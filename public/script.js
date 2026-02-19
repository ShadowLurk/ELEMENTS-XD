let todosJogos = [];
let listaFiltrada = []; // 🔥 guarda o filtro atual
let paginaAtual = 1;
const jogosPorPagina = 12;

function carregarJogos() {
  fetch("/api/deals")
    .then((res) => res.json())
    .then((data) => {
      todosJogos = [
        ...data.steam,
        ...data.epic,
        ...data.gog
      ];
      listaFiltrada = todosJogos; // 🔥 inicia mostrando todos
      renderizar(listaFiltrada);
    })
    .catch((err) => console.error("Erro ao carregar jogos:", err));
}

function renderizar(lista) {
  const container = document.getElementById("cards-container");

  // 🔥 aplica fade-out antes de trocar conteúdo
  container.classList.add("fade-out");

  setTimeout(() => {
    container.innerHTML = "";

    // Calcula início e fim da página
    const inicio = (paginaAtual - 1) * jogosPorPagina;
    const fim = inicio + jogosPorPagina;
    const pagina = lista.slice(inicio, fim);

    pagina.forEach((jogo) => {
      console.log("Plataforma recebida:", jogo.store);

      const imagem = jogo.thumb || "fallback.png";
      const card = document.createElement("div");
      card.className = "card";

      if (jogo.expired) {
        card.innerHTML = `
          <a href="${jogo.link || "#"}" target="_blank" class="card-link">
            <img src="${imagem}" alt="${jogo.title}" 
                 onerror="this.onerror=null;this.src='fallback.png'">
            <h3>-${jogo.discount || 0}%</h3>
            <p class="game-title">${jogo.title}</p>
            <div class="expired-msg">Promoção expirada</div>
            <small class="plataforma">${jogo.store}</small>
          </a>
        `;
      } else {
        const precoNormal = jogo.normalPriceBRL || "Indisponível";
        const precoPromo = jogo.salePriceBRL || "Indisponível";

        card.innerHTML = `
          <a href="${jogo.link || "#"}" target="_blank" class="card-link">
            <img src="${imagem}" alt="${jogo.title}" 
                 onerror="this.onerror=null;this.src='fallback.png'">
            <h3>-${jogo.discount || 0}%</h3>
            <p class="game-title">${jogo.title}</p>
            <div class="price-box">
              <span class="old">${precoNormal}</span>
              <span class="por">por</span>
              <span class="new">${precoPromo}</span>
            </div>
            <small class="plataforma">${jogo.store}</small>
          </a>
        `;
      }

      container.appendChild(card);
    });

    renderizarPaginacao(lista.length);

    // 🔥 remove fade-out para voltar ao normal (fade-in)
    container.classList.remove("fade-out");
  }, 300); // tempo da animação
}

function renderizarPaginacao(totalJogos) {
  const paginacao = document.getElementById("pagination");
  paginacao.innerHTML = "";

  const totalPaginas = Math.ceil(totalJogos / jogosPorPagina);

  for (let i = 1; i <= totalPaginas && i <= 5; i++) {
    const botao = document.createElement("button");
    botao.textContent = i;
    botao.className = (i === paginaAtual) ? "active" : "";
    botao.addEventListener("click", () => {
      paginaAtual = i;
      renderizar(listaFiltrada); // 🔥 usa lista filtrada
    });
    paginacao.appendChild(botao);
  }
}

function filtrar(loja) {
  if (loja === "Todos") {
    listaFiltrada = todosJogos;
  } else {
    listaFiltrada = todosJogos.filter(jogo => 
      jogo.store.trim().toLowerCase() === loja.trim().toLowerCase()
    );
  }

  paginaAtual = 1;
  renderizar(listaFiltrada);

  // Atualiza estilo ativo
  document.querySelectorAll(".filtro").forEach(el => {
    el.classList.remove("ativo");
    if (el.textContent.trim().toLowerCase() === loja.trim().toLowerCase()) {
      el.classList.add("ativo");
    }
  });
}

carregarJogos();
setInterval(carregarJogos, 300000);

/* =====================================
   SISTEMA DE TROCA DE TEMA
===================================== */

const button = document.getElementById("theme-Toggle");
const body = document.body;

// 🔥 Carrega tema salvo ao abrir a página
const temaSalvo = localStorage.getItem("tema");
if (temaSalvo) {
  body.classList.remove("dark", "light");
  body.classList.add(temaSalvo);
  button.textContent = temaSalvo === "dark" ? "☀️" : "🌙";
}

if (button) {
  button.addEventListener("click", () => {
    if (body.classList.contains("dark")) {
      body.classList.remove("dark");
      body.classList.add("light");
      button.textContent = "🌙";
      localStorage.setItem("tema", "light"); // 🔥 salva preferência
    } else {
      body.classList.remove("light");
      body.classList.add("dark");
      button.textContent = "☀️";
      localStorage.setItem("tema", "dark"); // 🔥 salva preferência
    }
  });
}

/* =====================================
   ANIMAÇÃO SUAVE SOBRE NÓS
===================================== */

document.addEventListener("DOMContentLoaded", () => {
  const sobre = document.querySelector(".sobre-nos");

  if (sobre) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          sobre.classList.add("visible");
        }
      });
    });

    observer.observe(sobre);
  }
});

/* =====================================
   MENU TOGGLE
===================================== */
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".menu-toggle");
  const sidebar = document.querySelector(".sidebar");
  const content = document.querySelector("main"); // 🔥 usa main no Sobre Nós

  if (toggle && sidebar) {
    toggle.addEventListener("click", () => {
      sidebar.classList.toggle("active");
      if (content) {
        content.classList.toggle("shift");
      }
    });
  }
});
