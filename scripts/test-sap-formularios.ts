import assert from "node:assert/strict";
import { CRONOGRAMA } from "../src/lib/sap-cronograma";
import { MANUAL } from "../src/lib/sap-tarefas";
import { DOC } from "../src/lib/sap-docs";
import {
  FORMULARIOS, FORMULARIO_DO_ITEM, campoCompleto, codigoDaEvidencia, formularioDoItem, leituraNotaAquisicao, limparDados, progresso, secoesAtivas, totalSecao, EVIDENCIA_DOC, type Dados,
} from "../src/lib/sap-formularios";

// Todo formulário tem ids de campo únicos e cada item mapeado existe no cronograma.
for (const f of Object.values(FORMULARIOS)) {
  const ids = f.secoes.flatMap((s) => s.campos.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length, `ids repetidos em ${f.codigo}`);
  for (const s of f.secoes) for (const c of s.campos) {
    if (c.tipo === "escolha" || c.tipo === "nota" || c.tipo === "multipla") assert.ok(c.opcoes?.length, `${f.codigo}.${c.id} sem opções`);
    if (c.tipo === "tabela") assert.ok(c.colunas?.length, `${f.codigo}.${c.id} sem colunas`);
  }
  if (f.doc) assert.ok(DOC.has(f.doc), `documento ${f.doc} fora do dicionário`);
}
const marcos = Object.values(FORMULARIOS).filter((f) => f.marco !== null).map((f) => f.marco as number);
assert.equal(new Set(marcos).size, marcos.length, "dois formulários para o mesmo item");
for (const n of marcos) assert.ok(CRONOGRAMA.some((i) => i.n === n), `item ${n} não existe no cronograma`);
assert.equal(formularioDoItem(7)?.codigo, "03.01");
assert.equal(formularioDoItem(4)?.codigo, "02.04");
assert.equal(formularioDoItem(30)?.codigo, "09.03");
assert.equal(formularioDoItem(1), null);
assert.equal(FORMULARIO_DO_ITEM[30], "09.03");
// O "Onde fazer" dos itens com formulário aponta para o formulário, e nenhum passo manda mais colar link do Drive.
assert.deepEqual(MANUAL[7].onde, { rotulo: "Preencher o documento 03.01 no SAP", tela: "/formulario", busca: { d: "03.01" } });
for (const n of marcos) assert.ok(!MANUAL[n].como.some((c) => /cole o (link|print)/i.test(c)), `item ${n} ainda manda colar link`);

// Evidência do documento.
assert.equal(codigoDaEvidencia(EVIDENCIA_DOC("03.01")), "03.01");
assert.equal(codigoDaEvidencia("https://exemplo.com"), null);
assert.equal(codigoDaEvidencia("arquivo:x/y.png"), null);

// 03.01: sem o "de acordo", os blocos do lead oculto (1 a 4) saem da exigência.
const f0301 = FORMULARIOS["03.01"];
assert.equal(secoesAtivas(f0301, {}).some((s) => s.id === "b1"), false);
assert.equal(secoesAtivas(f0301, { acordo: "Sim" }).some((s) => s.id === "b1"), true);
const semAcordo = progresso(f0301, { acordo: "Não" });
const comAcordo = progresso(f0301, { acordo: "Sim" });
assert.ok(comAcordo.obrigatorios > semAcordo.obrigatorios);
assert.ok(!semAcordo.completo);
assert.ok(semAcordo.faltam.every((x) => !x.id.startsWith("b1_")));

// Nota do bloco 1 vai de 0 a 12 (6 notas, de 0 a 2).
const b1 = f0301.secoes.find((s) => s.id === "b1")!;
assert.deepEqual(totalSecao(b1, {}), { valor: 0, maximo: 12 });
assert.equal(totalSecao(b1, { b1_n_tempo: "2", b1_n_qualif: "1", b1_n_preco: "1", b1_n_conducao: "0", b1_n_objecao: "0", b1_n_tom: "1" }).valor, 5);

