require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const cheerio = require("cheerio");

console.log("API KEY:", process.env.ITAD_API_KEY);

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

let cachedDeals = { steam: [], epic: [], gog: [] };
let lastUpdate = null;

const EXPIRE_REMOVE_DAYS = 2;

// =============================
// 🧠 Funções auxiliares
// =============================
function normalizePrice(price) {
  if (!price) return 0;
  return Number(
    price.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()
  );
}

function checkExpired(base, final) {
  const baseValue = normalizePrice(base);
  const finalValue = normalizePrice(final);
  return baseValue === finalValue;
}

function shouldRemoveDeal(deal) {
  if (!deal.expired || !deal.expiredAt) return false;
  const now = new Date();
  const expiredDate = new Date(deal.expiredAt);
  const diffDays = (now - expiredDate) / (1000 * 60 * 60 * 24);
  return diffDays >= EXPIRE_REMOVE_DAYS;
}

function calcDiscount(oldPrice, newPrice) {
  if (!oldPrice || !newPrice) return 0;
  return Math.round(100 - (newPrice / oldPrice) * 100);
}

// Remove duplicados com base nas 6 primeiras letras do título
function filtrarDuplicadosPorPrefixo(jogos) {
  const vistos = new Set();
  const filtrados = [];

  for (const jogo of jogos) {
    const prefixo = jogo.title.substring(0, 6).toLowerCase();
    if (!vistos.has(prefixo)) {
      vistos.add(prefixo);
      filtrados.push(jogo);
    }
  }

  return filtrados;
}

// =============================
// 🔵 Steam Brasil
// =============================
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

    if (data?.success && data.data?.price_overview) {
      return data.data.price_overview;
    }

    return null;
  } catch {
    return null;
  }
}

// =============================
// 🟣 Epic (Grátis + Pagos com desconto)
// =============================
async function getEpicDeals() {
  try {
    const response = await axios.get(
      "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR",
      {
        headers: {
          "Accept-Language": "pt-BR",
          "User-Agent": "Mozilla/5.0",
          "Cookie": "EPIC_LOCALE=pt-BR; EPIC_COUNTRY=BR;"
        },
        timeout: 8000
      }
    );

    const elements = response.data.data.Catalog.searchStore.elements;
    const epicGames = [];

    elements.forEach((game) => {
      const priceInfo = game.price?.totalPrice;
      if (!priceInfo) return;

      if (priceInfo.discountPrice < priceInfo.originalPrice) {
        const mapping = game.catalogNs?.mappings?.[0];
        if (!mapping?.pageSlug) return;

        const epicUrl =
          mapping.pageType === "bundle"
            ? `https://store.epicgames.com/pt-BR/bundles/${mapping.pageSlug}`
            : `https://store.epicgames.com/pt-BR/p/${mapping.pageSlug}`;

        const discountPercent = Math.round(
          100 - (priceInfo.discountPrice / priceInfo.originalPrice) * 100
        );

        epicGames.push({
          title: game.title,
          thumb: game.keyImages?.[0]?.url || "",
          normalPriceBRL: `R$ ${(priceInfo.originalPrice / 100).toFixed(2)}`,
          salePriceBRL:
            priceInfo.discountPrice === 0
              ? "GRÁTIS"
              : `R$ ${(priceInfo.discountPrice / 100).toFixed(2)}`,
          discount: discountPercent,
          store: "Epic",
          link: epicUrl,
          expired: false,
          expiredAt: null,
        });
      }
    });

    return epicGames.slice(0, 15);
  } catch (err) {
    console.error("Erro ao buscar jogos da Epic:", err.message);
    return [];
  }
}


