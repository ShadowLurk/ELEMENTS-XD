/* =====================================
   API DA AMAZON
   ===================================== */

import axios from "axios";
import * as cheerio from "cheerio";
import https from "https";

// =============================
// 🔥 AGENT (CONEXÃO PERSISTENTE)
// =============================

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 5
});

// =============================
// 🔥 CACHE EM MEMÓRIA
// =============================

let amazonCache = null;
let amazonLastUpdate = 0;

const AMAZON_CACHE_TIME = 12 * 60 * 60 * 1000;

// =============================
// HELPERS
// =============================

function normalizePrice(value) {
  if (!value) return 0;

  return Number(
    value
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "")
      .trim()
  );
}

const AMAZON_TAG = "elementsxd-20";

export function addAmazonAffiliate(link) {
  if (!link) return link;

  try {
    const url = new URL(link);

    if (!url.hostname.includes("amazon")) {
      return link;
    }

    url.searchParams.set("tag", AMAZON_TAG);

    return url.toString();

  } catch (err) {
    return link;
  }
}

function getRandomCategories(allCategories, limit = 3) {
  const shuffled = [...allCategories].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, limit);
}

// =============================
// CONFIGURAÇÃO AMAZON
// =============================

const AMAZON_BASE = "https://www.amazon.com.br";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1"
];

function getHeaders() {
  return {
    "User-Agent":
      USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],

    "Accept-Language": "pt-BR,pt;q=0.9",

    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",

    "Connection": "keep-alive",
  };
}

// =============================
// CONFIG CATEGORIAS
// =============================

