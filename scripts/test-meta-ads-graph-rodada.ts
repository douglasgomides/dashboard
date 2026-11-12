// Rodada do sync de anúncios pela Graph: (1) a mesma conta com o mesmo token em mais de um cliente é lida UMA vez na
// Meta (cada leitura repetida conta no limite de uso da conta) e cada cliente grava as suas linhas; (2) de ponta a ponta,
// a pausa por limite da Meta com dado em dia não vira erro do cliente. Sem rede e sem banco: fetch simulado e banco em memória.
import assert from "node:assert/strict";
import { leituraDaGraph, runMetaAdsGraphSync } from "../api/_lib/meta-ads-graph-sync";
import { consolidarStatusAnuncios } from "../api/_lib/anuncios-status";
import { fetchMeta, limparBloqueiosMeta } from "../api/_lib/meta-limite";
import { hojeBrasilia } from "../src/lib/status-fonte";
import { bancoEmMemoria } from "./support/supabase-memoria";

const originalFetch = globalThis.fetch;
const hoje = hojeBrasilia();
const dia = (n: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const resp = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...headers } });

const cliente = (nome: string) => ({ name: nome, active: true, meta_ad_account_id: null });
const vinculo = (client_id: string, ad_account_id: string, access_token: string) => ({ client_id, ad_account_id, access_token, active: true, clients: cliente(client_id) });

const chamadas: string[] = [];
function meta(opcoes: { usoPorToken?: Record<string, number> } = {}) {
  globalThis.fetch = async (input) => {
    const u = new URL(String(input));
    const m = u.pathname.match(/\/(act_\d+)(\/[a-z]+)?$/);
    assert.ok(m, `URL inesperada: ${u.pathname}`);
    const token = u.searchParams.get("access_token") ?? "";
    const tipo = m[2] === "/insights" ? (u.searchParams.get("date_preset") ? "alcance7d" : "insights") : m[2] === "/adsets" ? "conjuntos" : "limite";
    chamadas.push(`${tipo}|${m[1]}|${token}`);
    const uso = opcoes.usoPorToken?.[token];
    const cab: Record<string, string> = uso ? { "x-ad-account-usage": JSON.stringify({ acc_id_util_pct: uso, reset_time_duration: 1740 }) } : {};
    if (tipo === "insights") {
      return resp(200, { data: [{ date_start: dia(1), campaign_id: "k1", campaign_name: "Campanha", objective: "OUTCOME_ENGAGEMENT", spend: "10.5", impressions: "100", reach: "90", clicks: "5", unique_clicks: "4", frequency: "1.1", inline_link_clicks: "3", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "2" }] }] }, cab);
    }
    if (tipo === "alcance7d") return resp(200, { data: [{ campaign_id: "k1", reach: "90", impressions: "100", frequency: "1.1", date_start: dia(7), date_stop: dia(1) }] }, cab);
    if (tipo === "conjuntos") return resp(200, { data: [{ campaign_id: "k1", optimization_goal: "CONVERSATIONS", destination_type: "WHATSAPP" }] }, cab);
    return resp(200, { spend_cap: "0", amount_spent: "1000" }, cab);
  };
}
const contar = (prefixo: string) => chamadas.filter((c) => c.startsWith(prefixo)).length;
const env = (sb: unknown) => ({ supabaseUrl: "http://banco.invalido", supabaseServiceRoleKey: "chave-ficticia", syncDays: 30, supabase: sb as never });