// =============================
// 🟢 GOG Brasil
// =============================
async function getGOGBrazilPrice(fullUrl) {
  try {
    const response = await axios.get(`https://www.gog.com${fullUrl}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Cookie: "gog_lc=BR_BRL; currency=BRL;",
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data);

    let base = $(".product-actions-price__base-amount").first().text().trim();
    let final = $(".product-actions-price__final-amount").first().text().trim();

    if (!final) {
      final = $(".product-actions-price__amount").first().text().trim();
    }

    if (base) base = `R$ ${base}`;
    if (final) final = `R$ ${final}`;

    return { base: base || "Indisponível", final: final || "Indisponível" };
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

    for (const game of cheapSharkResponse.data.slice(0, 24)) {
      if (!game.steamAppID) continue;

      const steamPrice = await getSteamBRPrice(game.steamAppID);
      if (!steamPrice) continue;

      const expired = checkExpired(
        steamPrice.initial_formatted,
        steamPrice.final_formatted
      );

      steamResults.push({
        title: game.title,
        thumb: game.thumb,
        normalPriceBRL: steamPrice.initial_formatted,
        salePriceBRL: steamPrice.final_formatted,
        discount: expired ? 0 : steamPrice.discount_percent,
        store: "Steam",
        link: `https://store.steampowered.com/app/${game.steamAppID}`,
        expired,
        expiredAt: expired ? new Date() : null,
      });
    }

    // 🟣 Epic
    const epicResults = await getEpicDeals();

    // 🟢 GOG
    for (let page = 1; page <= 5; page++) {
      const gogResponse = await axios.get(
        `https://www.gog.com/games/ajax/filtered?mediaType=game&sort=popularity&page=${page}`
      );

      for (const game of gogResponse.data.products) {
        const gogPrice = await getGOGBrazilPrice(game.url);
        const expired = checkExpired(gogPrice.base, gogPrice.final);
        const titulo = game.title.toLowerCase();

        if (
          game.price.discountPercentage > 0 &&
          (
            game.category === "game" ||
            (
              !titulo.includes("soundtrack") &&
              !titulo.includes("sound track") &&
              !titulo.includes("collection") &&
              !titulo.includes("collector") &&
              !titulo.includes("dlc") &&
              !titulo.includes("bundle") &&
              !titulo.includes("pack")
            )
          )
          && game.ageRating !== "18" &&
          !titulo.includes("18+") &&
          !titulo.includes("adult") &&
          !titulo.includes("mature")
        ) {
          gogResults.push({
            title: game.title,
            thumb: `https:${game.image}_product_tile_256.jpg`,
            normalPriceBRL: gogPrice.base,
            salePriceBRL: gogPrice.final,
            discount: game.price.discountPercentage,
            store: "GOG",
            link: `https://www.gog.com${game.url}`,
            expired,
            expiredAt: expired ? new Date() : null,
          });
        }
      }
    }

    // ✅ aplica filtro de duplicados por prefixo
    const gogFinalResults = filtrarDuplicadosPorPrefixo(gogResults).slice(0, 30);

    // ✅ Atualiza cache dentro do try
    cachedDeals = {
      steam: steamResults.filter((d) => !shouldRemoveDeal(d)),
      epic: epicResults,
      gog: gogFinalResults
    };

    lastUpdate = new Date();
    console.log("Promoções atualizadas ✅");

    if (sseClient && !firstUpdateSent) {
  sseClient.write(`data: refresh\n\n`);
  firstUpdateSent = true; // só dispara uma vez
}

  } catch (error) {
    console.error("Erro ao atualizar promoções:", error.message);
  }
}


// =============================
// 🌐 API
// =============================
app.get("/api/deals", (req, res) => {
  res.json({
    lastUpdate,
    steam: cachedDeals.steam,
    epic: cachedDeals.epic,
    gog: cachedDeals.gog,
  });
});

// =============================
// 🔔 SSE (Server-Sent Events)
// =============================
let firstUpdateSent = false; 
let sseClient = null;

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  sseClient = res; // guarda a conexão do navegador
});


// =============================
// Página principal
// =============================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =============================
// Inicialização 
// =============================
updateDeals();
setInterval(updateDeals, 300000);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () =>
  console.log(`Servidor rodando na porta ${PORT} 🚀`)
);
