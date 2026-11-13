/**
 * Status de anúncios que não mente: decidido POR CONTA de anúncios e só depois juntado por cliente.
 *
 * Antes (auditoria de 01/11/2026):
 *   - o cliente ficava "ok" se QUALQUER conta trouxesse linha (okSeHouveLinhas), e a Windsor gravava sempre "sem erro".
 *     Uma conta falhando ficava escondida pela outra do mesmo cliente (caso da Dra. Lana, duas contas na Windsor);
 *   - o motivo "conta parada" era gravado numa linha por cliente dentro do laço de contas: a última conta processada
 *     apagava o aviso da outra (HOMS: conta parada há 39 dias sem aviso nenhum);
 *   - a conta que ninguém lê (sem token e fora da Windsor, caso da Dra. Glauce) aparecia "ok, sem campanha".
 *
 * Agora cada via (Graph e Windsor) grava a leitura de cada conta em sync_status_contas. Depois, para cada cliente,
 * junta TODAS as contas ativas dele e só marca "ok" quando cada conta foi lida por inteiro (todas as janelas do
 * período e todos os lotes gravados). Conta não lida, com erro ou parcial vira erro do cliente, dizendo qual conta.
 * Conta que tinha gasto e está sem dado há mais de DIAS_CONTA_PARADA dias vira aviso (motivo), também dizendo qual.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { erroCurto, lerDadosAte } from "./sync-status.js";
import { avisoDePausaMeta, ehSoPausaMeta } from "../../src/lib/pausa-meta.js";
import { dadoEmDiaParaPausa } from "../../src/lib/status-fonte.js";

export type ViaAnuncios = "graph" | "windsor";

/** Uma leitura de uma conta por uma via, nesta rodada. */
export interface LeituraConta {
  clientId: string;
  adAccountId: string;
  via: ViaAnuncios;
  rows: number;
  errors: string[];
  /** Quantas linhas de dia passado com gasto > 0 não foram trocadas por zero (ver anuncios-protecao.ts). */
  precisaReconferir?: number;
  /** Diagnóstico da Graph para conta parada (pagamento, campanha desligada...). */
  motivo?: string | null;
  motivoDono?: string | null;
}

/** Leitura guardada (desta rodada ou de outra via em outra chamada). */
export interface LeituraGuardada {
  via: ViaAnuncios;
  em: string; // last_attempt_at
  rows: number;
  erro: string | null;
  precisaReconferir: number;
  motivo: string | null;
  motivoDono: string | null;
}

export interface ContaParaAvaliar {
  adAccountId: string;
  leituras: LeituraGuardada[];
  /** Último dia com dado gravado desta conta neste cliente. */
  ultimoDado: string | null;
  /** A conta teve gasto > 0 nos últimos 120 dias (antes de parar). */
  teveGasto: boolean;
  /**
   * Última análise (com data) da planilha de distribuição da equipe deste cliente (clients.ads_planilha_url), ou null.
   * Conta que nenhuma via lê (post impulsionado pelo app do Instagram, conta fora da BM) fica coberta pela planilha
   * quando a análise tem até DIAS_PLANILHA_COBRE dias: vira aviso da equipe ("manual"), não erro de leitura.
   */
  planilhaAte?: string | null;
}

export type EstadoConta = "ok" | "parcial" | "erro" | "nao_lida" | "sem_leitura";

export interface AvaliacaoConta {
  adAccountId: string;
  estado: EstadoConta;
  erro: string | null;
  aviso: string | null;
  avisoDono: string | null;
  rows: number;
  precisaReconferir: number;
  /** A Meta pediu uma pausa por limite de uso nesta conta, mas o dado dela está em dia: vira aviso, não erro (pausa-meta.ts). */
  pausaMeta?: boolean;
}

/** Leitura vale por 48 h: o sync roda todo dia, e uma via que parou de rodar não pode manter o "ok" de ontem. */
export const VALIDADE_LEITURA_MS = 48 * 3600_000;
/** Conta com gasto antes e sem dado novo há mais que isto vira aviso. */
export const DIAS_CONTA_PARADA = 3;
/** A planilha é semanal: análise com até 14 dias ainda cobre a conta que o token não lê. */
export const DIAS_PLANILHA_COBRE = 14;

