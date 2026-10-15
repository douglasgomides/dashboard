import assert from "node:assert/strict";
import { passosDaImplantacao, resumoImplantacao, type EstadoImplantacao } from "../src/lib/sap-implantacao";

const zero: EstadoImplantacao = {
  ativo: false, d0: null, dia: null, ticket: null, temCrm: true, temWhatsapp: true, temAnuncios: true, marcos: [],
  baselineMedida: false, metasPrincipais: 0, metaCustoConsulta: false, linhasCompletas: null, divergencia: null,
  saudeSemanaAtual: false, execucaoItens: 0, execucaoVencidosSemStatus: 0,
};
const p0 = passosDaImplantacao(zero);
assert.equal(resumoImplantacao(p0).proximo?.id, "ativar");
assert.equal(p0.find((x) => x.id === "leitura")!.status, "depois");

// D12 sem etapas marcadas: etapas e baseline atrasadas; o próximo passo é o atrasado mais antigo.
const d12 = passosDaImplantacao({ ...zero, ativo: true, d0: "2026-10-01", dia: 12, marcos: ["agendado"] });
assert.equal(d12.find((x) => x.id === "etapas")!.status, "atrasado");
assert.equal(d12.find((x) => x.id === "baseline")!.status, "atrasado");
assert.equal(d12.find((x) => x.id === "metas")!.status, "fazer");
assert.equal(resumoImplantacao(d12).proximo?.id, "etapas");
assert.equal(d12.find((x) => x.id === "etapas")!.detalhe, "Marcadas: agendado. Falta marcar: compareceu ou faltou.");

// Tudo feito no D50.
const ok = passosDaImplantacao({ ...zero, ativo: true, d0: "2026-08-01", dia: 50, ticket: 4500, marcos: ["agendado", "compareceu", "faltou", "fechou"], baselineMedida: true, metasPrincipais: 3, metaCustoConsulta: true, linhasCompletas: 0.93, divergencia: 0.1, saudeSemanaAtual: true, execucaoItens: 12 });
const r = resumoImplantacao(ok);
assert.equal(r.feitosComeco, r.totalComeco);
assert.equal(r.atrasados, 0);
assert.equal(ok.find((x) => x.id === "leitura")!.status, "rotina");
// Sem meta de custo depois do D45: atrasado.
assert.equal(passosDaImplantacao({ ...zero, ativo: true, d0: "2026-08-01", dia: 47 }).find((x) => x.id === "custo")!.status, "atrasado");
// Acessos críticos (02.05): aparece só quando o checklist foi lido; atrasado depois do D7.
assert.equal(passosDaImplantacao({ ...zero, ativo: true, d0: "2026-08-01", dia: 3 }).some((x) => x.id === "acessos"), false);
assert.equal(passosDaImplantacao({ ...zero, ativo: true, d0: "2026-08-01", dia: 9, acessosCriticos: { feitos: 4, total: 9 } }).find((x) => x.id === "acessos")!.status, "atrasado");
assert.equal(passosDaImplantacao({ ...zero, ativo: true, d0: "2026-08-01", dia: 9, acessosCriticos: { feitos: 9, total: 9 } }).find((x) => x.id === "acessos")!.status, "feito");
// Metas sem aceite registrado não contam como feitas.
assert.equal(passosDaImplantacao({ ...zero, ativo: true, d0: "2026-08-01", dia: 13, metasPrincipais: 3, aceiteMetas: false }).find((x) => x.id === "metas")!.status, "fazer");
console.log("test-sap-implantacao: ok");
