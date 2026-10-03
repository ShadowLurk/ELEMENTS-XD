import { getSteamDealsIncremental } from "../../lib/steam.js";
import { getGogDealsIncremental } from "../../lib/gog.js";
import { getNuuvemDealsIncremental } from "../../lib/nuuvem.js";
import { getEpicDeals } from "../epic.js";
import {
  addNewStoreGames,
  getCursor,
  setCursor,
  getStoredIds,
  isGamesInitialized,
  setGamesInitialized,
  resetAllGames,
} from "../../lib/gamesCatalog.js";
import { safeCompare } from "../../lib/security.js";

// =============================
// 🔄 SYNC DE JOGOS (alternado)
// =============================

const LOTE_INICIAL_STEAM = 100;
const LOTE_INICIAL_EPIC = 10;

const LOTE_INCREMENTAL_STEAM = 100;
const LOTE_INCREMENTAL_GOG = 100;
const LOTE_INCREMENTAL_NUUVEM = 60;

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = req.headers.authorization?.replace("Bearer ", "").trim();
  return safeCompare(token, secret);
}

async function sincronizarSteam(alvo) {
  const idsJaSalvos = await getStoredIds("Steam");
  const cursorAtual = await getCursor("steam");

  const { results, nextCursor, steamRateLimited } =
    await getSteamDealsIncremental(alvo, cursorAtual, idsJaSalvos);

  const resultado = await addNewStoreGames("Steam", results);
  await setCursor("steam", nextCursor);

  return {
    ...resultado,
    alvo,
    cursorUsado: cursorAtual,
    proximoCursor: nextCursor,
    rateLimited: steamRateLimited,
  };
}

async function sincronizarGog(alvo) {
  const idsJaSalvos = await getStoredIds("GOG");
  const cursorAtual = await getCursor("gog");

  const { results, nextCursor } =
    await getGogDealsIncremental(alvo, cursorAtual, idsJaSalvos);

  const resultado = await addNewStoreGames("GOG", results);
  await setCursor("gog", nextCursor);

  return {
    ...resultado,
    alvo,
    cursorUsado: cursorAtual,
    proximoCursor: nextCursor,
  };
}

async function sincronizarNuuvem(alvo) {
  const idsJaSalvos = await getStoredIds("Nuuvem");
  const cursorAtual = await getCursor("nuuvem");

  const { results, nextCursor } =
    await getNuuvemDealsIncremental(alvo, cursorAtual, idsJaSalvos);

  const resultado = await addNewStoreGames("Nuuvem", results);
  await setCursor("nuuvem", nextCursor);

  return {
    ...resultado,
    alvo,
    cursorUsado: cursorAtual,
    proximoCursor: nextCursor,
  };
}

async function sincronizarEpicInicial() {
  const deals = await getEpicDeals(LOTE_INICIAL_EPIC).catch((err) => {
    console.error("Erro buscando Epic:", err.message);
    return [];
  });

  const resultado = await addNewStoreGames("Epic", deals);

  return { ...resultado, alvo: LOTE_INICIAL_EPIC };
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const jaInicializado = await isGamesInitialized();

    if (!jaInicializado) {
      console.log("🆕 [sync-games] Primeira execução: resetando catálogo...");

      await resetAllGames();

      const [resultadoSteam, resultadoEpic] = await Promise.all([
        sincronizarSteam(LOTE_INICIAL_STEAM),
        sincronizarEpicInicial(),
      ]);

      await setGamesInitialized();
      await setCursor("sync-turn", 0);

      return res.status(200).json({
        ok: true,
        modo: "inicializacao",
        timestamp: new Date().toISOString(),
        steam: resultadoSteam,
        epic: resultadoEpic,
      });
    }

    // Rodízio de 3 vias entre GOG, Steam e Nuuvem -- cada execução do
    // cron cuida de uma loja por vez, girando a cada chamada.
    const ORDEM_RODIZIO = ["GOG", "Steam", "Nuuvem"];

    const turno = await getCursor("sync-turn");
    const turnoAtual = turno % ORDEM_RODIZIO.length;
    const proximoTurno = (turnoAtual + 1) % ORDEM_RODIZIO.length;

    const loja = ORDEM_RODIZIO[turnoAtual];

    let resultado;
    if (loja === "GOG") {
      resultado = await sincronizarGog(LOTE_INCREMENTAL_GOG);
    } else if (loja === "Steam") {
      resultado = await sincronizarSteam(LOTE_INCREMENTAL_STEAM);
    } else {
      resultado = await sincronizarNuuvem(LOTE_INCREMENTAL_NUUVEM);
    }

    await setCursor("sync-turn", proximoTurno);

    console.log(`🔄 [sync-games] Rodada da vez: ${loja}`);

    return res.status(200).json({
      ok: true,
      modo: "incremental-alternado",
      timestamp: new Date().toISOString(),
      lojaDaVez: loja,
      resultado,
      proximaLoja: ORDEM_RODIZIO[proximoTurno],
    });
  } catch (err) {
    console.error("Erro no sync de jogos:", err);
    return res.status(500).json({ error: "Erro ao sincronizar jogos" });
  }
}
