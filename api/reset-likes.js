/* =====================================
   API DE RESET DE LIKES
   ===================================== */
import { redis } from "../lib/redis.js";

const SENHA = process.env.ADMIN_PASSWORD;

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { senha } = req.body;

const senhaCorreta = process.env.ADMIN_PASSWORD?.trim();

if (senha.trim() !== senhaCorreta) {
  return res.status(401).json({ error: "Senha incorreta" });
}

  try {

    await redis.flushall();

    return res.status(200).json({ message: "Likes resetados" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao resetar" });
  }
}
