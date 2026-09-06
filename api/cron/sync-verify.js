import { getSteamBRPrice } from "../../lib/steam.js";
import { getGogDeals } from "../../lib/gog.js";
import { getEpicDeals } from "../epic.js";
import { refreshStoreGames } from "../../lib/gamesCatalog.js";
import { safeCompare } from "../../lib/security.js";

// =============================
// 🔍 VERIFICAÇÃO (STEAM + GOG + EPIC)
// =============================

export const config = { maxDuration: 60 };

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  return safeCompare(token, secret);
}

function extrairSteamAppId(link) {
  const match = link?.match(/\/app\/(\d+)/);
  return match ? match[1] : null;
}

async function checkSteamGame(jogoSalvo) {
  const appID = extrairSteamAppId(jogoSalvo.link);
  if (!appID) return { removerAgora: true };

  const { rateLimited, price } = await getSteamBRPrice(appID);

  if (!price) {
    return { removerAgora: true };
  }

  const expirado =
    price.initial_formatted.replace(/\D/g, "") ===
    price.final_formatted.replace(/\D/g, "");

  if (expirado) return { expirado: true };

  return {
    expirado: false,
    dados: {
      normalPriceBRL: price.initial_formatted,
      salePriceBRL: price.final_formatted,
      discount: price.discount_percent,
    },
  };
}

async function verificarSteam() {
  return refreshStoreGames("Steam", checkSteamGame, {
    concorrencia: 6,
    delayEntreLotesMs: 400,
  });
}

async function verificarGog() {
  const promosAtuais = await getGogDeals(300).catch((err) => {
    console.error("Erro reconferindo GOG:", err.message);
    return null;
  });

  if (promosAtuais === null) {
    return { store: "GOG", total: 0, atualizados: 0, expirados: 0, removidos: 0 };
  }

  const mapaAtual = new Map(promosAtuais.map((g) => [g.link, g]));

  return refreshStoreGames("GOG", async (jogoSalvo) => {
    const atual = mapaAtual.get(jogoSalvo.link);

    if (!atual) return { expirado: true };

    return {
      expirado: false,
      dados: {
        normalPriceBRL: atual.normalPriceBRL,
        salePriceBRL: atual.salePriceBRL,
        discount: atual.discount,
      },
    };
  });
}

async function verificarEpic() {
  const promosAtuais = await getEpicDeals(50).catch((err) => {
    console.error("Erro reconferindo Epic:", err.message);
    return null;
  });

  if (promosAtuais === null) {
    return { store: "Epic", total: 0, atualizados: 0, expirados: 0, removidos: 0 };
  }

  const mapaAtual = new Map(promosAtuais.map((g) => [g.link, g]));

  return refreshStoreGames("Epic", async (jogoSalvo) => {
    const atual = mapaAtual.get(jogoSalvo.link);

    if (!atual) return { expirado: true };

    return {
      expirado: false,
      dados: {
        normalPriceBRL: atual.normalPriceBRL,
        salePriceBRL: atual.salePriceBRL,
        discount: atual.discount,
      },
    };
  });
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    console.log("🔍 [verify] Reconferindo TODO o catálogo Steam + GOG + Epic...");

    const resultadoSteam = await verificarSteam();
    const resultadoGog = await verificarGog();
    const resultadoEpic = await verificarEpic();

    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      steam: resultadoSteam,
      gog: resultadoGog,
      epic: resultadoEpic,
    });
  } catch (err) {
    console.error("Erro no verify:", err);
    return res.status(500).json({ error: "Erro ao verificar promoções" });
  }
}