/* =====================================
   CRON: SYNC YOUTUBE (inscritos/vídeos/views)
   Roda a cada 30min via GitHub Actions
   ===================================== */
import { scrapeYoutubeChannel, saveYoutubeStats } from "../../lib/youtube.js";
import { safeCompare } from "../../lib/security.js";

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
    const stats = await scrapeYoutubeChannel();
    await saveYoutubeStats(stats);

    console.log("✅ [sync-youtube] Stats atualizadas:", stats);

    return res.status(200).json({ ok: true, ...stats });
  } catch (err) {
    console.error("❌ [sync-youtube] Erro ao sincronizar:", err.message);

    return res.status(500).json({ ok: false, error: err.message });
  }
}