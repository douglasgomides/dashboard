// Atendimento honesto (auditoria 2 de 01/11/2026): 1ª resposta pelas mensagens, fila da WTS com o nome certo, amostra
// mínima, conferência ao vivo no selo da fonte, resultado oficial do card e aviso das mensagens. Sem rede, dados fictícios.
import assert from "node:assert/strict";
import { classificarMensagemWts, origemDaUtmDaSessao, primeiraRespostaWts, avisoFalhaMensagens, MARCA_AVISO_MENSAGENS } from "../api/_lib/conversas-wts";
import { resultadoOficialDoCard } from "../api/_lib/flwchat-sync";
import { esperaDoAtendimento, primeiraRespostaConfiavel, AMOSTRA_ESPERA, ROTULO_FILA, ROTULO_RESPOSTA } from "../src/lib/espera-atendimento";
import { divergenciasAoVivo, seloDaMetrica } from "../src/lib/conferencia-ao-vivo";
import { statusDaFonte } from "../src/lib/status-fonte";
import { montarResultado } from "../src/lib/resultado";
import { LIMITES } from "../src/lib/limites";

// --- 1ª resposta da WTS pelas mensagens --------------------------------------------------------------------------
{
  const t = (min: number) => new Date(Date.UTC(2026, 9, 20, 12, min)).toISOString();
  const msg = (min: number, direction: string, extra: Record<string, unknown> = {}) => ({ id: `m${min}`, createdAt: t(min), timestamp: t(min), direction, type: "TEXT", origin: "DEFAULT", status: "READ", ...extra });
  // Robô responde em segundos; nota interna e troca de equipe não contam; a 1ª mensagem de pessoa é aos 30 min.
  const conversa = [
    msg(0, "FROM_HUB"),
    msg(0.1, "TO_HUB", { origin: "BOT" }),
    msg(5, "TO_HUB", { type: "NOTE" }),
    msg(6, "TO_HUB", { type: "TRANSITION" }),
    msg(10, "TO_HUB", { origin: "OFFICE_HOURS" }),
    msg(20, "TO_HUB", { status: "FAILED" }),
    msg(30, "TO_HUB"),
    msg(31, "FROM_HUB"),
  ];
  assert.deepEqual(primeiraRespostaWts(conversa), { em: t(30), segundos: 30 * 60 });
  assert.equal(classificarMensagemWts(msg(1, "TO_HUB", { type: "NOTE" })).direcao, "sistema", "nota interna não é fala da clínica");
  assert.equal(classificarMensagemWts(msg(1, "TO_HUB", { type: "TRACK" })).direcao, "sistema");
  assert.equal(classificarMensagemWts(msg(1, "TO_HUB", { origin: "CAMPAIGN" })).automatica, true);
  assert.equal(classificarMensagemWts(msg(1, "TO_HUB", { origin: "API" })).automatica, true, "integração não é pessoa");
  assert.equal(classificarMensagemWts(msg(1, "TO_HUB")).automatica, false);
  assert.equal(classificarMensagemWts(msg(1, "FROM_HUB", { origin: "BOT" })).automatica, false, "só a saída é automática");
  // Fora de ordem também vale (ordena pela data).
  assert.equal(primeiraRespostaWts([...conversa].reverse())?.segundos, 30 * 60);
  // Sem origem nas mensagens da clínica: não dá para separar o robô, então não mede.
  assert.equal(primeiraRespostaWts(conversa.map(({ origin: _o, ...m }) => m)), null);
  // Só robô respondeu, ou o paciente nem escreveu: não medido.
  assert.equal(primeiraRespostaWts([msg(0, "FROM_HUB"), msg(1, "TO_HUB", { origin: "BOT" })]), null);
  assert.equal(primeiraRespostaWts([msg(0, "TO_HUB"), msg(1, "TO_HUB")]), null);
  // A clínica escreveu primeiro (campanha): conta da 1ª mensagem do paciente em diante.
  assert.equal(primeiraRespostaWts([msg(0, "TO_HUB", { origin: "CAMPAIGN" }), msg(10, "FROM_HUB"), msg(12, "TO_HUB")])?.segundos, 120);
}

