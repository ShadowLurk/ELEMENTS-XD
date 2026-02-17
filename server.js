const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// 🔥 CACHE EM MEMÓRIA SEPARADO POR LOJA
let cachedDeals = {
  steam: [],
  epic: [],
  gog: []
};

let lastUpdate = null;

// 🔥 Função para buscar preço oficial Steam BR
async function getSteamBRPrice(appID) {
  try {
    const response = await axios.get(
      "https://store.steampowered.com/api/appdetails",
      {
        params: {
          appids: appID,
          cc: "br",
          l: "portuguese",
        },
        timeout: 5000,
      }
    );

    const data = response.data[appID];

    if (data?.success && data?.data?.price_overview) {
      return data.data.price_overview;
    }

    return null;
  } catch {
    return null;
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
        link: `https://store.steampowered.com/app/${game.steamAppID}`,
      });
    }

    // =====================
    // 🟣 EPIC (Jogos Grátis)
    // =====================

    const epicResponse = await axios.get(
      "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions"
    );

    const epicGames =
      epicResponse.data.data.Catalog.searchStore.elements;

    epicGames.forEach((game) => {
      if (
        game.promotions?.promotionalOffers?.length > 0
      ) {
        const offer =
          game.promotions.promotionalOffers[0]
            .promotionalOffers[0];

        if (offer.discountSetting.discountPercentage === 0) {

          const pageSlug =
            game.catalogNs?.mappings?.[0]?.pageSlug;

          if (!pageSlug) return;

          epicResults.push({
            title: game.title,
            thumb: game.keyImages?.[0]?.url || "",
            normalPriceBRL: "R$ --",
            salePriceBRL: "GRÁTIS",
            discount: 100,
            link: `https://store.epicgames.com/pt-BR/p/${pageSlug}`,
          });
        }
      }
    });

    // =====================
    // 🟢 GOG
    // =====================

    const gogResponse = await axios.get(
      "https://www.gog.com/games/ajax/filtered?mediaType=game&sort=popularity&page=1",
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json"
        }
      }
    );

    const gogGames = gogResponse.data.products.slice(0, 15);

    gogGames.forEach((game) => {
      if (!game.price) return;

      gogResults.push({
        title: game.title,
        thumb: "https:" + game.image,
        normalPriceBRL: game.price.base,
        salePriceBRL: game.price.final,
        discount: game.price.discountPercentage,
        link: `https://www.gog.com${game.url}`,
      });
    });

    // 🔥 Ordena cada loja separadamente
    steamResults.sort((a, b) => b.discount - a.discount);
    gogResults.sort((a, b) => b.discount - a.discount);

    // 🔥 Atualiza cache
    cachedDeals = {
      steam: steamResults,
      epic: epicResults,
      gog: gogResults
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
    gog: cachedDeals.gog
  });
});

// 🔥 Inicializa
updateDeals();
setInterval(updateDeals, 300000);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});

