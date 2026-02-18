const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

let cachedDeals = { steam: [], epic: [], gog: [] };
let lastUpdate = null;

// =============================
// 🔵 Steam Brasil
// =============================
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

// =============================
// 🟣 Epic Brasil (SOMENTE grátis ATIVOS)
// =============================
async function getEpicFreeGames() {
  try {
    const response = await axios.get(
      "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions",
      { headers: { "Accept-Language": "pt-BR" } }
    );

    const elements =
      response.data.data.Catalog.searchStore.elements;

    const freeGames = [];

    elements.forEach((game) => {
      const priceInfo = game.price?.totalPrice;

      // 🔥 VERIFICA SE O PREÇO FINAL É ZERO
      if (
        priceInfo &&
        priceInfo.discountPrice === 0 &&
        priceInfo.originalPrice > 0
      ) {
        const mapping = game.catalogNs?.mappings?.[0];
        if (!mapping?.pageSlug) return;

        const epicUrl =
          mapping.pageType === "bundle"
            ? `https://store.epicgames.com/pt-BR/bundles/${mapping.pageSlug}`
            : `https://store.epicgames.com/pt-BR/p/${mapping.pageSlug}`;

        freeGames.push({
          title: game.title,
          thumb: game.keyImages?.[0]?.url || "",
          normalPriceBRL: `R$ ${(priceInfo.originalPrice / 100).toFixed(2)}`,
          salePriceBRL: "GRÁTIS",
          discount: 100,
          store: "Epic",
          link: epicUrl,
        });
      }
    });

    console.log("Epic grátis encontrados:", freeGames.length);

    return freeGames;
  } catch (err) {
    console.error("Erro ao buscar jogos grátis da Epic:", err.message);
    return [];
  }
}



// =============================
// 🟢 GOG Brasil
// =============================
async function getGOGBrazilPrice(fullUrl) {
  try {
    const response = await axios.get(`https://www.gog.com${fullUrl}`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR" },
    });

    const $ = cheerio.load(response.data);

    let base = $(".product-actions-price__base-amount").text().trim();
    let final = $(".product-actions-price__final-amount").text().trim();

    if (base) base = `R$ ${base}`;
    if (final) final = `R$ ${final}`;

    return {
      base: base || "Indisponível",
      final: final || "Indisponível",
    };
  } catch {
    return { base: "Indisponível", final: "Indisponível" };
  }
}

// =============================
// 🔥 Atualiza Cache
// =============================
async function updateDeals() {
  try {
    console.log("Atualizando promoções...");

    const steamResults = [];
    const gogResults = [];

    // 🔵 Steam
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

    // 🟣 Epic (somente grátis ativos)
    const epicResults = await getEpicFreeGames();

    // 🟢 GOG
    const gogResponse = await axios.get(
      "https://www.gog.com/games/ajax/filtered?mediaType=game&sort=popularity&page=1",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );

    for (const game of gogResponse.data.products.slice(0, 10)) {
      const gogPrice = await getGOGBrazilPrice(game.url);

      gogResults.push({
        title: game.title,
        thumb: `https:${game.image}_product_tile_256.jpg`,
        normalPriceBRL: gogPrice.base,
        salePriceBRL: gogPrice.final,
        discount: game.price.discountPercentage || 0,
        store: "GOG",
        link: `https://www.gog.com${game.url}`,
      });
    }

    cachedDeals = {
      steam: steamResults.sort((a, b) => b.discount - a.discount),
      epic: epicResults,
      gog: gogResults.sort((a, b) => b.discount - a.discount),
    };

    lastUpdate = new Date();

    console.log("Promoções atualizadas com sucesso.");
    console.log("Epic grátis ativos:", epicResults.length);
  } catch (error) {
    console.error("Erro ao atualizar promoções:", error.message);
  }
}

// =============================
// 🌐 Rota principal
// =============================
app.get("/api/deals", (req, res) => {
  res.json({
    lastUpdate,
    steam: cachedDeals.steam,
    epic: cachedDeals.epic,
    gog: cachedDeals.gog,
  });
});

// Inicializa
updateDeals();
setInterval(updateDeals, 300000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Servidor rodando na porta ${PORT} 🚀`)
);
