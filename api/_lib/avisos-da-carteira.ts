/**
 * Leituras do servidor para a Carteira (/admin), pelo alvo global carteira_avisos de api/sync/manual.ts (só admin):
 *  - o último acesso de quem é da clínica (auth.users), SÓ em agregado por clínica: sem e-mail, sem id de usuário;
 *  - as reservas do servidor que dado ativo usa e que não existem (só o NOME da variável e a contagem, nunca o valor).
 * lerUsoDeReservas e avisosDeReserva também servem ao /readyz da VPS (server/vps.ts, que só existe em vps/producao).
 * Nunca põe access_token nem meta_access_token num select: a presença do token é filtrada no banco.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { agruparAcessos, avisosDeReserva, type AvisosDaCarteira } from "../../src/lib/carteira-alertas.js";

type Admin = SupabaseClient<any, any, any>;

const PAGINA = 1000;
const LOTE_USUARIOS = 10;

async function lerTudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) return out;
  }
}

/** Quantas conexões ativas dependem de uma reserva do servidor, porque não têm token próprio. */
export async function lerUsoDeReservas(admin: Admin): Promise<{ kommoSemTokenProprio: number; instagramGraphSemTokenProprio: number }> {
  const ativas = await lerTudo<{ id: string }>((de, ate) => admin.from("clients").select("id").eq("active", true).eq("eh_teste", false).order("id").range(de, ate));
  const clinicaAtiva = new Set(ativas.map((c) => c.id));

  // Kommo ativo sem token próprio: o filtro de "sem token" roda no banco, a coluna do token não é lida.
  const kommo = await lerTudo<{ id: string; client_id: string }>((de, ate) =>
    admin.from("crm_connections").select("id, client_id").eq("provider", "kommo").eq("active", true).or("access_token.is.null,access_token.eq.").order("id").range(de, ate),
  );
  const kommoSemTokenProprio = kommo.filter((c) => clinicaAtiva.has(c.client_id)).length;

  // Instagram pela Graph: perfil ativo de clínica ativa, menos os que têm token próprio em instagram_account_secrets.
  const perfis = await lerTudo<{ id: string; client_id: string }>((de, ate) =>
    admin.from("instagram_accounts").select("id, client_id").eq("active", true).eq("sync_source", "meta_graph").order("id").range(de, ate),
  );
  const perfisAtivos = perfis.filter((p) => clinicaAtiva.has(p.client_id));
  const comToken = new Set<string>();
  for (let i = 0; i < perfisAtivos.length; i += 200) {
    const ids = perfisAtivos.slice(i, i + 200).map((p) => p.id);
    const { data, error } = await admin
      .from("instagram_account_secrets")
      .select("instagram_account_id")
      .in("instagram_account_id", ids)
      .not("meta_access_token", "is", null)
      .neq("meta_access_token", "");
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { instagram_account_id: string }[]) comToken.add(r.instagram_account_id);
  }
  const instagramGraphSemTokenProprio = perfisAtivos.filter((p) => !comToken.has(p.id)).length;
  return { kommoSemTokenProprio, instagramGraphSemTokenProprio };
}

const temVariavelPadrao = (nome: string) => !!process.env[nome]?.trim();

export async function lerAvisosDaCarteira(admin: Admin, temVariavel: (nome: string) => boolean = temVariavelPadrao): Promise<AvisosDaCarteira> {
  const [membros, admins] = await Promise.all([
    lerTudo<{ client_id: string; user_id: string }>((de, ate) => admin.from("client_members").select("client_id, user_id").order("client_id").order("user_id").range(de, ate)),
    lerTudo<{ user_id: string }>((de, ate) => admin.from("app_admins").select("user_id").order("user_id").range(de, ate)),
  ]);
  const equipe = new Set(admins.map((a) => a.user_id));
  const ids = [...new Set(membros.map((m) => m.user_id).filter((u) => !equipe.has(u)))];

  // Só last_sign_in_at e created_at ficam: e-mail e metadados não são guardados.
  const usuarios = new Map<string, { last_sign_in_at: string | null; created_at: string | null }>();
  for (let i = 0; i < ids.length; i += LOTE_USUARIOS) {
    await Promise.all(
      ids.slice(i, i + LOTE_USUARIOS).map(async (uid) => {
        const { data } = await admin.auth.admin.getUserById(uid);
        const u = data?.user;
        if (u) usuarios.set(uid, { last_sign_in_at: u.last_sign_in_at ?? null, created_at: u.created_at ?? null });
      }),
    );
  }

  const [acessos, uso] = await Promise.all([Promise.resolve(agruparAcessos(membros, equipe, usuarios)), lerUsoDeReservas(admin)]);
  return { acessos, reservas: avisosDeReserva(uso, temVariavel) };
}
