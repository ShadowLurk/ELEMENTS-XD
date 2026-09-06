/* =====================================
   SANITIZAÇÃO (evita XSS vindo de títulos/links raspados
   da Amazon/Steam/GOG/Epic — nunca confie em texto de terceiros
   antes de jogar em innerHTML)
   ===================================== */
function escapeHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch (e) {}
  return "#";
}

/* =====================================
   DEBUG / LOGS INICIAIS
   ===================================== */
console.log("Script carregado!");
console.log("Botão tema:", document.getElementById("theme-Toggle"));
console.log("Menu toggle:", document.querySelector(".menu-toggle"));
console.log("Sidebar:", document.querySelector(".sidebar"));
console.log("Main:", document.querySelector("main"));


/* =====================================
   ESTADO GLOBAL (DADOS DO APP)
   ===================================== */
let todosJogos = [];
let listaFiltrada = [];
let paginaAtual = 1;
let listaMisturadaGlobal = [];
let likesGlobal = {};

let categoriaAtual = "Todos";
let lojaAtual = "Todas";

const jogosPorPagina = 12;
const MAX_VISIBLE = 5;
const LIMITE_POR_LOJA = 60;

const LOJAS_PECAS = ["Amazon"];
const LOJAS_JOGOS = ["Steam", "Epic", "GOG"];


/* =====================================
   SISTEMA DE LIKES (API + LOCAL)
   ===================================== */
async function carregarLikes() {
  try {
    const res = await fetch("/api/likes");
    likesGlobal = await res.json();
  } catch (err) {
    console.error("Erro ao carregar likes:", err);
    likesGlobal = {};
  }
}


/* =====================================
   SISTEMA DE RANKING (NOVO + AVALIAÇÃO + LIKES)
   ===================================== */

/* --- SCORE DE NOVIDADE --- */
function scoreNovidade(jogo) {
  if (!jogo.isNew || !jogo.newUntil) return 10;

  const horasRestantes =
    (new Date(jogo.newUntil) - Date.now()) / 3600000;

  if (horasRestantes > 42) return 100;
  if (horasRestantes > 24) return 80;
  if (horasRestantes > 12) return 60;
  if (horasRestantes > 0) return 40;

  return 10;
}


/* --- SCORE DE AVALIAÇÃO --- */
function scoreAvaliacao(jogo) {
  const rating = jogo.rating || 0;
  const reviews = jogo.reviewCount || 0;

  return rating * Math.log10(reviews + 1);
}


/* --- SCORE DE LIKES --- */
function scoreLikes(jogo) {
  const id = jogo.id || jogo.title + jogo.store;
  return (likesGlobal[id] || 0) * 0.01;
}

function getLikesCount(jogo) {
  const id = jogo.id || jogo.title + jogo.store;
  return likesGlobal[id] || 0;
}


/* --- SCORE FINAL --- */
function horasDesdeEntrada(jogo) {
  if (!jogo.newUntil) return 999;

  const entrada = new Date(jogo.newUntil).getTime() - (48 * 3600000);
  return (Date.now() - entrada) / 3600000;
}


function calcularScore(jogo) {

  const novidade = scoreNovidade(jogo);
  const avaliacao = scoreAvaliacao(jogo);
  const likes = scoreLikes(jogo) * 15;

  const horas = horasDesdeEntrada(jogo);

  let pesoNovidade;
  let pesoAvaliacao;
  let pesoLikes = 0.25;

  if (horas < 6) {
    pesoNovidade = 0.75;
    pesoAvaliacao = 0.15;
    pesoLikes = 0.10;
  }
  else if (horas < 24) {
    pesoNovidade = 0.55;
    pesoAvaliacao = 0.30;
    pesoLikes = 0.15;
  }
  else if (horas < 48) {
    pesoNovidade = 0.35;
    pesoAvaliacao = 0.45;
    pesoLikes = 0.20;
  }
  else {
    pesoNovidade = 0.10;
    pesoAvaliacao = 0.65;
    pesoLikes = 0.25;
  }

  return (novidade * pesoNovidade) +
    (avaliacao * pesoAvaliacao) +
    (likes * pesoLikes);
}


