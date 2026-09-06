import { getStoredGames } from "../lib/gamesCatalog.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");

  try {
    const games = await getStoredGames();

    return res.status(200).json({ games });
  } catch (err) {
    console.error("Erro ao ler catálogo:", err);
    return res.status(500).json({ error: "Erro ao carregar catálogo" });
  }
}
