import axios from "axios";

const META_GOG = 180;

// =============================
// 🧠 Helpers
// =============================
function normalizePrice(value) {
  if (!value) return 0;

  return Number(
    value
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "")
      .trim()
  );
}

function checkExpired(base, final) {
  return normalizePrice(base) === normalizePrice(final);
}

function filtrarDuplicadosPorTituloExato(jogos) {
  const vistos = new Set();

  return jogos.filter((j) => {
    const titulo = j.title.toLowerCase().trim();

    if (vistos.has(titulo)) return false;

    vistos.add(titulo);
    return true;
  });
}

function isConteudoBloqueado(titulo) {
  const t = titulo.toLowerCase();

  if (
    t.includes("soundtrack") ||
    t.includes("collection") ||
    t.includes("collector") ||
    t.includes("dlc") ||
    t.includes("bundle") ||
    t.includes("pack")
  ) return true;

  if (
    t.includes("18+") ||
    t.includes("adult") ||
    t.includes("mature") ||
    t.includes("hentai") ||
    t.includes("eroge") ||
    t.includes("erotic") ||
    t.includes("nude") ||
    t.includes("xxx")
  ) return true;

  return false;
}

function montarDeal(game) {
  const base = `R$ ${game.price.baseAmount}`;
  const final = `R$ ${game.price.finalAmount}`;
  const expired = checkExpired(base, final);

  return {
    title: game.title,
    thumb: `https:${game.image}_product_tile_256.jpg`,
    normalPriceBRL: base,
    salePriceBRL: final,
    discount: game.price.discountPercentage,
    store: "GOG",
    link: `https://www.gog.com${game.url}`,
    expired,
    expiredAt: expired ? new Date() : null,
    addedAt: new Date(),
  };
}

function headersGog() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.gog.com/en/games",
    Cookie: "gog_lc=BR_BRL_en-US; currency=BRL;",
  };
}

// =============================
// 🟢 GOG Deals — busca completa (usada pelo handler manual)
// =============================
export async function getGogDeals(limite) {
  const gogResults = [];
  let page = 1;

  try {
    while (gogResults.length < limite && page <= 35) {
      const response = await axios.get("https://www.gog.com/games/ajax/filtered", {
        params: { mediaType: "game", sort: "popularity", page },
        headers: headersGog(),
        timeout: 8000,
      });

      const products = response.data?.products || [];
      if (!products.length) break;

      for (const game of products) {
        if (!game.price) continue;
        if (game.price.discountPercentage <= 0) continue;
        if (isConteudoBloqueado(game.title)) continue;

        gogResults.push(montarDeal(game));
        if (gogResults.length >= limite) break;
      }

      page++;
    }

    return filtrarDuplicadosPorTituloExato(gogResults).slice(0, limite);
  } catch (err) {
    console.error("Erro GOG:", err.message);
    return [];
  }
}

// =============================
// 🟢 GOG Deals — busca INCREMENTAL (lote pequeno por execução)
// =============================
export async function getGogDealsIncremental(quantidadeAlvo, cursorPage, idsJaSalvos) {
  const MAX_PAGES_POR_EXECUCAO = 35;

  const results = [];
  let page = cursorPage || 1;
  let paginasLidas = 0;
  let acabouOMercado = false;

  try {
    while (
      results.length < quantidadeAlvo &&
      paginasLidas < MAX_PAGES_POR_EXECUCAO
    ) {
      const response = await axios.get("https://www.gog.com/games/ajax/filtered", {
        params: { mediaType: "game", sort: "popularity", page },
        headers: headersGog(),
        timeout: 8000,
      });

      const products = response.data?.products || [];

      if (!products.length) {
        console.log(
          "🟡 [GOG debug] página",
          page,
          "sem produtos. Tipo da resposta:",
          typeof response.data,
          "| Prévia:",
          typeof response.data === "string"
            ? response.data.slice(0, 200)
            : JSON.stringify(response.data).slice(0, 200)
        );
        acabouOMercado = true;
        break;
      }

      for (const game of products) {
        if (!game.price) continue;
        if (game.price.discountPercentage <= 0) continue;
        if (isConteudoBloqueado(game.title)) continue;

        const candidatoId = `gog:${game.title.toLowerCase().trim()}`;
        if (idsJaSalvos.has(candidatoId)) continue;

        const deal = montarDeal(game);
        if (deal.expired) continue;

        results.push(deal);
        if (results.length >= quantidadeAlvo) break;
      }

      page++;
      paginasLidas++;
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (err) {
    console.error(
      "Erro GOG (incremental):",
      err.response?.status,
      err.response?.data || err.message
    );
  }

  const nextCursor = acabouOMercado ? 1 : page;

  return {
    results: filtrarDuplicadosPorTituloExato(results),
    nextCursor,
  };
}

// =============================
// 🟢 Verifica o preço ATUAL de 1 jogo já salvo (busca por título)
// =============================
export async function checkGogPriceByTitle(title, linkSalvo) {
  try {
    const response = await axios.get("https://www.gog.com/games/ajax/filtered", {
      params: { mediaType: "game", search: title },
      headers: headersGog(),
      timeout: 8000,
    });

    const produtos = response.data?.products || [];

    const encontrado =
      produtos.find((p) => `https://www.gog.com${p.url}` === linkSalvo) ||
      produtos[0];

    if (!encontrado || !encontrado.price) {
      return { removerAgora: true };
    }

    const base = `R$ ${encontrado.price.baseAmount}`;
    const final = `R$ ${encontrado.price.finalAmount}`;
    const expirado = checkExpired(base, final);

    if (expirado) {
      return { expirado: true };
    }

    return {
      expirado: false,
      dados: {
        normalPriceBRL: base,
        salePriceBRL: final,
        discount: encontrado.price.discountPercentage,
      },
    };
  } catch {
    return null;
  }
}

// =============================
// API HANDLER (manual/debug)
// =============================
export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "s-maxage=1800, stale-while-revalidate=1200"
  );

  try {
    console.log("🟢 Buscando GOG (manual)...");

    const gog = await getGogDeals(META_GOG);

    const meta = {
      atual: gog.length,
      meta: META_GOG,
      atingida: gog.length >= META_GOG
    };

    return res.status(200).json({ gog, meta });

  } catch (err) {
    console.error("Erro GOG:", err);
    return res.status(500).json({ error: "Erro ao buscar jogos da GOG" });
  }
}
