import axios from "axios";

const EXPIRE_REMOVE_DAYS = 2;

const STEAM_LIMIT = 60;
const GOG_LIMIT = 60;

// =============================
// 🧠 Helpers
// =============================
function normalizePrice(price) {
  if (!price) return 0;
  return Number(
    price.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()
  );
}

function checkExpired(base, final) {
  return normalizePrice(base) === normalizePrice(final);
}

function shouldRemoveDeal(deal) {
  if (!deal.expired || !deal.expiredAt) return false;
  const diffDays =
    (new Date() - new Date(deal.expiredAt)) /
    (1000 * 60 * 60 * 24);
  return diffDays >= EXPIRE_REMOVE_DAYS;
}

function filtrarDuplicadosPorPrefixo(jogos) {
  const vistos = new Set();
  return jogos.filter((j) => {
    const prefixo = j.title.substring(0, 6).toLowerCase();
    if (vistos.has(prefixo)) return false;
    vistos.add(prefixo);
    return true;
  });
}

// =============================
// 🧠 CONTROLE DE JOGOS EXISTENTES
// =============================

let previousDealsIndex = new Map();

function getDealKey(jogo) {
  return `${jogo.store}-${jogo.title}`.toLowerCase();
}

// =============================
// 🔵 Steam price
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
    return data?.success ? data.data?.price_overview : null;
  } catch {
    return null;
  }
}

// =============================
// 🔵 Steam Deals (PARALELO CONTROLADO)
// =============================
async function getSteamDeals() {

  const MAX_FETCH = 200; // busca mais resultados para garantir

  const cheapShark = await axios.get(
    "https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=60"
  );

  const games = cheapShark.data.slice(0, MAX_FETCH);

  const batchSize = 8;
  const results = [];

  for (
    let i = 0;
    i < games.length && results.length < STEAM_LIMIT;
    i += batchSize
  ) {

    const batch = games.slice(i, i + batchSize);

    const promises = batch.map(async (game) => {

      // 🔎 precisa ter appID
      if (!game.steamAppID) {
        console.log("Sem steamAppID:", game.title);
        return null;
      }

      // 🔎 busca preço BR oficial
      const price = await getSteamBRPrice(game.steamAppID);

      if (!price) {
        console.log("Ignorando jogo sem preço Steam BR:", game.title);
        return null;
      }

      const expired = checkExpired(
        price.initial_formatted,
        price.final_formatted
      );

      // =============================
      // 🧠 CONTROLE DE HISTÓRICO
      // =============================

      const key = getDealKey({
        store: "Steam",
        title: game.title
      });

      const jogoExistente = previousDealsIndex.get(key);

      // detecta se realmente é novo
      const isNovo = !jogoExistente;

      // =============================
      // ✅ OBJETO FINAL
      // =============================

      return {
        title: game.title,
        thumb: game.thumb,
        normalPriceBRL: price.initial_formatted,
        salePriceBRL: price.final_formatted,
        discount: expired ? 0 : price.discount_percent,
        store: "Steam",
        link: `https://store.steampowered.com/app/${game.steamAppID}`,
        expired,
        expiredAt: expired ? new Date() : null,

        // mantém data original se já existia
        addedAt: jogoExistente?.addedAt || new Date(),

        // sistema inteligente de novidade
        isNew: isNovo,
        newUntil: isNovo
          ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 2)
          : jogoExistente?.newUntil
      };

    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults.filter(Boolean));
  }

  // =============================
  // 🧹 LIMPEZA FINAL
  // =============================

  return filtrarDuplicadosPorPrefixo(results)
    .filter((d) => !shouldRemoveDeal(d))
    .slice(0, STEAM_LIMIT);
}

// =============================
// 🟣 Epic Deals
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

      // só pega jogos em promoção
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

        // 🔎 verifica se já existia no cache anterior
        const key = getDealKey({
          store: "Epic",
          title: game.title
        });

        const jogoExistente = previousDealsIndex.get(key);

        // ✅ detecta se é realmente novo
        const isNovo = !jogoExistente;

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

          // mantém data original se já existia
          addedAt: jogoExistente?.addedAt || new Date(),

          // sistema de novidade inteligente
          isNew: isNovo,
          newUntil: isNovo
            ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 2)
            : jogoExistente?.newUntil
        });
      }
    });

    return epicGames.slice(0, 18);

  } catch (err) {
    console.error("Erro ao buscar jogos da Epic:", err.message);
    return [];
  }
}

