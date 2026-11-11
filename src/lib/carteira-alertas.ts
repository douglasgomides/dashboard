// Alertas honestos da Carteira (/admin): quem da clínica entra no painel e quais reservas do servidor estão faltando.
// Puro e sem import de alias (@/), para o api/ importar este mesmo arquivo (como api/_lib/resumo-equipe.ts faz).
//
// Dois fatos diferentes, que o cartão antigo "Médico sem login" misturava:
//  - "sem acesso criado": ninguém da clínica tem login. É tarefa da equipe (neutro);
//  - "não entra": tem login, mas ninguém da clínica abre o painel há mais de 14 dias. É o alerta real.
import { ehNegocioProprio } from "./negocio-proprio.js";

export const DIAS_SEM_ENTRAR = 14;
const DIA_MS = 86_400_000;

export type AcessoClinica = { client_id: string; usuarios: number; ultimo_acesso: string | null; criado_em: string | null };
export type AvisoReserva = { variavel: "KOMMO_API_TOKEN" | "META_ACCESS_TOKEN"; conexoes: number; texto: string };
export type AvisosDaCarteira = { acessos: AcessoClinica[]; reservas: AvisoReserva[] };
export type FatoDeAcesso = "fora" | "sem_acesso" | "nao_entra" | "entra" | "nao_lido";

/** Clínica que a Carteira cobra: ativa e fora do negócio próprio da Doctor Creator. */
export function entraNaCarteira(c: { id: string; active?: boolean | null }): boolean {
  return c.active !== false && !ehNegocioProprio(c.id);
}

/**
 * Junta os membros por clínica, sem a equipe (app_admins). `usuarios` conta os distintos; as datas são as maiores da clínica.
 * Só sai o agregado: o user_id de entrada nunca aparece no resultado.
 */
export function agruparAcessos(
  membros: { client_id: string; user_id: string }[],
  equipe: Set<string>,
  usuarios: Map<string, { last_sign_in_at: string | null; created_at: string | null }>,
): AcessoClinica[] {
  const porClinica = new Map<string, Set<string>>();
  for (const m of membros) {
    if (equipe.has(m.user_id)) continue;
    const s = porClinica.get(m.client_id) ?? new Set<string>();
    s.add(m.user_id);
    porClinica.set(m.client_id, s);
  }
  const maior = (a: string | null, b: string | null | undefined) => (b && (!a || Date.parse(b) > Date.parse(a)) ? b : a);
  const out: AcessoClinica[] = [];
  for (const [client_id, ids] of porClinica) {
    let ultimo: string | null = null;
    let criado: string | null = null;
    for (const uid of ids) {
      const u = usuarios.get(uid);
      ultimo = maior(ultimo, u?.last_sign_in_at);
      criado = maior(criado, u?.created_at);
    }
    out.push({ client_id, usuarios: ids.size, ultimo_acesso: ultimo, criado_em: criado });
  }
  return out;
}

/**
 * O fato de acesso de uma clínica. `membrosCliente` vem do client_members (sem admin); `acesso` vem do servidor
 * (alvo carteira_avisos) e `lido` diz se essa leitura chegou. Acesso criado e nunca usado conta pela data da criação.
 */
export function fatoDeAcesso(x: {
  clinica: { id: string; active?: boolean | null };
  membrosCliente: number | undefined;
  acesso: AcessoClinica | null | undefined;
  lido: boolean;
  hoje: number;
}): { fato: FatoDeAcesso; dias: number | null } {
  if (!entraNaCarteira(x.clinica)) return { fato: "fora", dias: null };
  if (!x.lido || x.membrosCliente === undefined) return { fato: "nao_lido", dias: null };
  if (x.membrosCliente === 0) return { fato: "sem_acesso", dias: null };
  const ref = x.acesso?.ultimo_acesso ?? x.acesso?.criado_em ?? null;
  const t = ref ? Date.parse(ref) : NaN;
  if (!Number.isFinite(t)) return { fato: "nao_lido", dias: null };
  const dias = Math.max(0, Math.floor((x.hoje - t) / DIA_MS));
  return dias > DIAS_SEM_ENTRAR ? { fato: "nao_entra", dias } : { fato: "entra", dias };
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * Reservas do servidor que dado ativo usa e que não existem. Recebe só o predicado `temVariavel`, nunca o env:
 * assim o valor de uma variável não tem como chegar à saída. Texto técnico, para a equipe: só nome e contagem.
 */
export function avisosDeReserva(
  uso: { kommoSemTokenProprio: number; instagramGraphSemTokenProprio: number },
  temVariavel: (nome: string) => boolean,
): AvisoReserva[] {
  const out: AvisoReserva[] = [];
  const k = uso.kommoSemTokenProprio;
  if (k > 0 && !temVariavel("KOMMO_API_TOKEN")) {
    out.push({
      variavel: "KOMMO_API_TOKEN",
      conexoes: k,
      texto: `${k} ${plural(k, "conexão Kommo ativa sem token próprio depende", "conexões Kommo ativas sem token próprio dependem")} da reserva KOMMO_API_TOKEN, que o servidor não tem. Grave o token na própria conexão.`,
    });
  }
  const i = uso.instagramGraphSemTokenProprio;
  if (i > 0 && !temVariavel("META_ACCESS_TOKEN")) {
    out.push({
      variavel: "META_ACCESS_TOKEN",
      conexoes: i,
      texto: `${i} ${plural(i, "perfil do Instagram pela Meta sem token próprio depende", "perfis do Instagram pela Meta sem token próprio dependem")} da reserva META_ACCESS_TOKEN, que o servidor não tem. Grave o token do perfil.`,
    });
  }
  return out;
}
