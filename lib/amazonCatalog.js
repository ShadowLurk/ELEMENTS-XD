import { redis } from "./redis.js";

// =============================
// 🛒 CATÁLOGO AMAZON (PEÇAS DE PC)
// =============================

const HASH_KEY = "catalog:amazon";
const CURSOR_KEY = "cursor:amazon-categoria";

export const CATEGORY_ORDER = [
  "PC",
  "GPU",
  "RAM",
  "CPU",
  "MOBO",
  "PSU",
  "COOLER",
  "CASE",
  "STORAGE",
  "MONITOR",
  "TECLADO",
  "MOUSE",
  "HEADSET",
];

export function getProductId(produto) {
  return produto.id;
}

export async function getStoredAmazonProducts() {
  const raw = await redis.hgetall(HASH_KEY);
  if (!raw) return [];

  return Object.values(raw).map((v) =>
    typeof v === "string" ? JSON.parse(v) : v
  );
}

export async function getStoredAmazonByCategoryKey(categoryKey) {
  const existentes = await getStoredAmazonProducts();
  return existentes.filter((p) => p.categoryKey === categoryKey);
}

export async function getStoredAmazonIds(categoryKey) {
  const existentes = await getStoredAmazonByCategoryKey(categoryKey);
  return new Set(existentes.map(getProductId));
}

// =============================
// ➕ ADICIONA NOVOS (SEM DUPLICAR)
// =============================

export async function addNewAmazonProducts(categoryKey, freshDeals, limitNovos = 10) {
  const idsExistentes = await getStoredAmazonIds(categoryKey);

  const novos = freshDeals
    .filter((p) => p && getProductId(p) && !idsExistentes.has(getProductId(p)))
    .slice(0, limitNovos);

  if (!novos.length) {
    return { categoryKey, adicionados: 0 };
  }

  const pipeline = redis.pipeline();

  novos.forEach((produto) => {
    const item = {
      ...produto,
      categoryKey,
      addedAt: produto.addedAt || new Date().toISOString(),
    };
    pipeline.hset(HASH_KEY, { [getProductId(produto)]: JSON.stringify(item) });
  });

  await pipeline.exec();

  return { categoryKey, adicionados: novos.length };
}

// =============================
// 🔄 CURSOR DE ROTAÇÃO
// =============================

export async function getCategoriaCursor() {
  const valor = await redis.get(CURSOR_KEY);
  const num = Number(valor);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

export async function setCategoriaCursor(valor) {
  await redis.set(CURSOR_KEY, String(valor));
}

// =============================
// 🔍 VERIFICAÇÃO / EXPIRAÇÃO
// =============================

export async function refreshAmazonProducts(categoryKey, checkFn) {
  const existentes = await getStoredAmazonByCategoryKey(categoryKey);

  let atualizados = 0;
  let removidos = 0;

  const pipeline = redis.pipeline();

  for (const produto of existentes) {
    const atual = await checkFn(produto);

    if (!atual) continue;

    if (atual.expirado || atual.removerAgora) {
      pipeline.hdel(HASH_KEY, getProductId(produto));
      removidos++;
      continue;
    }

    pipeline.hset(HASH_KEY, {
      [getProductId(produto)]: JSON.stringify({
        ...produto,
        ...atual.dados,
        expired: false,
      }),
    });
    atualizados++;
  }

  if (existentes.length) {
    await pipeline.exec();
  }

  return { categoryKey, total: existentes.length, atualizados, removidos };
}
