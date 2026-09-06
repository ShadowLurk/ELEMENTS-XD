import axios from "axios";

const META_STEAM = 180;

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

// =============================
// 🔵 Steam price (1 jogo por vez)
// =============================
export async function getSteamBRPrice(appID, tentativa = 0) {
  try {
    const response = await axios.get(
      "https://store.steampowered.com/api/appdetails",
      {
        params: { appids: appID, cc: "br", l: "portuguese" },
        timeout: 5000,
        validateStatus: (status) => status < 500,
      }
    );

    if (response.status === 429) {
      if (tentativa >= 1) {
        return { rateLimited: true, price: null };
      }
      await new Promise((r) => setTimeout(r, 3000));
      return getSteamBRPrice(appID, tentativa + 1);
    }

    const data = response.data?.[appID];
    return { rateLimited: false, price: data?.success ? data.data?.price_overview : null };
  } catch {
    return { rateLimited: false, price: null };
  }
}

// =============================
// 🔵 Busca INCREMENTAL (lote pequeno por execução)
// =============================
export async function getSteamDealsIncremental(quantidadeAlvo, cursorPage, idsJaSalvos) {
  const MAX_PAGES_POR_EXECUCAO = 8;
  const batchSize = 6;
  const BATCH_DELAY_MS = 400;
  const PAGE_DELAY_MS = 500;

  const vistosNestaRodada = new Set();
  const results = [];

  let page = cursorPage || 0;
  let paginasLidas = 0;
  let acabouOMercado = false;
  let steamRateLimited = false;

  while (
    results.length < quantidadeAlvo &&
    paginasLidas < MAX_PAGES_POR_EXECUCAO &&
    !steamRateLimited
  ) {
    let response;
    try {
      response = await axios.get(
        "https://www.cheapshark.com/api/1.0/deals",
        {
          params: { storeID: 1, pageNumber: page, pageSize: 60 },
          headers: {
            "User-Agent": "ElementsXD/1.0 (contato@elementsxd.com)",
          },
        }
      );
    } catch (err) {
      const msgErro = err.response?.data;
      const estourouLimiteDePaginas =
        typeof msgErro === "string" && msgErro.includes("Too Many Results");

      if (estourouLimiteDePaginas) {
        console.log(
          `🟡 [Steam] Limite de páginas da CheapShark atingido na página ${page}, reiniciando cursor.`
        );
        acabouOMercado = true;
        break;
      }

      throw err;
    }

    if (!response.data.length) {
      acabouOMercado = true;
      break;
    }

    const gamesDaPagina = response.data.filter((g) => {
      if (!g.steamAppID || !g.title) return false;

      const candidatoId = `steam:${g.title.toLowerCase().trim()}`;
      if (idsJaSalvos.has(candidatoId)) return false;
      if (vistosNestaRodada.has(g.steamAppID)) return false;
      vistosNestaRodada.add(g.steamAppID);
      return true;
    });

    for (
      let i = 0;
      i < gamesDaPagina.length && results.length < quantidadeAlvo && !steamRateLimited;
      i += batchSize
    ) {
      const batch = gamesDaPagina.slice(i, i + batchSize);

      const promises = batch.map(async (game) => {
        const { rateLimited, price } = await getSteamBRPrice(game.steamAppID);

        if (rateLimited) {
          steamRateLimited = true;
          return null;
        }
        if (!price) return null;

        const expired = checkExpired(price.initial_formatted, price.final_formatted);
        if (expired) return null;

        return {
          title: game.title,
          thumb: game.thumb,
          normalPriceBRL: price.initial_formatted,
          salePriceBRL: price.final_formatted,
          discount: price.discount_percent,
          store: "Steam",
          link: `https://store.steampowered.com/app/${game.steamAppID}`,
          expired: false,
          expiredAt: null,
          addedAt: new Date(),
        };
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults.filter(Boolean));

      if (!steamRateLimited) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    page++;
    paginasLidas++;
    if (!steamRateLimited) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  }

  const nextCursor = acabouOMercado ? 0 : page;

  return {
    results: filtrarDuplicadosPorTituloExato(results),
    nextCursor,
    steamRateLimited,
  };
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
    console.log("🔵 Buscando Steam (manual)...");

    const { results } = await getSteamDealsIncremental(META_STEAM, 0, new Set());

    const meta = {
      atual: results.length,
      meta: META_STEAM,
      atingida: results.length >= META_STEAM,
    };

    return res.status(200).json({ steam: results, meta });
  } catch (err) {
    console.error("Erro Steam:", err);
    return res.status(500).json({ error: "Erro ao buscar jogos da Steam" });
  }
}
