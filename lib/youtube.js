import axios from "axios";
import { redis } from "./redis.js";

// =============================
// 📺 STATS DO CANAL DO YOUTUBE
// =============================

const CHANNEL_URL = "https://www.youtube.com/@MinyCreeper/about";
const CACHE_KEY = "youtube:channel";

const FALLBACK = {
  subscribersText: "841 inscritos",
  videosText: "48 vídeos",
  viewsText: null,
};

function extrairJson(html, varName) {
  const marcador = `var ${varName} = `;
  const inicio = html.indexOf(marcador);
  if (inicio === -1) return null;

  const jsonInicio = inicio + marcador.length;
  const jsonFim = html.indexOf(";</script>", jsonInicio);
  if (jsonFim === -1) return null;

  try {
    return JSON.parse(html.slice(jsonInicio, jsonFim));
  } catch {
    return null;
  }
}

function extrairCampoSimpleText(html, chave) {
  const regex = new RegExp(`"${chave}"\\s*:\\s*\\{\\s*"simpleText"\\s*:\\s*"([^"]+)"`);
  const match = html.match(regex);
  return match ? match[1] : null;
}

function extrairViewCount(html) {
  const direto = extrairCampoSimpleText(html, "viewCountText");
  if (direto) return direto;

  const regexRuns = /"viewCountText"\s*:\s*\{\s*"runs"\s*:\s*(\[[^\]]*\])/;
  const match = html.match(regexRuns);
  if (!match) return null;

  try {
    const runs = JSON.parse(match[1]);
    return runs.map((r) => r.text).join("");
  } catch {
    return null;
  }
}

/**
 * Busca ao vivo os dados do canal direto do YouTube (scraping da página pública).
 * Não depende de API Key nem de cota — mas é sensível a mudanças no layout do YouTube.
 */
export async function scrapeYoutubeChannel() {
  const { data: html } = await axios.get(CHANNEL_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    timeout: 8000,
    validateStatus: (status) => status < 500,
  });

  if (typeof html !== "string") {
    throw new Error("Resposta inválida do YouTube");
  }

  const subscribersText =
    extrairCampoSimpleText(html, "subscriberCountText") ||
    extrairJson(html, "ytInitialData")
      ?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.metadata
      ?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text
      ?.content ||
    null;

  const videosText =
    extrairCampoSimpleText(html, "videosCountText") ||
    extrairCampoSimpleText(html, "videoCountText");

  const viewsText = extrairViewCount(html);

  if (!subscribersText) {
    throw new Error("Não foi possível localizar o número de inscritos");
  }

  return {
    subscribersText,
    videosText: videosText || null,
    viewsText: viewsText || null,
    updatedAt: new Date().toISOString(),
  };
}

export async function getCachedYoutubeStats() {
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    return typeof cached === "string" ? JSON.parse(cached) : cached;
  }
  return { ...FALLBACK, updatedAt: null };
}

export async function saveYoutubeStats(stats) {
  await redis.set(CACHE_KEY, JSON.stringify(stats));
  return stats;
}