/* =====================================
   CARREGAR JOGOS
===================================== */
function mostrarLoading() {
  const container = document.getElementById("cards-container");
  if (!container) return;

  container.innerHTML = "";

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    const loadingCard = document.createElement("div");
    loadingCard.className = "card loading-card";
    loadingCard.innerHTML = `
      <div class="spinner"></div>
      <p>Carregando ofertas...</p>
    `;
    container.appendChild(loadingCard);

  } else {
    const vazio1 = document.createElement("div");
    vazio1.className = "card vazio-card";
    container.appendChild(vazio1);

    const loadingCard = document.createElement("div");
    loadingCard.className = "card loading-card";
    loadingCard.innerHTML = `
      <div class="spinner"></div>
      <p>Carregando ofertas...</p>
    `;
    container.appendChild(loadingCard);

    const vazio2 = document.createElement("div");
    vazio2.className = "card vazio-card";
    container.appendChild(vazio2);
  }
}


/* =====================================
   🔥 CARREGAMENTO PROGRESSIVO POR LOJA
===================================== */
async function carregarDados() {

  await carregarLikes();

  try {

    // =============================
    // 1️⃣ CATÁLOGO DE JOGOS (Steam + GOG)
    // =============================
    const catalogRes = await fetch("/api/catalog");
    const catalogData = await catalogRes.json();

    const games = catalogData.games || [];

    const steam = games.filter((j) => j.store === "Steam");
    const gog = games.filter((j) => j.store === "GOG");

    const statusSteam = document.getElementById("metaSteamNum");
    if (statusSteam) {
      statusSteam.textContent = steam.length.toLocaleString("pt-BR");
    }

    const statusGog = document.getElementById("metaGogNum");
    if (statusGog) {
      statusGog.textContent = gog.length.toLocaleString("pt-BR");
    }

    // =============================
    // 2️⃣ EPIC — busca ao vivo (poucos itens, muda pouco)
    // =============================
    const epicRes = await fetch("/api/epic");
    const epicData = await epicRes.json();
    const epic = epicData.epic || [];

    const statusEpic = document.getElementById("metaEpicNum");
    if (statusEpic && epicData.meta) {
      statusEpic.textContent = epicData.meta.atingida
        ? "Completa"
        : `${epicData.meta.atual}/${epicData.meta.meta}`;
    }

    // =============================
    // 3️⃣ AMAZON — catálogo acumulado
    // =============================
    const amazonRes = await fetch("/api/amazon-catalog");
    const amazonData = await amazonRes.json();
    const amazon = amazonData?.produtos || [];

    // =============================
    // 4️⃣ JUNTA TUDO
    // =============================
    todosJogos = [...games, ...epic, ...amazon].filter(
      (j) => j.expired || j.salePriceBRL
    );

    todosJogos.sort((a, b) =>
      new Date(b.addedAt) - new Date(a.addedAt)
    );

    const totalJogos = games.length + epic.length;
    const totalPecas = amazon.length;

    const statusJogosHero = document.getElementById("metaJogosNum");
    if (statusJogosHero) statusJogosHero.textContent = `+${totalJogos.toLocaleString("pt-BR")}`;

    const statusPecasHero = document.getElementById("metaPecasNum");
    if (statusPecasHero) statusPecasHero.textContent = `+${totalPecas.toLocaleString("pt-BR")}`;

    const statusOfertasAtivas = document.getElementById("metaOfertasAtivas");
    if (statusOfertasAtivas) {
      const ativas = todosJogos.filter(j => !j.expired).length;
      statusOfertasAtivas.textContent = `${ativas.toLocaleString("pt-BR")} OFERTAS ATIVAS`;
    }

    listaMisturadaGlobal = misturarJogosEPecas(todosJogos);
    listaMisturadaGlobal.sort((a, b) => calcularScore(b) - calcularScore(a));

    listaFiltrada = listaMisturadaGlobal;

    filtrar(categoriaAtual, null);

  } catch (err) {
    console.error(err);
  }
}

