// Status de uma fonte de um cliente: a ÚNICA regra usada pela tabela do admin, pelo alerta do topo,
// pela faixa "Dados: até..." do painel do cliente e pela Conferência de dados (api/_lib/conferencia.ts).
// Nenhuma tela calcula status por conta própria.
//
//   verde     0 a 1 dia sem dado novo
//   amarelo   2 a 3 dias
//   vermelho  mais de 3 dias, nenhum dado ainda, ou erro na última atualização
//   cinza "Sem movimento"  mais de 3 dias sem dado novo, mas a atualização rodou sem erro hoje ou ontem e não há
//             aviso de parada: a origem só não teve atividade (nenhum lead, nenhuma conversa). Não é falha técnica.
//   amarelo "Atenção"  anúncios em dia, mas uma das contas do cliente tem aviso (ex.: conta parada há 39 dias)
//   (CRM e WhatsApp só ganham dado em dia de expediente: para eles os dias contados são úteis, sem fim de semana e feriado)
//   (Instagram: a Meta só fecha o dia 2 dias depois, então o último dia completo é sempre "hoje menos 2"; esses 2 dias não contam como atraso)
//   cinza     não ligado (ou marcado como "não usa", quando é intencional)
//
// "Ligado" também é uma regra só: há cadastro da fonte OU já existe dado gravado OU a fonte é lida
// por planilha manual. Se a tabela mostra dado, a fonte está ligada em qualquer tela.
//
// Sem dependências (nem Supabase): roda no navegador e na função da Vercel.

export type CorStatus = "verde" | "amarelo" | "vermelho" | "cinza";
export type FonteId = "instagram" | "anuncios" | "crm" | "atendimento";

export const NOME_FONTE: Record<FonteId, string> = { instagram: "Instagram", anuncios: "Anúncios", crm: "CRM", atendimento: "WhatsApp" };
export const FONTES: FonteId[] = ["instagram", "anuncios", "crm", "atendimento"];

export interface EntradaStatus {
  /** Qual fonte é. CRM e WhatsApp contam dias úteis; Instagram e anúncios, dias corridos. */
  fonte?: FonteId | string | null;
  /** Cadastro da fonte (client_fontes: conta/conexão ativa). */
  cadastro: boolean;
  /** Dia do último dado gravado (YYYY-MM-DD), do próprio dado, não da sincronização. */
  data_ate: string | null;
  last_error?: string | null;
  /** Quando a última atualização deu certo (sync_status.last_success_at). Evita que a folga da Meta esconda uma sincronização parada. */
  ultimo_sucesso?: string | null;
  motivo?: string | null;
  motivo_dono?: string | null;
  /** A equipe marcou que o cliente não usa esta fonte de propósito. */
  naoUsa?: boolean;
}

export interface StatusFonte {
  cor: CorStatus;
  ligado: boolean;
  naoUsa: boolean;
  rotulo: string; // "Em dia", "Atenção", "Atrasada", "Parada", "Sem movimento", "Erro", "Sem dado", "Não ligado", "Não usa"
  dias: number | null; // dias sem dado novo
  data: string | null; // dd/mm do último dado
  detalhe: string; // frase curta: "até 09/10 · 5 dias sem dado novo"
  motivo: string | null;
  peso: number; // para ordenar: pior primeiro (vermelho 3, amarelo 2, verde 1, cinza 0)
}

/** Hoje no fuso de Brasília (o painel inteiro conta dias assim). */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

export function diasEntre(hoje: string, dia: string): number {
  return Math.round((Date.parse(hoje.slice(0, 10)) - Date.parse(dia.slice(0, 10))) / 86_400_000);
}

// Feriados nacionais (e pontos facultativos que a clínica costuma folgar) para contar dias úteis. Atualizar todo ano.
const FERIADOS = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04",
  "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-20", "2026-12-25", "2027-01-01",
]);
const diaUtil = (ms: number) => {
  const dow = new Date(ms).getUTCDay();
  return dow !== 0 && dow !== 6 && !FERIADOS.has(new Date(ms).toISOString().slice(0, 10));
};

/** Dias úteis (segunda a sexta, sem feriado) depois de `dia`, até `hoje` inclusive. */
export function diasUteisEntre(hoje: string, dia: string): number {
  let n = 0;
  for (let t = Date.parse(dia.slice(0, 10)) + 86_400_000; t <= Date.parse(hoje.slice(0, 10)); t += 86_400_000) { if (diaUtil(t)) n++; }
  return n;
}

const contaDiasUteis = (fonte?: string | null) => fonte === "crm" || fonte === "atendimento";
/** Dias que a Meta leva para fechar um dia de métricas do Instagram (alcance, novos seguidores, saídas). Não é atraso nosso. */
export const FOLGA_META_INSTAGRAM = 2;
const folgaDaFonte = (fonte?: string | null) => (fonte === "instagram" ? FOLGA_META_INSTAGRAM : 0);

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function fonteLigada(e: Pick<EntradaStatus, "cadastro" | "data_ate" | "motivo_dono">): boolean {
  return e.cadastro || !!e.data_ate || e.motivo_dono === "manual";
}

