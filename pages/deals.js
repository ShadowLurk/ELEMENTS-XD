// pages/deals.js
import { getSteamDeals, getEpicDeals, getGogDeals } from "../lib/deals"; 
// Sugestão: mover suas funções para /lib/deals.js para reaproveitar

export async function getStaticProps() {
  const [steam, epic, gog] = await Promise.all([
    getSteamDeals().catch(() => []),
    getEpicDeals().catch(() => []),
    getGogDeals().catch(() => []),
  ]);

  const all = [...steam, ...epic, ...gog].sort(
    (a, b) => new Date(b.addedAt) - new Date(a.addedAt)
  );

  return {
    props: { steam, epic, gog, all },
    revalidate: 1200, // revalida a cada 1 hora
  };
}

export default function DealsPage({ steam, epic, gog, all }) {
  return (
    <div>
      <h1>Promoções</h1>
      <h2>Steam</h2>
      <ul>
        {steam.map((game) => (
          <li key={game.title}>{game.title} - {game.salePriceBRL}</li>
        ))}
      </ul>

      <h2>Epic</h2>
      <ul>
        {epic.map((game) => (
          <li key={game.title}>{game.title} - {game.salePriceBRL}</li>
        ))}
      </ul>

      <h2>GOG</h2>
      <ul>
        {gog.map((game) => (
          <li key={game.title}>{game.title} - {game.salePriceBRL}</li>
        ))}
      </ul>
    </div>
  );
}
