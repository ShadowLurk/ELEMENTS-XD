function carregarJogos() {
  fetch("/api/deals") // 🔥 alterado de /api/jogos para /api/deals
    .then((res) => res.json())
    .then((data) => {
      const jogos = data.deals; // 🔥 pega os jogos dentro de deals
      const container = document.getElementById("cards-container");
      container.innerHTML = "";

      jogos.forEach((jogo) => {
        const link = jogo.steamLink || "#";

        const precoNormal = jogo.normalPriceBRL
          ? jogo.normalPriceBRL.replace(".", ",")
          : "0,00";

        const precoPromo = jogo.salePriceBRL
          ? jogo.salePriceBRL.replace(".", ",")
          : "0,00";

        const card = document.createElement("div");
        card.className = "card";

        card.innerHTML = `
          <a href="${link}" target="_blank" class="card-link">
            <img src="${jogo.thumb}" alt="${jogo.title}">
            <h3>-${jogo.discount || 0}%</h3>
            <p class="game-title">${jogo.title}</p>
            <p>
              <span class="old">R$ ${precoNormal}</span>
              <span class="por">por</span>
              <span class="new">R$ ${precoPromo}</span>
            </p>
          </a>
        `;

        container.appendChild(card);
      });
    })
    .catch((err) => console.error("Erro ao carregar jogos:", err));
}

carregarJogos();
setInterval(carregarJogos, 60000);

let todosJogos = [];

function carregarJogos() {
  fetch("/api/deals")
    .then((res) => res.json())
    .then((data) => {
      todosJogos = data.deals;
      renderizar(todosJogos);
    });
}

function renderizar(lista) {
  const container = document.getElementById("cards-container");
  container.innerHTML = "";

  lista.forEach((jogo) => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <a href="${jogo.link}" target="_blank" class="card-link">
        <img src="${jogo.thumb}" alt="${jogo.title}">
        <h3>-${jogo.discount}%</h3>
        <p class="game-title">${jogo.title}</p>
        <p><strong>${jogo.salePriceBRL}</strong></p>
        <small>${jogo.store}</small>
      </a>
    `;

    container.appendChild(card);
  });
}

function filtrar(loja) {
  if (loja === "Todos") {
    renderizar(todosJogos);
  } else {
    const filtrado = todosJogos.filter(
      (jogo) => jogo.store === loja
    );
    renderizar(filtrado);
  }
}

carregarJogos();
setInterval(carregarJogos, 300000);


/* =====================================
   SISTEMA DE TROCA DE TEMA
===================================== */

const button = document.getElementById("theme-Toggle");
const body = document.body;

if (button) { // 🔥 evita erro se botão não existir
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
