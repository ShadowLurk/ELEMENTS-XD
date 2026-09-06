import axios from "axios";

const META_EPIC = 10;

// =============================
// 🟣 Epic Deals
// =============================
export async function getEpicDeals(limite) {
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
        const mapping =
          game.offerMappings?.[0] ||
          game.catalogNs?.mappings?.[0];

        const pageSlug = mapping?.pageSlug || game.productSlug || game.urlSlug;
        if (!pageSlug) return;

        const epicUrl =
          mapping?.pageType === "bundle"
            ? `https://store.epicgames.com/pt-BR/bundles/${pageSlug}`
            : `https://store.epicgames.com/pt-BR/p/${pageSlug}`;

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
          addedAt: new Date(),
        });
      }
    });

    return epicGames.slice(0, limite);

  } catch (err) {
    console.error("Erro ao buscar jogos da Epic:", err.message);
    return [];
  }
}

// =============================
// API HANDLER
// =============================
export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "s-maxage=1800, stale-while-revalidate=1200"
  );

  try {
    console.log("🟣 Buscando Epic...");

    const epic = await getEpicDeals(META_EPIC);

    const meta = {
      atual: epic.length,
      meta: META_EPIC,
      atingida: epic.length >= META_EPIC
    };

    return res.status(200).json({ epic, meta });

  } catch (err) {
    console.error("Erro Epic:", err);
    return res.status(500).json({ error: "Erro ao buscar jogos da Epic" });
  }
}