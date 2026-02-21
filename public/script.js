let todosJogos = [];
let listaFiltrada = [];
let paginaAtual = 1;

const jogosPorPagina = 12;
const MAX_VISIBLE = 5;
const LIMITE_POR_LOJA = 60;

/* =====================================
   CARREGAR JOGOS
===================================== */
function mostrarLoading() {
  const container = document.getElementById("cards-container");

  // limpa os cards
  container.innerHTML = "";

  // primeiro card vazio
  const vazio1 = document.createElement("div");
  vazio1.className = "card vazio-card";
  container.appendChild(vazio1);

  // segundo card com loading
  const loadingCard = document.createElement("div");
  loadingCard.className = "card loading-card";
  loadingCard.innerHTML = `
    <div class="spinner"></div>
    <p>Carregando ofertas...</p>
  `;
  container.appendChild(loadingCard);

  // terceiro card vazio
  const vazio2 = document.createElement("div");
  vazio2.className = "card vazio-card";
  container.appendChild(vazio2);
}

function carregarJogos() {
  mostrarLoading();

  fetch("/api/deals")
    .then((res) => res.json())
    .then((data) => {

      // ✅ usa lista já misturada do backend
todosJogos = (data.all || []);

// se quiser ainda limitar por loja, pode aplicar slice aqui
// todosJogos = (data.all || []).slice(0, LIMITE_POR_LOJA * 3);


      listaFiltrada = [...todosJogos]; // ⭐ cópia segura
      paginaAtual = 1;

      renderizar(listaFiltrada);
    })
    .catch((err) => console.error("Erro ao carregar jogos:", err));
}

/* =====================================
   RENDERIZAÇÃO DOS CARDS
===================================== */

function renderizar(lista) {
  const container = document.getElementById("cards-container");
  if (!container) return;

  container.classList.add("fade-out");

  setTimeout(() => {
    container.innerHTML = "";

    const inicio = (paginaAtual - 1) * jogosPorPagina;
    const fim = inicio + jogosPorPagina;
    const pagina = lista.slice(inicio, fim);

    pagina.forEach((jogo) => {
  const imagem = jogo.thumb || "fallback.png";
  const card = document.createElement("div");
  card.className = "card";

  if (jogo.expired) {
    card.innerHTML = `
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

  // 🔥 Selo "Novo" (vale para qualquer jogo)
  if (jogo.isNew && new Date() < new Date(jogo.newUntil)) {
    const selo = document.createElement("span");
    selo.className = "novo-selo";
    selo.textContent = "Novo";
    card.appendChild(selo);
  }

      container.appendChild(card);
    });

    renderizarPaginacao(lista.length);
    container.classList.remove("fade-out");
  }, 200);
}

/* =====================================
   PAGINAÇÃO DINÂMICA (ESTILO STEAM)
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
   FILTROS DAS LOJAS
===================================== */

function filtrar(loja, elemento) {

  // troca visual do botão ativo
  document.querySelectorAll(".filtro")
    .forEach(btn => btn.classList.remove("ativo"));

  if (elemento) {
    elemento.classList.add("ativo");
  }

  // sempre volta pra primeira página
  paginaAtual = 1;

  // aplica filtro
  if (loja === "Todos") {
    listaFiltrada = [...todosJogos];
  } else {
    listaFiltrada = todosJogos.filter(
      jogo => jogo.store === loja
    );
  }

  // re-renderiza
  renderizar(listaFiltrada);
}

/* =====================================
   INICIALIZAÇÃO
===================================== */

carregarJogos();
setInterval(carregarJogos, 300000);

/* =====================================
   SISTEMA DE TEMA
===================================== */

const button = document.getElementById("theme-Toggle");
const body = document.body;

const temaSalvo = localStorage.getItem("tema");

if (temaSalvo) {
  body.classList.remove("dark", "light");
  body.classList.add(temaSalvo);
  if (button) button.textContent = temaSalvo === "dark" ? "☀️" : "🌙";
}

if (button) {
  button.addEventListener("click", () => {
    if (body.classList.contains("dark")) {
      body.classList.replace("dark", "light");
      button.textContent = "🌙";
      localStorage.setItem("tema", "light");
    } else {
      body.classList.replace("light", "dark");
      button.textContent = "☀️";
      localStorage.setItem("tema", "dark");
    }
  });
}

/* =====================================
   ANIMAÇÃO SOBRE NÓS
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
   MENU SIDEBAR
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