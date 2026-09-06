import { getAmazonDealsByCategory } from "../../lib/amazon.js";
import {
  addNewAmazonProducts,
  getCategoriaCursor,
  setCategoriaCursor,
  CATEGORY_ORDER,
} from "../../lib/amazonCatalog.js";
import { safeCompare } from "../../lib/security.js";

// =============================
// 🔄 SYNC INCREMENTAL AMAZON
// =============================

const LOTE_POR_EXECUCAO = 5;

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
    const cursor = await getCategoriaCursor();
    const categoryKey = CATEGORY_ORDER[cursor % CATEGORY_ORDER.length];

    console.log(`🟠 [sync-amazon] Categoria da vez: ${categoryKey}`);

    const deals = await getAmazonDealsByCategory(categoryKey).catch((err) => {
      console.error(`Erro buscando ${categoryKey}:`, err.message);
      return [];
    });

    const resultado = await addNewAmazonProducts(categoryKey, deals, LOTE_POR_EXECUCAO);

    await setCategoriaCursor(cursor + 1);

    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      categoria: categoryKey,
      encontrados: deals.length,
      ...resultado,
      proximaCategoria: CATEGORY_ORDER[(cursor + 1) % CATEGORY_ORDER.length],
    });
  } catch (err) {
    console.error("Erro no sync Amazon:", err);
    return res.status(500).json({ error: "Erro ao sincronizar Amazon" });
  }
}
