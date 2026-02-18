const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const cheerio = require("cheerio"); // 👈 necessário para parsear HTML

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

let cachedDeals = { steam: [], epic: [], gog: [] };
let lastUpdate = null;

// 🔥 Função para buscar preço oficial Steam BR
async function getSteamBRPrice(appID) {
  try {
    const response = await axios.get(
      "https://store.steampowered.com/api/appdetails",
      {
        params: { appids: appID, cc: "br", l: "portuguese" },
        timeout: 5000,
      }
    );
    const data = response.data[appID];
    if (data && data.success && data.data && data.data.price_overview) {
      return data.data.price_overview;
    }
    return null;
  } catch {
    return null;
  }
}

// 🔥 Função para buscar preço direto da página da GOG Brasil
async function getGOGBrazilPrice(fullUrl) {
  try {
    const response = await axios.get(`https://www.gog.com${fullUrl}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "pt-BR",
      },
    });

    const $ = cheerio.load(response.data);

    const base = $(".product-actions-price__base-amount").text().trim();
    const final = $(".product-actions-price__final-amount").text().trim();

    return {
      base: base || "Indisponível",
      final: final || "Indisponível",
    };
  } catch (err) {
    console.error("Erro ao buscar preço GOG Brasil:", err.message);
    return { base: "Indisponível", final: "Indisponível" };
  }
}

// 🔥 Atualiza o cache
async function updateDeals() {
  try {
    console.log("Atualizando promoções Steam + Epic + GOG...");

    const steamResults = [];
    const epicResults = [];
    const gogResults = [];

    // =====================
    // 🔵 STEAM
    // =====================
    const cheapSharkResponse = await axios.get(
      "https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=60"
    );
    const steamGames = cheapSharkResponse.data.slice(0, 15);

    for (const game of steamGames) {
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

    // =====================
    // 🟣 EPIC (Jogos em promoção, incluindo grátis)
    // =====================
    const epicResponse = await axios.get(
      "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions"
    );
    const epicGames = epicResponse.data.data.Catalog.searchStore.elements;

    epicGames.forEach((game) => {
      if (game.promotions && game.promotions.promotionalOffers.length > 0) {
        const offer =
          game.promotions.promotionalOffers[0].promotionalOffers[0];
        const discount = offer.discountSetting.discountPercentage;

        const pageSlug = game.catalogNs?.mappings?.[0]?.pageSlug;
        if (!pageSlug) return;

        epicResults.push({
          title: game.title,
          thumb: game.keyImages?.[0]?.url || "",
          normalPriceBRL:
            game.price?.totalPrice?.fmtPrice?.originalPrice || "R$ --",
          salePriceBRL:
            discount === 0
              ? "GRÁTIS"
              : game.price?.totalPrice?.fmtPrice?.discountPrice || "R$ --",
          discount: discount,
          store: "Epic",
          link: `https://store.epicgames.com/pt-BR/p/${pageSlug}`,
        });
      }
    });

    // =====================
    // 🟢 GOG (Brasil)
    // =====================
    const gogResponse = await axios.get(
      "https://www.gog.com/games/ajax/filtered?mediaType=game&sort=popularity&page=1",
      {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      }
    );

    const gogGames = gogResponse.data.products.slice(0, 10);

    for (const game of gogGames) {
      const gogPrice = await getGOGBrazilPrice(game.url);

      const expired = game.price.discountPercentage === 0;

      gogResults.push({
        title: game.title,
        thumb: `https:${game.image}_product_tile_256.jpg`,
        normalPriceBRL: expired ? "" : `R$ ${gogPrice.base}`,
        salePriceBRL: expired ? "" : `R$ ${gogPrice.final}`,
        discount: game.price.discountPercentage || 0,
        expired, // 👈 flag para o front
        store: "GOG",
        link: `https://www.gog.com${game.url}`,
      });
    }

    // 🔥 Atualiza cache
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

// 🔥 Rota principal
app.get("/api/deals", (req, res) => {
  res.json({
    lastUpdate,
    steam: cachedDeals.steam,
    epic: cachedDeals.epic,
    gog: cachedDeals.gog,
  });
});

// 🔥 Atualiza ao iniciar o servidor
updateDeals();

// 🔥 Atualiza a cada 5 minutos
setInterval(updateDeals, 300000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});
