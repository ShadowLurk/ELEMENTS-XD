import axios from "axios";
import { redis } from "./redis.js";

// =============================
// 📺 STATS DO CANAL DO YOUTUBE
// =============================

const CHANNEL_HANDLE = "MinyCreeper";
const CHANNEL_URL = `https://www.youtube.com/@${CHANNEL_HANDLE}/about`;
const CACHE_KEY = "youtube:channel";

const FALLBACK = {
  subscribersText: "841 inscritos",
  videosText: "48 vídeos",
  viewsText: null,
};

function formatarNumeroPtBr(numero) {
  return new Intl.NumberFormat("pt-BR").format(numero);
}

/**
 * Busca os dados do canal pela API oficial do YouTube (youtube.googleapis.com).
 * Precisa da env var YOUTUBE_API_KEY (gratuita, cota generosa -- criar em
 * https://console.cloud.google.com/apis/library/youtube.googleapis.com).
 *
 * Essa é a fonte confiável: a API devolve "hiddenSubscriberCount" explícito,
 * então a gente nunca mais confunde "visualizações" com "inscritos" --
 * diferente do scraping de HTML, que depende do layout da página e quebra
 * toda vez que o YouTube muda alguma coisa.
 */
async function fetchYoutubeStatsViaApi() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const { data } = await axios.get(
    "https://www.googleapis.com/youtube/v3/channels",
    {
      params: {
        part: "statistics",
        forHandle: CHANNEL_HANDLE,
        key: apiKey,
      },
      timeout: 8000,
    }
  );

  const canal = data?.items?.[0];
  if (!canal) return null;

  const stats = canal.statistics || {};

  const subscribersText = stats.hiddenSubscriberCount
    ? "inscritos ocultos"
    : `${formatarNumeroPtBr(Number(stats.subscriberCount || 0))} inscritos`;

  return {
    subscribersText,
    videosText: stats.videoCount
      ? `${formatarNumeroPtBr(Number(stats.videoCount))} vídeos`
      : null,
    viewsText: stats.viewCount
      ? `${formatarNumeroPtBr(Number(stats.viewCount))} visualizações`
      : null,
    updatedAt: new Date().toISOString(),
    fonte: "api",
  };
}

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
 * Não depende de API Key nem de cota -- mas é sensível a mudanças no layout do
 * YouTube. Usado só como fallback quando YOUTUBE_API_KEY não está configurada
 * ou a API falha por algum motivo.
 */
async function scrapeYoutubeChannelHtml() {
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

  const candidatoFallback =
    extrairJson(html, "ytInitialData")
      ?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.metadata
      ?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text
      ?.content || null;

  // O fallback acima só é confiável se o texto realmente falar de
  // inscritos ("inscrito"/"subscriber"). Sem isso, em canais com a
  // contagem de inscritos oculta (config do dono do canal), o YouTube
  // não manda o campo de inscritos e esse metadataRow acaba sendo o
  // de VISUALIZAÇÕES -- e sem essa checagem a gente mostrava visitas
  // como se fossem inscritos.
  const fallbackEhInscritos =
    candidatoFallback &&
    /inscrit|subscriber/i.test(candidatoFallback);

  const subscribersText =
    extrairCampoSimpleText(html, "subscriberCountText") ||
    (fallbackEhInscritos ? candidatoFallback : null);

  const videosText =
    extrairCampoSimpleText(html, "videosCountText") ||
    extrairCampoSimpleText(html, "videoCountText");

  const viewsText = extrairViewCount(html);

  // Se não achamos um texto confiável de inscritos, é bem provável que o
  // canal esteja com essa contagem oculta -- nesse caso é melhor mostrar
  // algo honesto do que exibir visualizações no lugar.
  const subscribersTextFinal = subscribersText || "inscritos ocultos";

  return {
    subscribersText: subscribersTextFinal,
    videosText: videosText || null,
    viewsText: viewsText || null,
    updatedAt: new Date().toISOString(),
    fonte: "scraping",
  };
}

/**
 * Ponto de entrada usado pelo cron: tenta a API oficial primeiro (se tiver
 * YOUTUBE_API_KEY configurada) e só cai pro scraping de HTML se a API não
 * estiver disponível ou falhar.
 */
export async function scrapeYoutubeChannel() {
  try {
    const viaApi = await fetchYoutubeStatsViaApi();
    if (viaApi) return viaApi;
  } catch (err) {
    console.error("Erro consultando YouTube Data API, caindo pro scraping:", err.message);
  }

  return scrapeYoutubeChannelHtml();
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
