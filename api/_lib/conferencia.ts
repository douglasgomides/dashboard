/**
 * Conferência de dados: procura o que o dashboard NÃO mostra e a Meta mostra, ou mostra parado.
 * Nasceu de furos reais: conta de anúncios da Lana com R$ 5 mil/mês fora do dashboard, sync "com sucesso"
 * e 0 linhas enquanto o alcance estava parado há dias, mesma conta ligada a dois clientes.
 *
 * Só leitura. Nada é gravado e nenhum token sai daqui (erros passam por erroCurto).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { erroCurto, lerDadosAte } from "./sync-status.js";

const GRAPH = "https://graph.facebook.com/v23.0";

export type Gravidade = "alta" | "media" | "baixa";

export interface Achado {
  id: string;
  gravidade: Gravidade;
  tipo: "conta_sem_cliente" | "conta_duplicada" | "dado_parado" | "sem_fonte" | "conferencia_falhou" | "inconsistencia" | "duplicidade";
  cliente: string | null;
  titulo: string; // o que aconteceu
  detalhe: string;
  acao: string; // o que fazer
  risco?: string; // o que dá errado se ninguém agir
  etapa?: EtapaId;
}

// O que foi conferido e passou (ou não): a prova de que a conferência olhou, não só o que deu errado.
export interface Verificado {
  etapa: EtapaId;
  tipo: "conta_anuncios" | "instagram" | "crm" | "cliente" | "token";
  nome: string;
  cliente: string | null;
  ok: boolean;
  nota: string;
}

export interface ResultadoConferencia {
  gerado_em: string;
  achados: Achado[];
  contas_vistas_na_meta: number;
  tokens_testados: number;
  verificados?: Verificado[];
}

// Etapas, na ordem em que a tela roda. Cada uma é uma chamada (cabe no tempo da função e mostra progresso).
export const ETAPAS = ["duplicidades", "contas_meta", "inconsistencias", "parados", "fontes_obrigatorias"] as const;
export type EtapaId = (typeof ETAPAS)[number];

export interface ResultadoEtapa {
  etapa: EtapaId;
  achados: Achado[];
  verificados: Verificado[];
  contas_vistas_na_meta?: number;
  tokens_testados?: number;
}

// Gasto do dashboard x gasto da Meta para a mesma conta e os mesmos dias. Diferença pequena é
// arredondamento ou dia ainda fechando; acima de 10% (e de R$ 20) é dado faltando ou sobrando.
export function compararGasto(painel: number, meta: number): { gravidade: Gravidade; dif: number; pct: number } | null {
  const dif = painel - meta;
  const base = Math.max(meta, painel);
  if (base <= 0) return null;
  const pct = Math.abs(dif) / base;
  if (Math.abs(dif) < 20 || pct < 0.1) return null;
  return { gravidade: pct >= 0.3 ? "alta" : "media", dif, pct };
}

const hojeBr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function graph(caminho: string, token: string): Promise<any> {
  const sep = caminho.includes("?") ? "&" : "?";
  const r = await fetch(`${GRAPH}/${caminho}${sep}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error?.message ?? `Graph ${r.status}`);
  return j;
}

// Todas as contas de anúncio que um token enxerga (a Meta pagina em 200, por cursor).
async function contasDoToken(token: string): Promise<{ id: string; nome: string; status: number }[]> {
  const out: { id: string; nome: string; status: number }[] = [];
  let depois = "";
  for (let i = 0; i < 4; i++) {
    const j = await graph(`me/adaccounts?fields=account_id,name,account_status&limit=200${depois}`, token);
    for (const c of j.data ?? []) out.push({ id: String(c.account_id), nome: String(c.name ?? c.account_id), status: Number(c.account_status ?? 0) });
    const cursor: string | undefined = j.paging?.next ? j.paging?.cursors?.after : undefined;
    if (!cursor) break;
    depois = `&after=${encodeURIComponent(cursor)}`;
  }
  return out;
}

async function gastoDosUltimos30(id: string, token: string): Promise<number> {
  const j = await graph(`act_${id}/insights?fields=spend&date_preset=last_30d`, token);
  return Number(j?.data?.[0]?.spend ?? 0);
}

type Sb = SupabaseClient<any, any, any>;

async function base(supabase: Sb) {
  const { data: clientes } = await supabase.from("clients").select("id, name, meta_ad_account_id").eq("active", true);
  const nome = new Map<string, string>((clientes ?? []).map((c: any) => [c.id, c.name]));
  const ativos = new Set(nome.keys());
  const { data: contasAds } = await supabase.from("client_ad_accounts").select("client_id, ad_account_id, name, active, access_token");
  const ads = (contasAds ?? []).filter((c: any) => ativos.has(c.client_id));
  // Conta gravada direto no cadastro do cliente (campo antigo) também conta como ligação.
  const contaCadastro = (clientes ?? [])
    .filter((c: any) => c.meta_ad_account_id)
    .map((c: any) => ({ client_id: c.id as string, ad_account_id: String(c.meta_ad_account_id) }));
  return { nome, ativos, contasAds: contasAds ?? [], ads, contaCadastro };
}

/** Roda uma etapa da conferência. Só leitura na origem; quem grava o resultado é o chamador. */
export async function rodarEtapa(supabase: Sb, etapa: EtapaId, opts: { tokenGlobalAnuncios?: string }): Promise<ResultadoEtapa> {
  const b = await base(supabase);
  const r =
    etapa === "duplicidades" ? await etapaDuplicidades(supabase, b)
    : etapa === "contas_meta" ? await etapaContasMeta(b, opts)
    : etapa === "inconsistencias" ? await etapaInconsistencias(supabase, b, opts)
    : etapa === "parados" ? await etapaParados(supabase, b)
    : await etapaFontesObrigatorias(supabase, b);
  for (const a of r.achados) a.etapa = etapa;
  return { etapa, ...r };
}

