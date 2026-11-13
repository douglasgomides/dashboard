// As respostas dos blocos do "Ver tudo" de Instagram › Desempenho (quick-ver-tudo, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-instagram.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import { cabecaDaCobertura, cabecaDaEvolucaoDeSeguidores, cabecaDasSemanas, cabecaDoAlcancePorFormato, cabecaDoBrutoLiquido } from "../src/lib/leitura/ver-tudo-instagram";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};

ok(cabecaDaEvolucaoDeSeguidores({ primeiro: 4739, ultimo: 5000, cobertura: 1 }), "Os seguidores subiram de 4.739 para 5.000 no período.");
ok(cabecaDaEvolucaoDeSeguidores({ primeiro: 5000, ultimo: 4900, cobertura: 0.9 }), "Os seguidores caíram de 5.000 para 4.900 no período.");
ok(cabecaDaEvolucaoDeSeguidores({ primeiro: 5000, ultimo: 5000, cobertura: 0.9 }), "Os seguidores ficaram em 5.000 no período.");
assert.equal(textoDaCabeca(cabecaDaEvolucaoDeSeguidores({ primeiro: 4000, ultimo: 5000, cobertura: 0.4 })), "Falta dado: só 40% dos dias têm contagem de seguidores (mínimo 60%)");
assert.equal(cabecaDaEvolucaoDeSeguidores({ primeiro: null, ultimo: 5000, cobertura: 1 }).tipo, "falta");
// Nunca a estimativa: a frase não fala de projeção.
assert.doesNotMatch(textoDaCabeca(cabecaDaEvolucaoDeSeguidores({ primeiro: 4739, ultimo: 5000, cobertura: 1 })), /proje|estimat|vai/i);

ok(cabecaDaCobertura({ dias: 30, esperados: 30 }), "30 de 30 dias do período têm contagem de seguidores.");
ok(cabecaDoBrutoLiquido({ novos: 308, saidas: 84, diasMedidos: 28 }), "Entraram 308 e saíram 84: 27% de quem entrou.");
assert.equal(cabecaDoBrutoLiquido({ novos: 0, saidas: 0, diasMedidos: 0 }).tipo, "falta");
ok(cabecaDasSemanas([{ semana: "2026-10-12", novos: 44, completa: false }, { semana: "2026-10-19", novos: 77, completa: true }, { semana: "2026-10-26", novos: null, completa: true }]), "A semana de 19/10 trouxe mais seguidores novos: 77.");
assert.equal(cabecaDasSemanas([{ semana: "2026-10-19", novos: 77, completa: true }]).tipo, "falta", "uma semana só não tem a melhor");
ok(cabecaDoAlcancePorFormato([{ nome: "Estático", alcanceTipico: 1420, posts: 10 }, { nome: "Reels", alcanceTipico: 1340, posts: 10 }, { nome: "Carrossel", alcanceTipico: 9000, posts: 2 }], 8), "O post típico de Estático chega a 1.420 pessoas.");
assert.equal(cabecaDoAlcancePorFormato([{ nome: "Reels", alcanceTipico: 900, posts: 3 }], 8).tipo, "falta", "amostra pequena não ganha");

console.log("test-ver-tudo-instagram: ok");
