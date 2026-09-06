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

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  return safeCompare(token, secret);
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    console.log("🔍 [verify-amazon] Reconferindo produtos já salvos...");

    const resultados = [];

    for (const categoryKey of CATEGORY_ORDER) {
      const dealsAtuais = await getAmazonDealsByCategory(categoryKey).catch((err) => {
        console.error(`Erro reconferindo ${categoryKey}:`, err.message);
        return null;
      });

      if (dealsAtuais === null) continue;

      const mapaAtual = new Map(dealsAtuais.map((p) => [getProductId(p), p]));

      const resultado = await refreshAmazonProducts(categoryKey, async (produtoSalvo) => {
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

      resultados.push(resultado);

      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
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