function carregarJogos() {
  const path = window.location.pathname;

  const estaNoIndex =
    path === "/" ||
    path.endsWith("index.html") ||
    path.endsWith("/index");

  if (estaNoIndex) {
    mostrarLoading();
    carregarDados();
    return;
  }

  if (document.getElementById("metaJogosNumSobre") || document.getElementById("metaPecasNumSobre")) {
    carregarContadoresSobre();
  }
}

async function carregarContadoresSobre() {
  try {
    const [catalogRes, epicRes, amazonRes] = await Promise.all([
      fetch("/api/catalog"),
      fetch("/api/epic"),
      fetch("/api/amazon-catalog"),
    ]);

    const catalogData = await catalogRes.json();
    const epicData = await epicRes.json();
    const amazonData = await amazonRes.json();

    const games = catalogData.games || [];
    const epic = epicData.epic || [];
    const amazon = amazonData?.produtos || [];

    const totalJogos = games.length + epic.length;
    const totalPecas = amazon.length;

    const statusJogosSobre = document.getElementById("metaJogosNumSobre");
    if (statusJogosSobre) statusJogosSobre.textContent = `+${totalJogos.toLocaleString("pt-BR")}`;

    const statusPecasSobre = document.getElementById("metaPecasNumSobre");
    if (statusPecasSobre) statusPecasSobre.textContent = `+${totalPecas.toLocaleString("pt-BR")}`;

  } catch (err) {
    console.error("Erro ao carregar contadores da página Sobre:", err);
  }
}


document.addEventListener("DOMContentLoaded", () => {

  const headerSearchInput = document.getElementById("headerSearchInput");
  const searchInputEl = document.getElementById("searchInput");

  if (headerSearchInput && searchInputEl) {
    headerSearchInput.addEventListener("input", () => {
      searchInputEl.value = headerSearchInput.value;
      searchInputEl.dispatchEvent(new Event("input"));
    });
  }

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (headerSearchInput) headerSearchInput.focus();
    }
  });

  /* Pesquisa */
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  function buscarJogos(termo) {
    paginaAtual = 1;

    const termoLower = termo.toLowerCase();

    if (!termoLower) {
      filtrar(categoriaAtual);
      return;
    }

    let base = [...todosJogos];

    if (categoriaAtual === "Jogos") {
      base = base.filter(j => LOJAS_JOGOS.includes(j.store));
    }
    else if (categoriaAtual === "Pecas") {
      base = base.filter(j => LOJAS_PECAS.includes(j.store));
    }

    if (lojaAtual !== "Todas") {
      base = base.filter(j => j.store === lojaAtual);
    }

    listaFiltrada = base.filter(jogo =>
      jogo.title?.toLowerCase().includes(termoLower)
    );

    renderizar(listaFiltrada);
  }

  searchInput.addEventListener("input", () => {
    buscarJogos(searchInput.value);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      buscarJogos(searchInput.value);
    }
  });

});


/* =====================================
   ÍCONES DAS LOJAS
===================================== */
function getStoreIcon(store) {
  const nome = (store || "").trim().toLowerCase();
  const mapa = {
    steam: "img/steam.png",
    epic: "img/epic.png",
    gog: "img/gog.png",
    amazon: "img/amazon.png"
  };
  return mapa[nome] || "";
}


/* =====================================
   RENDERIZAÇÃO DOS CARDS
===================================== */
function getTopLikes(lista) {

  const likes = JSON.parse(localStorage.getItem("likes")) || {};
  const copia = [...lista];

  copia.sort((a, b) => {
    const idA = a.id || a.title + a.store;
    const idB = b.id || b.title + b.store;
    const likeA = likes[idA] ? 1 : 0;
    const likeB = likes[idB] ? 1 : 0;
    return likeB - likeA;
  });

  return copia.slice(0, 5).map(j => j.id || j.title + j.store);
}