// =============================
// 🟢 GOG Deals (API DIRETA RÁPIDA)
// =============================
// =============================
// 🟢 GOG Deals (API DIRETA RÁPIDA)
// =============================
async function getGogDeals() {
  const gogResults = [];
  let page = 1;

  try {
    while (gogResults.length < GOG_LIMIT && page <= 20) {

      const response = await axios.get(
        "https://www.gog.com/games/ajax/filtered",
        {
          params: {
            mediaType: "game",
            sort: "popularity",
            page
          },
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "pt-BR,pt;q=0.9",
            Cookie: "gog_lc=BR_BRL; currency=BRL;"
          },
          timeout: 8000
        }
      );

      const products = response.data?.products || [];

      for (const game of products) {
        if (!game.price) continue;

        const titulo = game.title.toLowerCase();

        // 🔎 filtros
        if (game.price.discountPercentage <= 0) continue;

        if (
          titulo.includes("soundtrack") ||
          titulo.includes("collection") ||
          titulo.includes("collector") ||
          titulo.includes("dlc") ||
          titulo.includes("bundle") ||
          titulo.includes("pack")
        ) continue;

        if (
          game.ageRating === "18" ||
          titulo.includes("18+") ||
          titulo.includes("adult") ||
          titulo.includes("mature")
        ) continue;

        const base = `R$ ${game.price.baseAmount}`;
        const final = `R$ ${game.price.finalAmount}`;

        const expired = checkExpired(base, final);

        // ✅ IGUAL STEAM / EPIC
        const key = getDealKey({
          store: "GOG",
          title: game.title
        });

        const jogoExistente = previousDealsIndex.get(key);

        const isNovo = !jogoExistente;

gogResults.push({
  title: game.title,
  thumb: `https:${game.image}_product_tile_256.jpg`,
  normalPriceBRL: base,
  salePriceBRL: final,
  discount: expired ? 0 : game.price.discountPercentage,
  store: "GOG",
  link: `https://www.gog.com${game.url}`,
  expired,
  expiredAt: expired ? new Date() : null,

  // mantém data original
  addedAt: jogoExistente?.addedAt || new Date(),

  // ✅ novidade persistente
  isNew: isNovo,
  newUntil: isNovo
    ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 2)
    : jogoExistente?.newUntil
});

        if (gogResults.length >= GOG_LIMIT) break;
      }

      page++;
    }

    return filtrarDuplicadosPorPrefixo(gogResults)
      .filter((d) => !shouldRemoveDeal(d))
      .slice(0, GOG_LIMIT);

  } catch (err) {
    console.error("Erro GOG:", err.message);
    return [];
  }
}

let cache = null;
let cacheTime = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

export default async function handler(req, res) {
  try {
    // Se já existe cache e não expirou, retorna direto
    if (cache && (Date.now() - cacheTime < CACHE_DURATION)) {
      return res.status(200).json(cache);
    }

    // Caso contrário, busca novamente
    console.log("⚡ Cache expirado, atualizando promoções...");

    const [steam, epic, gog] = await Promise.all([
      getSteamDeals().catch(() => []),
      getEpicDeals().catch(() => []),
      getGogDeals().catch(() => []),
    ]);

// =============================
// Monta cache e ordena (novos primeiro)
// =============================

// junta todos os jogos
const todos = [...steam, ...epic, ...gog];

// ordena pelos mais novos
todos.sort((a, b) => {
  const dataA = a.addedAt ? new Date(a.addedAt) : 0;
  const dataB = b.addedAt ? new Date(b.addedAt) : 0;
  return dataB - dataA;
});

// atualiza índice de jogos anteriores
previousDealsIndex.clear();

todos.forEach(jogo => {
  previousDealsIndex.set(getDealKey(jogo), jogo);
});

// monta cache final
cache = {
  steam,
  epic,
  gog,
  all: todos
};

// salva momento da atualização
cacheTime = Date.now();

console.log(`✅ Cache atualizado em ${new Date().toLocaleString()}`);

    return res.status(200).json(cache);
  } catch (err) {
    console.error("❌ Erro ao buscar promoções:", err);
    res.status(500).json({ error: "Erro ao buscar promoções" });
  }
}

