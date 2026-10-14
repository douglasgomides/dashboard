// Status de uma fonte de um cliente: a ÚNICA regra usada pela tabela do admin, pelo alerta do topo,
// pela faixa "Dados: até..." do painel do cliente e pela Conferência de dados (api/_lib/conferencia.ts).
// Nenhuma tela calcula status por conta própria.
//
//   verde     0 a 1 dia sem dado novo
//   amarelo   2 a 3 dias
//   vermelho  mais de 3 dias, nenhum dado ainda, ou erro na última atualização
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
  /** Cadastro da fonte (client_fontes: conta/conexão ativa). */
  cadastro: boolean;
  /** Dia do último dado gravado (YYYY-MM-DD), do próprio dado, não da sincronização. */
  data_ate: string | null;
  last_error?: string | null;
  motivo?: string | null;
  motivo_dono?: string | null;
  /** A equipe marcou que o cliente não usa esta fonte de propósito. */
  naoUsa?: boolean;
}

export interface StatusFonte {
  cor: CorStatus;
  ligado: boolean;
  naoUsa: boolean;
  rotulo: string; // "Em dia", "Atrasada", "Parada", "Erro", "Sem dado", "Não ligado", "Não usa"
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
  const dias = e.data_ate ? Math.max(0, diasEntre(hoje, e.data_ate)) : null;
  const erro = e.last_error ? e.last_error.replace(/\s+/g, " ").trim() : null;
  const base = { ligado, naoUsa: false, data, dias, motivo: motivo ?? (erro ? `Erro na última atualização: ${erro.slice(0, 140)}` : null) };
  if (dias == null) return { ...base, cor: "vermelho", rotulo: erro ? "Erro" : "Sem dado", detalhe: "Nenhum dado gravado ainda", peso: 3 };
  const quando = `até ${data} · ${dias === 0 ? "hoje" : dias === 1 ? "1 dia sem dado novo" : `${dias} dias sem dado novo`}`;
  if (erro) return { ...base, cor: "vermelho", rotulo: "Erro", detalhe: quando, peso: 3 };
  if (dias <= 1) return { ...base, cor: "verde", rotulo: "Em dia", detalhe: `até ${data}`, peso: 1 };
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
  { cor: "cinza", texto: "Não ligado / não usa" },
];

/** Variável CSS de cada cor (os tokens do tema). */
export const VAR_COR: Record<CorStatus, string> = { verde: "var(--good)", amarelo: "var(--warn)", vermelho: "var(--crit)", cinza: "var(--muted)" };
