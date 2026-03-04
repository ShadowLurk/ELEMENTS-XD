// /api/amazon.js

import axios from "axios";
import * as cheerio from "cheerio";

// =============================
// 🔥 CACHE EM MEMÓRIA
// =============================

let amazonCache = null;
let amazonLastUpdate = 0;

// 6 HORAS (igual ao CDN)
const AMAZON_CACHE_TIME = 6 * 60 * 60 * 1000;




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
// CONFIGURAÇÃO DAS CATEGORIAS
// =============================

const AMAZON_BASE = "https://www.amazon.com.br";

const CATEGORY_CONFIG = {
  GPU: {
    url: "/s?i=computers&k=placa+de+video",
    categoria: "GPU",
    filter: (t) =>
      (t.includes("rtx") ||
        t.includes("gtx") ||
        t.includes("radeon") ||
        t.includes("rx ")) &&
      t.includes("gb"),
  },

  RAM: {
    url: "/s?i=computers&k=memoria+ram",
    categoria: "RAM",
    filter: (t) =>
      t.includes("ram") &&
      (t.includes("ddr4") ||
        t.includes("ddr5") ||
        t.includes("ddr6")),
  },

  CPU: {
  url: "/s?i=computers&k=processador",
  categoria: "CPU",
  filter: (t) => {

    const hasCPUBrand =
      t.includes("ryzen") ||
      t.includes("intel core") ||
      t.includes("core i3") ||
      t.includes("core i5") ||
      t.includes("core i7") ||
      t.includes("core i9");

    const blocked =
      t.includes("philips") ||
      t.includes("walita") ||
      t.includes("powerchop") ||
      t.includes("liquidificador") ||
      t.includes("multiprocessador") ||
      t.includes("processador de alimentos") ||
      t.includes("processador de comida");

    return hasCPUBrand && !blocked;
  }
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
        t.includes("gold") ||
        t.includes("silver") ||
        t.includes("platinum")),
  },

  COOLER: {
    url: "/s?i=computers&k=cooler+pc",
    categoria: "Cooler",
    filter: (t) =>
      t.includes("fan") ||
      t.includes("cpu cooler") ||
      t.includes("water cooler") ||
      t.includes("air cooler"),
  },

  CASE: {
    url: "/s?i=computers&k=gabinete+pc",
    categoria: "Gabinete",
    filter: (t) =>
      t.includes("gabinete") &&
      (t.includes("atx") ||
        t.includes("micro atx") ||
        t.includes("mini itx") ||
        t.includes("mid tower") ||
        t.includes("full tower")),
  },

  STORAGE: {
    url: "/s?i=computers&k=ssd+hd",
    categoria: "Armazenamento",
    filter: (t) => {
      const isSSD =
        (t.includes("ssd") || t.includes("nvme")) &&
        (t.includes("gb") || t.includes("tb"));

      const isHD =
        (t.includes("hd") || t.includes("hdd")) &&
        (t.includes("gb") || t.includes("tb"));

      const blocked =
        t.includes("windows") ||
        t.includes("notebook") ||
        t.includes("case") ||
        t.includes("adaptador") ||
        t.includes("cabo") ||
        t.includes("dock") ||
        t.includes("externo") ||
        t.includes("usb");

      return (isSSD || isHD) && !blocked;
    },
  },

  PC: {
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
// FUNÇÃO GENÉRICA
// =============================

export async function getAmazonDealsByCategory(categoryKey) {
  const config = CATEGORY_CONFIG[categoryKey];
  if (!config) throw new Error("Categoria inválida");

  const products = [];

  try {
    for (let page = 1; page <= 2; page++) {
      await new Promise((r) => setTimeout(r, 300));

      const { data } = await axios.get(
        `${AMAZON_BASE}${config.url}&page=${page}`,
        {
          headers: {
  "User-Agent": "...",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "Referer": "https://www.google.com/",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
},
          timeout: 10000,
        }
      );

      const $ = cheerio.load(data);

      $(".s-result-item[data-component-type='s-search-result']")
        .each((i, el) => {

          const title = $(el).find("h2 span").text().trim();
          if (!title) return;

          const t = title.toLowerCase();
          if (!config.filter(t)) return;

          const asin = $(el).attr("data-asin");

if (!asin || asin.length !== 10) return;

const link = `${AMAZON_BASE}/dp/${asin}`;

          const priceWhole = $(el)
            .find(".a-price-whole")
            .first()
            .text();

          const priceFraction = $(el)
            .find(".a-price-fraction")
            .first()
            .text();

          const oldPrice = $(el)
            .find(".a-price.a-text-price span")
            .first()
            .text();

          if (!priceWhole) return;

          const salePrice = normalizePrice(
            priceWhole + "," + priceFraction
          );

          const normalPrice = normalizePrice(oldPrice);

          const discount =
            normalPrice > 0
              ? Math.round(
                  100 - (salePrice / normalPrice) * 100
                )
              : 0;

          if (discount <= 0) return;

          products.push({
            title,
            thumb: $(el).find("img.s-image").attr("src"),
            normalPriceBRL: `R$ ${normalPrice}`,
            salePriceBRL: `R$ ${salePrice}`,
            discount,
            store: "Amazon",
            categoria: config.categoria,
            link,
            expired: false,
            addedAt: new Date(),
          });
        });
    }

    return products.slice(0, 20);

  } catch (err) {
    console.error(`Erro Amazon ${categoryKey}:`, err.message);
    return [];
  }
}



export default async function handler(req, res) {

  // 🔥 Cache CDN (6 horas)
  res.setHeader(
    "Cache-Control",
    "s-maxage=21600, stale-while-revalidate=3600"
  );

  const now = Date.now();

  // ✅ CACHE EM MEMÓRIA (super rápido)
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
    "PC"
  ];

  try {
    const results = {};
    const batchSize = 3;

    for (let i = 0; i < categories.length; i += batchSize) {
      const batch = categories.slice(i, i + batchSize);

      const responses = await Promise.all(
        batch.map(async (cat) => {
          console.log(`🟠 Buscando Amazon ${cat}...`);
          const data = await getAmazonDealsByCategory(cat).catch(() => []);
          return { cat, data };
        })
      );

      responses.forEach(({ cat, data }) => {
        results[cat] = data;
      });

      // 🔥 pequeno delay entre lotes (anti bloqueio)
      await new Promise(r => setTimeout(r, 400));
    }

    // ✅ salva no cache memória
    amazonCache = results;
    amazonLastUpdate = now;

    return res.status(200).json(results);

  } catch (err) {
    console.error("Erro geral Amazon:", err.message);
    return res.status(500).json({ error: "Erro ao buscar Amazon" });
  }
}