export const CATEGORY_CONFIG = {

  GPU: {
    url: "/s?i=computers&k=placa+de+video",
    categoria: "GPU",
    filter: (t) =>
      (t.includes("rtx") ||
        t.includes("gtx") ||
        t.includes("radeon") ||
        t.includes("rx")) &&
      t.includes("gb"),
  },

  RAM: {
    url: "/s?i=computers&k=memoria+ram",
    categoria: "RAM",
    filter: (t) => {

      const hasCapacity =
        t.includes("8gb") ||
        t.includes("16gb") ||
        t.includes("32gb") ||
        t.includes("64gb");

      const hasDDR =
        t.includes("ddr4") ||
        t.includes("ddr5");

      return hasCapacity && hasDDR;
    },
  },

  CPU: {
    url: [
      "/s?i=computers&k=processador+intel",
      "/s?i=computers&k=processador+amd+ryzen",
      "/s?i=computers&k=processador+gamer",
    ],
    categoria: "CPU",
    filter: (t) => {

      const hasCPUBrand =
        t.includes("ryzen 5") ||
        t.includes("ryzen 7") ||
        t.includes("ryzen 9") ||
        t.includes("core ultra") ||
        t.includes("i5") ||
        t.includes("i7") ||
        t.includes("i9");

      const blocked =
        t.includes("philips") ||
        t.includes("walita") ||
        t.includes("powerchop") ||
        t.includes("liquidificador") ||
        t.includes("multiprocessador") ||
        t.includes("processador de alimentos") ||
        t.includes("processador de comida");

      return hasCPUBrand && !blocked;
    },
  },

  MOBO: {
    url: "/s?i=computers&k=placa+mae",
    categoria: "Placa mãe",
    filter: (t) => {
      const isMobo =
        t.includes("placa") &&
        (t.includes("mae") || t.includes("mãe"));

      const isAtual =
        t.includes("am4") ||
        t.includes("am5") ||
        t.includes("b450") ||
        t.includes("b550") ||
        t.includes("x570") ||
        t.includes("a520") ||
        t.includes("b650") ||
        t.includes("x670") ||
        t.includes("b850") ||
        t.includes("x870") ||
        t.includes("b660") ||
        t.includes("b760") ||
        t.includes("z690") ||
        t.includes("z790") ||
        t.includes("z890") ||
        t.includes("lga1700") ||
        t.includes("lga 1700") ||
        t.includes("lga1851") ||
        t.includes("lga 1851");

      return isMobo && isAtual;
    },
  },

  PSU: {
    url: "/s?i=computers&k=fonte+pc",
    categoria: "Fonte",
    filter: (t) =>
      t.includes("fonte") &&
      (t.includes("w") ||
        t.includes("80 plus") ||
        t.includes("bronze") ||
        t.includes("gold")),
  },

  COOLER: {
    url: "/s?i=computers&k=cooler+pc",
    categoria: "Cooler",
    filter: (t) =>
      t.includes("cooler") ||
      t.includes("fan") ||
      t.includes("water cooler"),
  },

  CASE: {
    url: "/s?i=computers&k=gabinete+pc",
    categoria: "Gabinete",
    filter: (t) => t.includes("gabinete"),
  },

  STORAGE: {
    url: "/s?i=computers&k=ssd+nvme",
    categoria: "Armazenamento",
    filter: (t) => {

      const isSSD =
        (t.includes("ssd") || t.includes("nvme")) &&
        (t.includes("gb") || t.includes("tb"));

      const blocked =
        t.includes("case") ||
        t.includes("adaptador") ||
        t.includes("externo") ||
        t.includes("dock") ||
        t.includes("usb");

      return isSSD && !blocked;
    },
  },

  PC: {
    url: [
      "/s?i=computers&k=pc+gamer",
      "/s?i=computers&k=computador+gamer",
      "/s?i=computers&k=pc+gamer+completo",
    ],
    categoria: "PC",
    filter: (t) => {
      const isDesktopGamer =
        t.includes("pc gamer") ||
        t.includes("computador gamer") ||
        t.includes("pc completo");

      const isPeçaAvulsa =
        t.includes("gabinete") ||
        t.includes("kit") ||
        t.includes("placa mae") ||
        t.includes("placa mãe") ||
        t.includes("ssd") ||
        t.includes("memoria") ||
        t.includes("memória") ||
        t.includes("fonte");

      return (
        (isDesktopGamer && !isPeçaAvulsa) ||
        t.includes("vivobook") ||
        t.includes("notebook")
      );
    },
  },

  Notebook: {
    url: "/s?i=computers&k=computador+notebook",
    categoria: "PC",
    filter: (t) => {
      const isNotebook =
        t.includes("notebook") || t.includes("laptop");

      const isDesktop =
        (t.includes("pc gamer") ||
          t.includes("computador gamer") ||
          t.includes("pc completo")) &&
        !(
          t.includes("gabinete") ||
          t.includes("kit") ||
          t.includes("placa") ||
          t.includes("ssd") ||
          t.includes("memoria")
        );

      return isNotebook || isDesktop;
    },
  },

  MONITOR: {
    url: [
      "/s?i=computers&k=monitor+gamer",
      "/s?i=computers&k=monitor+para+pc",
    ],
    categoria: "Monitor",
    filter: (t) => {
      const isMonitor =
        t.includes("monitor") &&
        (t.includes("polegadas") ||
          t.includes('"') ||
          t.includes("hz") ||
          t.includes("full hd") ||
          t.includes("ips") ||
          t.includes("led"));

      const blocked =
        t.includes("suporte") ||
        t.includes("cabo") ||
        t.includes("adaptador") ||
        t.includes("braço") ||
        t.includes("bracadeira");

      return isMonitor && !blocked;
    },
  },

  TECLADO: {
    url: [
      "/s?i=computers&k=teclado+gamer",
      "/s?i=computers&k=teclado+mecanico",
    ],
    categoria: "Teclado",
    filter: (t) => {
      const isTeclado = t.includes("teclado");

      const blocked =
        t.includes("capa") ||
        t.includes("skin") ||
        t.includes("adesivo") ||
        t.includes("suporte");

      return isTeclado && !blocked;
    },
  },

  MOUSE: {
    url: [
      "/s?i=computers&k=mouse+gamer",
      "/s?i=computers&k=mouse+sem+fio",
    ],
    categoria: "Mouse",
    filter: (t) => {
      const isMouse = t.includes("mouse");

      const blocked =
        t.includes("mousepad") ||
        t.includes("pad para mouse") ||
        t.includes("suporte") ||
        t.includes("bungee");

      return isMouse && !blocked;
    },
  },

  HEADSET: {
    url: [
      "/s?i=computers&k=headset+gamer",
      "/s?i=computers&k=fone+de+ouvido+microfone",
      "/s?i=computers&k=microfone+para+pc",
    ],
    categoria: "Headset",
    filter: (t) => {
      const isHeadset =
        t.includes("headset") ||
        (t.includes("fone") && (t.includes("microfone") || t.includes("gamer"))) ||
        t.includes("microfone");

      const blocked =
        t.includes("capa") ||
        t.includes("almofada") ||
        t.includes("suporte para fone");

      return isHeadset && !blocked;
    },
  },
};

// =============================
// SCRAPER
// =============================

