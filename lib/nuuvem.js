/* =====================================
   NUUVEM (web scraping -- sem API oficial liberada)
   ===================================== */

import axios from "axios";
import * as cheerio from "cheerio";

// =============================
// ⚙️ CONFIG
// =============================

const BASE_URL = "https://www.nuuvem.com";
const LISTING_PATH = "/br-pt/promo/ofertas-nuuvem/sort/date/sort-mode/desc";

// Ativações conhecidas da Nuuvem, na ordem em que aparecem no texto do
// card -- usado só pra identificar qual é a "loja de ativação" do jogo
// (Steam, GOG.com, Epic Games etc), não a Nuuvem em si (a Nuuvem é quem
// vende a chave, mas o jogo ativa em uma dessas plataformas).
const ATIVACOES_CONHECIDAS = [
  "Steam",
  "GOG.com",
  "Epic Games",
  "Ubisoft Connect",
  "Origin",
  "EA App",
  "Rockstar Games Social Club",
  "Battle.net",
  "Microsoft Store",
  "Playstation Store",
  "Nintendo eShop",
  "App Store",
  "Google Play Store",
  "DRM-Free",
];

function headersNuuvem() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
}

// =============================
// 🧠 Helpers
// =============================

function normalizePrice(texto) {
  if (!texto) return 0;

  return Number(
    texto
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "")
      .trim()
  );
}

function isConteudoBloqueado(titulo) {
  const t = titulo.toLowerCase();

  if (
    t.includes("soundtrack") ||
    t.includes("dlc") ||
    t.includes("season pass") ||
    t.includes("bundle") ||
    t.includes("pacote") ||
    t.includes("gift card") ||
    t.includes("moeda virtual") ||
    t.includes("drops")
  )
    return true;

  if (
    t.includes("18+") ||
    t.includes("adult") ||
    t.includes("hentai") ||
    t.includes("eroge") ||
    t.includes("erotic") ||
    t.includes("nude") ||
    t.includes("xxx")
  )
    return true;

  return false;
}

function filtrarDuplicadosPorLink(jogos) {
  const vistos = new Set();

  return jogos.filter((j) => {
    if (vistos.has(j.link)) return false;
    vistos.add(j.link);
    return true;
  });
}

function detectarAtivacao(textoCompleto) {
  for (const nome of ATIVACOES_CONHECIDAS) {
    if (textoCompleto.includes(nome)) return nome;
  }
  return "Nuuvem";
}

/**
 * A página da Nuuvem não expõe uma API/JSON interna como a GOG -- cada
 * card de jogo é um <a href="/br-pt/item/slug"> com todo o conteúdo
 * (loja, título, plataformas, preço, desconto) dentro, como texto plano.
 * Por isso o parser lê o texto completo do link e extrai os pedaços por
 * regex, em vez de depender de nomes de classe CSS específicos -- essas
 * sim mudam com qualquer reestilização visual do site, o texto bruto é
 * mais estável.
 */
function parseNuuvemListingPage(html) {
  const produtos = [];

  if (
    html.includes("fila virtual") ||
    html.includes("captcha") ||
    html.length < 20000
  ) {
    console.log("🟡 [Nuuvem] Possível bloqueio/fila -- página incomum, pulando.");
    return { produtos, bloqueado: true };
  }

  const $ = cheerio.load(html);

  $('a[href*="/item/"]').each((_, el) => {
    const element = $(el);

    const href = element.attr("href");
    if (!href) return;

    const link = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const titulo = (element.attr("title") || "").trim();
    if (!titulo) return;
    if (isConteudoBloqueado(titulo)) return;

    const textoCompleto = element.text().replace(/\s+/g, " ").trim();

    // Pré-venda não tem desconto de verdade pra valer (preço ainda não
    // é o final), então não entra como "oferta".
    if (textoCompleto.includes("Pré-Venda")) return;

    const descontoMatch = textoCompleto.match(/-(\d{1,3})%/);
    if (!descontoMatch) return; // sem desconto = não é oferta

    const discount = parseInt(descontoMatch[1], 10);
    if (!discount || discount <= 0) return;

    const precosEncontrados = [...textoCompleto.matchAll(/R\$\s?[\d.,]+/g)].map(
      (m) => m[0]
    );
    if (precosEncontrados.length < 2) return;

    const normalPriceBRL = precosEncontrados[0];
    const salePriceBRL = precosEncontrados[1];

    if (normalizePrice(normalPriceBRL) <= normalizePrice(salePriceBRL)) return;

    const ativacao = detectarAtivacao(textoCompleto);

    const thumb = element.find("img").first().attr("src") || "";

    produtos.push({
      title: titulo,
      thumb,
      normalPriceBRL,
      salePriceBRL,
      discount,
      store: "Nuuvem",
      ativacao,
      link,
      expired: false,
      expiredAt: null,
      addedAt: new Date().toISOString(),
    });
  });

  return { produtos: filtrarDuplicadosPorLink(produtos), bloqueado: false };
}

