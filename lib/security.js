import crypto from "crypto";

/**
 * Compara duas strings em tempo constante, para evitar ataques de
 * "timing attack" na verificação de senha/token de admin.
 */
export function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Extrai o IP do cliente a partir dos headers (funciona atrás do
 * proxy da Vercel).
 */
export function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
