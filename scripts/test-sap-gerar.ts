import assert from "node:assert/strict";
import { montarEntrada } from "../api/_lib/sap-gerar";
import { PROMPTS_SAP, PROMPT_POR_CODIGO } from "../api/_lib/sap-prompts";
import { PROMPTS_TELA } from "../src/lib/sap-prompts-tela";
import { DOC } from "../src/lib/sap-docs";

// Todo prompt do gerador tem texto, entradas com id único e documento cadastrado no dicionário do SAP.
assert.deepEqual(PROMPTS_SAP.map((p) => p.codigo), ["05.13", "03.05", "06.10", "07.08", "08.08", "09.04"]);
assert.equal(PROMPTS_TELA.length, PROMPTS_SAP.length);
for (const p of PROMPTS_SAP) {
  assert.ok(p.sistema.length > 2000, `${p.codigo} sem texto`);
  assert.equal(new Set(p.entradas.map((e) => e.id)).size, p.entradas.length, `${p.codigo} com id de entrada repetido`);
  assert.ok(p.entradas.some((e) => e.obrigatoria), `${p.codigo} sem entrada obrigatória`);
  assert.ok(DOC.get(p.codigo)?.url, `${p.codigo} sem link no dicionário`);
}
// Regras que não podem sumir do texto (vêm do documento).
assert.match(PROMPT_POR_CODIGO.get("05.13")!.sistema, /pelo menos 70% das peças são verdes/);
assert.match(PROMPT_POR_CODIGO.get("03.05")!.sistema, /Você não calcula, não cria número e não inventa fato/);
assert.match(PROMPT_POR_CODIGO.get("06.10")!.sistema, /Isso precisa de atendimento agora\. Ligue 192/);
assert.match(PROMPT_POR_CODIGO.get("07.08")!.sistema, /Objeção sem fonte citada é proibida/);
assert.match(PROMPT_POR_CODIGO.get("08.08")!.sistema, /Garantia: lida na aba Garantia, nunca calculada por você/);
assert.match(PROMPT_POR_CODIGO.get("09.04")!.sistema, /Confidencialidade entre clínicas/);

// Montagem da entrada: obrigatório faltando bloqueia; PII é mascarada; o que não veio é avisado.
const sem = montarEntrada("05.13", { proposta: "texto" }, "Gere");
assert.ok(sem.erro && sem.faltaram.length === 1, "falta a árvore");
const ok = montarEntrada("05.13", { proposta: "Contato: ana@clinica.com, (11) 98888-7777, CPF 123.456.789-09", arvore: "Meta + WhatsApp" }, "Gere a atração da Clínica X");
assert.equal(ok.erro, undefined);
assert.match(ok.entrada, /\[e-mail\]/);
assert.match(ok.entrada, /\[telefone\]/);
assert.match(ok.entrada, /\[cpf\]/);
assert.doesNotMatch(ok.entrada, /ana@clinica\.com|98888-7777|123\.456\.789-09/);
assert.match(ok.entrada, /=== ANEXO · 05\.02/);
assert.match(ok.entrada, /Não anexados:/);
assert.ok(montarEntrada("99.99", {}, "x").erro);
const grande = montarEntrada("03.05", { raiox: "a".repeat(60_000), transcricao: "b".repeat(60_000), analise: "c".repeat(60_000), formulario: "d".repeat(60_000) }, "x");
assert.ok(grande.erro, "passa do limite total");
console.log("ok sap-gerar");

// Slots dos anexos: formato aceito pelo banco e mesmo documento = mesmo slot entre prompts.
for (const p of PROMPTS_TELA) for (const en of p.entradas) assert.match(en.slot, /^[a-z0-9_]{2,40}$/, `${p.codigo}/${en.id} slot inválido`);
const slotDe = (cod: string, id: string) => PROMPTS_TELA.find((p) => p.codigo === cod)!.entradas.find((en) => en.id === id)!.slot;
assert.equal(slotDe("05.13", "proposta"), slotDe("07.08", "proposta"));
assert.notEqual(slotDe("03.05", "transcricao"), slotDe("08.08", "transcricao"));
assert.notEqual(slotDe("08.08", "transcricao"), slotDe("09.04", "transcricao"));
for (const p of PROMPTS_TELA) assert.equal(new Set(p.entradas.map((en) => en.slot)).size, p.entradas.length, `${p.codigo} com slot repetido`);

// Leitura de .docx no navegador (mesma lógica de src/lib/sap-anexos.ts).
import { zipSync, strToU8 } from "fflate";
import { textoDeDocx } from "../src/lib/sap-anexos";
const xml = '<w:document><w:body><w:p><w:r><w:t>Título &amp; subtítulo</w:t></w:r></w:p><w:p><w:r><w:t>Segunda linha</w:t></w:r><w:r><w:tab/><w:t>com tab</w:t></w:r></w:p></w:body></w:document>';
const docx = zipSync({ "word/document.xml": strToU8(xml), "[Content_Types].xml": strToU8("<x/>") });
assert.equal(textoDeDocx(docx), "Título & subtítulo\nSegunda linha\tcom tab");
assert.throws(() => textoDeDocx(zipSync({ "outro.xml": strToU8("<x/>") })), /docx/);
console.log("ok sap-anexos");
