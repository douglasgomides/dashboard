/**
 * Conferência ao vivo (Nexo x CRM de origem): regras compartilhadas pelo servidor (api/_lib/conferencia-ao-vivo.ts) e
 * pela tela de Conferência. Só números: nada aqui carrega dado de paciente.
 */

export type FonteAoVivo = "kommo" | "flwchat" | "wts" | "digisac" | "rdstation";

export const ROTULO_FONTE_AO_VIVO: Record<FonteAoVivo, string> = {
  kommo: "Kommo",
  flwchat: "FlwChat (cards)",
  wts: "WTS / Helena (atendimentos)",
  digisac: "Digisac",
  rdstation: "RD Station",
};

/** Tolerância de cada métrica: a diferença aceita é o maior entre `abs` e `pct` da fonte. */
export interface Tolerancia {
  abs: number;
  pct: number;
}

/** Período fechado (30 dias inteiros até ontem): a contagem precisa bater exatamente. */
export const TOL_EXATA: Tolerancia = { abs: 0, pct: 0 };
/** Contagem ao vivo (o CRM muda entre a leitura da fonte e a do Nexo, e o sync é diário): ±1%, mínimo 2. */
export const TOL_AO_VIVO: Tolerancia = { abs: 2, pct: 0.01 };
/** Atendimentos: ±2%, mínimo 2 (a data de início da sessão pode ser preenchida depois da criação). */
export const TOL_SESSOES: Tolerancia = { abs: 2, pct: 0.02 };
/** Amostra de 20: aceita 1 registro diferente (mudou no CRM depois do último sync). */
export const TOL_AMOSTRA: Tolerancia = { abs: 1, pct: 0 };

export function dentroDaTolerancia(nexo: number, fonte: number, tol: Tolerancia): boolean {
  return Math.abs(nexo - fonte) <= Math.max(tol.abs, Math.floor(tol.pct * Math.abs(fonte)));
}

export function textoTolerancia(tol: Tolerancia): string {
  if (tol.abs === 0 && tol.pct === 0) return "exata";
  if (tol.pct === 0) return `±${tol.abs}`;
  return `±${+(tol.pct * 100).toFixed(2)}% (mín. ${tol.abs})`;
}

export interface LinhaAoVivo {
  client_id: string;
  fonte: string;
  metrica: string;
  ok: boolean | null;
  rodado_em: string;
}

export interface ResumoAoVivo {
  clientId: string;
  fonte: string;
  conferidas: number;
  ok: number;
  /** Métricas que não puderam ser lidas na fonte (erro, sem token, sem tempo). */
  naoLidas: number;
  pctOk: number | null;
  rodadoEm: string;
}

/** Última rodada de cada cliente e fonte: % de métricas dentro da tolerância (as não lidas ficam fora da conta). */
export function resumirAoVivo(linhas: LinhaAoVivo[]): ResumoAoVivo[] {
  const ultima = new Map<string, string>();
  for (const l of linhas) {
    const k = `${l.client_id}|${l.fonte}`;
    if (!ultima.has(k) || l.rodado_em > ultima.get(k)!) ultima.set(k, l.rodado_em);
  }
  const por = new Map<string, ResumoAoVivo>();
  for (const l of linhas) {
    const k = `${l.client_id}|${l.fonte}`;
    if (l.rodado_em !== ultima.get(k)) continue;
    const r = por.get(k) ?? { clientId: l.client_id, fonte: l.fonte, conferidas: 0, ok: 0, naoLidas: 0, pctOk: null, rodadoEm: l.rodado_em };
    if (l.ok === null) r.naoLidas++;
    else {
      r.conferidas++;
      if (l.ok) r.ok++;
    }
    por.set(k, r);
  }
  return [...por.values()]
    .map((r) => ({ ...r, pctOk: r.conferidas ? Math.round((r.ok / r.conferidas) * 100) : null }))
    .sort((a, b) => a.clientId.localeCompare(b.clientId) || a.fonte.localeCompare(b.fonte));
}
