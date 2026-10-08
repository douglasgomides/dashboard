/**
 * Registro persistido do resultado de cada sync, por cliente x fonte
 * (tabela public.sync_status). Antes o erro de um sync só voltava na resposta
 * HTTP e se perdia; agora a última tentativa, o último sucesso e o último erro
 * ficam gravados e o dashboard consegue mostrar.
 *
 * Regra de ouro: registrar NUNCA pode derrubar o sync. Qualquer falha aqui
 * (inclusive a tabela ainda não existir) é engolida.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type FonteSync = "instagram" | "comentarios" | "anuncios" | "crm" | "atendimento";

// Mensagem curta e sem segredo: tokens de acesso viajam em query string
// (access_token=...) e podem voltar dentro do texto de erro da Meta.
export function erroCurto(msg: string | null | undefined, max = 300): string | null {
  if (!msg) return null;
  return msg
    .replace(/access_token=[^&\s"']+/gi, "access_token=***")
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function recordSyncStatus(
  supabase: SupabaseClient<any, any, any>,
  clientId: string,
  fonte: FonteSync,
  r: { ok: boolean; rows?: number | null; error?: string | null; dataAte?: string | null },
): Promise<void> {
  try {
    const agora = new Date().toISOString();
    const linha: Record<string, unknown> = {
      client_id: clientId,
      fonte,
      last_attempt_at: agora,
      last_error: r.ok ? null : erroCurto(r.error) ?? "erro desconhecido",
      updated_at: agora,
    };
    if (r.ok) linha.last_success_at = agora;
    if (r.rows != null) linha.last_rows = r.rows;
    if (r.dataAte) linha.data_ate = r.dataAte;
    await supabase.from("sync_status").upsert(linha, { onConflict: "client_id,fonte" });
  } catch {
    /* registrar não pode quebrar o sync */
  }
  await registrarMotivoInstagram(supabase, clientId, fonte, r);
  // CRM sincronizado: liga os leads às pessoas (telefone) e alimenta a linha do tempo. Nunca derruba o sync.
  if (fonte === "crm" && r.ok) {
    try {
      await supabase.rpc("vincular_pessoas", { p_client: clientId });
    } catch {
      /* a função pode ainda não existir */
    }
  }
}

// Instagram bloqueado pela Meta (token vencido, revogado ou ativo da BM perdido): o que está pendente não é
// código nosso, é a equipe da cliente aprovar o novo token na Business Manager dela. Diz isso no painel.
// Sucesso limpa o aviso. Outros erros não mexem aqui (o painel traduz o erro bruto).
const BLOQUEIO_INSTAGRAM = /API access blocked|"code":\s*(190|200)\b|access token|session has expired|invalid oauth|error validating/i;
async function registrarMotivoInstagram(
  supabase: SupabaseClient<any, any, any>,
  clientId: string,
  fonte: FonteSync,
  r: { ok: boolean; error?: string | null },
): Promise<void> {
  if (fonte !== "instagram") return;
  try {
    const bloqueado = !r.ok && !!r.error && BLOQUEIO_INSTAGRAM.test(r.error);
    await supabase.from("sync_status").upsert(
      {
        client_id: clientId,
        fonte,
        motivo: bloqueado
          ? "Aguardando a equipe da cliente aprovar, na Business Manager dela, a geração do novo token de acesso ao Instagram. Até lá os posts não atualizam (as métricas diárias da conta seguem normais). Não é falha de sincronização."
          : null,
        motivo_dono: bloqueado ? "cliente" : null,
        motivo_em: new Date().toISOString(),
      },
      { onConflict: "client_id,fonte" },
    );
  } catch {
    /* o aviso é um extra; a coluna pode não existir */
  }
}

// Agrupa resultados por cliente e grava um registro por cliente x fonte:
// ok só se NENHUMA conta do cliente teve erro; rows é a soma; o erro é o
// primeiro encontrado.
export async function recordSyncStatusPorCliente(
  supabase: SupabaseClient<any, any, any>,
  fonte: FonteSync,
  itens: { clientId: string; rows: number; errors: string[] }[],
  opts: { okSeHouveLinhas?: boolean } = {},
): Promise<void> {
  const porCliente = new Map<string, { rows: number; errors: string[] }>();
  for (const i of itens) {
    const a = porCliente.get(i.clientId) ?? { rows: 0, errors: [] };
    a.rows += i.rows;
    a.errors.push(...i.errors);
    porCliente.set(i.clientId, a);
  }
  for (const [clientId, a] of porCliente) {
    await recordSyncStatus(supabase, clientId, fonte, {
      // Anúncios têm duas fontes (Graph e Windsor) e o erro da fonte que não
      // serve aquela conta é esperado — ali, entrar linha vale como sucesso.
      ok: a.errors.length === 0 || (!!opts.okSeHouveLinhas && a.rows > 0),
      rows: a.rows,
      error: a.errors[0],
    });
  }
}

const soData = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : null);

// "Frescura real": até que data o DADO vai, lido do banco (não da tentativa).
// Mesma regra da RPC client_sync_status. Instagram vale o mais antigo entre
// métricas diárias da conta e métricas dos posts — se os posts pararam, o
// selo precisa mostrar. Comentários não têm data própria (null).
export async function lerDadosAte(
  supabase: SupabaseClient<any, any, any>,
  clientId: string,
  fonte: FonteSync,
): Promise<string | null> {
  try {
    const topo = async (tabela: string, coluna: string) => {
      const { data } = await supabase
        .from(tabela)
        .select(coluna)
        .eq("client_id", clientId)
        .not(coluna, "is", null)
        .order(coluna, { ascending: false })
        .limit(1)
        .maybeSingle();
      return soData((data as Record<string, string> | null)?.[coluna]);
    };
    if (fonte === "anuncios") return await topo("meta_ads_daily", "date");
    if (fonte === "crm") return await topo("crm_leads", "received_at");
    if (fonte === "atendimento") return await topo("wts_sessions", "started_at");
    if (fonte === "instagram") {
      const [a, b] = await Promise.all([
        topo("instagram_account_daily_metrics", "date"),
        topo("instagram_posts", "metrics_updated_at"),
      ]);
      if (a && b) return a < b ? a : b;
      return a ?? b;
    }
    return null;
  } catch {
    return null;
  }
}