export function statusDaFonte(e: EntradaStatus, hoje: string = hojeBrasilia()): StatusFonte {
  const ligado = fonteLigada(e);
  const motivo = e.motivo?.trim() || null;
  if (!ligado) {
    if (e.naoUsa) return { cor: "cinza", ligado, naoUsa: true, rotulo: "Não usa", dias: null, data: null, detalhe: "Marcado como intencional", motivo: null, peso: 0 };
    return { cor: "cinza", ligado, naoUsa: false, rotulo: "Não ligado", dias: null, data: null, detalhe: "Fonte não conectada", motivo: null, peso: 0 };
  }
  const data = e.data_ate ? ddmm(e.data_ate) : null;
  let dias = e.data_ate ? Math.max(0, (contaDiasUteis(e.fonte) ? diasUteisEntre(hoje, e.data_ate) : diasEntre(hoje, e.data_ate)) - folgaDaFonte(e.fonte)) : null;
  // A folga da Meta só vale se a sincronização está rodando: Instagram com a última atualização bem-sucedida há 2+ dias
  // é atraso nosso, não da Meta. Sem isso, uma sincronização parada ficaria verde por 2 dias a mais.
  if (dias != null && e.fonte === "instagram" && e.ultimo_sucesso) {
    dias = Math.max(dias, Math.max(0, diasEntre(hoje, e.ultimo_sucesso.slice(0, 10))));
  }
  const erro = e.last_error ? e.last_error.replace(/\s+/g, " ").trim() : null;
  const base = { ligado, naoUsa: false, data, dias, motivo: motivo ?? (erro ? `Erro na última atualização: ${erro.slice(0, 140)}` : null) };
  if (dias == null) return { ...base, cor: "vermelho", rotulo: erro ? "Erro" : "Sem dado", detalhe: "Nenhum dado gravado ainda", peso: 3 };
  const un = contaDiasUteis(e.fonte) ? "útil" : "";
  const quando = `até ${data} · ${dias === 0 ? "hoje" : dias === 1 ? `1 dia${un ? " útil" : ""} sem dado novo` : `${dias} dias${un ? " úteis" : ""} sem dado novo`}`;
  if (erro) return { ...base, cor: "vermelho", rotulo: "Erro", detalhe: quando, peso: 3 };
  const donoAviso = e.motivo_dono && e.motivo_dono !== "origem" && e.motivo_dono !== "manual" ? e.motivo_dono : null;
  // Anúncios: o "até" é o da conta mais recente. Se outra conta do cliente tem aviso gravado (parada, pagamento), o
  // status não pode ficar verde só porque uma conta está em dia (HOMS: uma conta em dia, outra parada há 39 dias).
  if (dias <= 1 && e.fonte === "anuncios" && motivo && donoAviso) {
    return { ...base, cor: "amarelo", rotulo: "Atenção", detalhe: `até ${data} · uma conta com aviso`, peso: 2 };
  }
  if (dias <= 1) return { ...base, cor: "verde", rotulo: "Em dia", detalhe: `até ${data}`, peso: 1 };
  // Sem movimento: a atualização rodou sem erro hoje ou ontem e não há aviso de parada. A origem só não teve atividade;
  // pintar de vermelho "Dados parados" acusava falha técnica onde não havia (Mariela/CRM, auditoria 01/11/2026).
  const rodouAgora = !!e.ultimo_sucesso && diasEntre(hoje, e.ultimo_sucesso.slice(0, 10)) <= 1;
  if (dias > 3 && rodouAgora && !donoAviso) {
    return { ...base, cor: "cinza", rotulo: "Sem movimento", detalhe: `até ${data} · sem atividade nova na origem`, peso: 1 };
  }
  if (dias <= 3) return { ...base, cor: "amarelo", rotulo: "Atrasada", detalhe: quando, peso: 2 };
  return { ...base, cor: "vermelho", rotulo: "Parada", detalhe: quando, peso: 3 };
}

/** Pior cor de um conjunto (para o selo compacto do cabeçalho e a ordenação do admin). */
export function piorStatus(xs: StatusFonte[]): StatusFonte | null {
  return xs.reduce<StatusFonte | null>((a, s) => (!a || s.peso > a.peso ? s : a), null);
}

export const LEGENDA_STATUS: { cor: CorStatus; texto: string }[] = [
  { cor: "verde", texto: "Em dia (0–1 dia)" },
  { cor: "amarelo", texto: "Atrasada (2–3 dias)" },
  { cor: "vermelho", texto: "Parada (+3 dias) ou erro" },
  { cor: "cinza", texto: "Não ligado, não usa ou sem movimento (atualização em dia, sem atividade na origem)" },
];

/** Variável CSS de cada cor (os tokens do tema). */
export const VAR_COR: Record<CorStatus, string> = { verde: "var(--good)", amarelo: "var(--warn)", vermelho: "var(--crit)", cinza: "var(--muted)" };

/** Linha de sync_status_geral (integração da conta inteira, sem cliente: hoje só o Short.io). */
export interface StatusGeral {
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_rows?: number | null;
}

/**
 * Status do Short.io pela mesma régua das outras fontes (verde 0 a 1 dia, amarelo 2 a 3, vermelho mais de 3 ou erro).
 * O "dado até" é o dia do último sucesso, porque o Short.io não tem data própria de dado. Sem linha: não ligado.
 */
export function statusDoGeral(linha: StatusGeral | null | undefined, hoje: string = hojeBrasilia()): StatusFonte {
  const sucesso = linha?.last_success_at ? hojeBrasilia(new Date(linha.last_success_at)) : null;
  return statusDaFonte(
    { fonte: "shortio", cadastro: !!linha, data_ate: sucesso, last_error: linha?.last_error ?? null, ultimo_sucesso: linha?.last_success_at ?? null },
    hoje,
  );
}