function renderizar(lista) {
  const container = document.getElementById("cards-container");
  if (!container) return;

  container.classList.add("fade-out");

  setTimeout(() => {
    container.innerHTML = "";

    if (!lista || lista.length === 0) {
      const vazio = document.createElement("div");
      vazio.className = "no-results";
      vazio.innerHTML = `
        <div class="no-results-icon">🔍</div>
        <p class="no-results-title">Nada encontrado</p>
        <p class="no-results-sub">Não há promoções nessa categoria no momento. Volte mais tarde!</p>
      `;
      container.appendChild(vazio);

      renderizarPaginacao(0);
      container.classList.remove("fade-out");
      return;
    }

    const inicio = (paginaAtual - 1) * jogosPorPagina;
    const fim = inicio + jogosPorPagina;
    const pagina = lista.slice(inicio, fim);

    const likes = JSON.parse(localStorage.getItem("likes")) || {};
    const topLikes = getTopLikes(lista);

    pagina.forEach((jogo, index) => {

      const imagem = sanitizeUrl(jogo.thumb || "fallback.png");
      const card = document.createElement("div");
      card.className = "card";
      card.style.animationDelay = `${index * 0.07}s`;

      const iconeLoja = getStoreIcon(jogo.store);
      const lojaHtml = `${iconeLoja ? `<img src="${escapeHtml(iconeLoja)}" alt="">` : ""}<span class="badge-plataforma-texto">${escapeHtml(jogo.store || "")}</span>`;

      const idBase = jogo.id || jogo.title + jogo.store;
      let hash = 0;
      for (let i = 0; i < idBase.length; i++) hash = (hash * 31 + idBase.charCodeAt(i)) >>> 0;
      const rating = (4.4 + (hash % 60) / 100).toFixed(1);
      const desconto = jogo.discount || 0;
      const tag = desconto >= 70 ? "Imperdível" : desconto >= 40 ? "Quente" : desconto >= 15 ? "Popular" : "Recomendado";

      const linkSafe = sanitizeUrl(jogo.link || "#");
      const tituloSafe = escapeHtml(jogo.title || "");
      const idBaseSafe = escapeHtml(idBase);

      if (jogo.expired) {
        card.innerHTML = `
          <a href="${linkSafe}" target="_blank" rel="noopener noreferrer" class="card-link">
            <div class="card-media">
              <img loading="lazy" src="${imagem}" alt="${tituloSafe}" onerror="this.onerror=null;this.src='fallback.png'">
              <span class="badge-plataforma">${lojaHtml}</span>
            </div>
            <div class="card-body">
              <div class="card-body-top">
                <p class="game-title">${tituloSafe}</p>
                <button class="like-btn" data-id="${idBaseSafe}" onclick="toggleLike(event,this)">♡</button>
              </div>
              <div class="expired-msg">Promoção expirada</div>
              <div class="card-footer-row">
                <span class="card-tag">🔥 Indisponível</span>
              </div>
            </div>
          </a>
        `;
      } else {
        const precoNormal = escapeHtml(jogo.normalPriceBRL || "");
        const precoPromo = escapeHtml(jogo.salePriceBRL || "");
        const temDesconto = jogo.discount && jogo.discount > 0;

        card.innerHTML = `
          <a href="${linkSafe}" target="_blank" rel="noopener noreferrer" class="card-link">
            <div class="card-media">
              <img loading="lazy" src="${imagem}" alt="${tituloSafe}" onerror="this.onerror=null;this.src='fallback.png'">
              <span class="badge-plataforma">${lojaHtml}</span>
              ${temDesconto ? `<span class="badge-desconto">-${desconto}%</span>` : ""}
            </div>
            <div class="card-body">
              <div class="card-body-top">
                <p class="game-title">${tituloSafe}</p>
                <button class="like-btn" data-id="${idBaseSafe}" onclick="toggleLike(event,this)">♡</button>
              </div>
              ${temDesconto
                ? `<div class="price-box">
                     <span class="old">${precoNormal}</span>
                     <span class="new">${precoPromo}</span>
                   </div>`
                : `<div class="price-box">
                     <span class="new">Ver na loja</span>
                   </div>`
              }
              <div class="card-footer-row">
                <span class="card-tag">🔥 ${tag}</span>
                <span class="card-rating">★ ${rating}</span>
              </div>
            </div>
          </a>
        `;
      }

      const btn = card.querySelector(".like-btn");
      const likesCount = getLikesCount(jogo);

      const contador = document.createElement("span");
      contador.className = "likes-count";
      contador.textContent = likesCount;
      card.appendChild(contador);

      if (btn && likes[btn.dataset.id]) {
        btn.textContent = "❤️";
        btn.classList.add("liked");
      }

      const idJogo = jogo.id || jogo.title + jogo.store;
      const isTopLike = topLikes.includes(idJogo);
      const isHighDiscount = jogo.discount && jogo.discount >= 75;

      if (isTopLike || isHighDiscount) {
        const selo = document.createElement("span");
        selo.className = "hot-selo";
        selo.textContent = "🔥 HOT";
        card.appendChild(selo);
      }

      if (isTopLike) {
        card.classList.add("hot-card");
      }

      container.appendChild(card);
    });

    renderizarPaginacao(lista.length);
    container.classList.remove("fade-out");
  }, 200);
}


