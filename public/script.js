let todosJogos = [];
let listaFiltrada = []; // 🔥 nova variável para guardar o filtro atual
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
  container.innerHTML = "";

  // 🔥 Calcula início e fim da página
  const inicio = (paginaAtual - 1) * jogosPorPagina;
  const fim = inicio + jogosPorPagina;
  const pagina = lista.slice(inicio, fim);

  pagina.forEach((jogo) => {
    console.log("Plataforma recebida:", jogo.store);

    const imagem = jogo.thumb || "fallback.png";

    const card = document.createElement("div");
    card.className = "card";

    if (jogo.expired) {
      // 🔥 Caso promoção expirada
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
      // 🔥 Caso promoção válida
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
      renderizar(listaFiltrada); // 🔥 usa a lista filtrada, não todosJogos
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

if (button) {
  button.addEventListener("click", () => {
    if (body.classList.contains("dark")) {
      body.classList.remove("dark");
      body.classList.add("light");
      button.textContent = "🌙";
    } else {
      body.classList.remove("light");
      body.classList.add("dark");
      button.textContent = "☀️";
    }
  });
}