/** Conferência inteira numa chamada só (modo antigo, mantido). */
export async function rodarConferencia(supabase: Sb, opts: { tokenGlobalAnuncios?: string }): Promise<ResultadoConferencia> {
  const achados: Achado[] = [];
  const verificados: Verificado[] = [];
  let contas = 0;
  let tokens = 0;
  for (const e of ETAPAS) {
    const r = await rodarEtapa(supabase, e, opts);
    achados.push(...r.achados);
    verificados.push(...r.verificados);
    contas = r.contas_vistas_na_meta ?? contas;
    tokens = r.tokens_testados ?? tokens;
  }
  const ordem: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };
  achados.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || (a.cliente ?? "").localeCompare(b.cliente ?? ""));
  return { gerado_em: new Date().toISOString(), achados, contas_vistas_na_meta: contas, tokens_testados: tokens, verificados };
}

type Base = Awaited<ReturnType<typeof base>>;
type Parcial = Omit<ResultadoEtapa, "etapa">;

async function etapaDuplicidades(supabase: Sb, { nome, ativos, ads, contaCadastro }: Base): Promise<Parcial> {
  const achados: Achado[] = [];
  const verificados: Verificado[] = [];
  // 1. Mesma conta de anúncios ligada a mais de um cliente: toda soma entre clientes conta o gasto duas vezes.
  const porConta = new Map<string, Set<string>>();
  for (const c of ads) {
    if (!c.active) continue;
    const id = String(c.ad_account_id).replace(/^act_/, "");
    porConta.set(id, (porConta.get(id) ?? new Set()).add(c.client_id));
  }
  for (const c of contaCadastro) {
    const id = c.ad_account_id.replace(/^act_/, "");
    porConta.set(id, (porConta.get(id) ?? new Set()).add(c.client_id));
  }
  for (const [conta, cs] of porConta) {
    if (cs.size < 2) continue;
    const nomes = [...cs].map((id) => nome.get(id) ?? id);
    achados.push({
      id: `dup:${conta}`,
      gravidade: "media",
      tipo: "conta_duplicada",
      cliente: null,
      titulo: `A conta de anúncios ${conta} está em ${cs.size} clientes`,
      detalhe: `${nomes.join(" e ")}. O gasto aparece inteiro em cada um, então qualquer soma entre clientes conta em dobro.`,
      acao: "Se a conta é de um só cliente, tire do outro. Se é compartilhada de verdade, deixe e evite somar os dois no mesmo total.",
      risco: "Relatório entre clientes e benchmark com gasto em dobro; um cliente pode ver anúncio que não é dele.",
    });
  }
  for (const [conta, cs] of porConta) {
    verificados.push({ etapa: "duplicidades", tipo: "conta_anuncios", nome: conta, cliente: [...cs].map((id) => nome.get(id) ?? id).join(", "), ok: cs.size < 2, nota: cs.size < 2 ? "Em um cliente só" : `Em ${cs.size} clientes` });
  }

  // 1b. Mesmo Instagram em dois clientes: seguidores, alcance e posts aparecem iguais nos dois.
  const { data: igs } = await supabase.from("instagram_accounts").select("client_id, ig_username, ig_user_id, windsor_account_id").eq("active", true);
  const porIg = new Map<string, { nomeIg: string; cs: Set<string> }>();
  for (const ig of igs ?? []) {
    if (!ativos.has(ig.client_id)) continue;
    const chave = String(ig.ig_user_id ?? ig.windsor_account_id ?? ig.ig_username ?? "").toLowerCase();
    if (!chave) continue;
    const atual = porIg.get(chave) ?? { nomeIg: ig.ig_username ?? chave, cs: new Set<string>() };
    atual.cs.add(ig.client_id);
    porIg.set(chave, atual);
  }
  for (const [chave, { nomeIg, cs }] of porIg) {
    verificados.push({ etapa: "duplicidades", tipo: "instagram", nome: `@${nomeIg}`, cliente: [...cs].map((id) => nome.get(id) ?? id).join(", "), ok: cs.size < 2, nota: cs.size < 2 ? "Em um cliente só" : `Em ${cs.size} clientes` });
    if (cs.size < 2) continue;
    achados.push({
      id: `dup-ig:${chave}`,
      gravidade: "alta",
      tipo: "duplicidade",
      cliente: null,
      titulo: `O Instagram @${nomeIg} está ligado a ${cs.size} clientes`,
      detalhe: `${[...cs].map((id) => nome.get(id) ?? id).join(" e ")}. Os dois painéis mostram os mesmos posts e seguidores.`,
      acao: "Deixar a conta só no cliente certo (Admin > cliente > Instagram) e desativar no outro.",
      risco: "Um médico vê o Instagram de outro; relatório e benchmark ficam errados para os dois.",
    });
  }

  // 1c. Mesmo CRM (provedor + endereço) em dois clientes. Pode ser clínica com vários médicos: vira aviso, não erro.
  const { data: crms } = await supabase.from("crm_connections").select("client_id, provider, subdomain, active");
  const porCrm = new Map<string, Set<string>>();
  for (const c of crms ?? []) {
    if (!c.active || !ativos.has(c.client_id) || !c.subdomain) continue;
    const chave = `${c.provider}:${String(c.subdomain).toLowerCase()}`;
    porCrm.set(chave, (porCrm.get(chave) ?? new Set()).add(c.client_id));
  }
  for (const [chave, cs] of porCrm) {
    verificados.push({ etapa: "duplicidades", tipo: "crm", nome: chave.replace(":", " · "), cliente: [...cs].map((id) => nome.get(id) ?? id).join(", "), ok: cs.size < 2, nota: cs.size < 2 ? "Em um cliente só" : `Em ${cs.size} clientes` });
    if (cs.size < 2) continue;
    achados.push({
      id: `dup-crm:${chave}`,
      gravidade: "media",
      tipo: "duplicidade",
      cliente: null,
      titulo: `O mesmo CRM (${chave.replace(":", " · ")}) está em ${cs.size} clientes`,
      detalhe: `${[...cs].map((id) => nome.get(id) ?? id).join(" e ")}. Leads, etapas e vendas aparecem iguais em cada um.`,
      acao: "Se é clínica com vários médicos, separar por funil ou responsável no CRM. Se foi engano, desligar no cliente errado.",
      risco: "Conversão e vendas de um médico somam as do outro.",
    });
  }
  return { achados, verificados };
}