/* =====================================
   SISTEMA DE PAGINAÇÃO
   ===================================== */
function renderizarPaginacao(totalJogos) {
  const paginacao = document.getElementById("pagination");
  if (!paginacao) return;

  paginacao.innerHTML = "";

  const totalPaginas = Math.ceil(totalJogos / jogosPorPagina);

  let inicio = Math.max(1, paginaAtual - 2);
  let fim = inicio + MAX_VISIBLE - 1;

  if (fim > totalPaginas) {
    fim = totalPaginas;
    inicio = Math.max(1, fim - MAX_VISIBLE + 1);
  }

  function criarBotao(texto, paginaDestino, desabilitado = false) {
    const btn = document.createElement("button");
    btn.textContent = texto;
    btn.className = "page-btn";

    if (desabilitado) {
      btn.classList.add("disabled");
    } else {
      btn.onclick = () => {
        paginaAtual = paginaDestino;
        renderizar(listaFiltrada);
      };
    }

    paginacao.appendChild(btn);
  }

  criarBotao("⏮", 1, paginaAtual === 1);
  criarBotao("«", paginaAtual - 1, paginaAtual === 1);

  for (let i = inicio; i <= fim; i++) {
    const botao = document.createElement("button");
    botao.textContent = i;
    botao.className = "page-btn";

    if (i === paginaAtual) botao.classList.add("active");

    botao.onclick = () => {
      paginaAtual = i;
      renderizar(listaFiltrada);
    };

    paginacao.appendChild(botao);
  }

  criarBotao("»", paginaAtual + 1, paginaAtual === totalPaginas);
  criarBotao("⏭", totalPaginas, paginaAtual === totalPaginas);
}


/* =====================================
   ADICIONAIS DA PAGINAÇÃO
===================================== */
function selecionar(botao) {
  document.querySelectorAll('.btn-plataforma')
    .forEach(btn => btn.classList.remove('ativo'));
  botao.classList.add('ativo');
}


/* =====================================
   SISTEMA DE FILTROS (BARRA UNIFICADA)
   ===================================== */
function marcarCategoryCardAtivo(categoria) {
  const mapa = { Jogos: 0, Pecas: 1, Todos: 2 };
  const cards = document.querySelectorAll(".category-nav .category-card");
  cards.forEach((card, i) => {
    card.classList.toggle("ativo", i === mapa[categoria]);
  });
}

