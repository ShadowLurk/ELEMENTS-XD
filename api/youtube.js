/* =====================================
   API DE STATS DO YOUTUBE (MinyCreeper)
   ===================================== */
import { getCachedYoutubeStats } from "../lib/youtube.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const stats = await getCachedYoutubeStats();

    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");

    return res.status(200).json(stats);
  } catch (err) {
    console.error("Erro ao buscar stats do YouTube:", err);
    return res.status(500).json({ error: "Erro ao buscar stats do YouTube" });
  }
}