// --- Origem do anúncio pela UTM da sessão v2 ------------------------------------------------------------------------
{
  assert.deepEqual(origemDaUtmDaSessao({ sourceId: "1200", clid: "ctwa-x", headline: "Consulta", referralUrl: "https://fb.me/x", source: "ad" }),
    { ad_id: "1200", campaign_id: null, ctwa_clid: "ctwa-x", headline: "Consulta", source_url: "https://fb.me/x", bruto: { sourceId: "1200", clid: "ctwa-x", headline: "Consulta", referralUrl: "https://fb.me/x", source: "ad", _de: "sessao.utm" } });
  assert.equal(origemDaUtmDaSessao({ source: "instagram", medium: "bio" }), null, "UTM sem id de anúncio nem clid não é anúncio");
  assert.equal(origemDaUtmDaSessao(null), null);
}

// --- Espera com rótulo e amostra mínima ---------------------------------------------------------------------------
{
  assert.equal(AMOSTRA_ESPERA, LIMITES.amostra.conversas.esperaMedida);
  // Dra. Rafaela (01/11/2026): 1 atendimento medido em 50, mediana 93 s. Não vira número nem "Rápido".
  const rafaela = { atendimentos: 50, espera_mediana_seg: 93, espera_cobertura: 1, fila_mediana_seg: null, fila_cobertura: 0 };
  const e = esperaDoAtendimento(rafaela);
  assert.equal(e.tipo, "sem");
  assert.match(e.nota, /amostra pequena: 1 atendimento medido \(mínimo 10\)/);
  assert.equal(primeiraRespostaConfiavel(rafaela), null);
  const r = montarResultado({ start: "2026-10-02", end: "2026-10-31", hoje: "2026-11-01", diario: [], posts: [], wts: rafaela } as any);
  assert.equal(r.metricas.find((m) => m.id === "resposta"), undefined, "sem amostra, sem cartão de tempo de resposta");
  // Juliana: fila da WTS com o rótulo certo enquanto a 1ª resposta não tem amostra.
  const juliana = esperaDoAtendimento({ atendimentos: 300, espera_mediana_seg: 4, espera_cobertura: 3, fila_mediana_seg: 5014, fila_cobertura: 271 });
  assert.equal(juliana.tipo, "fila");
  assert.equal(juliana.rotulo, ROTULO_FILA);
  assert.match(juliana.nota, /não é o tempo até a 1ª resposta/);
  // Com amostra: 1ª resposta.
  const ok = esperaDoAtendimento({ atendimentos: 300, espera_mediana_seg: 10955, espera_cobertura: 271, fila_mediana_seg: 5014, fila_cobertura: 271 });
  assert.equal(ok.tipo, "resposta");
  assert.equal(ok.rotulo, ROTULO_RESPOSTA);
  assert.equal(ok.seg, 10955);
  assert.equal(esperaDoAtendimento(null).nota, "não medido");
}

