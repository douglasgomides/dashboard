// Resultados por origem do CRM e fila do WhatsApp (auditoria de 30/10/2026).
// Rodar: npx tsx scripts/test-vendas-origem-e-fila.ts
import assert from "node:assert/strict";
import { abertosDaLinha, fechadosDaLinha, resumoVendas, soNaoInformado, type FunilRow } from "../src/lib/vendas-origem";
import { avisoContaCompartilhada, avisoFilaEsquecida, avisoLote, lerFilaWhatsapp } from "../src/lib/fila-whatsapp";

const semTravessao = (t: string) => assert.ok(!/[—–]/.test(t), `travessão em: ${t}`);

// ---- Doctor Creator: "Não informado" (182/388 = 47%) não pode ser a origem que mais converte.
const dc: FunilRow[] = [
  { chave: "Material de isca", total: 2157, ganhos: 1, perdidos: 1141, abertos: 1015 },
  { chave: "Não informado", total: 388, ganhos: 182, perdidos: 19, abertos: 187 },
  { chave: "Base importada", total: 81, ganhos: 35, perdidos: 10, abertos: 36 },
  { chave: "LP1 Autoridade", total: 142, ganhos: 24, perdidos: 22, abertos: 96 },
];
const total = dc.reduce((s, r) => s + r.total, 0);
const frasesDc = resumoVendas(dc, total);
assert.ok(frasesDc.every((f) => !/“Não informado”/.test(f)), frasesDc.join("\n"));
assert.match(frasesDc[1], /^75% dos ganhos \(182 de 242\) não têm origem registrada\.$/);
assert.match(frasesDc[2], /ainda não dá para comparar as origens/);
assert.match(frasesDc[3], /“Material de isca”/);
frasesDc.forEach(semTravessao);

// ---- Com a maior parte dos ganhos com origem, o ranking aparece, sem "Não informado".
const bom: FunilRow[] = [
  { chave: "Não informado", total: 50, ganhos: 30, perdidos: 0, abertos: 20 },
  { chave: "Instagram", total: 200, ganhos: 40, perdidos: 60, abertos: 100 },
  { chave: "Google", total: 100, ganhos: 30, perdidos: 20, abertos: 50 },
];
const frasesBom = resumoVendas(bom, 350);
assert.match(frasesBom.at(-1)!, /^A origem com maior taxa de status ganho é “Google”: 30%/);
assert.match(frasesBom[2], /“Instagram”/);

// ---- Marcella: fechados na origem sem resultado não contam como em andamento.
const marcella: FunilRow = { chave: "Não informado", total: 601, ganhos: 27, perdidos: 162, abertos: 170 };
assert.equal(abertosDaLinha(marcella), 170);
assert.equal(fechadosDaLinha(marcella), 242);
assert.match(resumoVendas([marcella], 601)[0], /170 ainda em aberto; 242 foram fechados no CRM sem dizer se ganharam ou perderam\./);
// Banco sem a coluna de abertos: a conta antiga, e nenhum fechado inventado.
const antigo: FunilRow = { chave: "X", total: 601, ganhos: 27, perdidos: 162 };
assert.equal(abertosDaLinha(antigo), 412);
assert.equal(fechadosDaLinha(antigo), 0);

// ---- Procedimento sem o campo no CRM: tudo "Não informado" esconde a tabela.
assert.equal(soNaoInformado([{ chave: "Não informado", total: 10, ganhos: 1, perdidos: 1 }]), true);
assert.equal(soNaoInformado([{ chave: "Não informado", total: 10, ganhos: 1, perdidos: 1 }, { chave: "Implante", total: 2, ganhos: 0, perdidos: 0 }]), false);
assert.equal(soNaoInformado([]), false);

// ---- Fila do WhatsApp: avisos só com o dado do cliente.
assert.equal(lerFilaWhatsapp(null), null);
const marcellaFila = lerFilaWhatsapp({ abertas_7d: 109, abertas_antigas: 520, encerradas: 448, maior_lote: 7, encerradas_em_lote: 45, conta_compartilhada_com: [] })!;
assert.equal(avisoLote(marcellaFila), null, "maior lote de 7 e 10% em lote: sem aviso");
assert.equal(avisoContaCompartilhada(marcellaFila), null, "conta só dela: nada de 'duas médicas'");
assert.match(avisoFilaEsquecida(marcellaFila)!, /^520 conversas estão abertas no WhatsApp há mais de 7 dias/);
const lotes = lerFilaWhatsapp({ abertas_7d: 10, abertas_antigas: 0, encerradas: 1000, maior_lote: 147, encerradas_em_lote: 240, conta_compartilhada_com: ["Dra. B"] })!;
assert.equal(avisoLote(lotes), "24% dos encerramentos deste período aconteceram em lote (5 ou mais conversas fechadas no mesmo minuto); o maior teve 147 conversas.");
assert.match(avisoContaCompartilhada(lotes)!, /também está ligada a Dra\. B/);
assert.equal(avisoFilaEsquecida(lotes), null);
assert.match(avisoFilaEsquecida({ ...lotes, abertasAntigas: 1 })!, /^1 conversa está aberta/);
[avisoLote(lotes)!, avisoContaCompartilhada(lotes)!, avisoFilaEsquecida(marcellaFila)!].forEach(semTravessao);
console.log("test-vendas-origem-e-fila: ok");
