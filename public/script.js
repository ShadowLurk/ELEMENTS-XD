console.log("Script carregado!");
console.log("Botão tema:", document.getElementById("theme-Toggle"));
console.log("Menu toggle:", document.querySelector(".menu-toggle"));
console.log("Sidebar:", document.querySelector(".sidebar"));
console.log("Main:", document.querySelector("main"));

let todosJogos = [];
let listaFiltrada = [];
let paginaAtual = 1;

const jogosPorPagina = 12;
const MAX_VISIBLE = 5;
const LIMITE_POR_LOJA = 60;

/* =====================================
   RANKING (NOVO + AVALIAÇÃO)
===================================== */

function scoreNovidade(jogo) {
  if (!jogo.isNew || !jogo.newUntil) return 10;

  const horasRestantes =
    (new Date(jogo.newUntil) - Date.now()) / 3600000;

  if (horasRestantes > 42) return 100; // acabou de entrar
  if (horasRestantes > 24) return 80;
  if (horasRestantes > 12) return 60;
  if (horasRestantes > 0) return 40;

  return 10;
}

function scoreAvaliacao(jogo) {
  const rating = jogo.rating || 0;        // ex: 92
  const reviews = jogo.reviewCount || 0;  // ex: 50000

  // evita jogo com 3 reviews dominar ranking
  return rating * Math.log10(reviews + 1);
}

function horasDesdeEntrada(jogo) {
  if (!jogo.newUntil) return 999;

  // seu "novo" dura 48h
  const entrada = new Date(jogo.newUntil).getTime() - (48 * 3600000);
  return (Date.now() - entrada) / 3600000;
}

function calcularScore(jogo) {

  const novidade = scoreNovidade(jogo);
  const avaliacao = scoreAvaliacao(jogo);

  const horas = horasDesdeEntrada(jogo);

  let pesoNovidade;
  let pesoAvaliacao;

  // 🔥 acabou de entrar
  if (horas < 6) {
    pesoNovidade = 0.85;
    pesoAvaliacao = 0.15;
  }
  // ainda muito novo
  else if (horas < 24) {
    pesoNovidade = 0.65;
    pesoAvaliacao = 0.35;
  }
  // meio do ciclo
  else if (horas < 48) {
    pesoNovidade = 0.45;
    pesoAvaliacao = 0.55;
  }
  // deixou de ser novo
  else {
    pesoNovidade = 0.15;
    pesoAvaliacao = 0.85;
  }

  return (novidade * pesoNovidade) +
         (avaliacao * pesoAvaliacao);
}
/* =====================================
   CARREGAR JOGOS
===================================== */
function mostrarLoading() {
  const container = document.getElementById("cards-container");
  if (!container) return; // se não existe, sai da função
  container.innerHTML = "<div class='spinner'></div><p>Carregando jogos...</p>";


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

async function carregarDados() {
  try {
    // 🔥 1️⃣ Carrega games primeiro
    const gamesRes = await fetch("/api/games");
    const gamesData = await gamesRes.json();

    const steam = gamesData.steam || [];
    const epic = gamesData.epic || [];
    const gog = gamesData.gog || [];

    todosJogos = [...steam, ...epic, ...gog];

    // 🔥 Ordena antes de renderizar
    todosJogos.sort((a, b) =>
      new Date(b.addedAt) - new Date(a.addedAt)
    );

    renderizar(todosJogos);

    // 🔥 2️⃣ Carrega Amazon depois
    fetch("/api/amazon")
      .then(res => res.json())
      .then(amazonData => {
        const amazon = Object.values(amazonData || {}).flat();

        // Junta tudo
        todosJogos = [...todosJogos, ...amazon];

        // 🔥 ORDENAR DE NOVO
        todosJogos.sort((a, b) =>
          new Date(b.addedAt) - new Date(a.addedAt)
        );

        renderizar(todosJogos);
      });

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

  // 🔥 Selo "Novo" baseado em addedAt (48h)
const DOIS_DIAS = 1000 * 60 * 60 * 24 * 2;

if (jogo.addedAt && !jogo.expired) {

  const dataEntrada = new Date(jogo.addedAt).getTime();
  const agora = Date.now();

  if (!isNaN(dataEntrada) && (agora - dataEntrada) < DOIS_DIAS) {
    const selo = document.createElement("span");
    selo.className = "novo-selo";
    selo.textContent = "🔥 Novo";
    card.appendChild(selo);
  }
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

  // =============================
  // FILTRO DE DADOS
  // =============================

  listaFiltrada = [...todosJogos];

  // 🔹 Filtra por categoria
  if (categoriaAtual === "Jogos") {

    listaFiltrada = listaFiltrada.filter(j =>
      ["Steam", "Epic", "GOG"].includes(j.store)
    );

  }

  else if (categoriaAtual === "Pecas") {

    listaFiltrada = listaFiltrada.filter(j =>
      j.store === "Amazon"
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

  // =============================
  // RENDERIZA
  // =============================
  renderizar(listaFiltrada);
}

/* =====================================
   SISTEMA DE TEMA
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
    filtrar("Todos"); // padrão = ALL
  }

}); 
document.addEventListener("DOMContentLoaded", () => {
  carregarJogos();
  setInterval(carregarJogos, 450000);
});