// Partes que são enriquecimento (meta de otimização, alcance de 7 dias): falha vira aviso, não "dado incompleto".
const ERRO_EXTRA = /^(conjuntos de anúncios|alcance de 7 dias)/i;
export const erroQueConta = (e: string) => !ERRO_EXTRA.test(e.trim());

/** "final 1234": identifica a conta na tela sem expor o número inteiro. */
export function contaCurta(adAccountId: string): string {
  const s = String(adAccountId).replace(/^act_/, "");
  return `final ${s.slice(-4)}`;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diasEntre = (hoje: string, dia: string) => Math.round((Date.parse(hoje.slice(0, 10)) - Date.parse(dia.slice(0, 10))) / 86_400_000);

export function avaliarConta(c: ContaParaAvaliar, agora: Date = new Date()): AvaliacaoConta {
  const hoje = new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const frescas = c.leituras.filter((l) => agora.getTime() - Date.parse(l.em) <= VALIDADE_LEITURA_MS);
  const base = { adAccountId: c.adAccountId, aviso: null as string | null, avisoDono: null as string | null };
  // Pausa da Meta por limite de uso com o dado da conta em dia (até ontem): não é falha de leitura. O que a pausa deixou
  // de ler (hoje e a revisão dos últimos dias) volta na próxima rodada. Com o dado velho a pausa já custou dado e segue
  // como erro. Qualquer outro erro da leitura não muda (ehSoPausaMeta exige que só haja pausa no texto).
  const diaEmDia = dadoEmDiaParaPausa("anuncios", c.ultimoDado, null, agora);
  let pausaMeta = false;
  const leituras = frescas.map((l) => {
    if (l.erro && diaEmDia && ehSoPausaMeta(l.erro)) {
      pausaMeta = true;
      return { ...l, erro: null };
    }
    return l;
  });
  const rows = frescas.reduce((m, l) => Math.max(m, l.rows), 0);
  const precisaReconferir = frescas.reduce((m, l) => Math.max(m, l.precisaReconferir), 0);
  const conta = `Conta ${contaCurta(c.adAccountId)}`;
  const cobertaPelaPlanilha = !!c.planilhaAte && diasEntre(hoje, c.planilhaAte) <= DIAS_PLANILHA_COBRE;
  const pelaPlanilha = (): AvaliacaoConta => ({
    ...base,
    estado: "ok",
    erro: null,
    aviso: `${conta} não é lida pelo token da Meta: os números vêm da planilha da equipe (última análise em ${ddmm(c.planilhaAte!)}).`,
    avisoDono: "manual",
    rows,
    precisaReconferir,
  });
  if (frescas.length === 0) {
    if (cobertaPelaPlanilha) return pelaPlanilha();
    return { ...base, estado: "sem_leitura", erro: `${conta} não foi lida nas últimas 48 horas por nenhuma via.`, rows: 0, precisaReconferir: 0 };
  }
  // Lida por inteiro: sem erro. Pela Graph (token da conta) zero linha é resposta de verdade (nenhuma entrega no
  // período); pela Windsor zero linha também pode ser "a Windsor não tem a conta", decidido abaixo pelo histórico.
  const inteira = leituras.find((l) => !l.erro && (l.rows > 0 || l.via === "graph"));
  const vaziaWindsor = leituras.find((l) => !l.erro && l.via === "windsor" && l.rows === 0);
  let estado: EstadoConta;
  let erro: string | null = null;
  if (inteira) estado = "ok";
  else {
    const comErro = leituras.filter((l) => l.erro);
    const parcial = comErro.find((l) => l.rows > 0);
    // Erro da Graph é sempre real (a conta tem token para ela). Erro só da Windsor vale quando nada mais leu a conta.
    const erroGraph = comErro.find((l) => l.via === "graph");
    if (parcial) {
      estado = "parcial";
      erro = `${conta}: dado incompleto (${parcial.erro})`;
    } else if (erroGraph || (comErro.length > 0 && !vaziaWindsor)) {
      estado = "erro";
      erro = `${conta}: ${(erroGraph ?? comErro[0]).erro}`;
    } else if (!c.ultimoDado || diasEntre(hoje, c.ultimoDado) > 120) {
      // Só a Windsor tentou, voltou vazia e a conta nunca trouxe dado: ninguém lê esta conta.
      estado = "nao_lida";
      erro = `${conta} não lida: não tem token próprio e a Windsor não devolve nenhum dado dela. Os números desta conta não entram no painel. Confira se o dono da conta deu acesso de leitura (ads_read).`;
    } else {
      estado = "ok"; // Windsor respondeu vazio para uma conta que já teve dado: período sem entrega (ver aviso).
    }
  }
  // Conta que nenhuma via lê, mas a equipe lança na planilha: os números vêm de lá (não é falha nossa nem da leitura).
  if (estado === "nao_lida" && cobertaPelaPlanilha) return pelaPlanilha();
  // Conta que tinha gasto e parou: aviso por conta (nunca apagado pela outra conta do cliente).
  if (estado === "ok" && c.ultimoDado && c.teveGasto) {
    const dias = diasEntre(hoje, c.ultimoDado);
    if (dias > DIAS_CONTA_PARADA) {
      const diag = frescas.find((l) => l.motivo)?.motivo ?? null;
      base.aviso = `${conta}: sem dado novo desde ${ddmm(c.ultimoDado)} (${dias} dias), embora tivesse gasto antes. ${diag ?? "Confira se as campanhas foram pausadas, o pagamento ou o acesso à conta."}`.trim();
      base.avisoDono = frescas.find((l) => l.motivo)?.motivoDono ?? "cliente";
    }
  }
  // Pausa da Meta com dado em dia: aviso informativo (dono "meta") na conta, sem derrubar o estado dela para "erro".
  if (estado === "ok" && pausaMeta && !base.aviso) {
    base.aviso = `${conta}: ${avisoDePausaMeta(c.ultimoDado, hoje)}`;
    base.avisoDono = "meta";
  }
  return { ...base, estado, erro, rows, precisaReconferir, ...(estado === "ok" && pausaMeta ? { pausaMeta: true } : {}) };
}

export interface ResumoAnunciosCliente {
  ok: boolean;
  erro: string | null;
  motivo: string | null;
  motivoDono: string | null;
  rows: number;
  precisaReconferir: number;
  contas: AvaliacaoConta[];
  /** Alguma conta está em pausa da Meta (aviso, dado em dia): a rodada não leu tudo, então não vale como "último sucesso". */
  pausaMeta?: boolean;
}

const ORDEM_ESTADO: Record<EstadoConta, number> = { nao_lida: 0, erro: 1, sem_leitura: 2, parcial: 3, ok: 4 };

/** Junta as contas de um cliente: "ok" só se TODA conta foi lida por inteiro. */
export function resumirCliente(contas: AvaliacaoConta[]): ResumoAnunciosCliente {
  const ruins = contas.filter((c) => c.estado !== "ok").sort((a, b) => ORDEM_ESTADO[a.estado] - ORDEM_ESTADO[b.estado]);
  // Aviso de pausa da Meta vai depois dos demais (pagamento, campanha parada) e não decide o dono do motivo.
  const avisos = contas.filter((c) => c.aviso).sort((a, b) => Number(!!a.pausaMeta) - Number(!!b.pausaMeta));
  const precisaReconferir = contas.reduce((t, c) => t + c.precisaReconferir, 0);
  const pausaMeta = contas.some((c) => c.pausaMeta);
  return {
    ok: ruins.length === 0,
    erro: ruins.length ? ruins.map((c) => c.erro).filter(Boolean).join(" | ") : null,
    motivo: avisos.length ? avisos.map((c) => c.aviso).join(" | ") : null,
    motivoDono: avisos[0]?.avisoDono ?? null,
    rows: contas.reduce((t, c) => t + c.rows, 0),
    precisaReconferir,
    contas,
    ...(pausaMeta ? { pausaMeta } : {}),
  };
}

// ------------------------------------------------------------------ banco

const linhaGuardada = (l: LeituraConta, em: string) => ({
  client_id: l.clientId,
  ad_account_id: l.adAccountId,
  via: l.via,
  last_attempt_at: em,
  last_rows: l.rows,
  last_error: erroDaLeitura(l),
  precisa_reconferir: l.precisaReconferir ?? 0,
  motivo: l.motivo ?? null,
  motivo_dono: l.motivoDono ?? null,
  updated_at: em,
  ...(erroDaLeitura(l) ? {} : { last_success_at: em }),
});

function erroDaLeitura(l: LeituraConta): string | null {
  const reais = l.errors.filter(erroQueConta);
  return reais.length ? erroCurto(reais.join("; "), 300) : null;
}

/** Grava a leitura de cada conta. Nunca derruba o sync (a tabela pode ainda não existir). */
export async function registrarLeiturasContas(supabase: SupabaseClient<any, any, any>, leituras: LeituraConta[]): Promise<void> {
  if (leituras.length === 0) return;
  const em = new Date().toISOString();
  try {
    for (let i = 0; i < leituras.length; i += 200) {
      await supabase.from("sync_status_contas").upsert(leituras.slice(i, i + 200).map((l) => linhaGuardada(l, em)), { onConflict: "client_id,ad_account_id,via" });
    }
  } catch {
    /* registrar não pode quebrar o sync */
  }
}

/**
 * Recalcula e grava o status de anúncios de cada cliente a partir de TODAS as contas ativas dele.
 * `destaRodada` entra mesmo se a tabela sync_status_contas ainda não existir (migração não aplicada).
 * Cliente sem nenhuma conta (só planilha) não é tocado: a planilha grava o próprio status.
 */
export async function consolidarStatusAnuncios(
  supabase: SupabaseClient<any, any, any>,
  clientIds: string[],
  destaRodada: LeituraConta[] = [],
  agora: Date = new Date(),
): Promise<Map<string, ResumoAnunciosCliente>> {
  const out = new Map<string, ResumoAnunciosCliente>();
  const ids = [...new Set(clientIds)];
  if (ids.length === 0) return out;
  try {
    const [{ data: cad }, { data: principais }] = await Promise.all([
      supabase.from("client_ad_accounts").select("client_id, ad_account_id").in("client_id", ids).eq("active", true),
      supabase.from("clients").select("id, meta_ad_account_id, ads_planilha_url").in("id", ids).eq("active", true),
    ]);
    const planilhaAte = await ultimaAnaliseDaPlanilha(supabase, ((principais ?? []) as { id: string; ads_planilha_url: string | null }[]).filter((p) => p.ads_planilha_url).map((p) => p.id));
    const contasPorCliente = new Map<string, Set<string>>();
    const add = (c: string, a: string | null | undefined) => {
      if (!a) return;
      const s = contasPorCliente.get(c) ?? new Set<string>();
      s.add(String(a));
      contasPorCliente.set(c, s);
    };
    for (const p of (principais ?? []) as { id: string; meta_ad_account_id: string | null }[]) add(p.id, p.meta_ad_account_id);
    for (const c of (cad ?? []) as { client_id: string; ad_account_id: string }[]) add(c.client_id, c.ad_account_id);

    // Leituras guardadas (todas as vias, de qualquer chamada) + as desta rodada por cima.
    const guardadas = new Map<string, LeituraGuardada[]>();
    const chave = (c: string, a: string) => `${c}|${a}`;
    try {
      const { data: g, error } = await supabase
        .from("sync_status_contas")
        .select("client_id, ad_account_id, via, last_attempt_at, last_rows, last_error, precisa_reconferir, motivo, motivo_dono")
        .in("client_id", ids);
      if (!error) {
        for (const r of (g ?? []) as any[]) {
          const k = chave(r.client_id, r.ad_account_id);
          guardadas.set(k, [...(guardadas.get(k) ?? []), {
            via: r.via, em: r.last_attempt_at, rows: Number(r.last_rows ?? 0), erro: r.last_error ?? null,
            precisaReconferir: Number(r.precisa_reconferir ?? 0), motivo: r.motivo ?? null, motivoDono: r.motivo_dono ?? null,
          }]);
        }
      }
    } catch {
      /* sem a tabela: vale só o desta rodada */
    }
    const em = agora.toISOString();
    for (const l of destaRodada) {
      const k = chave(l.clientId, l.adAccountId);
      const outras = (guardadas.get(k) ?? []).filter((x) => x.via !== l.via);
      guardadas.set(k, [...outras, { via: l.via, em, rows: l.rows, erro: erroDaLeitura(l), precisaReconferir: l.precisaReconferir ?? 0, motivo: l.motivo ?? null, motivoDono: l.motivoDono ?? null }]);
    }

    for (const clientId of ids) {
      const contas = [...(contasPorCliente.get(clientId) ?? [])];
      if (contas.length === 0) continue;
      const historico = await historicoDasContas(supabase, clientId, contas, agora);
      const avaliacoes = contas.map((a) => avaliarConta({ adAccountId: a, leituras: guardadas.get(chave(clientId, a)) ?? [], ...historico.get(a)!, planilhaAte: planilhaAte.get(clientId) ?? null }, agora));
      const resumo = resumirCliente(avaliacoes);
      out.set(clientId, resumo);
      await gravarResumo(supabase, clientId, resumo, em);
    }
  } catch {
    /* status é registro: não derruba o sync */
  }
  return out;
}

/** Última análise com data (não a data "sem data" 2099-12-31) da planilha de cada cliente, linhas não removidas. */
async function ultimaAnaliseDaPlanilha(supabase: SupabaseClient<any, any, any>, clientIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of clientIds) {
    try {
      const { data } = await supabase
        .from("ads_planilha_semanal")
        .select("analise_em")
        .eq("client_id", id)
        .is("removido_em", null)
        .lt("analise_em", "2099-01-01")
        .order("analise_em", { ascending: false })
        .limit(1);
      const d = (data?.[0] as { analise_em?: string } | undefined)?.analise_em?.slice(0, 10);
      if (d) out.set(id, d);
    } catch {
      /* sem a planilha: a conta segue como não lida */
    }
  }
  return out;
}