// Preenche tudo e conclui: o 03.01 completo precisa de tabelas de linhas fixas inteiras.
function preencherTudo(f: typeof f0301, base: Dados): Dados {
  const d: Dados = { ...base };
  for (const s of secoesAtivas(f, d)) for (const c of s.campos) {
    if (c.tipo === "tabela") {
      const n = c.linhas ? c.linhas.length : Math.max(1, c.minLinhas ?? 1);
      d[c.id] = Array.from({ length: n }, () => Object.fromEntries((c.colunas ?? []).map((col) => [col.id, col.opcoes?.[0] ?? "x"])));
    } else if (c.tipo === "multipla") d[c.id] = c.todas ? [...(c.opcoes ?? [])] : [c.opcoes![0]];
    else if (c.tipo === "escolha" || c.tipo === "nota") d[c.id] = d[c.id] ?? c.opcoes![0];
    else if (c.tipo === "arquivo") d[c.id] = ["arquivo:x/1.png"];
    else d[c.id] = d[c.id] ?? "ok";
  }
  return d;
}
const cheio = preencherTudo(f0301, { acordo: "Sim" });
assert.ok(progresso(f0301, cheio).completo);
// Tirar uma linha de uma tabela fixa, ou uma célula, volta a faltar.
const b6 = { ...cheio, b6_tab: (cheio.b6_tab as Record<string, string>[]).slice(1) };
assert.ok(progresso(f0301, b6).faltam.some((x) => x.id === "b6_tab"));
const b6b = { ...cheio, b6_tab: (cheio.b6_tab as Record<string, string>[]).map((l, i) => (i === 0 ? { ...l, a: "" } : l)) };
assert.ok(progresso(f0301, b6b).faltam.some((x) => x.id === "b6_tab"));

// 02.04: consentimento exige as duas caixas; tabelas fixas exigem as 5 e as 6 linhas.
const f0204 = FORMULARIOS["02.04"];
const cons = f0204.secoes.find((s) => s.id === "s8")!.campos[0];
assert.equal(campoCompleto(cons, { q8_1: [cons.opcoes![0]] }), false);
assert.equal(campoCompleto(cons, { q8_1: [...cons.opcoes!] }), true);
assert.ok(progresso(f0204, preencherTudo(f0204, {})).completo);
// Uma pergunta opcional vazia (4.2a) não bloqueia.
assert.ok(!progresso(f0204, {}).faltam.some((x) => x.id === "q4_2a"));

// 09.03: precisa de ao menos 1 compromisso; dúvidas são opcionais.
const f0903 = FORMULARIOS["09.03"];
const call = preencherTudo(f0903, {});
assert.ok(progresso(f0903, call).completo);
assert.ok(progresso(f0903, { ...call, compromissos: [{}] }).faltam.some((x) => x.id === "compromissos"));
assert.ok(progresso(f0903, { ...call, duvidas: [] }).completo);

// 01.05: scorecard pesa 50 x 2 = 100 no máximo.
const f0105 = FORMULARIOS["01.05"];
const sc = f0105.secoes.find((s) => s.total === "scorecard")!;
assert.deepEqual(totalSecao(sc, {}), { valor: 0, maximo: 100 });
const aurora = { n1: "0", n2: "1", n3: "1", n4: "1", n5: "0", n6: "0", n7: "1", n8: "0", n9: "2", n10: "0", n11: "1", n12: "1" };
assert.equal(totalSecao(sc, aurora).valor, 31); // exemplo do documento: Clínica Aurora, 31 de 100
assert.match(leituraNotaAquisicao(31), /crítico/);
assert.match(leituraNotaAquisicao(50), /relevante/);
assert.match(leituraNotaAquisicao(75), /Boa base/);
assert.match(leituraNotaAquisicao(90), /reconhecimento/);

// Campos que saíram do formulário não ficam nas respostas.
assert.deepEqual(limparDados(f0903, { tema: "x", antigo: "y" }), { tema: "x" });

console.log("sap-formularios ok");
