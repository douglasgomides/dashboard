// Pausa da Meta por limite de uso é informação, não erro (caso Douglas Gomides, 12/11/2026): com o dado em dia, a pausa vai
// para sync_status.motivo (dono "meta") e NÃO para last_error; com o dado velho continua erro; outros erros não mudam.
// Sem rede e sem banco: fetch simulado e banco em memória, dados fictícios.
import assert from "node:assert/strict";
import { fetchMeta, limparBloqueiosMeta } from "../api/_lib/meta-limite";
import { avaliarConta, consolidarStatusAnuncios, resumirCliente, type LeituraGuardada } from "../api/_lib/anuncios-status";
import { recordSyncStatus, recordSyncStatusPorCliente, registrarValidadeToken } from "../api/_lib/sync-status";
import { avisoDePausaMeta, ehSoPausaMeta, primeiroErroReal, soAvisoDePausaMeta } from "../src/lib/pausa-meta";
import { dadoEmDiaParaPausa, hojeBrasilia, statusDaFonte } from "../src/lib/status-fonte";
import { motivoDaLinha, motivoDoErro, statusDaLinha } from "../src/lib/motivos";
import { bancoEmMemoria } from "./support/supabase-memoria";

const originalFetch = globalThis.fetch;
const resp = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...headers } });

// A mensagem de produção, palavra por palavra (sync_status de 12/11/2026, sem o prefixo "Conta final 2463:").
const PAUSA_PROD = "Meta: uso em 202% do limite da conta. Chamadas pausadas por cerca de 29 min para não prolongar o bloqueio; a próxima rodada tenta de novo.";
const ERRO_REAL = "Meta insights act_1 respondeu 400: (#100) Invalid parameter";

