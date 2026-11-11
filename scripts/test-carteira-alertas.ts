import assert from "node:assert/strict";
import {
  DIAS_SEM_ENTRAR,
  agruparAcessos,
  avisosDeReserva,
  entraNaCarteira,
  fatoDeAcesso,
  type AcessoClinica,
} from "../src/lib/carteira-alertas";
import { manualRequestSchema } from "../api/_lib/request-validation";

const DOCTOR_CREATOR = "0ef2c738-1961-4a90-b347-d1d45ac8098c";
const DOUGLAS = "ba5231d4-a973-47da-9018-82af6c5a5661";
const HOJE = Date.parse("2026-11-11T12:00:00Z");

assert.equal(DIAS_SEM_ENTRAR, 14);

// entraNaCarteira: inativa e negócio próprio ficam fora.
assert.equal(entraNaCarteira({ id: "c-1", active: true }), true);
assert.equal(entraNaCarteira({ id: "c-1" }), true);
assert.equal(entraNaCarteira({ id: "c-1", active: false }), false);
assert.equal(entraNaCarteira({ id: DOCTOR_CREATOR, active: true }), false);
assert.equal(entraNaCarteira({ id: DOUGLAS, active: true }), false);

const acesso = (client_id: string, ultimo_acesso: string | null, criado_em: string | null = "2026-08-01T12:00:00Z"): AcessoClinica => ({ client_id, usuarios: 1, ultimo_acesso, criado_em });

// Caso Lana: 1 membro, último acesso em 05/10 (37 dias).
const lana = { id: "lana", active: true };
const f37 = fatoDeAcesso({ clinica: lana, membrosCliente: 1, acesso: acesso("lana", "2026-10-05T12:00:00Z"), lido: true, hoje: HOJE });
assert.deepEqual(f37, { fato: "nao_entra", dias: 37 });
// O mesmo membro com acesso em 01/11 entra.
assert.equal(fatoDeAcesso({ clinica: lana, membrosCliente: 1, acesso: acesso("lana", "2026-11-01T12:00:00Z"), lido: true, hoje: HOJE }).fato, "entra");
// Exatamente 14 dias ainda entra; 15 não.
assert.equal(fatoDeAcesso({ clinica: lana, membrosCliente: 1, acesso: acesso("lana", "2026-10-28T12:00:00Z"), lido: true, hoje: HOJE }).fato, "entra");
assert.equal(fatoDeAcesso({ clinica: lana, membrosCliente: 1, acesso: acesso("lana", "2026-10-27T12:00:00Z"), lido: true, hoje: HOJE }).fato, "nao_entra");
// 0 membros: o acesso nunca foi criado (tarefa da equipe).
assert.equal(fatoDeAcesso({ clinica: lana, membrosCliente: 0, acesso: undefined, lido: true, hoje: HOJE }).fato, "sem_acesso");
// Inativa e negócio próprio ficam fora, mesmo sem membro.
assert.equal(fatoDeAcesso({ clinica: { id: "x", active: false }, membrosCliente: 0, acesso: undefined, lido: true, hoje: HOJE }).fato, "fora");
assert.equal(fatoDeAcesso({ clinica: { id: DOCTOR_CREATOR, active: true }, membrosCliente: 0, acesso: undefined, lido: true, hoje: HOJE }).fato, "fora");
assert.equal(fatoDeAcesso({ clinica: { id: DOUGLAS, active: true }, membrosCliente: 0, acesso: undefined, lido: true, hoje: HOJE }).fato, "fora");
// Acesso criado e nunca usado: vale a data da criação.
assert.equal(fatoDeAcesso({ clinica: lana, membrosCliente: 1, acesso: acesso("lana", null, "2026-11-08T12:00:00Z"), lido: true, hoje: HOJE }).fato, "entra");
const nunca = fatoDeAcesso({ clinica: lana, membrosCliente: 1, acesso: acesso("lana", null, "2026-10-12T12:00:00Z"), lido: true, hoje: HOJE });
assert.deepEqual(nunca, { fato: "nao_entra", dias: 30 });
// Sem leitura do servidor, ou sem contagem de membros: não dá para afirmar nada.
assert.equal(fatoDeAcesso({ clinica: lana, membrosCliente: 1, acesso: acesso("lana", "2026-10-05T12:00:00Z"), lido: false, hoje: HOJE }).fato, "nao_lido");
assert.equal(fatoDeAcesso({ clinica: lana, membrosCliente: undefined, acesso: acesso("lana", "2026-10-05T12:00:00Z"), lido: true, hoje: HOJE }).fato, "nao_lido");
// Tem membro mas o servidor não trouxe data nenhuma: também não dá para afirmar.
assert.equal(fatoDeAcesso({ clinica: lana, membrosCliente: 1, acesso: undefined, lido: true, hoje: HOJE }).fato, "nao_lido");
assert.equal(fatoDeAcesso({ clinica: lana, membrosCliente: 1, acesso: acesso("lana", null, null), lido: true, hoje: HOJE }).fato, "nao_lido");