function filtrarUnificado(valor, elemento) {

  document.querySelectorAll("#filtros-principal .chip")
    .forEach(chip => chip.classList.remove("ativo"));
  if (elemento) elemento.classList.add("ativo");

  if (valor === "Todas") {
    filtrar("Todos", null);
    marcarCategoryCardAtivo("Todos");
    return;
  }

  if (valor === "Jogos" || valor === "Pecas") {
    filtrar(valor, null);
    marcarCategoryCardAtivo(valor);
    return;
  }

  categoriaAtual = "Todos";
  filtrar(valor, null);
  document.querySelectorAll(".icon-nav-item[data-categoria]").forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.categoria === "Todos");
  });
  marcarCategoryCardAtivo("Todos");
}

// =====================================
// SUZUKI RECOMENDA (só ofertas 75%+ off)
// =====================================
function filtrarSuzukiRecomenda() {
  const chipTodas = document.querySelector('#filtros-principal .chip');

  filtrarUnificado('Todas', chipTodas);

  listaFiltrada = listaFiltrada.filter(jogo => (jogo.discount || 0) >= 75);
  paginaAtual = 1;

  renderizar(listaFiltrada);

  document.getElementById('cards-container')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function marcarChipAtivo(categoria) {
  const mapa = { Todos: "Todas", Jogos: "Jogos", Pecas: "Peças" };
  const texto = mapa[categoria];
  if (texto) {
    document.querySelectorAll("#filtros-principal .chip").forEach(chip => {
      chip.classList.toggle("ativo", chip.textContent.trim() === texto);
    });
  }

  document.querySelectorAll(".icon-nav-item[data-categoria]").forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.categoria === categoria);
  });

  marcarCategoryCardAtivo(categoria);
}

function filtrar(valor, elemento) {

  const filtrosPecas = document.querySelectorAll(".filtro-peca");

  // =============================
  // SE FOR CATEGORIA PRINCIPAL
  // =============================
  if (valor === "Jogos" || valor === "Pecas" || valor === "Todos") {

    document.querySelectorAll(".filtro-categoria")
      .forEach(btn => btn.classList.remove("ativo"));

    if (elemento) elemento.classList.add("ativo");

    categoriaAtual = valor;
    lojaAtual = "Todas";
    paginaAtual = 1;

    marcarChipAtivo(valor);
  }

  // =============================
  // SE FOR LOJA OU SUBCATEGORIA
  // =============================
  else {

    if (categoriaAtual === "Pecas" && !LOJAS_PECAS.includes(valor)) {
      filtrosPecas.forEach(btn => btn.classList.remove("ativo"));
      if (elemento) elemento.classList.add("ativo");
    }

    lojaAtual = valor;
    paginaAtual = 1;
  }

  // =============================
  // CONTROLE VISUAL DA SUBCATEGORIA DE PEÇAS
  // =============================
  filtrosPecas.forEach(btn => {
    btn.style.display = categoriaAtual === "Pecas" ? "inline-block" : "none";
  });

  // =============================
  // MONTA LISTA FILTRADA
  // =============================
  listaFiltrada = [...todosJogos];

  if (categoriaAtual === "Jogos") {
    listaFiltrada = listaFiltrada.filter(j => LOJAS_JOGOS.includes(j.store));
  }
  else if (categoriaAtual === "Pecas") {
    listaFiltrada = listaFiltrada.filter(j => LOJAS_PECAS.includes(j.store));
  }

  if (lojaAtual !== "Todas") {

    if (LOJAS_PECAS.includes(lojaAtual)) {
      listaFiltrada = listaFiltrada.filter(j => j.store === lojaAtual);

    } else if (categoriaAtual === "Pecas") {
      listaFiltrada = listaFiltrada.filter(j => j.categoria === lojaAtual);

    } else {
      listaFiltrada = listaFiltrada.filter(j =>
        j.store?.trim().toLowerCase() === lojaAtual.trim().toLowerCase()
      );
    }
  }

  // =============================
  // APLICA RANKING
  // =============================
  listaFiltrada.sort((a, b) => calcularScore(b) - calcularScore(a));

  if (categoriaAtual === "Todos") {

    listaFiltrada = [...listaMisturadaGlobal];

    if (lojaAtual !== "Todas") {
      listaFiltrada = listaFiltrada.filter(item =>
        item.store?.trim().toLowerCase() === lojaAtual.trim().toLowerCase()
      );
    }

    listaFiltrada.sort((a, b) => calcularScore(b) - calcularScore(a));
  }

  if (todosJogos.length === 0) {
    mostrarLoading();
    return;
  }

  renderizar(listaFiltrada);
}


