import assert from "node:assert/strict";
import { MODELOS, avisosCopy, contagemCriativos, mediana, pecasAprovadas, placarModelos, podeAprovar, seloDaPeca, type Peca } from "../src/lib/sap-anuncios";

// 15 modelos, cada etapa com pelo menos 3, e há modelos sem rosto para o banco de criativos.
assert.equal(MODELOS.length, 15);
for (const e of ["C1", "C2", "C3"] as const) assert.ok(MODELOS.filter((m) => m.etapas.includes(e)).length >= 3, e);
assert.ok(MODELOS.filter((m) => !m.rosto).length >= 6);
// Os ganchos de exemplo dos modelos passam no próprio verificador (sem preço, sem promessa, sem 2ª pessoa diagnóstica).
for (const m of MODELOS) assert.deepEqual(avisosCopy(m.gancho), [], m.codigo);

assert.equal(podeAprovar({ semaforo: "vermelho", ciente_em: "2026-10-10" }).ok, false);
assert.equal(podeAprovar({ semaforo: "amarelo", ciente_em: null }).ok, false);
assert.equal(podeAprovar({ semaforo: "amarelo", ciente_em: "2026-10-10" }).ok, true);

const p = (x: Partial<Peca>): Peca => ({ id: Math.random().toString(), modelo: "BA-03", titulo: "t", etapa: "C1", formato: "imagem", rosto: false, ganchos: [], semaforo: "verde", ciente_em: null, status: "aprovado", arquivo_url: null, campaign_id: null, reprovacao_meta: null, ...x });
const seis = Array.from({ length: 6 }, () => p({}));
assert.deepEqual(contagemCriativos([...seis, p({ rosto: true, status: "producao" })]), { semRosto: 6, metaSemRosto: 6, videos: 0, videosPlanejados: 1 });
assert.equal(pecasAprovadas([p({}), p({ semaforo: "amarelo", status: "producao" })]).ok, false);
assert.equal(pecasAprovadas([p({}), p({ status: "ideia" })]).ok, true); // ideia ainda não entra na campanha
assert.equal(pecasAprovadas([]).ok, false);

assert.match(avisosCopy("Promoção: R$ 300 de desconto")[0], /preço/);
assert.ok(avisosCopy("Você sofre de calorão?").some((a) => /2ª pessoa/.test(a)));

// Selo: C3 com custo por conversa abaixo da mediana e 7+ dias = vencedor; custo +30% na semana = cansou.
const n = { campaign_id: "c", gasto: 700, conversas: 70, cliques: 0, impressoes: 0, dias: 10, ultimos7Gasto: 350, ultimos7Conversas: 35, anteriores7Gasto: 350, anteriores7Conversas: 35 };
assert.equal(seloDaPeca(p({ etapa: "C3", status: "no_ar" }), n, 12), "vencedor");
assert.equal(seloDaPeca(p({ etapa: "C3" }), { ...n, ultimos7Conversas: 20 }, 12), "cansou");
assert.equal(seloDaPeca(p({ etapa: "C1" }), { ...n, dias: 3 }, 12), "aprendendo");
assert.equal(mediana([3, 1, 2]), 2);
assert.equal(placarModelos([{ ...p({ status: "no_ar" }), clinica_id: "a" }, { ...p({}), clinica_id: "b" }]).get("BA-03")!.clinicas, 2);
console.log("ok sap-anuncios");
