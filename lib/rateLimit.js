import { redis } from "./redis.js";

/**
 * Rate limit simples por janela fixa, usando o mesmo Redis do projeto.
 * Retorna true se a requisição PODE seguir, false se estourou o limite.
 *
 * Ex: checkRateLimit(`rl:like:${ip}`, 30, 60) => no máximo 30 chamadas
 * a cada 60 segundos para essa chave.
 */
export async function checkRateLimit(key, limit, windowSeconds) {
  try {
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    return count <= limit;
  } catch (err) {
    console.error("Erro no rate limit:", err.message);
    return true;
  }
}