async function historicoDasContas(
  supabase: SupabaseClient<any, any, any>,
  clientId: string,
  contas: string[],
  agora: Date,
): Promise<Map<string, { ultimoDado: string | null; teveGasto: boolean }>> {
  const out = new Map<string, { ultimoDado: string | null; teveGasto: boolean }>();
  const desde = new Date(agora.getTime() - 120 * 86400_000).toISOString().slice(0, 10);
  for (const a of contas) {
    let ultimoDado: string | null = null;
    let teveGasto = false;
    try {
      const [{ data: ult }, { data: gasto }] = await Promise.all([
        supabase.from("meta_ads_daily").select("date").eq("client_id", clientId).eq("ad_account_id", a).order("date", { ascending: false }).limit(1),
        supabase.from("meta_ads_daily").select("date").eq("client_id", clientId).eq("ad_account_id", a).gte("date", desde).gt("spend", 0).limit(1),
      ]);
      ultimoDado = (ult?.[0] as { date?: string } | undefined)?.date?.slice(0, 10) ?? null;
      teveGasto = (gasto ?? []).length > 0;
    } catch {
      /* sem histórico: a conta só não ganha o aviso de parada */
    }
    out.set(a, { ultimoDado, teveGasto });
  }
  return out;
}

async function gravarResumo(supabase: SupabaseClient<any, any, any>, clientId: string, r: ResumoAnunciosCliente, em: string): Promise<void> {
  try {
    const dataAte = await lerDadosAte(supabase, clientId, "anuncios");
    await supabase.from("sync_status").upsert(
      {
        client_id: clientId,
        fonte: "anuncios",
        last_attempt_at: em,
        last_error: r.ok ? null : erroCurto(r.erro, 600) ?? "erro desconhecido",
        last_rows: r.rows,
        updated_at: em,
        motivo: r.motivo ? erroCurto(r.motivo, 600) : null,
        motivo_dono: r.motivo ? r.motivoDono : null,
        motivo_em: em,
        // Conta em pausa da Meta (aviso, dado em dia) não foi lida nesta rodada: não vale como "último sucesso".
        ...(r.ok && !r.pausaMeta ? { last_success_at: em } : {}),
        ...(dataAte ? { data_ate: dataAte } : {}),
      },
      { onConflict: "client_id,fonte" },
    );
  } catch {
    /* registrar não pode quebrar o sync */
  }
  try {
    await supabase.from("sync_status").update({ precisa_reconferir: r.precisaReconferir }).eq("client_id", clientId).eq("fonte", "anuncios");
  } catch {
    /* coluna nova: pode ainda não existir */
  }
}
