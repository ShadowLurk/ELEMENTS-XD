let todosJogos = [];
let listaFiltrada = [];
let paginaAtual = 1;
const jogosPorPagina = 12;

/* =====================================
   CARREGAR JOGOS
===================================== */

function carregarJogos() {
  fetch("/api/deals")
    .then((res) => res.json())
    .then((data) => {
      todosJogos = [
        ...data.steam,
        ...data.epic,
        ...data.gog,
      ];

      listaFiltrada = todosJogos;
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
                  </div>
                `
                : `
                  <div class="price-box">
                    <span class="new">Ver na loja</span>
                  </div>
                `
            }

            <small class="plataforma">${jogo.store}</small>
          </a>
        `;
      }

      container.appendChild(card);
    });

    renderizarPaginacao(lista.length);
    container.classList.remove("fade-out");
  }, 300);
}

/* =====================================
   PAGINAÇÃO
===================================== */

function renderizarPaginacao(totalJogos) {
  const paginacao = document.getElementById("pagination");
  if (!paginacao) return;

  paginacao.innerHTML = "";

  const totalPaginas = Math.ceil(totalJogos / jogosPorPagina);

  for (let i = 1; i <= totalPaginas && i <= 5; i++) {
    const botao = document.createElement("button");

    botao.textContent = i;
    botao.className = i === paginaAtual ? "active" : "";

    botao.addEventListener("click", () => {
      paginaAtual = i;
      renderizar(listaFiltrada);
    });

    paginacao.appendChild(botao);
  }
}

/* =====================================
   FILTROS
===================================== */

function filtrar(loja) {
  if (loja === "Todos") {
    listaFiltrada = todosJogos;
  } else {
    listaFiltrada = todosJogos.filter(
      (jogo) =>
        jogo.store?.trim().toLowerCase() === loja.trim().toLowerCase()
    );
  }

  paginaAtual = 1;
  renderizar(listaFiltrada);

  document.querySelectorAll(".filtro").forEach((el) => {
    el.classList.remove("ativo");

    if (el.textContent.trim().toLowerCase() === loja.trim().toLowerCase()) {
      el.classList.add("ativo");
    }
  });
}

/* =====================================
   Inicialização
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
