/* =====================================
   API DE LIKES
   ===================================== */
import { Redis } from "@upstash/redis";
import { checkRateLimit } from "../lib/rateLimit.js";
import { getClientIp, safeCompare } from "../lib/security.js";

const redis = Redis.fromEnv();

const MAX_ID_LENGTH = 200;

function isValidId(id) {
  return typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH;
}

export default async function handler(req, res) {
  const ip = getClientIp(req);

  if (req.method === "GET") {
    const likes = await redis.hgetall("likes");
    return res.status(200).json(likes || {});
  }

  if (req.method === "POST") {
    const podeSeguir = await checkRateLimit(`rl:likes:${ip}`, 40, 60);
    if (!podeSeguir) {
      return res.status(429).json({ error: "Muitas requisições, tente novamente em instantes." });
    }

    const { id, action } = req.body || {};

    if (!isValidId(id)) {
      return res.status(400).json({ error: "id inválido" });
    }

    if (action !== "like" && action !== "unlike") {
      return res.status(400).json({ error: "action inválida" });
    }

    let count;

    if (action === "like") {
      count = await redis.hincrby("likes", id, 1);
    }

    if (action === "unlike") {
      count = await redis.hincrby("likes", id, -1);

      if (count < 0) {
        await redis.hset("likes", { [id]: 0 });
        count = 0;
      }
    }

    return res.status(200).json({ likes: count });
  }

  if (req.method === "DELETE") {
    const podeSeguir = await checkRateLimit(`rl:likes-delete:${ip}`, 5, 15 * 60);
    if (!podeSeguir) {
      return res.status(429).json({ error: "Muitas tentativas, tente novamente mais tarde." });
    }

    const senhaCorreta = process.env.ADMIN_PASSWORD?.trim();
    const token = req.headers.authorization?.replace("Bearer ", "").trim();

    if (!senhaCorreta || !token || !safeCompare(token, senhaCorreta)) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    await redis.del("likes");

    return res.status(200).json({
      message: "Todos os likes foram resetados",
    });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  return res.status(405).json({ error: "Método não permitido" });
}