async function etapaContasMeta({ ads, contasAds }: Base, opts: { tokenGlobalAnuncios?: string }): Promise<Parcial> {
  const achados: Achado[] = [];
  const verificados: Verificado[] = [];
  // 2. Conta de anúncios que a Meta mostra, gasta, e nenhum cliente tem.
  const tokens = [...new Set([...ads.map((c: any) => c.access_token as string | null).filter(Boolean), opts.tokenGlobalAnuncios].filter(Boolean) as string[])];
  const registradas = new Set<string>(contasAds.map((c: any) => String(c.ad_account_id)));
  const vistas = new Map<string, { nome: string; status: number; token: string }>();
  for (const t of tokens) {
    try {
      const lista = await contasDoToken(t);
      for (const c of lista) if (!vistas.has(c.id)) vistas.set(c.id, { nome: c.nome, status: c.status, token: t });
      verificados.push({ etapa: "contas_meta", tipo: "token", nome: `Token ${tokens.indexOf(t) + 1}`, cliente: null, ok: true, nota: `${lista.length} contas visíveis` });
    } catch (e) {
      achados.push({
        id: `token:${tokens.indexOf(t)}`,
        gravidade: "baixa",
        tipo: "conferencia_falhou",
        cliente: null,
        titulo: "Um token da Meta não conseguiu listar contas de anúncios",
        detalhe: erroCurto(e instanceof Error ? e.message : String(e), 160) ?? "erro desconhecido",
        acao: "Se esse token é de um cliente, confira se venceu. A conferência de contas não cobre o que ele enxerga.",
        risco: "Conta com gasto fora do painel pode passar sem ser vista.",
      });
      verificados.push({ etapa: "contas_meta", tipo: "token", nome: `Token ${tokens.indexOf(t) + 1}`, cliente: null, ok: false, nota: "Não listou as contas" });
      continue;
    }
  }
  const soltas = [...vistas.entries()].filter(([id]) => !registradas.has(id));
  // Limite de contas consultadas por rodada: cada uma é uma chamada à Meta.
  for (let i = 0; i < Math.min(soltas.length, 60); i += 8) {
    await Promise.all(
      soltas.slice(i, i + 8).map(async ([id, c]) => {
        try {
          const gasto = await gastoDosUltimos30(id, c.token);
          if (gasto <= 0) return;
          achados.push({
            id: `solta:${id}`,
            gravidade: gasto >= 1000 ? "alta" : "media",
            tipo: "conta_sem_cliente",
            cliente: null,
            titulo: `Conta de anúncios "${c.nome}" (${id}) gastou ${brl(gasto)} em 30 dias e não está em nenhum cliente`,
            detalhe: "A Meta mostra gasto nessa conta, mas o dashboard não a lê. Se for de um cliente, o gasto dele está subestimado.",
            acao: "Descubra de quem é. Se for de cliente, cadastre em client_ad_accounts. Se não for de cliente (conta própria), ignore.",
            risco: "O cliente vê menos gasto do que tem: custo por lead e retorno ficam melhores do que a realidade.",
          });
        } catch {
          /* conta sem permissão de insights: não vira alerta */
        }
      }),
    );
  }

  for (const [id, c] of vistas) {
    if (registradas.has(id)) verificados.push({ etapa: "contas_meta", tipo: "conta_anuncios", nome: `${c.nome} (${id})`, cliente: null, ok: true, nota: "Vista na Meta e cadastrada" });
  }
  return { achados, verificados, contas_vistas_na_meta: vistas.size, tokens_testados: tokens.length };
}