function parseAmazonSearchPage(data, config) {

  const products = [];

  if (
    data.includes("Robot Check") ||
    data.includes("captcha") ||
    data.includes("Digite os caracteres") ||
    data.length < 50000
  ) {
    console.log("Amazon bloqueou");
    return products;
  }

  const $ = cheerio.load(data);

  $("div[data-asin]").each((i, el) => {

    const element = $(el);
    if (element.attr("data-component-type") === "sp-sponsored-result") return;

    const asin = element.attr("data-asin");
    if (!asin || asin.length !== 10) return;

    const title = element.find("h2 span").text().trim();
    if (!title) return;

    const t = title.toLowerCase();
    if (!config.filter(t)) return;

    if (element.find(".a-price").length === 0) return;

    let priceText = element.find(".a-price .a-offscreen").first().text();

    if (!priceText) {
      const priceWhole = element.find(".a-price-whole").first().text();
      const priceFraction = element.find(".a-price-fraction").first().text();

      if (priceWhole) {
        priceText = `${priceWhole},${priceFraction || "00"}`;
      }
    }

    const salePrice = normalizePrice(priceText);
    if (!salePrice || salePrice <= 0) return;

    const oldPrice = element
      .find(".a-price.a-text-price span.a-offscreen")
      .first()
      .text();

    const normalPrice = normalizePrice(oldPrice);

    let finalNormalPrice = normalPrice;
    if (!finalNormalPrice || finalNormalPrice < salePrice) {
      finalNormalPrice = salePrice;
    }

    const discount =
      finalNormalPrice > salePrice
        ? Math.round(100 - (salePrice / finalNormalPrice) * 100)
        : 0;

    if (discount < 10) return;
    if (!title || !salePrice || !finalNormalPrice) return;

    // =============================
    // 🖼️ IMAGEM VIA ASIN
    // =============================

    const imgElement = element.find("img.s-image");
    let img = null;

    const dynamic = imgElement.attr("data-a-dynamic-image");
    if (dynamic) {
      try {
        const json = JSON.parse(dynamic);
        const melhor = Object.entries(json).sort((a, b) => b[1][0] - a[1][0])[0];
        if (melhor) img = melhor[0];
      } catch (e) {}
    }

    if (!img) {
      const srcset = imgElement.attr("srcset");
      if (srcset) {
        const parts = srcset.split(",");
        const ultimo = parts[parts.length - 1].trim().split(" ")[0];
        if (ultimo && !ultimo.startsWith("data:")) img = ultimo;
      }
    }

    if (!img || img.startsWith("data:")) {
      img = `https://m.media-amazon.com/images/P/${asin}.jpg`;
    }

    products.push({
      id: `amazon:${asin}`,
      title,
      thumb: img,
      normalPriceBRL: finalNormalPrice > 0 ? `R$ ${finalNormalPrice}` : null,
      salePriceBRL: salePrice > 0 ? `R$ ${salePrice}` : null,
      discount,
      store: "Amazon",
      categoria: config.categoria,
      link: addAmazonAffiliate(`${AMAZON_BASE}/dp/${asin}`),
      expired: false,
      addedAt: new Date(),
    });

  });

  return products;
}

export async function getAmazonDealsByCategory(categoryKey) {

  const config = CATEGORY_CONFIG[categoryKey];
  if (!config) throw new Error("Categoria inválida");

  const paths = Array.isArray(config.url) ? config.url : [config.url];

  const porAsin = new Map();

  for (const path of paths) {
    try {

      const { data } = await axios.get(
        `${AMAZON_BASE}${path}`,
        {
          headers: getHeaders(),
          httpsAgent,
          timeout: 20000
        }
      );

      const encontrados = parseAmazonSearchPage(data, config);

      encontrados.forEach((p) => {
        if (!porAsin.has(p.id)) porAsin.set(p.id, p);
      });

      if (paths.length > 1) {
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
      }

    } catch (err) {
      console.error(`Erro Amazon ${categoryKey} (${path}):`, err.message);
    }
  }

  return Array.from(porAsin.values())
    .filter(p => p.salePriceBRL && p.discount > 0)
    .slice(0, 16);
}

// =============================
// API HANDLER
// =============================

export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "s-maxage=43200, stale-while-revalidate=7200, stale-if-error=86400"
  );

  const now = Date.now();

  if (amazonCache && now - amazonLastUpdate < AMAZON_CACHE_TIME) {
    console.log("⚡ Amazon vindo do cache memória");
    return res.status(200).json(amazonCache);
  }

  const ALL_CATEGORIES = [
    "GPU",
    "RAM",
    "CPU",
    "MOBO",
    "PSU",
    "COOLER",
    "CASE",
    "STORAGE",
    "PC",
    "Notebook",
    "MONITOR",
    "TECLADO",
    "MOUSE",
    "HEADSET"
  ];

  const categories = ALL_CATEGORIES;

  try {

    const results = {};
    const batchSize = 2;

    for (let i = 0; i < categories.length; i += batchSize) {

      const batch = categories.slice(i, i + batchSize);

      const responses = await Promise.all(
        batch.map(async (cat) => {
          console.log(`🟠 Buscando Amazon ${cat}`);

          const data = await getAmazonDealsByCategory(cat).catch(() => []);

          return { cat, data };
        })
      );

      responses.forEach(({ cat, data }) => {
        results[cat] = data;
      });

      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    }

    amazonCache = results;
    amazonLastUpdate = now;

    return res.status(200).json(results);

  } catch (err) {
    console.error("Erro geral Amazon:", err.message);

    return res.status(500).json({
      error: "Erro ao buscar Amazon"
    });
  }
}
