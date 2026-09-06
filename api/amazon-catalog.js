import { getStoredAmazonProducts } from "../lib/amazonCatalog.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");

  try {
    const produtos = await getStoredAmazonProducts();

    return res.status(200).json({ produtos });
  } catch (err) {
    console.error("Erro ao ler catálogo Amazon:", err);
    return res.status(500).json({ error: "Erro ao carregar catálogo Amazon" });
  }
}