// Retrato do debug (Q1): 20 clínicas, 19 ativas e 1 inativa (Carrion). Entre as ativas, os 2 do negócio próprio (sem membro)
// e a Lana (1 membro, último acesso em 05/10). As outras 16 não têm membro.
{
  const clinicas = [
    { id: DOCTOR_CREATOR, active: true },
    { id: DOUGLAS, active: true },
    { id: "lana", active: true },
    { id: "carrion", active: false },
    ...Array.from({ length: 16 }, (_, i) => ({ id: `sem-${i}`, active: true })),
  ];
  assert.equal(clinicas.length, 20);
  assert.equal(clinicas.filter((c) => c.active).length, 19);
  const membrosPorClinica = new Map([["lana", 1], ["carrion", 1]]);
  const acessos = new Map<string, AcessoClinica>([
    ["lana", acesso("lana", "2026-10-05T12:00:00Z")],
    ["carrion", acesso("carrion", "2026-09-28T12:00:00Z")],
  ]);
  const fatos = clinicas.map((c) => fatoDeAcesso({ clinica: c, membrosCliente: membrosPorClinica.get(c.id) ?? 0, acesso: acessos.get(c.id), lido: true, hoje: HOJE }).fato);
  assert.equal(fatos.filter((f) => f === "sem_acesso").length, 16);
  assert.equal(fatos.filter((f) => f === "nao_entra").length, 1);
  assert.equal(fatos.filter((f) => f === "fora").length, 3);
}

// agruparAcessos: admin fica fora; usuarios conta não-admin distintos; datas são as maiores; user_id não sai.
{
  const equipe = new Set(["admin-1"]);
  const membros = [
    { client_id: "c1", user_id: "admin-1" },
    { client_id: "c1", user_id: "u-secreto-1" },
    { client_id: "c1", user_id: "u-secreto-1" },
    { client_id: "c1", user_id: "u-secreto-2" },
    { client_id: "c2", user_id: "admin-1" },
    { client_id: "c3", user_id: "u-secreto-3" },
  ];
  const usuarios = new Map([
    ["u-secreto-1", { last_sign_in_at: "2026-10-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z" }],
    ["u-secreto-2", { last_sign_in_at: "2026-10-20T00:00:00Z", created_at: "2026-09-01T00:00:00Z" }],
    ["u-secreto-3", { last_sign_in_at: null, created_at: "2026-11-01T00:00:00Z" }],
  ]);
  const r = agruparAcessos(membros, equipe, usuarios);
  assert.equal(r.length, 2, "c2 só tem admin e não aparece");
  const c1 = r.find((x) => x.client_id === "c1")!;
  assert.equal(c1.usuarios, 2);
  assert.equal(c1.ultimo_acesso, "2026-10-20T00:00:00Z");
  assert.equal(c1.criado_em, "2026-09-01T00:00:00Z");
  const c3 = r.find((x) => x.client_id === "c3")!;
  assert.equal(c3.usuarios, 1);
  assert.equal(c3.ultimo_acesso, null);
  assert.equal(c3.criado_em, "2026-11-01T00:00:00Z");
  const json = JSON.stringify(r);
  assert.ok(!json.includes("u-secreto"), "o user_id de entrada não pode sair");
  assert.ok(!json.includes("admin-1"));
}

// avisosDeReserva: nome e contagem, nunca valor.
{
  const um = avisosDeReserva({ kommoSemTokenProprio: 1, instagramGraphSemTokenProprio: 0 }, () => false);
  assert.equal(um.length, 1);
  assert.equal(um[0].variavel, "KOMMO_API_TOKEN");
  assert.equal(um[0].conexoes, 1);
  assert.match(um[0].texto, /1 conexão Kommo ativa sem token próprio depende da reserva KOMMO_API_TOKEN, que o servidor não tem\. Grave o token na própria conexão\./);
  assert.deepEqual(avisosDeReserva({ kommoSemTokenProprio: 1, instagramGraphSemTokenProprio: 0 }, () => true), []);
  assert.deepEqual(avisosDeReserva({ kommoSemTokenProprio: 0, instagramGraphSemTokenProprio: 0 }, () => false), []);
  const dois = avisosDeReserva({ kommoSemTokenProprio: 2, instagramGraphSemTokenProprio: 3 }, () => false);
  assert.deepEqual(dois.map((a) => a.variavel), ["KOMMO_API_TOKEN", "META_ACCESS_TOKEN"]);
  assert.match(dois[0].texto, /2 conexões Kommo ativas sem token próprio dependem da reserva KOMMO_API_TOKEN/);
  assert.match(dois[1].texto, /3 perfis do Instagram pela Meta sem token próprio dependem da reserva META_ACCESS_TOKEN/);
  assert.match(dois[1].texto, /Grave o token do perfil\.$/);

  // Sem vazar valor: o predicado sai de um env falso; só o nome e a contagem chegam à saída.
  const envFalso: Record<string, string> = { META_ACCESS_TOKEN: "valor-secreto-de-teste" };
  const temVariavel = (nome: string) => !!envFalso[nome]?.trim();
  const sem = avisosDeReserva({ kommoSemTokenProprio: 0, instagramGraphSemTokenProprio: 2 }, temVariavel);
  assert.ok(!sem.some((a) => a.variavel === "META_ACCESS_TOKEN"));
  assert.ok(!JSON.stringify(sem).includes("valor-secreto-de-teste"));
  const kommo = avisosDeReserva({ kommoSemTokenProprio: 1, instagramGraphSemTokenProprio: 2 }, temVariavel);
  assert.ok(!JSON.stringify(kommo).includes("valor-secreto-de-teste"));
}

// Schema do alvo: global, sem client_id.
assert.equal(manualRequestSchema.safeParse({ alvo: "carteira_avisos" }).success, true);
assert.equal(manualRequestSchema.safeParse({ alvo: "posts" }).success, false);

console.log("test-carteira-alertas: ok");
