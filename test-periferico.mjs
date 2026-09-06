import { getAmazonDealsByCategory } from "./api/amazon.js";

const categoria = process.argv[2] || "MOUSE";

console.log(`Testando categoria: ${categoria}`);

const resultados = await getAmazonDealsByCategory(categoria);

console.log(`Encontrados: ${resultados.length}`);
console.log(JSON.stringify(resultados, null, 2));
