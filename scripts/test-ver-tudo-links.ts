// As respostas dos blocos dos Detalhes de De onde vêm › Links (quick-ver-tudo-abas, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-links.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import { cabecaDoCliqueAVenda, cabecaDosLinks, cabecaPorLugar } from "../src/lib/leitura/ver-tudo-links";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};

// A passagem que mais perde: 61 de 470 cliques (13%) contra 16 de 61 conversas (26%) e 3 de 16 (19%).
ok(cabecaDoCliqueAVenda({ cliques: 470, conversas: 61, agendou: 16, vendas: 3 }), "De cada 100 cliques, 13 viram conversa.");
ok(cabecaDoCliqueAVenda({ cliques: 100, conversas: 80, agendou: 40, vendas: 2 }), "De cada 100 que agendaram, 5 viraram venda.");
ok(cabecaDoCliqueAVenda({ cliques: 100, conversas: 80, agendou: 10, vendas: 0 }), "De cada 100 que agendaram, 0 viraram venda.");
assert.equal(textoDaCabeca(cabecaDoCliqueAVenda({ cliques: 0, conversas: 0, agendou: 0, vendas: 0 })), "Falta dado: nenhum clique nos links no período");
// Sem conversa e sem agendamento: só a passagem do clique, que é medida (0 de cada 100).
ok(cabecaDoCliqueAVenda({ cliques: 50, conversas: 0, agendou: 0, vendas: 0 }), "De cada 100 cliques, 0 viram conversa.");

const lugares = [
  { nome: "Link da bio", cliques: 300, conversas: 40, agendou: 10, vendas: 2 },
  { nome: "Story", cliques: 100, conversas: 12, agendou: 4, vendas: 1 },
  { nome: "QR code", cliques: 20, conversas: 3, agendou: 2, vendas: 0 },
];
ok(cabecaPorLugar(lugares), "Link da bio tem mais vendas: 2 de 3.");
ok(cabecaPorLugar(lugares.map((l) => ({ ...l, vendas: 0 }))), "Link da bio tem mais agendamentos: 10 de 16.");
ok(cabecaPorLugar(lugares.map((l) => ({ ...l, vendas: 0, agendou: 0 }))), "QR code vira mais conversa: 15% dos cliques.");
// Um lugar com poucos cliques não ganha "vira mais conversa".
assert.equal(cabecaPorLugar([{ nome: "A", cliques: 3, conversas: 3, agendou: 0, vendas: 0 }, { nome: "B", cliques: 100, conversas: 5, agendou: 0, vendas: 0 }]).tipo, "falta");

ok(cabecaDosLinks([{ conversas: 40, ativo: true }, { conversas: 21, ativo: true }]), "Os 2 links ativos tiveram conversa no período.");
ok(cabecaDosLinks([{ conversas: 40, ativo: true }, { conversas: 0, ativo: true }, { conversas: 0, ativo: true }, { conversas: 0, ativo: false }]), "2 dos 3 links ativos ficaram sem conversa no período.");
ok(cabecaDosLinks([{ conversas: 40, ativo: true }, { conversas: 0, ativo: true }]), "1 dos 2 links ativos ficou sem conversa no período.");
ok(cabecaDosLinks([{ conversas: 4, ativo: true }]), "1 link ativo, com conversa no período.");
ok(cabecaDosLinks([{ conversas: 0, ativo: false }, { conversas: 0, ativo: false }]), "Nenhum dos 2 links está ativo.");
assert.equal(cabecaDosLinks([]).tipo, "falta");

// Nunca afirma causa que o dado não prova.
for (const c of [cabecaPorLugar(lugares), cabecaDosLinks([{ conversas: 4, ativo: true }])]) assert.doesNotMatch(textoDaCabeca(c), /trouxe|gera|causa/i);

console.log("test-ver-tudo-links: ok");