try {
  // ---------- 1. Detector: a mensagem que o limitador REALMENTE gera (nunca se afasta do texto de meta-limite.ts)
  limparBloqueiosMeta();
  globalThis.fetch = async (input) => {
    const t = new URL(String(input)).searchParams.get("access_token");
    if (t === "tok-cheio") return resp(200, { data: [] }, { "x-ad-account-usage": JSON.stringify({ acc_id_util_pct: 202, reset_time_duration: 1740 }) });
    const codigo = Number(String(t).replace("tok-codigo-", ""));
    return resp(400, { error: { code: codigo, message: "limite" } });
  };
  await fetchMeta("https://graph.facebook.com/v26.0/act_1/insights?access_token=tok-cheio");
  const gerada = await fetchMeta("https://graph.facebook.com/v26.0/act_1/insights?access_token=tok-cheio").then(() => "", (e: Error) => e.message);
  assert.equal(gerada, PAUSA_PROD, "o texto gerado é o mesmo que está gravado em produção");
  assert.ok(ehSoPausaMeta(gerada));
  for (const codigo of [4, 17, 32, 613, 80004]) {
    limparBloqueiosMeta();
    const m = await fetchMeta(`https://graph.facebook.com/v26.0/act_1/insights?access_token=tok-codigo-${codigo}`).then(() => "", (e: Error) => e.message);
    assert.match(m, /Chamadas pausadas/, `código ${codigo} gera pausa`);
    assert.ok(ehSoPausaMeta(m), `código ${codigo}: ${m}`);
  }
  limparBloqueiosMeta();

  // Prefixos de etapa e de conta passam; outro erro junto, não.
  assert.ok(ehSoPausaMeta(PAUSA_PROD));
  assert.ok(ehSoPausaMeta(`Conta final 2463: ${PAUSA_PROD}`));
  assert.ok(ehSoPausaMeta(`posts: ${PAUSA_PROD}`));
  assert.ok(ehSoPausaMeta(`posts (topo): ${PAUSA_PROD}; seguidores: ${PAUSA_PROD}`));
  assert.ok(!ehSoPausaMeta(`${ERRO_REAL}; ${PAUSA_PROD}`), "erro de verdade junto com a pausa continua sendo erro");
  assert.ok(!ehSoPausaMeta(`${PAUSA_PROD}; insights 123: Graph respondeu 400`));
  assert.ok(!ehSoPausaMeta(ERRO_REAL));
  assert.ok(!ehSoPausaMeta("Meta: instável"), "só a mensagem de pausa");
  assert.ok(!ehSoPausaMeta(""));
  assert.ok(!ehSoPausaMeta(null));
  assert.equal(primeiroErroReal([PAUSA_PROD, "comments upsert: falhou"]), "comments upsert: falhou");
  assert.equal(primeiroErroReal([PAUSA_PROD]), PAUSA_PROD);
  assert.equal(primeiroErroReal([]), undefined);

  // ---------- 2. Régua do "dado em dia" (a mesma do status: até 1 dia, Instagram com folga de 2)
  const agora = new Date("2026-11-12T15:50:00Z"); // 12/11 em Brasília
  assert.ok(dadoEmDiaParaPausa("anuncios", "2026-11-11", null, agora), "até ontem está em dia");
  assert.ok(dadoEmDiaParaPausa("anuncios", "2026-11-12", null, agora));
  assert.ok(!dadoEmDiaParaPausa("anuncios", "2026-11-10", null, agora), "anteontem já é dado velho");
  assert.ok(dadoEmDiaParaPausa("instagram", "2026-11-09", null, agora), "Instagram: a Meta leva 2 dias para fechar o dia");
  assert.ok(!dadoEmDiaParaPausa("instagram", "2026-11-08", null, agora));
  assert.ok(dadoEmDiaParaPausa("comentarios", null, "2026-11-11T20:00:00Z", agora), "sem data do dado vale o último sucesso");
  assert.ok(!dadoEmDiaParaPausa("comentarios", null, "2026-11-09T20:00:00Z", agora));
  assert.ok(!dadoEmDiaParaPausa("anuncios", null, null, agora), "sem nenhuma evidência de dado em dia, não suaviza");
  assert.equal(avisoDePausaMeta("2026-11-11", "2026-11-12"), "Atualizado até ontem · a Meta pediu uma pausa; a próxima rodada tenta de novo.");
  assert.equal(avisoDePausaMeta("2026-11-12", "2026-11-12"), "Atualizado até hoje · a Meta pediu uma pausa; a próxima rodada tenta de novo.");
  assert.equal(avisoDePausaMeta("2026-11-09", "2026-11-12"), "Atualizado até 09/11 · a Meta pediu uma pausa; a próxima rodada tenta de novo.");
  assert.equal(avisoDePausaMeta(null, ""), "A Meta pediu uma pausa; a próxima rodada tenta de novo.");
  assert.ok(soAvisoDePausaMeta(avisoDePausaMeta("2026-11-11", "2026-11-12")));
  assert.ok(soAvisoDePausaMeta(`Conta final 1: ${avisoDePausaMeta("2026-11-11", "2026-11-12")} | Conta final 2: ${avisoDePausaMeta("2026-11-11", "2026-11-12")}`));
  assert.ok(!soAvisoDePausaMeta(`Conta final 1: ${avisoDePausaMeta("2026-11-11", "2026-11-12")} | Conta final 2: sem dado novo desde 23/09`));

  // ---------- 3. Anúncios por conta (avaliarConta / resumirCliente): o caso do Douglas
  const em = "2026-11-12T15:11:59Z";
  const leitura = (p: Partial<LeituraGuardada>): LeituraGuardada => ({ via: "graph", em, rows: 0, erro: null, precisaReconferir: 0, motivo: null, motivoDono: null, ...p });
  const conta = (id: string, leituras: LeituraGuardada[], ultimoDado: string | null = "2026-11-11", teveGasto = true) => avaliarConta({ adAccountId: id, leituras, ultimoDado, teveGasto }, agora);
  const AVISO_2463 = "Conta final 2463: Atualizado até ontem · a Meta pediu uma pausa; a próxima rodada tenta de novo.";

  const douglas = conta("1234567892463", [leitura({ erro: PAUSA_PROD })]);
  assert.equal(douglas.estado, "ok", "dado até ontem + pausa da Meta: a conta não está com erro");
  assert.equal(douglas.erro, null);
  assert.equal(douglas.aviso, AVISO_2463);
  assert.equal(douglas.avisoDono, "meta");
  const resumoDouglas = resumirCliente([douglas]);
  assert.equal(resumoDouglas.ok, true, "o cliente não fica com erro (sem last_error, o banco não cria 'sync-erro-anuncios')");
  assert.equal(resumoDouglas.erro, null);
  assert.equal(resumoDouglas.motivo, AVISO_2463);
  assert.equal(resumoDouglas.motivoDono, "meta");
  assert.equal(resumoDouglas.pausaMeta, true);

  // Dado velho: a pausa já custou dado, continua erro (e o texto traz a pausa e a conta).
  const velha = conta("1234567892463", [leitura({ erro: PAUSA_PROD })], "2026-11-10");
  assert.equal(velha.estado, "erro");
  assert.equal(velha.erro, `Conta final 2463: ${PAUSA_PROD}`);
  assert.equal(resumirCliente([velha]).ok, false);
  // Sem nenhum dado gravado também é erro.
  assert.equal(conta("1234567892463", [leitura({ erro: PAUSA_PROD })], null, false).estado, "erro");

  // Outros erros não mudam: erro de verdade junto com a pausa, erro de token, erro parcial, e a Windsor errando junto.
  assert.equal(conta("a", [leitura({ erro: `${ERRO_REAL}; ${PAUSA_PROD}` })]).estado, "erro");
  assert.equal(conta("b", [leitura({ erro: "(#190) token expirado" })]).estado, "erro");
  assert.equal(conta("c", [leitura({ rows: 80, erro: "campanhas: falhou" })]).estado, "parcial");
  // A Windsor errando numa conta que a Graph leu (aqui, com dado em dia e pausa) segue sendo o ruído esperado.
  assert.equal(conta("d", [leitura({ erro: PAUSA_PROD }), leitura({ via: "windsor", erro: "Windsor.ai request failed (500)" })]).estado, "ok");
  // Só a Windsor, com erro de verdade, e a pausa da Graph não a esconde.
  assert.equal(conta("d2", [leitura({ via: "windsor", erro: "Windsor.ai request failed (500)" })]).estado, "erro");
  // Leitura boa não ganha aviso nenhum.
  assert.equal(conta("e", [leitura({ rows: 40 })]).aviso, null);

  // Cliente com duas contas: pausa numa, conta parada com aviso do cliente na outra. O aviso do cliente vem primeiro e dá o dono.
  const parada = conta("2000000000001399", [leitura({ rows: 0, motivo: "4 campanhas ligadas, mas sem entrega (WhatsApp Business required).", motivoDono: "cliente" })], "2026-09-23");
  const duas = resumirCliente([douglas, parada]);
  assert.equal(duas.ok, true);
  assert.match(duas.motivo ?? "", /^Conta final 1399: sem dado novo desde 23\/09 .*\| Conta final 2463: Atualizado até ontem/);
  assert.equal(duas.motivoDono, "cliente", "a pausa da Meta não esconde o aviso que depende do cliente");
  assert.equal(duas.pausaMeta, true);

  // ---------- 4. Escritor de anúncios (consolidarStatusAnuncios -> sync_status), de ponta a ponta com banco em memória
  const C = "ba5231d4-a973-47da-9018-82af6c5a5661";
  const CONTA = "1234567892463";
  const bancoAnuncios = (ultimoDia: string) =>
    bancoEmMemoria({
      client_ad_accounts: [{ client_id: C, ad_account_id: CONTA, active: true }],
      clients: [{ id: C, active: true, meta_ad_account_id: null }],
      meta_ads_daily: [{ client_id: C, ad_account_id: CONTA, date: ultimoDia, campaign_id: "k1", spend: 120 }],
    });
  const leituraGraph = (errors: string[], rows = 0) => ({ clientId: C, adAccountId: CONTA, via: "graph" as const, rows, errors });
  {
    const b = bancoAnuncios("2026-11-11");
    await consolidarStatusAnuncios(b.sb, [C], [leituraGraph([PAUSA_PROD])], agora);
    const s = b.achar("sync_status", { client_id: C, fonte: "anuncios" })!;
    assert.equal(s.last_error, null, "pausa com dado até ontem NÃO vai para last_error");
    assert.equal(s.motivo, AVISO_2463);
    assert.equal(s.motivo_dono, "meta");
    assert.equal(s.data_ate, "2026-11-11");
    assert.equal(s.last_attempt_at, agora.toISOString(), "a tentativa fica registrada");
    assert.ok(!("last_success_at" in s), "a rodada não leu nada: não vale como último sucesso");
    // A rodada seguinte, sem pausa, limpa o aviso e carimba o sucesso.
    await consolidarStatusAnuncios(b.sb, [C], [leituraGraph([], 120)], new Date("2026-11-12T16:30:00Z"));
    const depois = b.achar("sync_status", { client_id: C, fonte: "anuncios" })!;
    assert.equal(depois.last_error, null);
    assert.equal(depois.motivo, null);
    assert.equal(depois.motivo_dono, null);
    assert.ok(depois.last_success_at);
  }
  {
    const b = bancoAnuncios("2026-11-09"); // pausa que já durou: dado de 3 dias atrás
    await consolidarStatusAnuncios(b.sb, [C], [leituraGraph([PAUSA_PROD])], agora);
    const s = b.achar("sync_status", { client_id: C, fonte: "anuncios" })!;
    assert.equal(s.last_error, `Conta final 2463: ${PAUSA_PROD}`, "dado velho: continua erro de verdade");
    assert.equal(s.motivo, null);
  }
  {
    const b = bancoAnuncios("2026-11-11");
    await consolidarStatusAnuncios(b.sb, [C], [leituraGraph([ERRO_REAL])], agora);
    assert.match(b.achar("sync_status", { client_id: C, fonte: "anuncios" })!.last_error, /Invalid parameter/, "outro erro não muda");
  }

  // ---------- 5. Escritor comum (recordSyncStatus): Instagram e comentários
  const hoje = hojeBrasilia();
  const dia = (n: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  {
    // Comentários: sem data própria do dado, vale o último sucesso (10 h atrás).
    const sucessoAnterior = new Date(Date.now() - 10 * 3600_000).toISOString();
    const b = bancoEmMemoria({ sync_status: [{ client_id: C, fonte: "comentarios", last_success_at: sucessoAnterior, last_error: null }] });
    await recordSyncStatus(b.sb, C, "comentarios", { ok: false, error: PAUSA_PROD });
    const s = b.achar("sync_status", { client_id: C, fonte: "comentarios" })!;
    assert.equal(s.last_error, null);
    assert.equal(s.last_success_at, sucessoAnterior, "o carimbo de sucesso não anda numa rodada pausada");
    assert.match(s.motivo, /a Meta pediu uma pausa/);
    assert.equal(s.motivo_dono, "meta");
    // Volta ao normal: o aviso de pausa sai.
    await recordSyncStatus(b.sb, C, "comentarios", { ok: true, rows: 3 });
    const ok = b.achar("sync_status", { client_id: C, fonte: "comentarios" })!;
    assert.equal(ok.motivo, null);
    assert.equal(ok.motivo_dono, null);
    assert.equal(ok.last_error, null);
    // Aviso de OUTRA origem (token vencendo) não é apagado pela volta ao normal nem pela pausa.
    const c = bancoEmMemoria({ sync_status: [{ client_id: C, fonte: "comentarios", last_success_at: sucessoAnterior, motivo: "O token da Meta vence em 5 dias (17/11/2026).", motivo_dono: "cliente" }] });
    await recordSyncStatus(c.sb, C, "comentarios", { ok: false, error: PAUSA_PROD });
    assert.match(c.achar("sync_status", { client_id: C, fonte: "comentarios" })!.motivo, /O token da Meta vence/);
    assert.equal(c.achar("sync_status", { client_id: C, fonte: "comentarios" })!.last_error, null);
  }
  {
    // Instagram com dado em dia (conta e posts até ontem).
    const b = bancoEmMemoria({
      instagram_account_daily_metrics: [{ client_id: C, date: dia(1) }],
      instagram_posts: [{ client_id: C, metrics_updated_at: `${dia(1)}T10:00:00Z` }],
    });
    await recordSyncStatus(b.sb, C, "instagram", { ok: false, rows: 0, error: `posts: ${PAUSA_PROD}` });
    const s = b.achar("sync_status", { client_id: C, fonte: "instagram" })!;
    assert.equal(s.last_error, null);
    assert.match(s.motivo, /^Atualizado até (ontem|hoje) · a Meta pediu uma pausa/);
    assert.equal(s.motivo_dono, "meta");
    assert.equal(s.data_ate, dia(1));
    assert.ok(!("last_success_at" in s));
    await recordSyncStatus(b.sb, C, "instagram", { ok: true, rows: 5 });
    assert.equal(b.achar("sync_status", { client_id: C, fonte: "instagram" })!.motivo, null, "rodada boa limpa o aviso");
  }
  {
    // Instagram com dado velho (6 dias): a pausa já custou dado, continua erro.
    const b = bancoEmMemoria({
      instagram_account_daily_metrics: [{ client_id: C, date: dia(6) }],
      instagram_posts: [{ client_id: C, metrics_updated_at: `${dia(6)}T10:00:00Z` }],
    });
    await recordSyncStatus(b.sb, C, "instagram", { ok: false, rows: 0, error: `posts: ${PAUSA_PROD}` });
    const s = b.achar("sync_status", { client_id: C, fonte: "instagram" })!;
    assert.match(s.last_error, /Chamadas pausadas/);
    assert.equal(s.motivo, null);
    // Outro erro do Instagram (mesmo com dado em dia) não muda.
    const c = bancoEmMemoria({ instagram_account_daily_metrics: [{ client_id: C, date: dia(1) }], instagram_posts: [{ client_id: C, metrics_updated_at: `${dia(1)}T10:00:00Z` }] });
    await recordSyncStatus(c.sb, C, "instagram", { ok: false, rows: 0, error: "posts: Graph respondeu 500" });
    assert.match(c.achar("sync_status", { client_id: C, fonte: "instagram" })!.last_error, /Graph respondeu 500/);
  }
  {
    // Pausa e erro de verdade na mesma rodada: o erro de verdade é o que fica gravado.
    const b = bancoEmMemoria({ sync_status: [{ client_id: C, fonte: "comentarios", last_success_at: new Date().toISOString() }] });
    await recordSyncStatusPorCliente(b.sb, "comentarios", [{ clientId: C, rows: 0, errors: [PAUSA_PROD, "comments upsert: falhou"] }]);
    assert.equal(b.achar("sync_status", { client_id: C, fonte: "comentarios" })!.last_error, "comments upsert: falhou");
    // Anúncios no escritor comum não suavizam: ali a decisão é por conta (anuncios-status.ts).
    const c = bancoEmMemoria({ meta_ads_daily: [{ client_id: C, date: dia(1) }] });
    await recordSyncStatus(c.sb, C, "anuncios", { ok: false, error: PAUSA_PROD });
    assert.match(c.achar("sync_status", { client_id: C, fonte: "anuncios" })!.last_error, /Chamadas pausadas/);
  }

  {
    // O aviso de token vencendo vale mais que a pausa da Meta (que é passageira); sem aviso de token, a pausa fica.
    const pausa = "Atualizado até ontem · a Meta pediu uma pausa; a próxima rodada tenta de novo.";
    const b = bancoEmMemoria({ sync_status: [{ client_id: C, fonte: "instagram", motivo: pausa, motivo_dono: "meta" }] });
    await registrarValidadeToken(b.sb, C, "instagram", "Meta", new Date(Date.now() + 5 * 86_400_000), { artigo: "a" });
    assert.match(b.achar("sync_status", { client_id: C, fonte: "instagram" })!.motivo, /^O token da Meta vence em/);
    assert.equal(b.achar("sync_status", { client_id: C, fonte: "instagram" })!.motivo_dono, "cliente");
    const c = bancoEmMemoria({ sync_status: [{ client_id: C, fonte: "instagram", motivo: pausa, motivo_dono: "meta" }] });
    await registrarValidadeToken(c.sb, C, "instagram", "Meta", new Date(Date.now() + 200 * 86_400_000), { artigo: "a" });
    assert.equal(c.achar("sync_status", { client_id: C, fonte: "instagram" })!.motivo, pausa, "token longe de vencer não apaga a pausa");
    // Motivo de outra origem (cliente) continua com prioridade sobre o token.
    const d = bancoEmMemoria({ sync_status: [{ client_id: C, fonte: "instagram", motivo: "Aguardando a equipe da cliente aprovar o novo token.", motivo_dono: "cliente" }] });
    await registrarValidadeToken(d.sb, C, "instagram", "Meta", new Date(Date.now() + 5 * 86_400_000), { artigo: "a" });
    assert.match(d.achar("sync_status", { client_id: C, fonte: "instagram" })!.motivo, /^Aguardando a equipe/);
  }

  // ---------- 6. Tela: o chip da Carteira acompanha, e a pausa nunca é vermelha com o dado em dia
  const base = { fonte: "anuncios", cadastro: true, data_ate: "2026-11-11", ultimo_sucesso: "2026-11-12T02:12:25Z" };
  const novo = statusDaFonte({ ...base, last_error: null, motivo: AVISO_2463, motivo_dono: "meta" }, "2026-11-12");
  assert.equal(novo.cor, "verde");
  assert.equal(novo.rotulo, "Em dia");
  assert.match(novo.detalhe, /a Meta pediu uma pausa/);
  assert.equal(novo.motivo, AVISO_2463);
  // Linha antiga, ainda com a pausa em last_error (a de produção hoje): com dado em dia não pinta "Erro".
  const antigo = statusDaFonte({ ...base, last_error: `Conta final 2463: ${PAUSA_PROD}`, motivo: null, motivo_dono: null }, "2026-11-12");
  assert.equal(antigo.cor, "verde");
  assert.equal(antigo.rotulo, "Em dia");
  // Pela rota completa da Carteira (motivoDaLinha + statusDaFonte).
  const linhaProd = { fonte: "anuncios", last_attempt_at: "2026-11-12T15:11:59Z", last_success_at: "2026-11-12T02:12:25Z", last_error: `Conta final 2463: ${PAUSA_PROD}`, last_rows: 0, data_ate: hojeBrasilia(new Date(Date.now() - 86_400_000)), motivo: null, motivo_dono: null };
  assert.equal(statusDaLinha(linhaProd, true).rotulo, "Em dia");
  assert.equal(motivoDaLinha(linhaProd)?.dono, "meta", "e quando é erro de verdade, o dono é a Meta, não 'falha nossa'");
  // Dado velho: continua "Erro" vermelho.
  const velho = statusDaFonte({ ...base, data_ate: "2026-11-08", last_error: `Conta final 2463: ${PAUSA_PROD}` }, "2026-11-12");
  assert.equal(velho.cor, "vermelho");
  assert.equal(velho.rotulo, "Erro");
  // Pausa junto com aviso do cliente (outra conta parada): não vira verde, segue "Atenção".
  const misto = statusDaFonte({ ...base, last_error: null, motivo: `Conta final 1399: sem dado novo desde 23/09 (39 dias). | ${AVISO_2463}`, motivo_dono: "cliente" }, "2026-11-12");
  assert.equal(misto.cor, "amarelo");
  assert.equal(misto.rotulo, "Atenção");
  // Aviso da Meta que NÃO é pausa (conta em análise) com dado em dia segue como antes: "Atenção".
  const analise = statusDaFonte({ ...base, last_error: null, motivo: "Conta final 3333: sem dado novo desde 01/11 (11 dias). Conta de anúncios em análise de risco pela Meta.", motivo_dono: "meta" }, "2026-11-12");
  assert.equal(analise.rotulo, "Atenção");
  // Erro de verdade com dado em dia continua vermelho.
  assert.equal(statusDaFonte({ ...base, last_error: ERRO_REAL }, "2026-11-12").rotulo, "Erro");
  assert.equal(motivoDoErro("anuncios", PAUSA_PROD)?.dono, "meta");
  assert.equal(motivoDoErro("anuncios", ERRO_REAL), null);
} finally {
  globalThis.fetch = originalFetch;
  limparBloqueiosMeta();
}

console.log("test-pausa-meta: ok");
