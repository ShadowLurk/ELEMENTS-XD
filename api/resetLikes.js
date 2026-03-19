// /api/resetLikes.js

import { redis } from "../lib/redis.js";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {

    // 💣 APAGA TUDO do Redis
    await redis.flushall();

    return res.status(200).json({ message: "Likes resetados" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao resetar" });
  }
}