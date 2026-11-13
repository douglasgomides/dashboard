// As respostas dos blocos dos Detalhes de Onde os pacientes travam › Jornada (quick-ver-tudo-abas, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-jornada.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import { fatosDaJornada } from "../src/lib/leitura/fatos-comercial";
import { descobertasDaLeitura } from "../src/lib/leitura/leitura-em-descobertas";
import {
  DESCOBERTA_SEM_PESSOA,
  cabecaDaOrigem,
  cabecaDasLimitacoesDaJornada,
  cabecaDoFunilDe7,
  cabecaDosCruzamentos,
  cabecaDosLinksDaJornada,
  cabecaDosPostsQueGeram,
} from "../src/lib/leitura/ver-tudo-jornada";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};
const falta = (c: CabecaDoBloco, motivo: RegExp) => {
  assert.equal(c.tipo, "falta", `sem dado vira "Falta dado": ${textoDaCabeca(c)}`);
  assert.match(textoDaCabeca(c), motivo);
};

const etapas = [
  { id: "alcance", taxa: null },
  { id: "engajamento", taxa: 0.04 },
  { id: "comentario", taxa: 0.1 },
  { id: "conversa", taxa: 0.6 },
  { id: "lead", taxa: 0.67 },
  { id: "agendamento", taxa: null },
  { id: "venda", taxa: null },
];
// A lista das 7 etapas diz o que o topo não diz: a passagem que mais perde ANTES da conversa (a maior do comercial já está no topo).
ok(cabecaDoFunilDe7({ medidas: 7, etapas }), "Antes da conversa, de alcance para engajamento passam só 4%.");
ok(cabecaDoFunilDe7({ medidas: 3, etapas: etapas.map((e) => ({ ...e, taxa: e.id === "lead" ? 0.5 : null })) }), "3 de 7 etapas da jornada têm dado neste período.");
falta(cabecaDoFunilDe7({ medidas: 0, etapas }), /nenhuma das 7 etapas/);
falta(cabecaDoFunilDe7(null), /não carregou/);

ok(cabecaDosCruzamentos({ pessoas: 200, comentaram_e_lead: 10, conversaram_e_lead: 50, comentaram_e_conversaram: 20 }), "50 pessoas conversaram e viraram lead; 10 comentaram e viraram lead.");
falta(cabecaDosCruzamentos(null), /nenhuma pessoa/);
ok(cabecaDasLimitacoesDaJornada(1), "1 coisa limita o que a jornada consegue dizer.");
ok(cabecaDasLimitacoesDaJornada(2), "2 coisas limitam o que a jornada consegue dizer.");

// Por origem: ganhos só entram na frase com a venda confirmada pelo diagnóstico.
const origens = [{ o: "Instagram", leads: 30, ganhos: 4 }, { o: "Indicação", leads: 10, ganhos: 2 }];
ok(cabecaDaOrigem(origens, true), '"Instagram" trouxe mais leads: 30 de 40, com 4 vendas.');
ok(cabecaDaOrigem(origens, false), '"Instagram" trouxe mais leads: 30 de 40.');
falta(cabecaDaOrigem([], true), /nenhuma origem/);
ok(cabecaDosPostsQueGeram([{ comentaristas: 40, viraram_lead: 6 }, { comentaristas: 20, viraram_lead: 2 }]), "8 de 60 pessoas que comentaram em 2 posts viraram lead.");
ok(cabecaDosLinksDaJornada([{ conversas: 30, viraram_lead: 9 }]), "30 conversas vieram de 1 link rastreado; 9 viraram lead.");

// A descoberta "sem pessoa" da leitura tem o id que a aba procura para levar o aviso completo aos Detalhes.
const funil = {
  etapas: [
    { id: "conversa", valor: 120, taxa: null, fracao: null },
    { id: "lead", valor: 80, taxa: 0.67, fracao: null },
    { id: "agendamento", valor: 30, taxa: null, fracao: null },
    { id: "venda", valor: 25, taxa: null, fracao: null },
  ],
  maiorQueda: { de: "conversa", para: "lead", taxa: 0.67 },
  medidas: 4,
} as unknown as Parameters<typeof fatosDaJornada>[0]["funil"];
const fatos = fatosDaJornada({ de: "2026-10-15", ate: "2026-11-13", hoje: "2026-11-13", funil, resumo: { leads_total: 80, leads_sem_pessoa: 50 } });
const ds = descobertasDaLeitura({ fatos, descobertas: [], jaDitos: ["maior-perda"], textoDoTopo: ["Conversou 120 Virou lead 80 67%"] });
assert.ok(ds.some((d) => d.id === DESCOBERTA_SEM_PESSOA), `descoberta ${DESCOBERTA_SEM_PESSOA} existe: ${ds.map((d) => d.id).join(", ")}`);
assert.ok(!ds.some((d) => d.id === "leitura-maior-perda"), "a maior perda (já no funil desenhado) não volta");
const semPessoa = ds.find((d) => d.id === DESCOBERTA_SEM_PESSOA)!;
assert.equal(semPessoa.impacto, "50 de 80", '"N de M" segue no número em destaque');

console.log("test-ver-tudo-jornada: ok");