// --- Conferência ao vivo no selo da fonte -------------------------------------------------------------------------
{
  const base = { client_id: "marcella", crm_connection_id: "c1", fonte: "flwchat" };
  const linhas = [
    { ...base, metrica: "abertos_agora", ok: false, nexo: 824, fonte_valor: 673, rodado_em: "2026-11-01T21:53:04.757Z" },
    { ...base, metrica: "criados_30d_listados", ok: false, nexo: 633, fonte_valor: 564, rodado_em: "2026-11-01T21:53:04.757Z" },
    { ...base, client_id: "mariela", crm_connection_id: null, fonte: "wts", metrica: "sessoes_abertas_agora", ok: false, nexo: 8, fonte_valor: 5, rodado_em: "2026-11-01T21:57:20.468Z" },
    { ...base, client_id: "mariela", crm_connection_id: null, fonte: "wts", metrica: "sessoes_7d", ok: true, nexo: 22, fonte_valor: 20, rodado_em: "2026-11-01T21:57:20.468Z" },
    { ...base, client_id: "x", fonte: "kommo", metrica: "abertos_agora", ok: null, nexo: null, fonte_valor: null, rodado_em: "2026-11-01T21:00:00Z" },
  ];
  const d = divergenciasAoVivo(linhas);
  assert.deepEqual(d.get("marcella")?.get("crm"), { n: 151, fracao: 151 / 673, em: "2026-11-01T21:53:04.757Z" }, "a maior diferença da rodada");
  assert.equal(d.get("mariela")?.get("atendimento")?.n, 3);
  assert.equal(d.has("x"), false, "fonte não lida não conta como divergência");
  // A rodada seguinte bateu: some.
  const depois = divergenciasAoVivo([...linhas, { ...base, metrica: "abertos_agora", ok: true, nexo: 673, fonte_valor: 673, rodado_em: "2026-11-01T21:57:21.473Z" }]);
  assert.equal(depois.get("marcella")?.get("crm"), undefined);
  assert.equal(seloDaMetrica("digisac", "atendimentos_abertos_agora"), "atendimento");
  assert.equal(seloDaMetrica("digisac", "abertos_agora"), "crm");

  const emDia = { fonte: "crm", cadastro: true, data_ate: "2026-11-01", ultimo_sucesso: "2026-11-01T22:31:00Z" };
  assert.equal(statusDaFonte(emDia, "2026-11-01").cor, "verde");
  const grave = statusDaFonte({ ...emDia, divergencia: d.get("marcella")!.get("crm")! }, "2026-11-01");
  assert.equal(grave.cor, "vermelho", "151 de 673 (22%): vermelho");
  assert.equal(grave.rotulo, "Diverge da fonte");
  assert.match(grave.detalhe, /diverge da fonte: 151/);
  const leve = statusDaFonte({ ...emDia, fonte: "atendimento", divergencia: { n: 3, fracao: 0.6, em: "x" } }, "2026-11-01");
  assert.equal(leve.cor, "amarelo", "diferença pequena em número absoluto: amarelo");
  assert.match(leve.detalhe, /diverge da fonte: 3/);
  // Sem movimento (cinza) com divergência também não fica neutro.
  const parado = statusDaFonte({ fonte: "crm", cadastro: true, data_ate: "2026-10-20", ultimo_sucesso: "2026-11-01T10:00:00Z", divergencia: { n: 5, fracao: 0.01, em: "x" } }, "2026-11-01");
  assert.equal(parado.cor, "amarelo");
  // Não ligado fica como está.
  assert.equal(statusDaFonte({ fonte: "crm", cadastro: false, data_ate: null, divergencia: { n: 5, fracao: 0.01, em: "x" } }, "2026-11-01").cor, "cinza");
}

// --- Aviso das mensagens no selo do WhatsApp ----------------------------------------------------------------------
{
  const aviso = avisoFalhaMensagens(4, 20);
  assert.match(aviso, MARCA_AVISO_MENSAGENS);
  assert.equal(aviso, "Mensagens do WhatsApp: 4 conversas não foram lidas na última rodada (20 lidas sem erro). Elas voltam na próxima.");
  const st = statusDaFonte({ fonte: "atendimento", cadastro: true, data_ate: "2026-11-01", motivo: aviso, motivo_dono: "nos" }, "2026-11-01");
  assert.equal(st.cor, "amarelo");
  assert.equal(statusDaFonte({ fonte: "atendimento", cadastro: true, data_ate: "2026-11-01" }, "2026-11-01").cor, "verde");
}

// --- Resultado oficial do card (Helena v2) ------------------------------------------------------------------------
{
  assert.equal(resultadoOficialDoCard("WON"), "won");
  assert.equal(resultadoOficialDoCard("lost"), "lost");
  assert.equal(resultadoOficialDoCard("ARCHIVED"), "closed");
  assert.equal(resultadoOficialDoCard("OPEN"), null, "aberto segue a regra da etapa");
  assert.equal(resultadoOficialDoCard(undefined), null);
}

console.log("atendimento honesto: ok");
