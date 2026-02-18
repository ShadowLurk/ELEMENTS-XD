const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

let cachedDeals = { steam: [], epic: [], gog: [] };
let lastUpdate = null;

// Função auxiliar para calcular desconto
function calcularDesconto(normal, final) {
  if (!normal || !final) return 0;
  if (final.toLowerCase().includes("grátis")) return 100;

  const normalNum = parseFloat(normal.replace("R$", "").replace(",", "."));
  const finalNum = parseFloat(final.replace("R$", "").replace(",", "."));

  if (isNaN(normalNum) || isNaN(finalNum) || normalNum === 0) return 0;

  return Math.round(((normalNum - finalNum) / normalNum) * 100);
}

// 🔵 Steam Brasil
async function getSteamBRPrice(appID) {
  try {
    const response = await axios.get(
      "https://store.steampowered.com/api/appdetails",
      { params: { appids: appID, cc: "br", l: "portuguese" }, timeout: 5000 }
    );
    const data = response.data[appID];
    if (data?.success && data.data?.price_overview) {
      return data.data.price_overview;
    }
    return null;
  } catch {
    return null;
  }
}

// 🟣 Epic Brasil (via Puppeteer debugando DOM)
async function getEpicBrazilPrice(pageSlug) {
  try {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(`https://store.epicgames.com/pt-BR/p/${pageSlug}`, {
      waitUntil: "networkidle2",
    });

    const bodyText = await page.evaluate(() => document.body.innerText);

    console.log("=== DEBUG Epic Page Text ===");
    console.log(bodyText);

    const prices = bodyText
      .split("\n")
      .filter(line => line.includes("R$") || line.toLowerCase().includes("gratuito"))
      .map(line => line.trim());

    let result = { normal: "Preço não disponível", final: "Preço não disponível" };

    if (prices.length > 0) {
      if (prices.some(p => p.toLowerCase().includes("gratuito"))) {
        result = { normal: prices[0], final: "Grátis" };
      } else if (prices.length >= 2) {
        result = { normal: prices[0], final: prices[1] };
      } else {
        result = { normal: prices[0], final: prices[0] };
      }
    }

    await browser.close();
    return result;
  } catch (err) {
    console.error("Erro ao raspar preço Epic Brasil:", err.message);
    return { normal: "Preço não disponível", final: "Preço não disponível" };
  }
}

// 🟢 GOG Brasil (com prefixo R$)
async function getGOGBrazilPrice(fullUrl) {
  try {
    const response = await axios.get(`https://www.gog.com${fullUrl}`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR" },
    });
    const $ = cheerio.load(response.data);

    let base = $(".product-actions-price__base-amount").text().trim();
    let final = $(".product-actions-price__final-amount").text().trim();

    if (base && !base.toLowerCase().includes("indisponível")) {
      base = `R$ ${base}`;
    }
    if (final && !final.toLowerCase().includes("indisponível")) {
      final = `R$ ${final}`;
    }

    return {
      base: base || "Indisponível",
      final: final || "Indisponível",
    };
  } catch (err) {
    console.error("Erro ao raspar preço GOG Brasil:", err.message);
    return { base: "Indisponível", final: "Indisponível" };
  }
}

// 🔥 Atualiza cache
async function updateDeals() {
  try {
    console.log("Atualizando promoções Steam + Epic + GOG...");

    const steamResults = [];
    const epicResults = [];
    const gogResults = [];

    // Steam
    const cheapSharkResponse = await axios.get(
      "https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=60"
    );
    for (const game of cheapSharkResponse.data.slice(0, 15)) {
      if (!game.steamAppID) continue;
      const steamPrice = await getSteamBRPrice(game.steamAppID);
      if (!steamPrice) continue;
      steamResults.push({
        title: game.title,
        thumb: game.thumb,
        normalPriceBRL: steamPrice.initial_formatted,
        salePriceBRL: steamPrice.final_formatted,
        discount: steamPrice.discount_percent,
        store: "Steam",
        link: `https://store.steampowered.com/app/${game.steamAppID}`,
      });
    }

    // Epic Brasil
    const epicResponse = await axios.get(
      "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions",
      { headers: { "Accept-Language": "pt-BR", "X-Epic-Region": "BR" } }
    );
    for (const game of epicResponse.data.data.Catalog.searchStore.elements) {
      if (game.promotions?.promotionalOffers.length > 0) {
        const pageSlug = game.catalogNs?.mappings?.[0]?.pageSlug;
        if (!pageSlug) continue;
        const epicPrice = await getEpicBrazilPrice(pageSlug);

        let normal = epicPrice.normal;
        let final = epicPrice.final;

        const discount = calcularDesconto(normal, final);

        epicResults.push({
          title: game.title,
          thumb: game.keyImages?.[0]?.url || "",
          normalPriceBRL: normal,
          salePriceBRL: final,
          discount,
          store: "Epic",
          link: `https://store.epicgames.com/pt-BR/p/${pageSlug}`,
        });
      }
    }

    // GOG Brasil
    const gogResponse = await axios.get(
      "https://www.gog.com/games/ajax/filtered?mediaType=game&sort=popularity&page=1",
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } }
    );
    for (const game of gogResponse.data.products.slice(0, 10)) {
      const gogPrice = await getGOGBrazilPrice(game.url);
      const expired = game.price.discountPercentage === 0;
      gogResults.push({
        title: game.title,
        thumb: `https:${game.image}_product_tile_256.jpg`,
        normalPriceBRL: expired ? "" : gogPrice.base,
        salePriceBRL: expired ? "" : gogPrice.final,
        discount: game.price.discountPercentage || 0,
        expired,
        store: "GOG",
        link: `https://www.gog.com${game.url}`,
      });
    }

    cachedDeals = {
      steam: steamResults.sort((a, b) => b.discount - a.discount),
      epic: epicResults.sort((a, b) => b.discount - a.discount),
      gog: gogResults.sort((a, b) => b.discount - a.discount),
    };
    lastUpdate = new Date();
    console.log("Promoções atualizadas com sucesso.");
  } catch (error) {
    console.error("Erro ao atualizar promoções:", error.message);
  }
}

// Rota principal
app.get("/api/deals", (req, res) => {
  res.json({ lastUpdate, steam: cachedDeals.steam, epic: cachedDeals.epic, gog: cachedDeals.gog });
});

// Atualiza ao iniciar
updateDeals();
setInterval(updateDeals, 300000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT} 🚀`));