async function etapaInconsistencias(supabase: Sb, { nome, ads }: Base, opts: { tokenGlobalAnuncios?: string }): Promise<Parcial> {
  const achados: Achado[] = [];
  const verificados: Verificado[] = [];
  // Gasto dos últimos 7 dias fechados (sem hoje): painel x Meta, conta por conta.
  const hoje = hojeBr();
  const fim = new Date(Date.parse(hoje) - 86_400_000).toISOString().slice(0, 10);
  const ini = new Date(Date.parse(hoje) - 7 * 86_400_000).toISOString().slice(0, 10);
  const alvo = ads.filter((c: any) => c.active).slice(0, 40);
  for (let i = 0; i < alvo.length; i += 6) {
    await Promise.all(
      alvo.slice(i, i + 6).map(async (c: any) => {
        const token = c.access_token || opts.tokenGlobalAnuncios;
        const cli = nome.get(c.client_id) ?? null;
        const rot = `${c.name ?? "Conta"} (${c.ad_account_id})`;
        if (!token) {
          verificados.push({ etapa: "inconsistencias", tipo: "conta_anuncios", nome: rot, cliente: cli, ok: true, nota: "Sem token para comparar (lida pela Windsor)" });
          return;
        }
        let meta: number;
        try {
          const j = await graph(`act_${c.ad_account_id}/insights?fields=spend&time_range=${encodeURIComponent(JSON.stringify({ since: ini, until: fim }))}`, token);
          meta = Number(j?.data?.[0]?.spend ?? 0);
        } catch {
          verificados.push({ etapa: "inconsistencias", tipo: "conta_anuncios", nome: rot, cliente: cli, ok: true, nota: "A Meta não deixou ler o gasto com este token" });
          return;
        }
        const { data: linhas } = await supabase
          .from("meta_ads_daily")
          .select("spend")
          .eq("client_id", c.client_id)
          .eq("ad_account_id", c.ad_account_id)
          .gte("date", ini)
          .lte("date", fim);
        const painel = (linhas ?? []).reduce((s: number, l: any) => s + Number(l.spend ?? 0), 0);
        const cmp = compararGasto(painel, meta);
        verificados.push({ etapa: "inconsistencias", tipo: "conta_anuncios", nome: rot, cliente: cli, ok: !cmp, nota: `7 dias: painel ${brl(painel)} · Meta ${brl(meta)}` });
        if (!cmp) return;
        achados.push({
          id: `gasto:${c.client_id}:${c.ad_account_id}`,
          gravidade: cmp.gravidade,
          tipo: "inconsistencia",
          cliente: cli,
          titulo: `Gasto de ${ini.slice(8, 10)}/${ini.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)} não bate: painel ${brl(painel)}, Meta ${brl(meta)}`,
          detalhe: `Conta ${rot}. Diferença de ${brl(Math.abs(cmp.dif))} (${Math.round(cmp.pct * 100)}%) ${cmp.dif < 0 ? "a menos" : "a mais"} no painel.`,
          acao: cmp.dif < 0
            ? "Rodar a sincronização de anúncios deste cliente (Gerenciar > Anúncios). Se continuar diferente, faltam dias ou campanhas na leitura."
            : "Ver se a conta está em dois cadastros ou se há linhas repetidas; rodar a sincronização de anúncios de novo.",
          risco: "Custo por lead, comparativo de período e relatório do cliente saem com o gasto errado.",
        });
      }),
    );
  }
  return { achados, verificados };
}