try {
  // ---------- 1. Mesma conta e mesmo token em dois clientes: uma leitura só
  limparBloqueiosMeta();
  meta();
  {
    const b = bancoEmMemoria({
      client_ad_accounts: [
        vinculo("c1", "111", "tok-a"),
        vinculo("c2", "act_111", "tok-a"), // mesma conta (com o prefixo act_), mesmo token
        vinculo("c3", "111", "tok-b"), // mesma conta, OUTRO token: leitura própria
        vinculo("c4", "222", "tok-a"), // outra conta
      ],
    });
    const r = await runMetaAdsGraphSync(env(b.sb));
    assert.equal(r.length, 4, "quatro vínculos, quatro resultados");
    assert.equal(contar("insights|act_111|tok-a"), 1, "insights de 30 dias da mesma conta/token: uma vez");
    assert.equal(contar("conjuntos|act_111|tok-a"), 1);
    assert.equal(contar("alcance7d|act_111|tok-a"), 1);
    assert.equal(contar("limite|act_111|tok-a"), 1);
    assert.equal(contar("insights|act_111|tok-b"), 1, "outro token é outra leitura");
    assert.equal(contar("insights|act_222|tok-a"), 1);
    assert.equal(chamadas.length, 12, "12 chamadas à Meta em vez de 16 (3 leituras distintas x 4 chamadas)");
    // Cada cliente grava as suas linhas, com o seu client_id.
    for (const id of ["c1", "c2", "c3", "c4"]) {
      const linhas = b.tabela("meta_ads_daily").filter((l) => l.client_id === id);
      assert.equal(linhas.length, 1, `${id} grava a sua linha diária`);
      assert.equal(linhas[0].spend, 10.5);
      assert.equal(linhas[0].conversations, 2);
      assert.equal(b.tabela("meta_ads_campaigns").filter((l) => l.client_id === id).length, 1);
      assert.equal(b.tabela("meta_ads_alcance_janela").filter((l) => l.client_id === id).length, 1);
    }
    assert.ok(r.every((x) => x.rows === 1 && x.errors.length === 0 && x.campaigns === 1));
    assert.equal(b.tabela("sync_status_contas").length, 4, "a leitura por conta continua sendo registrada por cliente");
  }

  // ---------- 2. Uma segunda rodada (outra chamada) lê de novo: o reaproveitamento vale só dentro da rodada
  chamadas.length = 0;
  limparBloqueiosMeta();
  {
    const b = bancoEmMemoria({ client_ad_accounts: [vinculo("c1", "111", "tok-a")] });
    await runMetaAdsGraphSync(env(b.sb));
    await runMetaAdsGraphSync(env(b.sb));
    assert.equal(contar("insights|act_111|tok-a"), 2, "cada rodada lê a Meta de novo (a revisão de 30 dias precisa disso)");
  }

  // ---------- 3. Pausa durante a rodada: a segunda linha da mesma conta não gera nenhuma chamada nova
  chamadas.length = 0;
  limparBloqueiosMeta();
  meta({ usoPorToken: { "tok-cheio": 202 } });
  {
    const b = bancoEmMemoria({ client_ad_accounts: [vinculo("c1", "333", "tok-cheio"), vinculo("c2", "333", "tok-cheio")] });
    const r = await runMetaAdsGraphSync(env(b.sb));
    assert.equal(chamadas.length, 1, "a primeira resposta mostra 202% de uso: o resto da rodada espera, e a repetição nem tenta");
    assert.ok(r.every((x) => x.rows === 1), "o dado da primeira leitura foi gravado nos dois clientes");
  }

  // ---------- 4. Ponta a ponta do caso do Douglas: a Meta já estava pausada quando a rodada começou
  chamadas.length = 0;
  limparBloqueiosMeta();
  meta({ usoPorToken: { "tok-douglas": 202 } });
  await fetchMeta("https://graph.facebook.com/v26.0/act_444?access_token=tok-douglas"); // resposta com 202% de uso: pausa de 29 min
  chamadas.length = 0;
  const C = "ba5231d4-a973-47da-9018-82af6c5a5661";
  const montar = (ultimoDia: string) =>
    bancoEmMemoria({
      client_ad_accounts: [vinculo(C, "444000000002463", "tok-douglas")],
      clients: [{ id: C, active: true, meta_ad_account_id: null }],
      meta_ads_daily: [{ client_id: C, ad_account_id: "444000000002463", date: ultimoDia, campaign_id: "k1", spend: 120 }],
    });
  {
    const b = montar(dia(1)); // dado até ontem
    const r = await runMetaAdsGraphSync(env(b.sb));
    assert.equal(chamadas.length, 0, "pausada: nenhuma chamada à Meta");
    assert.match(r[0].errors[0], /uso em 202% do limite da conta\. Chamadas pausadas por cerca de \d+ min/);
    await consolidarStatusAnuncios(b.sb, [C], r.map(leituraDaGraph));
    const s = b.achar("sync_status", { client_id: C, fonte: "anuncios" })!;
    assert.equal(s.last_error, null, "dado até ontem + pausa: sem last_error, então 'Anúncios: erro' e o item do banco não existem");
    assert.match(s.motivo, /Conta final 2463: Atualizado até ontem · a Meta pediu uma pausa; a próxima rodada tenta de novo\./);
    assert.equal(s.motivo_dono, "meta");
    assert.equal(s.data_ate, dia(1));
  }
  {
    const b = montar(dia(4)); // pausa que já custou dado
    const r = await runMetaAdsGraphSync(env(b.sb));
    await consolidarStatusAnuncios(b.sb, [C], r.map(leituraDaGraph));
    const s = b.achar("sync_status", { client_id: C, fonte: "anuncios" })!;
    assert.match(s.last_error, /Conta final 2463: Meta: uso em 202%/, "dado velho: continua erro de verdade");
  }
} finally {
  globalThis.fetch = originalFetch;
  limparBloqueiosMeta();
}

console.log("test-meta-ads-graph-rodada: ok");