/* =====================================
   SISTEMA DE TEMA (DARK / LIGHT)
   ===================================== */
document.addEventListener("DOMContentLoaded", () => {

  const button = document.getElementById("theme-Toggle");
  if (!button) return;

  const body = document.body;
  const temaSalvo = localStorage.getItem("tema") || "dark";

  body.classList.remove("dark", "light");
  body.classList.add(temaSalvo);
  button.textContent = temaSalvo === "dark" ? "☀️" : "🌙";

  button.addEventListener("click", () => {
    const novoTema = body.classList.contains("dark") ? "light" : "dark";
    body.classList.replace(novoTema === "dark" ? "light" : "dark", novoTema);
    button.textContent = novoTema === "dark" ? "☀️" : "🌙";
    localStorage.setItem("tema", novoTema);
  });

});


/* =====================================
   ANIMAÇÕES (INTERSECTION OBSERVER)
   ===================================== */
document.addEventListener("DOMContentLoaded", () => {
  const sobre = document.querySelector(".sobre-nos");
  if (!sobre) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) sobre.classList.add("visible");
    });
  });

  observer.observe(sobre);
});


/* =====================================
   MENU LATERAL (SIDEBAR)
   ===================================== */
document.addEventListener("DOMContentLoaded", () => {
  const toggle  = document.querySelector(".menu-toggle");
  const sidebar = document.querySelector(".sidebar");
  const content = document.querySelector("main");

  if (!toggle || !sidebar) return;

  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("active");
    if (content) content.classList.toggle("shift");
  });
});


/* =====================================
   NAVEGAÇÃO (INDEX / SOBRE)
   ===================================== */
function irParaSobre() {
  window.location.href = "sobre.html";
}

