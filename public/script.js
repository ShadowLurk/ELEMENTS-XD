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

const jogosPorPagina = 12;
const MAX_VISIBLE = 5;
const LIMITE_POR_LOJA = 60;


/* =====================================
   SISTEMA DE LIKES (API + LOCAL)
   ===================================== */
async function carregarLikes(){

  const res = await fetch("/api/likes");
  likesGlobal = await res.json();

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
  const rating = jogo.rating || 0;        // ex: 92
  const reviews = jogo.reviewCount || 0;  // ex: 50000

  // evita jogo com 3 reviews dominar ranking
  return rating * Math.log10(reviews + 1);
}


/* --- SCORE DE LIKES --- */
function scoreLikes(jogo){

  const id = jogo.id || jogo.title + jogo.store;

  return (likesGlobal[id] || 0) * 0.01;

}

function getLikesCount(jogo){

  const id = jogo.id || jogo.title + jogo.store;

  return likesGlobal[id] || 0;

}


/* --- SCORE FINAL --- */
function horasDesdeEntrada(jogo) {
  if (!jogo.newUntil) return 999;

  // tag "novo" dura 48h
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

  // 🔥 acabou de entrar
  if (horas < 6) {
  pesoNovidade = 0.75;
  pesoAvaliacao = 0.15;
  pesoLikes = 0.10;
}
  // ainda muito novo
  else if (horas < 24) {
  pesoNovidade = 0.55;
  pesoAvaliacao = 0.30;
  pesoLikes = 0.15;
}
  // meio do ciclo
  else if (horas < 48) {
  pesoNovidade = 0.35;
  pesoAvaliacao = 0.45;
  pesoLikes = 0.20;
}
  // deixou de ser novo
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

  // 🔥 detecta mobile
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // 👉 só 1 card no celular
    const loadingCard = document.createElement("div");
    loadingCard.className = "card loading-card";
    loadingCard.innerHTML = `
      <div class="spinner"></div>
      <p>Carregando ofertas...</p>
    `;
    container.appendChild(loadingCard);

  } else {
    // 👉 3 cards no PC (igual já está)
    
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



async function carregarDados() {

  await carregarLikes();

  try {

    // =============================
    // 🔥 1️⃣ CARREGA SÓ JOGOS
    // =============================
    const gamesRes = await fetch("/api/games");
    const gamesData = await gamesRes.json();

    // ✅ MOSTRA METAS AQUI
const metas = gamesData.metas;
if (metas) {
  const statusSteam = document.getElementById("metaSteam");
  const statusGog = document.getElementById("metaGog");
  const statusEpic = document.getElementById("metaEpic");

  if (statusSteam) {
    statusSteam.innerText = metas.steam.atingida
      ? "🔥 Steam completa!"
      : `⏳ Steam: ${metas.steam.atual}/${metas.steam.meta}`;
  }

  if (statusGog) {
    statusGog.innerText = metas.gog.atingida
      ? "🔥 GOG completa!"
      : `⏳ GOG: ${metas.gog.atual}/${metas.gog.meta}`;
  }

  if (statusEpic) {
    statusEpic.innerText = metas.epic.atingida
      ? "🔥 Epic completa!"
      : `⏳ Epic: ${metas.epic.atual}/${metas.epic.meta}`;
  }
}

    const steam = gamesData.steam || [];
    const epic = gamesData.epic || [];
    const gog = gamesData.gog || [];

    let jogos = [...steam, ...epic, ...gog];

    jogos.sort((a, b) =>
      new Date(b.addedAt) - new Date(a.addedAt)
    );

    // 👉 MOSTRA JOGOS PRIMEIRO
    listaFiltrada = jogos;
    renderizar(jogos);

    // =============================
    // 🔥 2️⃣ CARREGA PEÇAS DEPOIS
    // =============================
    const amazonRes = await fetch("/api/amazon");
    const amazonData = await amazonRes.json();
    const amazon = Object.values(amazonData || {}).flat();

    // junta tudo
    todosJogos = [...jogos, ...amazon];

    // ordena geral
    todosJogos.sort((a, b) =>
      new Date(b.addedAt) - new Date(a.addedAt)
    );

    // mistura jogos + peças
    listaMisturadaGlobal = misturarJogosEPecas(todosJogos);

    // aplica ranking
    listaMisturadaGlobal.sort((a, b) =>
      calcularScore(b) - calcularScore(a)
    );

    listaFiltrada = listaMisturadaGlobal;

    // 👉 ATUALIZA COM TUDO MISTURADO
    renderizar(listaMisturadaGlobal);

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

  if (!estaNoIndex) return;

  mostrarLoading();
  carregarDados();
}

// 🔥 Só carrega jogos se existir o container (ou seja, só no index)
document.addEventListener("DOMContentLoaded", () => {

  const path = window.location.pathname;

  const estaNoIndex =
    path === "/" ||
    path === "/index.html" ||
    path.endsWith("/index.html") ||
    path.endsWith("index.html");

});


/* =====================================
   RENDERIZAÇÃO DOS CARDS
===================================== */
function getTopLikes(lista){

  const likes = JSON.parse(localStorage.getItem("likes")) || {};

  const copia = [...lista];

  copia.sort((a,b) => {

    const idA = a.id || a.title + a.store;
    const idB = b.id || b.title + b.store;

    const likeA = likes[idA] ? 1 : 0;
    const likeB = likes[idB] ? 1 : 0;

    return likeB - likeA;

  });

  return copia.slice(0,5).map(j => j.id || j.title + j.store);

}


function renderizar(lista) {
  const container = document.getElementById("cards-container");
  if (!container) return;

  container.classList.add("fade-out");

  setTimeout(() => {
    container.innerHTML = "";

    const inicio = (paginaAtual - 1) * jogosPorPagina;
    const fim = inicio + jogosPorPagina;
    const pagina = lista.slice(inicio, fim);

    const likes = JSON.parse(localStorage.getItem("likes")) || {};
    const topLikes = getTopLikes(lista);

   pagina.forEach((jogo, index) => {

  const imagem = jogo.thumb || "fallback.png";
  const card = document.createElement("div");
  card.className = "card";

  card.style.animationDelay = `${index * 0.07}s`;

  if (jogo.expired) {
    card.innerHTML = `

    <button class="like-btn" data-id="${jogo.id || jogo.title + jogo.store}" onclick="toggleLike(event,this)">♡</button>

      <a href="${jogo.link || "#"}" target="_blank" class="card-link">
        <img loading="lazy"
             src="${imagem}"
             alt="${jogo.title}"
             onerror="this.onerror=null;this.src='fallback.png'">

        ${jogo.discount > 0 ? `<h3>-${jogo.discount}%</h3>` : ""}

        <p class="game-title">${jogo.title}</p>
        <div class="expired-msg">Promoção expirada</div>
        <small class="plataforma">${jogo.store}</small>
      </a>
    `;
  } else {
    const precoNormal = jogo.normalPriceBRL || "";
    const precoPromo = jogo.salePriceBRL || "";
    const temDesconto = jogo.discount && jogo.discount > 0;

    card.innerHTML = `
  <a href="${jogo.link || "#"}" target="_blank" class="card-link">

    <button class="like-btn" data-id="${jogo.id || jogo.title + jogo.store}" onclick="toggleLike(event,this)">♡</button>

    <img loading="lazy"
         src="${imagem}"
         alt="${jogo.title}"
         onerror="this.onerror=null;this.src='fallback.png'">

    ${temDesconto ? `<h3>-${jogo.discount}%</h3>` : ""}

    <p class="game-title">${jogo.title}</p>

    ${
      temDesconto
        ? `
        <div class="price-box">
          <span class="old">${precoNormal}</span>
          <span class="por">por</span>
          <span class="new">${precoPromo}</span>
        </div>`
        : `
        <div class="price-box">
          <span class="new">Ver na loja</span>
        </div>`
    }

    <small class="plataforma">${jogo.store}</small>

  </a>
`;
  }

const btn = card.querySelector(".like-btn");


const likesCount = getLikesCount(jogo);

const contador = document.createElement("span");
contador.className = "likes-count";
contador.textContent = likesCount;

card.appendChild(contador);

if(btn && likes[btn.dataset.id]){
  btn.textContent = "❤️";
  btn.classList.add("liked");
}



const idJogo = jogo.id || jogo.title + jogo.store;

const isTopLike = topLikes.includes(idJogo);
const isHighDiscount = jogo.discount && jogo.discount >= 75;

// 🔥 MOSTRA SELO HOT (geral)
if (isTopLike || isHighDiscount) {

  const selo = document.createElement("span");
  selo.className = "hot-selo";
  selo.textContent = "🔥 HOT";

  card.appendChild(selo);
}

// 💜 BORDA ROXA APENAS TOP LIKES
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
  const MAX_VISIBLE = 5;

  let inicio = Math.max(1, paginaAtual - 2);
  let fim = inicio + MAX_VISIBLE - 1;

  if (fim > totalPaginas) {
    fim = totalPaginas;
    inicio = Math.max(1, fim - MAX_VISIBLE + 1);
  }

  // 🔥 função helper pra criar botão
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

  // ⏮ PRIMEIRA (sempre visível)
  criarBotao("⏮", 1, paginaAtual === 1);

  // « ANTERIOR
  criarBotao("«", paginaAtual - 1, paginaAtual === 1);

  // BOTÕES NUMÉRICOS
  for (let i = inicio; i <= fim; i++) {
    const botao = document.createElement("button");
    botao.textContent = i;
    botao.className = "page-btn";

    if (i === paginaAtual) {
      botao.classList.add("active");
    }

    botao.onclick = () => {
      paginaAtual = i;
      renderizar(listaFiltrada);
    };

    paginacao.appendChild(botao);
  }

  // » PRÓXIMO
  criarBotao("»", paginaAtual + 1, paginaAtual === totalPaginas);

  // ⏭ ÚLTIMA (sempre visível)
  criarBotao("⏭", totalPaginas, paginaAtual === totalPaginas);
}


/* =====================================
   ADICIONAIS DA PAGINAÇÃO
===================================== */
function selecionar(botao) {

  // remove seleção dos outros botões
  document.querySelectorAll('.btn-plataforma')
    .forEach(btn => btn.classList.remove('ativo'));

  // ativa o botão clicado
  botao.classList.add('ativo');
}


/* =====================================
   SISTEMA DE FILTROS
   ===================================== */
function filtrar(valor, elemento) {

  const filtrosLojas = document.querySelectorAll("#filtros-lojas .filtro");
  const filtrosPecas = document.querySelectorAll(".filtro-peca");

  // =============================
  // SE FOR CATEGORIA
  // =============================
  if (valor === "Jogos" || valor === "Pecas" || valor === "Todos") {

    document.querySelectorAll(".filtro-categoria")
      .forEach(btn => btn.classList.remove("ativo"));

    if (elemento) elemento.classList.add("ativo");

    categoriaAtual = valor;
    lojaAtual = "Todas";
    paginaAtual = 1;

    // remove ativo de todas as lojas
    document.querySelectorAll(".filtro")
      .forEach(btn => btn.classList.remove("ativo"));

    const btnTodas = [...filtrosLojas]
      .find(btn => btn.textContent.trim() === "Todas");

    if (btnTodas) btnTodas.classList.add("ativo");
  }

  // =============================
  // SE FOR LOJA
  // =============================
  else {

    document.querySelectorAll(".filtro")
      .forEach(btn => btn.classList.remove("ativo"));

    if (elemento) elemento.classList.add("ativo");

    lojaAtual = valor;
    paginaAtual = 1;
  }

  // =============================
  // CONTROLE VISUAL DOS BOTÕES
  // =============================

  if (categoriaAtual === "Jogos") {

    // mostra apenas lojas de jogos
    filtrosLojas.forEach(btn => {
      const nome = btn.textContent.trim();
      btn.style.display =
        ["Todas", "Steam", "Epic", "GOG"].includes(nome)
          ? "inline-block"
          : "none";
    });

    // esconde peças
    filtrosPecas.forEach(btn => btn.style.display = "none");
  }

  else if (categoriaAtual === "Pecas") {

  // 🔥 Mostra apenas "Todas"
  filtrosLojas.forEach(btn => {
    const nome = btn.textContent.trim();
    btn.style.display =
      nome === "Todas"
        ? "inline-block"
        : "none";
  });

  // 🔥 Mostra somente filtros de peças
  filtrosPecas.forEach(btn => {
    btn.style.display = "inline-block";
  });
}

  else { // ALL

    // mostra lojas
    filtrosLojas.forEach(btn => {
      const nome = btn.textContent.trim();
      btn.style.display =
        ["Todas", "Steam", "Epic", "GOG", "Amazon"].includes(nome)
          ? "inline-block"
          : "none";
    });

    // esconde peças
    filtrosPecas.forEach(btn => btn.style.display = "none");
  }

  listaFiltrada = [...todosJogos];

  // 🔹 Filtra por categoria
  if (categoriaAtual === "Jogos") {

    listaFiltrada = listaFiltrada.filter(j =>
      ["Steam", "Epic", "GOG"].includes(j.store)
    );

  }

  else if (categoriaAtual === "Pecas") {

    listaFiltrada = listaFiltrada.filter(j =>
      ["Amazon", "AliExpress"].includes(j.store)
    );

  }

  // 🔹 Depois filtra por loja ou subcategoria
  if (lojaAtual !== "Todas") {

    if (categoriaAtual === "Pecas") {

      listaFiltrada = listaFiltrada.filter(j =>
        j.categoria === lojaAtual
      );

    } else {

      listaFiltrada = listaFiltrada.filter(j =>
        j.store === lojaAtual
      );

    }
  }

  // =============================
  // APLICA RANKING
  // =============================
 listaFiltrada.sort((a, b) =>
  calcularScore(b) - calcularScore(a)
);

// 🔥 Mistura apenas quando estiver em "Todos"
if (categoriaAtual === "Todos") {

  listaFiltrada = [...listaMisturadaGlobal];

  if (lojaAtual !== "Todas") {
    listaFiltrada = listaFiltrada.filter(item =>
      item.store?.trim().toLowerCase() === lojaAtual.trim().toLowerCase()
    );
  }

  // 🔥 aplica ranking depois da mistura
  listaFiltrada.sort((a, b) =>
    calcularScore(b) - calcularScore(a)
  );

}

  // =============================
  // RENDERIZA
  // =============================
  renderizar(listaFiltrada);
}


/* =====================================
   SISTEMA DE TEMA (DARK / LIGHT)
   ===================================== */
document.addEventListener("DOMContentLoaded", () => {

  const button = document.getElementById("theme-Toggle");
  if (!button) return;

  const body = document.body;

  // aplica tema salvo
  const temaSalvo = localStorage.getItem("tema") || "dark";

  body.classList.remove("dark", "light");
  body.classList.add(temaSalvo);

  button.textContent = temaSalvo === "dark" ? "☀️" : "🌙";

  // troca tema
  button.addEventListener("click", () => {

    const novoTema =
      body.classList.contains("dark") ? "light" : "dark";

    body.classList.replace(
      novoTema === "dark" ? "light" : "dark",
      novoTema
    );

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
      if (entry.isIntersecting) {
        sobre.classList.add("visible");
      }
    });
  });

  observer.observe(sobre);
});


/* =====================================
   MENU LATERAL (SIDEBAR)
   ===================================== */
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".menu-toggle");
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

function mostrarContato() {
  alert(
    "Teve uma ideia que podemos acrescentar no site?\n\n" +
    "Entre em contato pelo e-mail:\n" +
    "elements13dk@gmail.com"
  );
}

function irParaIndex(event, categoria) {

  if (event) event.preventDefault();

  const paginaAtual = window.location.pathname;

  // ✅ Se já estiver no index → NÃO redireciona
  if (paginaAtual.includes("index") || paginaAtual === "/") {
    filtrar(categoria, null);
    return;
  }

  // ✅ Se estiver em outra página → salva e redireciona
  sessionStorage.setItem("categoriaSelecionada", categoria);
  window.location.href = "/";
}

window.addEventListener("DOMContentLoaded", () => {

  const categoriaSalva = sessionStorage.getItem("categoriaSelecionada");

  if (categoriaSalva) {

    // Ativar botão visualmente
    document.querySelectorAll(".filtro-categoria")
      .forEach(btn => {
        btn.classList.remove("ativo");

        if (
          btn.textContent.includes("ALL") && categoriaSalva === "Todos" ||
          btn.textContent.includes("Jogos") && categoriaSalva === "Jogos" ||
          btn.textContent.includes("PC") && categoriaSalva === "Pecas"
        ) {
          btn.classList.add("ativo");
        }
      });

    filtrar(categoriaSalva, null);

    sessionStorage.removeItem("categoriaSelecionada");
  }

});

function irParaSobre() {
  window.location.href = "sobre.html";
}

function mostrarContato() {
  alert(
    "Teve uma ideia que podemos acrescentar no site?\n\n" +
    "Entre em contato pelo e-mail:\n" +
    "elements13dk@gmail.com"
  );
}

document.addEventListener("DOMContentLoaded", () => {

  const categoriaSalva = localStorage.getItem("categoriaAtiva");

  if (categoriaSalva) {
    filtrar(categoriaSalva);
  } else {
    filtrar("Todos");
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

  const jogos = lista.filter(j =>
    ["Steam", "Epic", "GOG"].includes(j.store)
  );

  const pecas = lista.filter(j =>
  ["Amazon", "AliExpress"].includes(j.store)
);

  shuffle(jogos);
  shuffle(pecas);

  const resultado = [];

  while (jogos.length > 0 || pecas.length > 0) {

    // 60% chance de jogo
    if (Math.random() < 0.6 && jogos.length > 0) {
      resultado.push(jogos.shift());
    }

    // 40% chance de peça
    else if (pecas.length > 0) {
      resultado.push(pecas.shift());
    }

    // fallback se um acabar
    else if (jogos.length > 0) {
      resultado.push(jogos.shift());
    }
  }

  return resultado;
}


/* =====================================
   PRELOADER + ATUALIZAÇÃO AUTOMÁTICA
   ===================================== */
window.addEventListener("load", () => {

  const preloader = document.getElementById("preloader");

  setTimeout(() => {

    preloader.classList.add("hide");
    document.body.classList.add("loaded");

    // 🔥 Só carrega depois que o preloader sumir
    carregarJogos();
    setInterval(() => {

  if(!document.hidden){
    carregarJogos();
  }

},450000);

  }, 3000);

});


/* =====================================
   INTERAÇÃO DE LIKE (BOTÃO ❤️)
   ===================================== */
async function toggleLike(e,btn){

  e.preventDefault();
  e.stopPropagation();

  if(btn.disabled) return;
  btn.disabled = true;

  const id = btn.dataset.id;

  const card = btn.closest(".card");
  const contador = card.querySelector(".likes-count");

  const liked = btn.classList.contains("liked");

  const action = liked ? "unlike" : "like";

  try{

    const res = await fetch("/api/likes",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body: JSON.stringify({id,action})
    });

    const data = await res.json();

    contador.textContent = data.likes;

    if(liked){
  btn.classList.remove("liked");
  btn.textContent = "♡";
  salvarLikeLocal(id, false);
  toggleFavorito(id);
}else{
  btn.classList.add("liked");
  btn.textContent = "❤️";
  salvarLikeLocal(id, true);
  toggleFavorito(id);
}


  }catch(err){
    console.error(err);
  }

  btn.disabled = false;

}


/* =====================================
   SISTEMA DE FAVORITOS
   ===================================== */
  function salvarLikeLocal(id, liked){

  let likes = JSON.parse(localStorage.getItem("likes")) || {};

  if(liked){
    likes[id] = true;
  }else{
    delete likes[id];
  }

  localStorage.setItem("likes", JSON.stringify(likes));
}

function toggleFavorito(id){

  let favoritos = getFavoritos();

  if(favoritos.includes(id)){
    favoritos = favoritos.filter(f => f !== id);
  }else{
    favoritos.push(id);
  }

  localStorage.setItem("favoritos", JSON.stringify(favoritos));

}

function getFavoritos(){
  return JSON.parse(localStorage.getItem("favoritos")) || [];
}

function mostrarFavoritos(){

  const likes = JSON.parse(localStorage.getItem("likes")) || {};

  listaFiltrada = listaMisturadaGlobal.filter(jogo => {

    const id = jogo.id || jogo.title + jogo.store;
    return likes[id];

  });

  paginaAtual = 1;
  renderizar(listaFiltrada);
}

function resetLikes() {
  fetch("/api/resetLikes", {
    method: "POST"
  }).then(() => {
    localStorage.removeItem("likes");
    location.reload();
  });
}


async function resetLikes() {
  const senha = prompt("Digite a senha:");

  if (!senha) return;

  const res = await fetch("/api/reset-likes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ senha })
  });

  const data = await res.json();

  if (res.ok) {
    alert("✅ " + data.message);
  } else {
    alert("❌ " + data.error);
  }
}
