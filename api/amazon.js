// /api/amazon.js

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

// =============================
// CONFIGURAÇÃO AMAZON
// =============================

const AMAZON_BASE = "https://www.amazon.com.br";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Connection": "keep-alive",
};

// =============================
// CONFIG CATEGORIAS
// =============================

const CATEGORY_CONFIG = {

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
    url: "/s?i=computers&k=processador",
    categoria: "CPU",
    filter: (t) => {

      const cpu =
        t.includes("ryzen") ||
        t.includes("intel core") ||
        t.includes("core i3") ||
        t.includes("core i5") ||
        t.includes("core i7") ||
        t.includes("core i9");

      const blocked =
        t.includes("philips") ||
        t.includes("walita") ||
        t.includes("liquidificador") ||
        t.includes("multiprocessador") ||
        t.includes("alimentos");

      return cpu && !blocked;
    },
  },

  MOBO: {
    url: "/s?i=computers&k=placa+mae",
    categoria: "Placa mãe",
    filter: (t) =>
      t.includes("placa") &&
      (t.includes("mae") || t.includes("mãe")),
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
    url: "/s?i=computers&k=pc+gamer",
    categoria: "PC",
    filter: (t) =>
      t.includes("pc gamer") ||
      t.includes("vivobook") ||
      t.includes("notebook"),
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
};

// =============================
// SCRAPER
// =============================

export async function getAmazonDealsByCategory(categoryKey) {

  const config = CATEGORY_CONFIG[categoryKey];
  if (!config) throw new Error("Categoria inválida");

  const products = [];

  try {

    const { data } = await axios.get(
      `${AMAZON_BASE}${config.url}`,
      {
        headers: HEADERS,
        httpsAgent,
        timeout: 20000
      }
    );

    if (
  data.includes("Robot Check") ||
  data.includes("captcha") ||
  data.includes("Digite os caracteres")
) {
  console.log("Amazon bloqueou");
  return [];
}

    const $ = cheerio.load(data);

    $("div[data-asin]").each((i, el) => {

      const element = $(el);
      if (
  element.attr("data-component-type") ===
  "sp-sponsored-result"
) return;

      const asin = element.attr("data-asin");
      if (!asin || asin.length !== 10) return;

      const title = element.find("h2 span").text().trim();
      if (!title) return;

      const t = title.toLowerCase();
      if (!config.filter(t)) return;

      // 🔥 ignora produtos sem preço na Amazon
if (element.find(".a-price").length === 0) {
  return;
}

      let priceText =
  element.find(".a-price .a-offscreen").first().text();

if (!priceText) {
  const priceWhole =
    element.find(".a-price-whole").first().text();

  const priceFraction =
    element.find(".a-price-fraction").first().text();

  if (priceWhole) {
    priceText = `${priceWhole},${priceFraction || "00"}`;
  }
}

const salePrice = normalizePrice(priceText);

// 🔥 ignora produtos sem preço
if (!salePrice || salePrice <= 0) {
  return;
}

const oldPrice =
  element
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
          ? Math.round(
              100 - (salePrice / finalNormalPrice) * 100
            )
          : 0;

          // 🔥 ignora produtos sem desconto
if (discount <= 0) {
  return;
}

      if (salePrice <= 0) return;

      // 🔥 filtro final de segurança
if (!title || !salePrice || salePrice <= 0) {
  return;
}

      const img =
  element.find("img.s-image").attr("src") ||
  element.find("img.s-image").attr("data-src");

  // 🔥 filtro definitivo contra "ver na loja"
if (!priceText || !salePrice || !finalNormalPrice) {
  return;
}

products.push({
  title,
  thumb: img,
  normalPriceBRL: finalNormalPrice > 0 ? `R$ ${finalNormalPrice}` : null,
  salePriceBRL: salePrice > 0 ? `R$ ${salePrice}` : null,
        discount,
        store: "Amazon",
        categoria: config.categoria,
        link: `${AMAZON_BASE}/dp/${asin}`,
        expired: false,
        addedAt: new Date(),
      });

    });

   return products
  .filter(p => p.salePriceBRL && p.discount > 0)
  .slice(0, 20);

  } catch (err) {

    console.error(`Erro Amazon ${categoryKey}:`, err.message);
    return [];
  }
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

  const categories = [
    "GPU",
    "RAM",
    "CPU",
    "MOBO",
    "PSU",
    "COOLER",
    "CASE",
    "STORAGE",
    "PC",
    "Notebook"
  ];

  try {

    const results = {};
    const batchSize = 2;

    for (let i = 0; i < categories.length; i += batchSize) {

      const batch = categories.slice(i, i + batchSize);

      const responses = await Promise.all(
        batch.map(async (cat) => {

          console.log(`🟠 Buscando Amazon ${cat}`);

          const data =
            await getAmazonDealsByCategory(cat)
            .catch(() => []);

          return { cat, data };
        })
      );

      responses.forEach(({ cat, data }) => {
        results[cat] = data;
      });

      await new Promise(r =>
  setTimeout(r, 500 + Math.random() * 1000)
);
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