function irParaParceiros(event) {
  if (event) event.preventDefault();

  const path = window.location.pathname;
  const estaNoIndex = path === "/" || path.endsWith("index.html") || path.endsWith("/index");

  if (estaNoIndex) {
    document.querySelector(".parceiros")?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  sessionStorage.setItem("scrollToParceiros", "1");
  window.location.href = "/";
}

function mostrarContato() {
  alert(
    "Teve uma ideia que podemos acrescentar no site?\n\n" +
    "E-mail: elements13dk@gmail.com\n" +
    "Instagram: @elements.xd"
  );
}

function irParaIndex(event, categoria) {
  if (event) event.preventDefault();

  const paginaAtual = window.location.pathname;

  if (paginaAtual.includes("index") || paginaAtual === "/") {
    filtrar(categoria, null);
    return;
  }

  sessionStorage.setItem("categoriaSelecionada", categoria);
  window.location.href = "/";
}

window.addEventListener("DOMContentLoaded", () => {

  if (!document.getElementById("filtros-principal")) return;

  const categoriaSalva = sessionStorage.getItem("categoriaSelecionada");
  const categoriaInicial = categoriaSalva || "Todos";

  filtrar(categoriaInicial, null);

  if (categoriaSalva) {
    sessionStorage.removeItem("categoriaSelecionada");
  }

  if (sessionStorage.getItem("scrollToParceiros")) {
    sessionStorage.removeItem("scrollToParceiros");
    setTimeout(() => {
      document.querySelector(".parceiros")?.scrollIntoView({ behavior: "smooth" });
    }, 600);
  }

});


/* =====================================
   MISTURA DE JOGOS E PEÇAS (SHUFFLE)
   ===================================== */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function misturarJogosEPecas(lista) {

  const jogos = lista.filter(j => LOJAS_JOGOS.includes(j.store));
  const pecas = lista.filter(j => LOJAS_PECAS.includes(j.store));

  shuffle(jogos);
  shuffle(pecas);

  const resultado = [];

  while (jogos.length > 0 || pecas.length > 0) {
    if (Math.random() < 0.6 && jogos.length > 0) {
      resultado.push(jogos.shift());
    } else if (pecas.length > 0) {
      resultado.push(pecas.shift());
    } else if (jogos.length > 0) {
      resultado.push(jogos.shift());
    }
  }

  return resultado;
}


/* =====================================
   PRELOADER + ATUALIZAÇÃO AUTOMÁTICA
   ===================================== */

function initPreloaderGlow() {
  const preloader = document.getElementById("preloader");
  if (!preloader) return;

  const glow = preloader.querySelector(".preloader-glow");
  if (!glow) return;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReducedMotion) return;

  let ativo = true;
  window.__pararPreloaderGlow = () => { ativo = false; };

  window.addEventListener("mousemove", (e) => {
    if (!ativo) return;
    preloader.style.setProperty("--mx", `${e.clientX}px`);
    preloader.style.setProperty("--my", `${e.clientY}px`);
  });

  window.addEventListener("touchmove", (e) => {
    if (!ativo || !e.touches[0]) return;
    preloader.style.setProperty("--mx", `${e.touches[0].clientX}px`);
    preloader.style.setProperty("--my", `${e.touches[0].clientY}px`);
  }, { passive: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPreloaderGlow);
} else {
  initPreloaderGlow();
}

window.addEventListener("load", () => {

  const preloader = document.getElementById("preloader");

  if (!preloader) {
    carregarJogos();
    setInterval(() => {
      if (!document.hidden) carregarJogos();
    }, 450000);
    return;
  }

  setTimeout(() => {
    preloader.classList.add("hide");
    window.__pararPreloaderGlow?.();
    document.body.classList.add("loaded");

    carregarJogos();

    setInterval(() => {
      if (!document.hidden) carregarJogos();
    }, 450000);

  }, 3000);

});


/* =====================================
   INTERAÇÃO DE LIKE (BOTÃO ❤️)
   ===================================== */
async function toggleLike(e, btn) {

  e.preventDefault();
  e.stopPropagation();

  if (btn.disabled) return;
  btn.disabled = true;

  const id = btn.dataset.id;
  const card = btn.closest(".card");
  const contador = card.querySelector(".likes-count");
  const liked = btn.classList.contains("liked");
  const action = liked ? "unlike" : "like";

  try {
    const res = await fetch("/api/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action })
    });

    const data = await res.json();
    contador.textContent = data.likes;

    if (liked) {
      btn.classList.remove("liked");
      btn.textContent = "♡";
      salvarLikeLocal(id, false);
      toggleFavorito(id);
    } else {
      btn.classList.add("liked");
      btn.textContent = "❤️";
      salvarLikeLocal(id, true);
      toggleFavorito(id);
    }

  } catch (err) {
    console.error(err);
  }

  btn.disabled = false;
}


/* =====================================
   SISTEMA DE FAVORITOS
   ===================================== */
function salvarLikeLocal(id, liked) {
  let likes = JSON.parse(localStorage.getItem("likes")) || {};
  if (liked) { likes[id] = true; } else { delete likes[id]; }
  localStorage.setItem("likes", JSON.stringify(likes));
}

function toggleFavorito(id) {
  let favoritos = getFavoritos();
  if (favoritos.includes(id)) {
    favoritos = favoritos.filter(f => f !== id);
  } else {
    favoritos.push(id);
  }
  localStorage.setItem("favoritos", JSON.stringify(favoritos));
}

function getFavoritos() {
  return JSON.parse(localStorage.getItem("favoritos")) || [];
}

function mostrarFavoritos() {
  const likes = JSON.parse(localStorage.getItem("likes")) || {};
  listaFiltrada = listaMisturadaGlobal.filter(jogo => {
    const id = jogo.id || jogo.title + jogo.store;
    return likes[id];
  });
  paginaAtual = 1;
  renderizar(listaFiltrada);
}

