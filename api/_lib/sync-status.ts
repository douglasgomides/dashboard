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

// Parâmetros de URL que carregam segredo: Meta (access_token), Windsor (api_key), RD Station v1 (token), webhook do
// Kommo (secret) e variações comuns. Valem para texto de erro e para qualquer linha de log.
const PARAMETRO_SECRETO = /([?&;\s"'(]|^)((?:access_|api_|app_|client_|refresh_)?(?:token|key|secret|apikey|signature|sig|password|senha)|secret|api_key|apikey|key)=[^&\s"'<>)]+/gi;

/** Esconde segredos em texto livre (mensagem de erro, URL, linha de log). */
export function ocultarSegredos(texto: string): string {
  return texto
    .replace(PARAMETRO_SECRETO, (_m, antes: string, nome: string) => `${antes}${nome}=***`)
    .replace(/(Bearer\s+)[A-Za-z0-9._\-~+/=]+/gi, "$1***")
    .replace(/((?:x-)?api[-_]?(?:key|token)["']?\s*[:=]\s*["']?)[A-Za-z0-9._\-~+/=]{8,}/gi, "$1***")
    .replace(/\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-*.]{6,}/g, "[chave]");
}

// Mensagem curta e sem segredo: tokens de acesso viajam em query string
// (access_token=..., api_key=...) e podem voltar dentro do texto de erro do provedor.
export function erroCurto(msg: string | null | undefined, max = 300): string | null {
  if (!msg) return null;
  return ocultarSegredos(msg)
    .replace(/access_token=[^&\s"']+/gi, "access_token=***")
    // Chave da Windsor também viaja na URL; agora o erro da Windsor é gravado, então ela é escondida aqui.
    .replace(/api_key=[^&\s"']+/gi, "api_key=***")
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Validade do token quando ele mesmo informa: o token de longa duração do Kommo é um JWT com "exp" (vale de 1 dia a
 * 5 anos e não tem renovação automática). Lê só o campo exp do payload; a assinatura não interessa aqui. null quando
 * o token não é JWT ou não tem exp.
 */
export function expiraDoJwt(token: string | null | undefined): Date | null {
  const partes = String(token ?? "").split(".");
  if (partes.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(partes[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { exp?: unknown };
    const exp = typeof payload.exp === "number" ? payload.exp : Number(payload.exp);
    return Number.isFinite(exp) && exp > 0 ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}

const AVISO_TOKEN = /^O token d[oa] .+ (vence|venceu) /;
/** Frase de aviso quando faltam até `dias` para vencer (ou já venceu). null quando ainda está longe. */
export function avisoValidadeToken(provedor: string, expira: Date | null, agora = new Date(), dias = 30): string | null {
  if (!expira) return null;
  const faltam = Math.ceil((expira.getTime() - agora.getTime()) / 86_400_000);
  const data = expira.toISOString().slice(0, 10).split("-").reverse().join("/");
  if (faltam <= 0) return `O token do ${provedor} venceu em ${data}. Gere um novo token de longa duração na conta e atualize a conexão; até lá o CRM não atualiza.`;
  if (faltam > dias) return null;
  return `O token do ${provedor} vence em ${faltam} ${faltam === 1 ? "dia" : "dias"} (${data}). Gere um novo token de longa duração na conta e atualize a conexão antes disso.`;
}

/**
 * Grava o aviso de validade em sync_status.motivo (dono "cliente": quem gera o token é o dono da conta), sem apagar
 * motivo de outra origem. A data de vencimento fica em token_expira_em quando a coluna existe. Nunca derruba o sync.
 */
export async function registrarValidadeToken(
  supabase: SupabaseClient<any, any, any>,
  clientId: string,
  fonte: FonteSync,
  provedor: string,
  expira: Date | null,
): Promise<void> {
  try {
    const { data } = await supabase.from("sync_status").select("motivo").eq("client_id", clientId).eq("fonte", fonte).maybeSingle();
    const atual = (data as { motivo?: string | null } | null)?.motivo ?? null;
    const aviso = avisoValidadeToken(provedor, expira);
    if (atual && !AVISO_TOKEN.test(atual)) {
      // Motivo de outra origem tem prioridade; só a data é guardada.
    } else if (aviso !== atual) {
      await supabase.from("sync_status").upsert(
        { client_id: clientId, fonte, motivo: aviso, motivo_dono: aviso ? "cliente" : null, motivo_em: new Date().toISOString() },
        { onConflict: "client_id,fonte" },
      );
    }
    if (expira) await supabase.from("sync_status").update({ token_expira_em: expira.toISOString() }).eq("client_id", clientId).eq("fonte", fonte);
  } catch {
    /* aviso é extra */
  }
}

/**
 * Grava (ou limpa) um aviso em sync_status.motivo sem apagar motivo de outra origem. `marca` reconhece os avisos desta
 * origem: só eles são trocados ou limpos. Nunca derruba o sync.
 */
export async function registrarAviso(
  supabase: SupabaseClient<any, any, any>,
  clientId: string,
  fonte: FonteSync,
  aviso: string | null,
  marca: RegExp,
  dono: "cliente" | "meta" | "nos" = "cliente",
): Promise<void> {
  try {
    const { data } = await supabase.from("sync_status").select("motivo").eq("client_id", clientId).eq("fonte", fonte).maybeSingle();
    const atual = (data as { motivo?: string | null } | null)?.motivo ?? null;
    if (atual && !marca.test(atual)) return; // motivo de outra origem tem prioridade
    if (aviso === atual) return;
    await supabase.from("sync_status").upsert(
      { client_id: clientId, fonte, motivo: aviso, motivo_dono: aviso ? dono : null, motivo_em: new Date().toISOString() },
      { onConflict: "client_id,fonte" },
    );
  } catch {
    /* aviso é extra */
  }
}

export async function recordSyncStatus(
  supabase: SupabaseClient<any, any, any>,
  clientId: string,
  fonte: FonteSync,
  r: { ok: boolean; rows?: number | null; error?: string | null; dataAte?: string | null; preservaBloqueio?: boolean },
): Promise<void> {
  try {
    const agora = new Date().toISOString();
    // O sync automático (cron/n8n) não informa até que data o dado vai; só o botão manual informava. Resultado: o
    // carimbo "Dados até" ficava preso na data do último clique manual, semanas atrás, mesmo com o sync rodando todo
    // dia. Sucesso sem data informada lê a data real do banco (mesma regra do botão e da RPC client_sync_status).
    if (r.ok && !r.dataAte) r = { ...r, dataAte: await lerDadosAte(supabase, clientId, fonte) };
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
  r: { ok: boolean; error?: string | null; preservaBloqueio?: boolean },
): Promise<void> {
  if (fonte !== "instagram") return;
  // O sync da Windsor (06h30) só traz as métricas diárias da conta; os posts vêm da Graph (06h). Sucesso da
  // Windsor apagava o aviso de bloqueio gravado pela Graph meia hora antes, e a conta parecia "sem erro"
  // com os posts parados (Dra. Marcelly Achkar, "API access blocked" desde 18/09). Ela não limpa mais.
  if (r.ok && r.preservaBloqueio) return;
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
  opts: { okSeHouveLinhas?: boolean; preservaBloqueio?: boolean } = {},
): Promise<void> {
  const porCliente = new Map<string, { rows: number; errors: string[] }>();
  for (const i of itens) {
    const a = porCliente.get(i.clientId) ?? { rows: 0, errors: [] };
    a.rows += i.rows;
    a.errors.push(...i.errors);
    porCliente.set(i.clientId, a);
  }
  for (const [clientId, todos] of porCliente) {
    // A classificação de tema/funil por IA é um enriquecimento: se a IA devolver o lote incompleto, os posts ficam
    // sem classificar e voltam na próxima rodada. Isso não pode marcar a coleta do Instagram do cliente como falha.
    const a = { rows: todos.rows, errors: todos.errors.filter((e) => !e.startsWith("conteudo-ia")) };
    await recordSyncStatus(supabase, clientId, fonte, {
      // Anúncios têm duas fontes (Graph e Windsor) e o erro da fonte que não
      // serve aquela conta é esperado — ali, entrar linha vale como sucesso.
      ok: a.errors.length === 0 || (!!opts.okSeHouveLinhas && a.rows > 0),
      rows: a.rows,
      error: a.errors[0],
      preservaBloqueio: opts.preservaBloqueio,
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
    // Cliente lido só pela planilha de distribuição de conteúdo (sem conta de anúncios nossa) tem o dado em ads_planilha_semanal.
    if (fonte === "anuncios") {
      const diario = await topo("meta_ads_daily", "date");
      if (diario) return diario;
      // Planilha: ignora a linha com data no futuro (o bloco "30/12/2026"), que não é uma análise de verdade.
      const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("ads_planilha_semanal")
        .select("analise_em")
        .eq("client_id", clientId)
        .lte("analise_em", hoje)
        .order("analise_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      return soData((data as { analise_em?: string } | null)?.analise_em);
    }
    // Data do lead (occurred_at), não a da sincronização: o Kommo grava received_at = agora a cada rodada.
    if (fonte === "crm") return (await topo("crm_leads", "occurred_at")) ?? (await topo("crm_leads", "received_at"));
    // WhatsApp: WTS ou qualquer conversa gravada (Kommo, Clint, FlwChat, Digisac), a mesma regra de fontes_base.
    // Antes só o WTS contava, e clientes Clint e Kommo ficavam sem "Dados até" com conversas chegando todo dia.
    if (fonte === "atendimento") {
      const [w, c] = await Promise.all([topo("wts_sessions", "started_at"), topo("conversas", "ultima_msg_em")]);
      if (w && c) return w > c ? w : c;
      return w ?? c;
    }
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

/** Integrações da conta inteira, sem cliente (Short.io). Linha em sync_status_geral. */
export type FonteGeral = "shortio";

/** Grava a última tentativa de uma integração da conta inteira. Nunca derruba o sync. */
export async function registrarStatusGeral(
  supabase: SupabaseClient<any, any, any>,
  fonte: FonteGeral,
  r: { ok: boolean; rows?: number | null; error?: string | null },
): Promise<void> {
  try {
    const agora = new Date().toISOString();
    await supabase.from("sync_status_geral").upsert(
      {
        fonte,
        last_attempt_at: agora,
        last_error: r.ok ? null : erroCurto(r.error) ?? "erro desconhecido",
        updated_at: agora,
        ...(r.ok ? { last_success_at: agora } : {}),
        ...(r.rows != null ? { last_rows: r.rows } : {}),
      },
      { onConflict: "fonte" },
    );
  } catch {
    /* registrar não pode quebrar o sync (a tabela pode ainda não existir) */
  }
}
