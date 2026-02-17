const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// 🔥 CACHE EM MEMÓRIA
let cachedDeals = [];
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

    if (
      data &&
      data.success &&
      data.data &&
      data.data.price_overview
    ) {
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
    console.log("Atualizando promoções Steam + Epic...");

    const results = [];

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

      results.push({
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
// 🟣 EPIC (Jogos Grátis)
// =====================

const epicResponse = await axios.get(
  "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions"
);

const epicGames =
  epicResponse.data.data.Catalog.searchStore.elements;

epicGames.forEach((game) => {
  if (
    game.promotions &&
    game.promotions.promotionalOffers.length > 0
  ) {
    const offer =
      game.promotions.promotionalOffers[0]
        .promotionalOffers[0];

    if (offer.discountSetting.discountPercentage === 0) {

      // 🔥 SLUG CORRETO
      const pageSlug =
        game.catalogNs?.mappings?.[0]?.pageSlug;

      if (!pageSlug) return;

      results.push({
        title: game.title,
        thumb: game.keyImages?.[0]?.url || "",
        normalPriceBRL: "R$ --",
        salePriceBRL: "GRÁTIS",
        discount: 100,
        store: "Epic",
        link: `https://store.epicgames.com/pt-BR/p/${pageSlug}`,
      });
    }
  }
});


    // 🔥 Ordena por maior desconto
    results.sort((a, b) => b.discount - a.discount);

    cachedDeals = results;
    lastUpdate = new Date();

    console.log("Promoções atualizadas com sucesso.");
  } catch (error) {
    console.error("Erro ao atualizar promoções:", error.message);
  }
}


// 🔥 Rota principal (agora instantânea)
app.get("/api/deals", (req, res) => {
  res.json({
    lastUpdate,
    deals: cachedDeals,
  });
});

// 🔥 Atualiza ao iniciar o servidor
updateDeals();

// 🔥 Atualiza a cada 5 minutos (300000 ms)
setInterval(updateDeals, 300000);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});
