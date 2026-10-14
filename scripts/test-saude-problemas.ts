// npx tsx scripts/test-saude-problemas.ts
import assert from "node:assert/strict";
import { montarProblemasFontes, resumirProblemas, filtrarProblemas, problemaDaLinha } from "../src/lib/saude-problemas";

const dia = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const linha = (fonte: string, o: Record<string, unknown>) => ({ fonte, last_attempt_at: null, last_success_at: null, last_error: null, last_rows: null, data_ate: null, ...o }) as any;
const todas = { tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true };
const c = { id: "c1", nome: "Dra. A" };

// Vazio e tudo em dia: nenhum problema inventado.
assert.deepEqual(montarProblemasFontes([]), []);
assert.deepEqual(montarProblemasFontes([{ ...c, fontes: todas, linhas: [linha("instagram", { data_ate: dia(0) }), linha("anuncios", { data_ate: dia(1) })] }]), []);
assert.equal(resumirProblemas([]).prioridade, null);

// Erro técnico sem tradução, dado velho: falha técnica, alta, Doctor Creator, erro bruto preservado.
const erro = problemaDaLinha(c, linha("crm", { data_ate: dia(9), last_error: "Kommo respondeu 401 subdomain", last_attempt_at: "2026-10-14T07:00:00Z" }))!;
assert.equal(erro.tipo, "falha_tecnica");
assert.equal(erro.gravidade, "alta");
assert.equal(erro.quem, "equipe");
assert.equal(erro.ultimoErro, "Kommo respondeu 401 subdomain");
assert.equal(erro.ultimaTentativa, "2026-10-14T07:00:00Z");

// Mesmo erro com dado em dia: média.
assert.equal(problemaDaLinha(c, linha("crm", { data_ate: dia(0), last_error: "boom" }))!.gravidade, "media");

// Token bloqueado: do lado do cliente.
const tok = problemaDaLinha(c, linha("instagram", { data_ate: dia(10), last_error: "API access blocked" }))!;
assert.equal(tok.tipo, "cliente");
assert.equal(tok.quem, "cliente");
assert.equal(tok.gravidade, "alta");

// Meta instável: falha técnica, mas quem resolve é a Meta.
const meta = problemaDaLinha(c, linha("anuncios", { data_ate: dia(0), last_error: "Service temporarily unavailable" }))!;
assert.equal(meta.quem, "meta");
assert.equal(meta.gravidade, "baixa");

// Sync roda sem erro, origem sem dado novo há 12 dias: sem dado na origem, mas vermelho (regra única),
// então não é "baixa / só acompanhar": média, e quem confirma é o cliente.
const orig = problemaDaLinha(c, linha("anuncios", { data_ate: dia(12), last_success_at: new Date().toISOString(), last_attempt_at: new Date().toISOString() }))!;
assert.equal(orig.tipo, "sem_dado_origem");
assert.equal(orig.gravidade, "media");
assert.equal(orig.quem, "cliente");
assert.match(orig.acao, /pausou/);

// Motivo gravado pelo sync tem prioridade (dono vindo do banco).
const pag = problemaDaLinha(c, linha("anuncios", { data_ate: dia(8), motivo: "Pagamento recusado na Meta.", motivo_dono: "cliente" }))!;
assert.equal(pag.tipo, "cliente");
assert.match(pag.detalhe!, /Pagamento recusado/);

// Ligada e nunca trouxe dado: configuração incompleta.
assert.equal(problemaDaLinha(c, linha("atendimento", {}))!.tipo, "config_incompleta");

// Atraso de 2 a 3 dias sem erro: baixa, só acompanhar.
const atr = problemaDaLinha(c, linha("crm", { data_ate: dia(2) }))!;
assert.equal(atr.gravidade, "baixa");
assert.equal(atr.quem, "ninguem");

// Montagem: fonte desligada ignora a linha; Instagram desligado vira configuração incompleta;
// qualidade_dados entra sem repetir "sync-erro-*"; ordem por gravidade.
const ps = montarProblemasFontes([
  {
    id: "c2", nome: "Dr. B",
    fontes: { tem_instagram: false, tem_anuncios: false, tem_crm: true, tem_atendimento: false },
    linhas: [linha("anuncios", { data_ate: dia(30), last_error: "x" }), linha("crm", { data_ate: dia(9), last_error: "falhou geral" })],
    qualidade: [
      { id: "sync-erro-crm", fonte: "crm", severidade: "alta", titulo: "dup", evidencia: "", causa: "", correcao: "", responsavel: "equipe_hub", afeta: "" },
      { id: "crm-leads-parados", fonte: "crm", severidade: "alta", titulo: "78% parados", evidencia: "3.087 de 3.942", causa: "Ninguém fecha.", correcao: "Mover para perdido.", responsavel: "comercial", afeta: "funil" },
      { id: "crm-compartilhado", fonte: "crm", severidade: "media", titulo: "CRM em 2 clientes", evidencia: "", causa: "", correcao: "Separar por funil.", responsavel: "equipe_hub", afeta: "" },
      { id: "ads-sem-gasto", fonte: "anuncios", severidade: "media", titulo: "Sem gasto", evidencia: "", causa: "", correcao: "Confirmar.", responsavel: "gestor_trafego", afeta: "" },
    ],
  },
]);
assert.equal(ps.length, 5);
assert.ok(!ps.some((p) => p.titulo === "dup"));
assert.ok(!ps.some((p) => p.fonte === "anuncios" && p.ultimoErro === "x"));
assert.deepEqual(ps.map((p) => p.gravidade), ["alta", "alta", "media", "media", "baixa"]);
assert.equal(ps[0].tipo, "falha_tecnica"); // nosso primeiro, entre os de alta
assert.equal(ps.find((p) => p.titulo === "78% parados")!.tipo, "cliente");
assert.equal(ps.find((p) => p.titulo === "CRM em 2 clientes")!.tipo, "config_incompleta");
assert.equal(ps.find((p) => p.titulo === "Sem gasto")!.tipo, "sem_dado_origem");
assert.ok(ps.some((p) => p.id === "c2:instagram:nao-ligado"));

const r = resumirProblemas(ps);
assert.equal(r.total, 5);
assert.equal(r.clientesAfetados, 1);
assert.equal(r.porGravidade.alta, 2);
assert.equal(r.prioridade!.quem, "equipe");

assert.equal(filtrarProblemas(ps, { quem: "cliente" }).length, 1);
assert.equal(filtrarProblemas(ps, { fonte: "crm", gravidade: "alta" }).length, 2);
assert.equal(filtrarProblemas(ps, { cliente: "outro" }).length, 0);
assert.equal(filtrarProblemas(ps, {}).length, 5);

console.log("test-saude-problemas: ok");
