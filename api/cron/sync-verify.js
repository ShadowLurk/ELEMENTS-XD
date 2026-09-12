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

  const semDesconto =
    price.initial_formatted.replace(/\D/g, "") ===
      price.final_formatted.replace(/\D/g, "") ||
    !price.discount_percent ||
    price.discount_percent <= 0;

  if (semDesconto) return { expirado: true };

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
    concorrencia: 12,
    delayEntreLotesMs: 150,
    // Com o catálogo Steam crescendo pra 10-15 mil jogos, NÃO dá pra
    // verificar tudo numa chamada só -- não existe configuração que
    // caiba isso dentro do tempo máximo de uma função serverless.
    // A saída é reconferir uma fatia maior por execução (300, ainda com
    // folga de sobra dentro dos 60s) e rodar o cron bem mais seguido
    // (ver .github/workflows/sync-verify.yml) -- assim, girando o
    // cursor, o catálogo inteiro é coberto em poucas horas em vez de
    // dias, sem nunca estourar o tempo de uma única execução.
    paginacao: { chave: "verify:steam", tamanho: 300 },
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

  return refreshStoreGames(
    "GOG",
    async (jogoSalvo) => {
      const atual = mapaAtual.get(jogoSalvo.link);

      if (!atual) return { expirado: true };

      // Se a loja ainda lista o jogo mas sem desconto de verdade, trata
      // como expirado também -- senão o card fica sem preço promocional
      // (mostrando "Ver na loja") em vez de sumir do catálogo.
      if (!atual.discount || atual.discount <= 0) return { expirado: true };

      return {
        expirado: false,
        dados: {
          normalPriceBRL: atual.normalPriceBRL,
          salePriceBRL: atual.salePriceBRL,
          discount: atual.discount,
        },
      };
    },
    // GOG não bate em API por jogo aqui (só compara com o mapa que já
    // veio pronto de getGogDeals) -- não tem motivo pra atraso entre
    // lotes nem pra limitar concorrência, é tudo em memória.
    { concorrencia: 100, delayEntreLotesMs: 0 }
  );
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

  return refreshStoreGames(
    "Epic",
    async (jogoSalvo) => {
      const atual = mapaAtual.get(jogoSalvo.link);

      if (!atual) return { expirado: true };

      // Mesma regra da GOG: sem desconto real = expirado, some do catálogo.
      if (!atual.discount || atual.discount <= 0) return { expirado: true };

      return {
        expirado: false,
        dados: {
          normalPriceBRL: atual.normalPriceBRL,
          salePriceBRL: atual.salePriceBRL,
          discount: atual.discount,
        },
      };
    },
    // Mesmo caso da GOG: só compara em memória, sem chamada por jogo.
    { concorrencia: 100, delayEntreLotesMs: 0 }
  );
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    console.log("🔍 [verify] Reconferindo catálogo Steam + GOG + Epic...");

    // Antes rodava Steam -> GOG -> Epic em sequência, somando o tempo dos
    // três dentro do mesmo maxDuration. Agora roda em paralelo, então o
    // tempo total passa a ser o do mais lento, não a soma dos três.
    const [resultadoSteam, resultadoGog, resultadoEpic] = await Promise.all([
      verificarSteam(),
      verificarGog(),
      verificarEpic(),
    ]);

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