async function etapaParados(supabase: Sb, { nome, ativos, ads }: Base): Promise<Parcial> {
  const achados: Achado[] = [];
  const verificados: Verificado[] = [];
  const hoje = hojeBr();
  // 3. Instagram: sync dá sucesso, mas o alcance parou. Foi o caso do Doctor Creator (parado desde 30/09).
  const { data: igs } = await supabase.from("instagram_accounts").select("client_id, ig_username").eq("active", true);
  const { data: statusRows } = await supabase.from("sync_status").select("client_id, fonte, motivo, last_success_at");
  const status = new Map<string, any>((statusRows ?? []).map((s: any) => [`${s.client_id}:${s.fonte}`, s]));
  for (const ig of igs ?? []) {
    if (!ativos.has(ig.client_id)) continue;
    const { data: ult } = await supabase
      .from("instagram_account_daily_metrics")
      .select("date")
      .eq("client_id", ig.client_id)
      .not("reach", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ultimo: string | null = ult?.date ?? null;
    const s = status.get(`${ig.client_id}:instagram`);
    if (s?.motivo) continue; // já explicado no painel (ex.: token da cliente bloqueado)
    const atraso = ultimo ? diff(hoje, ultimo) : null;
    if (atraso == null || atraso > 3) {
      achados.push({
        id: `ig-parado:${ig.client_id}`,
        gravidade: "alta",
        tipo: "dado_parado",
        cliente: nome.get(ig.client_id) ?? null,
        titulo: ultimo ? `Alcance do Instagram parado desde ${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)} (${atraso} dias)` : "Instagram sem nenhum dia de alcance gravado",
        detalhe: `@${ig.ig_username}. O sync registra sucesso, mas a fonte das métricas diárias (Windsor) não devolve esta conta, então alcance, novos seguidores e saídas ficam parados.`,
        acao: "Conectar esta conta no conector Instagram da Windsor, ou passar a ler as métricas diárias direto da Graph.",
        risco: "Alcance, engajamento, crescimento e relatório do cliente param no tempo sem aviso.",
      });
    }
    verificados.push({ etapa: "parados", tipo: "instagram", nome: `@${ig.ig_username}`, cliente: nome.get(ig.client_id) ?? null, ok: !(atraso == null || atraso > 3) || !!s?.motivo, nota: ultimo ? `Alcance até ${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)}` : "Sem alcance gravado" });
  }

  // 4. Anúncios: conta ativa sem dado novo e sem motivo registrado.
  const ultimoPorConta = new Map<string, string>();
  for (const c of ads) {
    if (!c.active) continue;
    const { data: u } = await supabase
      .from("meta_ads_daily")
      .select("date")
      .eq("client_id", c.client_id)
      .eq("ad_account_id", c.ad_account_id)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (u?.date) ultimoPorConta.set(`${c.client_id}:${c.ad_account_id}`, u.date);
  }
  const clientesComAdsRecentes = new Set<string>();
  for (const c of ads) {
    const u = ultimoPorConta.get(`${c.client_id}:${c.ad_account_id}`);
    if (u && diff(hoje, u) <= 5) clientesComAdsRecentes.add(c.client_id);
  }
  for (const c of ads) {
    if (!c.active || clientesComAdsRecentes.has(c.client_id)) continue; // outra conta do cliente está em dia
    const s = status.get(`${c.client_id}:anuncios`);
    if (s?.motivo) continue;
    const u = ultimoPorConta.get(`${c.client_id}:${c.ad_account_id}`);
    achados.push({
      id: `ads-parado:${c.client_id}:${c.ad_account_id}`,
      gravidade: "media",
      tipo: "dado_parado",
      cliente: nome.get(c.client_id) ?? null,
      titulo: u ? `Anúncios sem dado novo desde ${u.slice(8, 10)}/${u.slice(5, 7)}` : "Conta de anúncios cadastrada sem nenhum dado",
      detalhe: `Conta ${c.ad_account_id}. Sem motivo registrado no painel.`,
      acao: "Conferir no Gerenciador de Anúncios se há campanha rodando. Se não houver, registrar o motivo. Se houver, o token ou a conta estão errados.",
      risco: "Se há campanha rodando, o painel mostra zero gasto e zero lead enquanto o cliente paga.",
    });
  }
  for (const c of ads) {
    if (!c.active) continue;
    const u = ultimoPorConta.get(`${c.client_id}:${c.ad_account_id}`);
    verificados.push({ etapa: "parados", tipo: "conta_anuncios", nome: `${c.name ?? "Conta"} (${c.ad_account_id})`, cliente: nome.get(c.client_id) ?? null, ok: !!u && diff(hoje, u) <= 5, nota: u ? `Dado até ${u.slice(8, 10)}/${u.slice(5, 7)}` : "Sem dado" });
  }

  // 4b. CRM e WhatsApp: a sincronização diz "sucesso" (sem erro, rodou há pouco), mas o dado mais novo é velho.
  // Pode ser ausência real (nenhum lead novo), por isso é aviso: a conferência só aponta para alguém olhar.
  for (const fonte of ["crm", "atendimento"] as const) {
    const limite = fonte === "crm" ? 7 : 3;
    for (const s of statusRows ?? []) {
      if (s.fonte !== fonte || !ativos.has(s.client_id) || s.motivo || !s.last_success_at) continue;
      if (diff(hoje, String(s.last_success_at).slice(0, 10)) > 2) continue; // não rodou há pouco: aparece na Saúde das fontes
      const ultimo = await lerDadosAte(supabase, s.client_id, fonte);
      const atraso = ultimo ? diff(hoje, ultimo) : null;
      const parado = atraso == null || atraso > limite;
      const rot = fonte === "crm" ? "CRM" : "WhatsApp";
      verificados.push({ etapa: "parados", tipo: fonte === "crm" ? "crm" : "cliente", nome: rot, cliente: nome.get(s.client_id) ?? null, ok: !parado, nota: ultimo ? `Sync ok; dado até ${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)}` : "Sync ok; nenhum dado" });
      if (!parado) continue;
      achados.push({
        id: `${fonte}-parado:${s.client_id}`,
        gravidade: "baixa",
        tipo: "dado_parado",
        cliente: nome.get(s.client_id) ?? null,
        titulo: ultimo ? `${rot}: sincronização com sucesso, mas nada novo desde ${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)} (${atraso} dias)` : `${rot}: sincronização com sucesso, mas nenhum dado gravado`,
        detalhe: fonte === "crm" ? "Nenhum lead novo no período. Pode ser real (cliente sem lead) ou o CRM lançado à mão / funil errado na conexão." : "Nenhuma conversa nova no período. Pode ser real ou o número do WhatsApp mudou.",
        acao: fonte === "crm" ? "Perguntar ao cliente se entraram leads. Se entraram, conferir funil e token da conexão do CRM." : "Perguntar ao cliente se recebeu mensagens. Se recebeu, conferir o canal na WTS.",
        risco: "Funil e atendimento aparecem vazios; a leitura de conversão do período fica sem base.",
      });
    }
  }
  return { achados, verificados };
}

async function etapaFontesObrigatorias(supabase: Sb, { nome, ativos, ads }: Base): Promise<Parcial> {
  const achados: Achado[] = [];
  const verificados: Verificado[] = [];
  const { data: igs } = await supabase.from("instagram_accounts").select("client_id").eq("active", true);
  // 5. Cliente ativo sem alguma fonte ligada (Instagram, anúncios ou CRM).
  const { data: crms } = await supabase.from("crm_connections").select("client_id");
  const temIg = new Set<string>((igs ?? []).map((i: any) => i.client_id));
  const temAds = new Set<string>(ads.filter((a: any) => a.active).map((a: any) => a.client_id));
  const temCrm = new Set<string>((crms ?? []).map((c: any) => c.client_id));
  for (const id of ativos) {
    const falta = [!temIg.has(id) && "Instagram", !temAds.has(id) && "anúncios", !temCrm.has(id) && "CRM"].filter(Boolean) as string[];
    verificados.push({ etapa: "fontes_obrigatorias", tipo: "cliente", nome: nome.get(id) ?? id, cliente: nome.get(id) ?? null, ok: falta.length === 0, nota: falta.length ? `Falta ${falta.join(", ")}` : "Instagram, anúncios e CRM ligados" });
    if (falta.length === 0) continue;
    achados.push({
      id: `sem-fonte:${id}`,
      // Instagram é obrigatório (é a base do painel); anúncios e CRM podem não existir de verdade.
      gravidade: !temIg.has(id) ? "alta" : falta.length === 3 ? "media" : "baixa",
      tipo: "sem_fonte",
      cliente: nome.get(id) ?? null,
      titulo: `Sem ${falta.join(", ")} ligado`,
      detalhe: "O dashboard não tem como mostrar o que não está ligado. Pode ser intencional (cliente que não anuncia, por exemplo).",
      acao: "Confirmar se o cliente tem essa fonte. Se tiver, ligar. Se não tiver, nada a fazer.",
      risco: !temIg.has(id) ? "Sem Instagram o painel do cliente fica praticamente vazio." : "Partes do painel (anúncios, funil) ficam sem dado para este cliente.",
    });
  }
  return { achados, verificados };
}
