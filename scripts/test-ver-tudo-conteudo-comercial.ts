// As respostas dos blocos dos Detalhes de De onde vêm os pacientes › Instagram (Conteúdo × Comercial) e os filtros que tiram repetição
// (quick-ver-tudo-abas, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-conteudo-comercial.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import type { Descoberta } from "../src/lib/leitura/cinco-segundos";
import { SEM_LEITURA_ORIGEM_POR_POST } from "../src/lib/leitura/fatos-instagram";
import {
  cabecaDaGrade,
  cabecaDaResposta,
  cabecaDaVendaPorTema,
  cabecaDasSemanas,
  cabecaDoMaisComum,
  cabecaDosComentariosDeCompra,
  cabecaDosTemas,
  semRepetirOAviso,
  temasJaDitos,
} from "../src/lib/leitura/ver-tudo-conteudo-comercial";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};
const falta = (c: CabecaDoBloco, motivo: RegExp) => {
  assert.equal(c.tipo, "falta", `sem dado vira "Falta dado": ${textoDaCabeca(c)}`);
  assert.match(textoDaCabeca(c), motivo);
};

ok(cabecaDosTemas([{ tema: "Menopausa", quem: 47, agendaram: 14 }, { tema: "Tireoide", quem: 21, agendaram: 5 }], "pessoas"), '"Menopausa" é o assunto que mais trouxe gente: 47 pessoas, 14 agendaram.');
falta(cabecaDosTemas([{ tema: "Sono", quem: 0, agendaram: 0 }], "pessoas"), /sem temas lidos/);
// Tema longo: a frase cai para a versão curta, nunca passa de 90 caracteres.
const longo = cabecaDosTemas([{ tema: "Reposição hormonal bioidêntica na perimenopausa", quem: 12, agendaram: 2 }], "conversas");
assert.equal(longo.tipo, "frase");
assert.ok(textoDaCabeca(longo).length <= 90);

ok(cabecaDaGrade([{ dow: 1, hora: 9, conversas: 12 }, { dow: 3, hora: 18, conversas: 30 }]), "Mais conversas começam quarta perto das 18h: 30.");
falta(cabecaDaGrade([]), /nenhuma conversa/);

ok(cabecaDosComentariosDeCompra({ total: 2971, compra: 70, posts_com_compra: 32 }), "70 de 2.971 comentários, em 32 posts, pedem preço, horário ou contato.");
ok(cabecaDosComentariosDeCompra({ total: 300, compra: 0, posts_com_compra: 0 }), "Nenhum dos 300 comentários pede preço, horário ou contato.");
falta(cabecaDosComentariosDeCompra(null), /não deu para ler/);

ok(cabecaDasSemanas([{ semana: "2026-10-16", conversas: 60 }, { semana: "2026-11-06", conversas: 84 }]), "A semana de 06/11 teve mais conversas: 84.");
falta(cabecaDasSemanas([{ semana: "2026-10-16", conversas: 60 }]), /menos de 2 semanas/);

const faixas = [
  { rotulo: "Até 15 min", conversas: 400, agendaram: 40 },
  { rotulo: "1 a 4 horas", conversas: 100, agendaram: 4 },
  { rotulo: "Sem resposta humana", conversas: 50, agendaram: 1 },
];
ok(cabecaDaResposta(faixas, 30), "Sem resposta humana: só 2% agendaram, em 50 conversas.");
falta(cabecaDaResposta(faixas.slice(0, 1), 30), /poucas conversas/);
// Faixa abaixo do mínimo não entra na conta (nunca vira conclusão com base pequena).
ok(cabecaDaResposta([...faixas.slice(0, 2), { rotulo: "Sem resposta humana", conversas: 5, agendaram: 0 }], 30), "1 a 4 horas: só 4% agendaram, em 100 conversas.");

ok(cabecaDaVendaPorTema([{ tema: "Catarata", ganhos: 12, receita: 60000 }, { tema: "Menopausa", ganhos: 7, receita: 21000 }]), '"Catarata" faturou mais: R$ 60.000 em 12 vendas.');
ok(cabecaDaVendaPorTema([{ tema: "Catarata", ganhos: 3, receita: 0 }]), '"Catarata" teve mais vendas: 3; o valor não foi preenchido.');
falta(cabecaDaVendaPorTema([]), /sem conversas com tema/);

ok(cabecaDoMaisComum([{ nome: "Preço", n: 40 }, { nome: "Convênio", n: 12 }], { oQue: "a objeção mais comum", unidade: "pessoas", vazio: "x" }), '"Preço" é a objeção mais comum: 40 pessoas.');
falta(cabecaDoMaisComum([], { oQue: "o pedido mais comum", unidade: "conversas", vazio: "nenhum assunto lido ainda" }), /nenhum assunto/);

// Sem repetição: a descoberta que só repete o aviso "origem por post não medida" sai; o tema já dito à vista não volta na lista.
const d = (id: string, frase: string, rotulo = "Ver os números", impacto?: string): Descoberta => ({ id, tom: "atencao", selo: "Atenção", frase, impacto, acao: { rotulo, local: "x" }, porque: { titulo: "t", barras: [] } });
const lista = [d("a", "Publicar também nos dias úteis de agenda vazia."), d("b", `Conferir como medir a origem de cada contato por post (falta dado: ${SEM_LEITURA_ORIGEM_POR_POST}).`)];
assert.deepEqual(semRepetirOAviso(lista, SEM_LEITURA_ORIGEM_POR_POST).map((x) => x.id), ["a"]);
assert.deepEqual(semRepetirOAviso([d("c", "Conferir como medir a origem de cada contato por post (falta dado.")], SEM_LEITURA_ORIGEM_POR_POST), [], "frase cortada também sai");
const vis = [d("c", "Pessoas chamaram sobre assuntos que não tiveram post.", "Publicar um post sobre Canetas emagrecedoras", "Canetas emagrecedoras (30)")];
assert.deepEqual(temasJaDitos([{ tema: "Canetas emagrecedoras" }, { tema: "Acne" }], vis).map((t) => t.tema), ["Acne"]);
const soOPasso = [d("e", "Publicar um post sobre Canetas emagrecedoras.")];
assert.deepEqual(temasJaDitos([{ tema: "Canetas emagrecedoras" }], soOPasso).map((t) => t.tema), ["Canetas emagrecedoras"], "só o passo não tira o número da lista");

console.log("test-ver-tudo-conteudo-comercial: ok");