async function buscarPagina(numeroPagina) {
  const path =
    numeroPagina <= 1 ? LISTING_PATH : `${LISTING_PATH}/page/${numeroPagina}`;

  const { data } = await axios.get(`${BASE_URL}${path}`, {
    headers: headersNuuvem(),
    timeout: 10000,
    validateStatus: (status) => status < 500,
  });

  if (typeof data !== "string") {
    return { produtos: [], bloqueado: true };
  }

  return parseNuuvemListingPage(data);
}

// =============================
// 🟠 Nuuvem Deals — busca completa (usada pela verificação)
// =============================
export async function getNuuvemDeals(limite) {
  const resultados = [];
  let page = 1;
  const MAX_PAGINAS = 20;

  try {
    while (resultados.length < limite && page <= MAX_PAGINAS) {
      const { produtos, bloqueado } = await buscarPagina(page);

      if (bloqueado) break;
      if (!produtos.length) break;

      resultados.push(...produtos);
      page++;

      await new Promise((r) => setTimeout(r, 300));
    }

    return filtrarDuplicadosPorLink(resultados).slice(0, limite);
  } catch (err) {
    console.error("Erro Nuuvem:", err.message);
    return [];
  }
}

// =============================
// 🟠 Nuuvem Deals — busca INCREMENTAL (lote pequeno por execução)
// =============================
export async function getNuuvemDealsIncremental(
  quantidadeAlvo,
  cursorPage,
  idsJaSalvos
) {
  const MAX_PAGINAS_POR_EXECUCAO = 15;

  const results = [];
  let page = cursorPage || 1;
  let paginasLidas = 0;
  let acabouOMercado = false;

  try {
    while (
      results.length < quantidadeAlvo &&
      paginasLidas < MAX_PAGINAS_POR_EXECUCAO
    ) {
      const { produtos, bloqueado } = await buscarPagina(page);

      if (bloqueado) {
        // Bloqueio/fila -- não avança o cursor, tenta de novo do mesmo
        // ponto na próxima execução do cron.
        break;
      }

      if (!produtos.length) {
        acabouOMercado = true;
        break;
      }

      for (const jogo of produtos) {
        const candidatoId = `nuuvem:${jogo.title.toLowerCase().trim()}`;
        if (idsJaSalvos.has(candidatoId)) continue;

        results.push(jogo);
        if (results.length >= quantidadeAlvo) break;
      }

      page++;
      paginasLidas++;
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch (err) {
    console.error("Erro Nuuvem (incremental):", err.message);
  }

  const nextCursor = acabouOMercado ? 1 : page;

  return {
    results: filtrarDuplicadosPorLink(results),
    nextCursor,
  };
}

// =============================
// 🟠 Verifica o preço ATUAL de 1 jogo já salvo (pela própria página dele)
// =============================
//
// Diferente da GOG/Epic (que devolvem o catálogo inteiro de ofertas em
// uma chamada só, permitindo comparar em memória), o catálogo da Nuuvem
// é grande demais (milhares de itens, dezenas de páginas) pra buscar de
// novo por inteiro a cada verificação. Comparar só contra uma fatia
// recente faria o sistema remover por engano jogos que ainda estão em
// oferta, só por terem "descido" na lista de mais recentes. Por isso,
// aqui a verificação é feita item a item, direto na página salva do
// jogo (igual a Steam faz por appid).
export async function checkNuuvemPriceByLink(link) {
  try {
    const { data: html } = await axios.get(link, {
      headers: headersNuuvem(),
      timeout: 8000,
      validateStatus: (status) => status < 500,
    });

    if (typeof html !== "string" || html.length < 5000) {
      return null;
    }

    if (html.includes("fila virtual") || html.includes("captcha")) {
      return null;
    }

    const $ = cheerio.load(html);
    const textoCompleto = $("body").text().replace(/\s+/g, " ").trim();

    const descontoMatch = textoCompleto.match(/-(\d{1,3})%/);

    if (!descontoMatch) {
      // Sem badge de desconto na página = promoção acabou.
      return { expirado: true };
    }

    const discount = parseInt(descontoMatch[1], 10);
    if (!discount || discount <= 0) {
      return { expirado: true };
    }

    // Pega os preços logo depois do primeiro "-NN%" encontrado, que é
    // o bloco principal de preço da página (o antes-e-depois do item).
    const trechoAposDesconto = textoCompleto.slice(descontoMatch.index);
    const precos = [...trechoAposDesconto.matchAll(/R\$\s?[\d.,]+/g)]
      .slice(0, 2)
      .map((m) => m[0]);

    if (precos.length < 2) {
      return null; // não deu pra confirmar com segurança -- não mexe
    }

    const [normalPriceBRL, salePriceBRL] = precos;

    if (normalizePrice(normalPriceBRL) <= normalizePrice(salePriceBRL)) {
      return null;
    }

    return {
      expirado: false,
      dados: { normalPriceBRL, salePriceBRL, discount },
    };
  } catch (err) {
    return null; // erro de rede/timeout -- não mexe, tenta de novo depois
  }
}
