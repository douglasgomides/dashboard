// Frases que a tela afirmava sem ser verdade (debug numeros-nao-batem-fonte, 16/11/2026) não podem voltar:
// - "Os últimos 28 dias foram reconstruídos": a reconstrução do total de seguidores não preenche nada desde 01/11/2026;
// - "igual ao 'Seguidores' do Instagram": nunca foi conferido contra o app (decisão D1/D2 do João, em aberto).
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-telas-sem-afirmacao-falsa.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PROIBIDAS: { frase: RegExp; porque: string }[] = [
  { frase: /foram reconstru[ií]dos/i, porque: "a reconstrução do histórico de seguidores não roda desde 01/11" },
  { frase: /igual ao [“"']Seguidores[”"'] do Instagram/i, porque: "o bruto nunca foi conferido contra o app do Instagram" },
  { frase: /n[uú]mero que o Instagram mostra em [“"']Seguidores[”"']/i, porque: "o bruto nunca foi conferido contra o app do Instagram" },
];
const TELAS = ["src/routes/_authenticated.$clientId.conteudo.tsx", "src/routes/_authenticated.$clientId.hoje.tsx", "src/routes/_authenticated.$clientId.index.tsx", "src/routes/_authenticated.$clientId.audiencia.tsx"];

for (const tela of TELAS) {
  const texto = readFileSync(new URL(`../${tela}`, import.meta.url), "utf8");
  for (const p of PROIBIDAS) assert.doesNotMatch(texto, p.frase, `${tela}: ${p.porque}`);
}
console.log("test-telas-sem-afirmacao-falsa: ok");
