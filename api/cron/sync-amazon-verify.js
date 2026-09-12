import { getAmazonDealsByCategory } from "../../lib/amazon.js";
import {
  refreshAmazonProducts,
  getProductId,
  CATEGORY_ORDER,
} from "../../lib/amazonCatalog.js";
import { safeCompare } from "../../lib/security.js";

// =============================
// 🔍 VERIFICAÇÃO AMAZON
// =============================

// Antes rodava sem limite de tempo definido e passava pelas 13 categorias
// uma de cada vez (com espera entre elas) -- já chegou a levar 1min21s no
// total, bem perto de estourar o limite da Vercel. Agora processa em
// pequenos grupos em paralelo (mantendo uma pausa só entre grupos, pra não
// martelar a Amazon com tudo de uma vez) e trava um maxDuration explícito
// com folga.
export const config = { maxDuration: 90 };

const CATEGORIAS_POR_GRUPO = 4;

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  return safeCompare(token, secret);
}

async function verificarCategoria(categoryKey) {
  const dealsAtuais = await getAmazonDealsByCategory(categoryKey).catch((err) => {
    console.error(`Erro reconferindo ${categoryKey}:`, err.message);
    return null;
  });

  if (dealsAtuais === null) {
    return { categoryKey, total: 0, atualizados: 0, removidos: 0, pulado: true };
  }

  const mapaAtual = new Map(dealsAtuais.map((p) => [getProductId(p), p]));

  return refreshAmazonProducts(categoryKey, async (produtoSalvo) => {
    const atual = mapaAtual.get(getProductId(produtoSalvo));

    if (!atual) return { expirado: true };
    if (!atual.discount || atual.discount < 10) return { expirado: true };

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
    console.log("🔍 [verify-amazon] Reconferindo produtos já salvos...");

    const resultados = [];

    for (let i = 0; i < CATEGORY_ORDER.length; i += CATEGORIAS_POR_GRUPO) {
      const grupo = CATEGORY_ORDER.slice(i, i + CATEGORIAS_POR_GRUPO);

      const resultadosGrupo = await Promise.all(
        grupo.map((categoryKey) => verificarCategoria(categoryKey))
      );

      resultados.push(...resultadosGrupo);

      if (i + CATEGORIAS_POR_GRUPO < CATEGORY_ORDER.length) {
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
      }
    }

    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      resultados,
    });
  } catch (err) {
    console.error("Erro no verify Amazon:", err);
    return res.status(500).json({ error: "Erro ao verificar Amazon" });
  }
}
