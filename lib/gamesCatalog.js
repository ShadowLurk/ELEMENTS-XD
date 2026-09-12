import { redis } from "./redis.js";

// =============================
// 🎮 CATÁLOGO DE JOGOS (STEAM + GOG)
// =============================

const HASH_KEY = "catalog:games";
const INIT_FLAG_KEY = "catalog:games:initialized";

// Quantas horas um jogo fica marcado como "expirado" no catálogo antes de
// ser removido de vez. Com 0, ele é removido imediatamente assim que a
// verificação detecta que a promoção acabou (sem período de carência).
const HORAS_PARA_REMOVER = 0;

export function getGameId(jogo) {
  return jogo.id || `${jogo.store}:${jogo.title}`.toLowerCase();
}

export async function getStoredGames() {
  const raw = await redis.hgetall(HASH_KEY);
  if (!raw) return [];

  return Object.values(raw).map((v) =>
    typeof v === "string" ? JSON.parse(v) : v
  );
}

export async function getStoredGamesByStore(store) {
  const existentes = await getStoredGames();
  return existentes.filter((j) => j.store === store);
}

export async function countStoredGames(store) {
  const existentes = await getStoredGamesByStore(store);
  return existentes.length;
}

export async function getStoredIds(store) {
  const existentes = await getStoredGamesByStore(store);
  return new Set(existentes.map(getGameId));
}

// =============================
// ➕ ADICIONA NOVOS (SEM DUPLICAR)
// =============================

export async function addNewStoreGames(store, freshDeals) {
  const idsExistentes = await getStoredIds(store);

  const novos = freshDeals
    .filter((jogo) => !idsExistentes.has(getGameId(jogo)))
    .filter((jogo) => !!jogo.salePriceBRL);

  if (!novos.length) {
    return { store, adicionados: 0 };
  }

  const pipeline = redis.pipeline();

  novos.forEach((jogo) => {
    const id = getGameId(jogo);
    const item = { ...jogo, id, addedAt: jogo.addedAt || new Date().toISOString() };
    pipeline.hset(HASH_KEY, { [id]: JSON.stringify(item) });
  });

  await pipeline.exec();

  return { store, adicionados: novos.length };
}

// =============================
// 🚀 INICIALIZAÇÃO / RESET (padrão Amazon)
// =============================

export async function isGamesInitialized() {
  const valor = await redis.get(INIT_FLAG_KEY);
  return valor === "1" || valor === 1;
}

export async function setGamesInitialized() {
  await redis.set(INIT_FLAG_KEY, "1");
}

export async function resetAllGames() {
  await redis.del(HASH_KEY);
  await redis.del("cursor:steam");
  await redis.del("cursor:gog");
}

// =============================
// 🔄 CURSOR DE PAGINAÇÃO
// =============================

export async function getCursor(chave) {
  const valor = await redis.get(`cursor:${chave}`);
  const num = Number(valor);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

export async function setCursor(chave, valor) {
  await redis.set(`cursor:${chave}`, String(valor));
}

// =============================
// 🔍 VERIFICAÇÃO / EXPIRAÇÃO
// =============================

export async function refreshStoreGames(store, checkFn, opcoes = {}) {
  const { concorrencia = 6, delayEntreLotesMs = 350, paginacao = null } = opcoes;

  const todos = await getStoredGamesByStore(store);

  // Em vez de girar por posição (cursor numérico), seleciona sempre os
  // jogos que estão HÁ MAIS TEMPO sem ser verificados (lastVerifiedAt
  // mais antigo primeiro, undefined conta como "nunca verificado" e vai
  // pra frente da fila). Isso garante cobertura justa mesmo com o
  // catálogo mudando de tamanho/ordem entre execuções -- ninguém fica
  // esquecido pra sempre, e ninguém é verificado de novo enquanto tem
  // jogo mais atrasado esperando.
  let lote = todos;

  if (paginacao && todos.length > 0) {
    const { tamanho } = paginacao;

    lote = [...todos]
      .sort((a, b) => {
        const dataA = a.lastVerifiedAt ? new Date(a.lastVerifiedAt).getTime() : 0;
        const dataB = b.lastVerifiedAt ? new Date(b.lastVerifiedAt).getTime() : 0;
        return dataA - dataB;
      })
      .slice(0, tamanho);
  }

  let atualizados = 0;
  let expirados = 0;
  let removidos = 0;

  const pipeline = redis.pipeline();

  for (let i = 0; i < lote.length; i += concorrencia) {
    const pedaco = lote.slice(i, i + concorrencia);
    const resultados = await Promise.all(pedaco.map((jogo) => checkFn(jogo)));

    pedaco.forEach((jogo, idx) => {
      const atual = resultados[idx];

      if (!atual) return;

      if (atual.removerAgora) {
        pipeline.hdel(HASH_KEY, getGameId(jogo));
        removidos++;
        return;
      }

      if (atual.expirado) {
        const jaEstavaExpirado = jogo.expired && jogo.expiredAt;
        const expiradoDesde = jaEstavaExpirado ? jogo.expiredAt : new Date().toISOString();


        const diffHoras =
          (new Date() - new Date(expiradoDesde)) / (1000 * 60 * 60);

        if (diffHoras >= HORAS_PARA_REMOVER) {
          pipeline.hdel(HASH_KEY, getGameId(jogo));
          removidos++;
        } else {
          pipeline.hset(HASH_KEY, {
            [getGameId(jogo)]: JSON.stringify({
              ...jogo,
              expired: true,
              expiredAt: expiradoDesde,
              lastVerifiedAt: new Date().toISOString(),
            }),
          });
          expirados++;
        }
        return;
      }

      if (!atual.dados?.salePriceBRL) {
        pipeline.hdel(HASH_KEY, getGameId(jogo));
        removidos++;
        return;
      }

      pipeline.hset(HASH_KEY, {
        [getGameId(jogo)]: JSON.stringify({
          ...jogo,
          ...atual.dados,
          expired: false,
          expiredAt: null,
          lastVerifiedAt: new Date().toISOString(),
        }),
      });
      atualizados++;
    });

    if (i + concorrencia < lote.length) {
      await new Promise((r) => setTimeout(r, delayEntreLotesMs));
    }
  }

  if (lote.length) {
    await pipeline.exec();
  }

  return { store, total: lote.length, totalCatalogo: todos.length, atualizados, expirados, removidos };
}