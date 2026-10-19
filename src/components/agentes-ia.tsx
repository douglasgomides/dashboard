// Sistema agêntico na tela: o painel "Agentes de IA" (Hub e SAP) e o que cada agente preparou, na tela onde a pessoa
// trabalha (Recuperação no WhatsApp, Gestor de anúncios em Anúncios, Roteirista em Ideias). Os agentes rodam sozinhos
// no horário (src/lib/agentes-catalogo.ts); o resultado da recuperação é medido sozinho pelas conversas e pelo CRM.
// Marcar à mão é atalho, não obrigação. Nada é enviado, publicado ou alterado em anúncio pelo painel.
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Brain, CalendarPlus, CheckCircle2, ChevronDown, Headset, Lightbulb, Loader2, MessageCircle, Play, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClientRole } from "@/hooks/use-client-role";
import { rodarFluxoAteFim } from "@/lib/agentes-data";
import { AGENTES, type AgenteCatalogo, type IdAgente } from "@/lib/agentes-catalogo";
import { pecaParaTexto, type CopyAnuncio, type PecaConteudo } from "@/lib/agentes-sugestoes";
import { duracao, resumoPiloto } from "@/lib/atendente";
import { acoesDoSinal, brlCentavos, type TipoAcao } from "@/lib/anuncios-acoes";
import { ProvaResultado } from "@/components/prova-resultado";
import { usePautas } from "@/components/planejador-conteudo";
import { AssumirRecuperacao, OperacaoRecuperacao } from "@/components/operacao-recuperacao";
import { BotaoCopiar } from "@/components/botao-copiar";
import { CentroTrabalhoAgentes } from "@/components/agentes-trabalho";
import { EstrategiasIA } from "@/components/estrategias-ia";
import { TRABALHOS_AGENTE } from "@/lib/agentes-trabalho";

const db = supabase as any;
type Estado = "proposta" | "feita" | "descartada";
interface Sugestao {
  id: string; agente: "recuperacao" | "anuncios" | "conteudo"; tipo: string; titulo: string; detalhe: string | null; evidencias: string[]; brain: string[];
  conteudo: any; mensagem: string | null; conversa_id: string | null; campanha_id: string | null; prioridade: number; estado: Estado;
  resultado: string | null; medido_em: string | null; medicao?: { versao?: number; legado?: { estado?: string } }; criado_em: string; nota?: number | null; critica?: string | null;
  conversa?: { canal: string | null; pessoa: { nome: string | null } | null } | null;
}

const agente = (id: IdAgente) => AGENTES.find((a) => a.id === id)!;
const ha = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? "agora há pouco" : h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} dia${Math.round(h / 24) === 1 ? "" : "s"}`;
};
const primeiro = (nome?: string | null) => (nome ?? "").trim().split(/\s+/)[0] || "";

function useSugestoes(clientId: string, ag: Sugestao["agente"], dias = 14) {
  return useQuery({
    queryKey: ["sugestoes-agentes", clientId, ag],
    queryFn: async () => {
      const sel = ag === "recuperacao" ? "*, conversa:conversas(canal, pessoa:pessoas(nome))" : "*";
      const { data, error } = await db.from("sugestoes_agentes").select(sel).eq("client_id", clientId).eq("agente", ag)
        .gte("criado_em", new Date(Date.now() - dias * 86_400_000).toISOString()).order("criado_em", { ascending: false }).order("prioridade", { ascending: false }).limit(60);
      if (error) throw error;
      if (ag === "recuperacao") {
        const {data: assumidas,error:erroAssumidas} = await db.from("operacao_recuperacao").select("sugestao_id").eq("client_id",clientId);
        if (erroAssumidas) throw erroAssumidas;
        const ids = new Set((assumidas ?? []).map((t: {sugestao_id:string})=>t.sugestao_id));
        return ((data ?? []) as Sugestao[]).filter(s=>!ids.has(s.id));
      }
      return (data ?? []) as Sugestao[];
    },
  });
}

function useDecidir(clientId: string, ag: string) {
  const qc = useQueryClient();
  return async (id: string, estado: Estado, resultado?: string) => {
    const { error } = await db.rpc("sugestao_decidir", { p_id: id, p_estado: estado, p_resultado: resultado ?? null });
    await qc.invalidateQueries({ queryKey: ["sugestoes-agentes", clientId, ag] });
    await qc.invalidateQueries({ queryKey: ["agentes-trabalho", clientId] });
    if (error) throw error;
  };
}

/** Cabeçalho comum: quem é o agente, quando roda, quando entregou, e "Rodar agora" para a equipe. */
function Cabecalho({ a, clientId, ultima, aoTerminar, mostrarExecutar = true }: { a: AgenteCatalogo; clientId: string; ultima: string | null; aoTerminar: () => void; mostrarExecutar?: boolean }) {
  const { isAdmin } = useAuth();
  const [andando, setAndando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  async function rodar() {
    setErro(null);
    try { const e = await rodarFluxoAteFim(clientId, { id: a.fluxo, agente: a.agente, objetivo: a.entrega }, setAndando); if (e) setErro(e); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setAndando(null); aoTerminar(); }
  }
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Bot size={16} aria-hidden style={{ color: "var(--accent)" }} /> {a.nome}</h3>
        {mostrarExecutar && <><p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>{a.entrega}</p>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>Rotina prevista: {a.frequencia.toLowerCase()}{ultima ? ` · última entrega ${ha(ultima)}` : ""} · {a.quemAprova}</p></>}
        {andando && <p className="mt-1 text-xs" style={{ color: "var(--muted)" }} aria-live="polite">{andando}</p>}
        {erro && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{erro}</p>}
      </div>
      {isAdmin && mostrarExecutar && (
        <button type="button" className="btn inline-flex items-center gap-1.5" disabled={!!andando} onClick={rodar} title="Rodar este agente agora para esta clínica">
          {andando ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <Play size={14} aria-hidden />} {andando ? "Preparando…" : TRABALHOS_AGENTE[a.id].acao}
        </button>
      )}
    </div>
  );
}

function Acoes({ s, podeEditar, decidir, extra, somenteDescartar = false }: { s: Sugestao; podeEditar: boolean; decidir: (e: Estado) => Promise<void>; extra?: React.ReactNode; somenteDescartar?: boolean }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ir = async (e: Estado) => { setErro(null); setSalvando(true); try { await decidir(e); } catch { setErro("Não foi possível salvar a decisão. Tente novamente."); } finally { setSalvando(false); } };
  const medido = s.agente !== "recuperacao" && s.resultado && s.resultado !== "expirou sem revisão"
    ? <p className="mt-2 w-full rounded-md p-2 text-xs" style={{ background: "var(--surface-2)" }}><b>Leitura posterior:</b> {s.resultado}</p> : null;
  const revisor = s.nota != null
    ? <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }} title="Um segundo agente revisa tudo antes de chegar aqui; abaixo de 6 é descartado.">Nota do revisor: <b style={{ color: s.nota >= 8 ? "var(--ok, var(--accent))" : "var(--ink-2)" }}>{s.nota}/10</b>{s.critica ? ` · ${s.critica}` : ""}</p> : null;
  if (!podeEditar) return <>{medido}{revisor}{extra ? <div className="mt-2 flex flex-wrap gap-2">{extra}</div> : null}</>;
  return (
    <>{medido}{revisor}
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {extra}
      {erro && <p role="alert" className="w-full text-xs" style={{ color: "var(--crit)" }}>{erro}</p>}
      {s.estado === "proposta" ? (
        <>
          {!somenteDescartar && <button type="button" className="btn inline-flex items-center gap-1" disabled={salvando} onClick={() => ir("feita")}><CheckCircle2 size={14} aria-hidden /> Feito</button>}
          <button type="button" className="inline-flex min-h-[36px] items-center gap-1 px-2 text-xs" style={{ color: "var(--muted)" }} disabled={salvando} onClick={() => ir("descartada")}><XCircle size={14} aria-hidden /> Descartar</button>
        </>
      ) : (
        <button type="button" className="inline-flex min-h-[36px] items-center px-2 text-xs" style={{ color: "var(--muted)" }} disabled={salvando} onClick={() => ir("proposta")}>Desfazer</button>
      )}
    </div>
    </>
  );
}

const RESULTADO: Record<string, string> = { enviada: "Mensagem enviada", respondeu: "Paciente respondeu", agendou: "Agendamento registrado", compareceu: "Comparecimento registrado", fechou: "Venda registrada" };

function Lista({ itens, render, vazio }: { itens: Sugestao[]; render: (s: Sugestao) => React.ReactNode; vazio: string }) {
  const [verTodas, setVerTodas] = useState(false);
  const abertas = itens.filter((s) => s.estado === "proposta");
  const outras = itens.filter((s) => s.estado !== "proposta");
  const visiveis = verTodas ? [...abertas, ...outras] : abertas;
  return (
    <>
      {visiveis.length === 0 ? <p className="text-sm" style={{ color: "var(--ink-2)" }}>{vazio}</p> : <div className="grid gap-3 lg:grid-cols-2">{visiveis.map(render)}</div>}
      {outras.length > 0 && <button type="button" className="self-start text-xs font-semibold" style={{ color: "var(--accent)" }} onClick={() => setVerTodas(!verTodas)}>{verTodas ? "Esconder histórico" : `Ver histórico de ${outras.length} propostas`}</button>}
    </>
  );
}

const cartao = (s: Sugestao) => ({ background: "var(--surface)", borderColor: "var(--border)", borderLeft: "3px solid var(--accent)", opacity: s.estado === "descartada" ? 0.55 : 1 });
const Secao = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <section id={id} aria-label={AGENTES.find((a) => id === `ag-${a.id}`)?.nome} className="flex flex-col gap-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>{children}</section>
);

// ---------------------------------------------------------------- Recuperação de pacientes

export function RecuperarHoje({ clientId, podeEditar, mostrarExecutar = true }: { clientId: string; podeEditar: boolean; mostrarExecutar?: boolean }) {
  const { isAdmin } = useAuth();
  const q = useSugestoes(clientId, "recuperacao");
  const decidir = useDecidir(clientId, "recuperacao");
  const a = agente("recuperacao");
  const itens = q.data ?? [];
  return (
    <div className="space-y-4">
    <OperacaoRecuperacao key={clientId} clientId={clientId} podeEditar={podeEditar} />
    <Secao id="ag-recuperacao">
            <Cabecalho a={a} clientId={clientId} ultima={itens[0]?.criado_em ?? null} aoTerminar={() => q.refetch()} mostrarExecutar={mostrarExecutar} />
      {q.isError && <p role="alert" className="text-sm">Não foi possível carregar as propostas. <button type="button" className="underline" onClick={() => void q.refetch()}>Tentar novamente</button></p>}
      {q.isSuccess && <Lista itens={itens} vazio="Nenhuma proposta pendente de revisão. Os casos assumidos ficam no acompanhamento acima." render={(s) => {
        const nome = primeiro(s.conversa?.pessoa?.nome);
        const msg = (s.mensagem ?? "").replace(/\[nome\]/gi, nome || "[nome]");
        return (
          <article key={s.id} className="flex flex-col rounded-xl border p-3" style={cartao(s)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{s.conversa?.pessoa?.nome || "Sem nome"}{s.conversa?.canal ? <span className="font-normal" style={{ color: "var(--muted)" }}> · {s.conversa.canal}</span> : null}</span>
              {s.medicao?.versao === 2 && s.resultado && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--surface-2)", color: s.resultado === "agendou" ? "var(--ok, var(--accent))" : "var(--ink-2)" }}>{RESULTADO[s.resultado] ?? s.resultado}</span>}
            </div>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>{s.titulo}</p>
            <p className="mt-2 rounded-lg p-2.5 text-sm leading-relaxed" style={{ background: "var(--surface-2)" }}>{msg}</p>
            {s.estado === "proposta" && s.medicao?.legado?.estado === "feita" && <p className="mt-2 text-xs">Classificação automática anterior arquivada. Revise o caso com os dados atuais antes de novo contato.</p>}
            {s.detalhe && <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>Por quê: {s.detalhe}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <BotaoCopiar texto={msg} rotulo="Copiar rascunho" />
              {s.conversa_id && isAdmin && <Link to="/$clientId/atendimento" params={{ clientId }} search={{ aba: "conversas", conversa: s.conversa_id } as never} className="btn"><MessageCircle size={14} aria-hidden /> Ver conversa</Link>}
            </div>
            {podeEditar && s.estado === "proposta" && <AssumirRecuperacao key={s.id} clientId={clientId} sugestaoId={s.id} />}
            <Acoes s={s} podeEditar={podeEditar} decidir={(e) => decidir(s.id, e)} somenteDescartar />
          </article>
        );
      }} />}
    </Secao>
    </div>
  );
}

// ---------------------------------------------------------------- Gestor de anúncios

const ROTULO_SINAL: Record<string, string> = { sem_resultado: "Gastando sem resultado", custo_subiu: "Custo subiu", fadiga: "Criativo cansado", escalar: "Pode escalar", seguidor_caro: "Seguidor caro", perfil_escalar: "Seguidor barato: pode escalar" };

function Copies({ copies }: { copies: CopyAnuncio[] }) {
  if (!copies?.length) return null;
  return (
    <div className="space-y-2">
      {copies.map((c, n) => {
        const texto = `${c.gancho}\n\n${c.texto}\n\n${c.cta}`;
        return (
          <div key={n} className="rounded-lg p-2.5 text-sm" style={{ background: "var(--surface-2)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Copy {n + 1}</div>
            <p className="mt-1 font-semibold">{c.gancho}</p>
            <p className="mt-1 leading-relaxed">{c.texto}</p>
            <p className="mt-1 text-xs font-semibold" style={{ color: "var(--accent)" }}>{c.cta}</p>
            <div className="mt-2"><BotaoCopiar texto={texto} rotulo="Copiar copy" /></div>
          </div>
        );
      })}
    </div>
  );
}

async function chamarAcaoAnuncio(clientId: string, corpo: Record<string, unknown>) {
  const { data: ses } = await supabase.auth.getSession();
  const r = await fetch("/api/sync/manual", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ses.session?.access_token ?? ""}` }, body: JSON.stringify({ client_id: clientId, alvo: "anuncio_acao", ...corpo }) });
  return (await r.json().catch(() => ({ ok: false, erro: `Falhou (${r.status})` }))) as { ok: boolean; erro?: string; token?: boolean };
}
interface AcaoAnuncio { id: string; tipo: string; pct: number | null; estado: string; erro: string | null; aplicado_em: string | null; criado_em: string; antes: any; depois: any }

/** Aplicar com 1 clique (só a equipe): a mudança vai pela API da Meta, com limite de 20% no orçamento, 1 mudança por
 *  campanha a cada 24 h e botão de desfazer. Sem o token de escrita, os botões ficam desligados com o aviso. */
function AcoesMeta({ clientId, s }: { clientId: string; s: Sugestao }) {
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ["meta-escrita"], staleTime: 300_000, queryFn: () => chamarAcaoAnuncio(clientId, { acao: "status" }) });
  const hist = useQuery({
    queryKey: ["anuncios-acoes", s.campanha_id],
    enabled: !!s.campanha_id,
    queryFn: async () => {
      const { data } = await db.from("anuncios_mudancas").select("id, tipo, pct, estado, erro, aplicado_em, criado_em, antes, depois").eq("campanha_id", s.campanha_id).order("criado_em", { ascending: false }).limit(5);
      return (data ?? []) as AcaoAnuncio[];
    },
  });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const opcoes = acoesDoSinal(s.tipo);
  if (!s.campanha_id || (!opcoes.length && !(hist.data ?? []).length)) return null;
  const temToken = st.data?.token === true;
  async function ir(corpo: Record<string, unknown>, confirmar: string) {
    if (!window.confirm(confirmar)) return;
    setOcupado(true); setErro(null);
    const r = await chamarAcaoAnuncio(clientId, corpo);
    if (!r.ok) setErro(r.erro ?? "Não foi possível aplicar.");
    setOcupado(false);
    await qc.invalidateQueries({ queryKey: ["anuncios-acoes", s.campanha_id] });
    await qc.invalidateQueries({ queryKey: ["sugestoes-agentes", clientId, "anuncios"] });
  }
  const desc = (a: AcaoAnuncio) => a.tipo === "pausar" ? "Campanha pausada" : a.tipo === "ativar" ? "Campanha reativada"
    : `Orçamento ${Number(a.pct) > 0 ? "+" : ""}${a.pct}%${(a.antes?.orcamentos ?? []).length ? ` (${brlCentavos((a.antes.orcamentos as { daily_budget: number }[]).reduce((t, o) => t + o.daily_budget, 0))} → ${brlCentavos(((a.depois?.orcamentos ?? []) as { daily_budget: number }[]).reduce((t, o) => t + o.daily_budget, 0))}/dia)` : ""}`;
  return (
    <div className="mt-2 rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Aplicar na Meta (com aprovação)</div>
      {!temToken && st.data && <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Aguardando o token de escrita da Meta na Vercel (META_ADS_WRITE_TOKEN). Até lá, faça a mudança no Gerenciador.</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button key={o.rotulo} type="button" disabled={!temToken || ocupado} className="inline-flex min-h-[34px] items-center rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-50" style={{ borderColor: o.tipo === "pausar" ? "var(--crit)" : "var(--accent)", color: o.tipo === "pausar" ? "var(--crit)" : "var(--accent)" }}
            onClick={() => ir({ tipo: o.tipo as TipoAcao, pct: o.pct, campanha_id: s.campanha_id, sugestao_id: s.id }, `${o.rotulo} na Meta agora? Dá para desfazer depois.`)}>
            {ocupado ? <Loader2 size={13} className="mr-1 animate-spin" aria-hidden /> : null}{o.rotulo}
          </button>
        ))}
      </div>
      {erro && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{erro}</p>}
      {(hist.data ?? []).map((a) => (
        <p key={a.id} className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--ink-2)" }}>
          <span>{a.estado === "falhou" ? `Falhou: ${a.erro}` : `${desc(a)} · ${new Date(a.aplicado_em ?? a.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${a.estado === "desfeita" ? " · desfeita" : ""}`}</span>
          {a.estado === "aplicada" && temToken && <button type="button" disabled={ocupado} className="font-semibold underline" style={{ color: "var(--accent)" }} onClick={() => ir({ acao: "desfazer", id: a.id }, "Desfazer esta mudança na Meta?")}>Desfazer</button>}
        </p>
      ))}
    </div>
  );
}

export function GestorAnunciosIA({ clientId, podeEditar, mostrarExecutar = true }: { clientId: string; podeEditar: boolean; mostrarExecutar?: boolean }) {
  const q = useSugestoes(clientId, "anuncios", 10);
  const decidir = useDecidir(clientId, "anuncios");
  const a = agente("anuncios");
  const itens = q.data ?? [];
  return (
    <Secao id="ag-anuncios">
      <Cabecalho a={a} clientId={clientId} ultima={itens[0]?.criado_em ?? null} aoTerminar={() => q.refetch()} mostrarExecutar={mostrarExecutar} />
      {q.isPending ? <p role="status">Carregando recomendações…</p> : q.isError ? <p role="alert">Não foi possível carregar as recomendações. <button type="button" className="underline" onClick={() => void q.refetch()}>Tentar novamente</button></p> : <Lista itens={itens} vazio="Nenhuma recomendação neste intervalo. Confira o estado da rodada e a cobertura dos anúncios; isso não confirma que a conta está saudável." render={(s) => <CartaoAnuncio key={s.id} s={s} clientId={clientId} podeEditar={podeEditar} decidir={(e) => decidir(s.id, e)} />} />}
    </Secao>
  );
}

function CartaoAnuncio({ s, clientId, podeEditar, decidir }: { s: Sugestao; clientId: string; podeEditar: boolean; decidir: (e: Estado) => Promise<void> }) {
  const { isAdmin } = useAuth();
  const [aberto, setAberto] = useState(false);
  const passos: string[] = s.conteudo?.passos ?? [];
  const copies: CopyAnuncio[] = s.conteudo?.copies ?? [];
  return (
    <article className="flex flex-col rounded-xl border p-3" style={cartao(s)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: s.tipo === "escalar" || s.tipo === "perfil_escalar" ? "var(--accent)" : "var(--warn)" }}>{ROTULO_SINAL[s.tipo] ?? s.tipo}</span>
      <h4 className="mt-0.5 text-[15px] font-semibold leading-snug">{s.titulo}</h4>
      {s.detalhe && <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>{s.detalhe}</p>}
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs" style={{ color: "var(--ink-2)" }}>{s.evidencias.map((e) => <li key={e}>{e}</li>)}</ul>
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="mt-2 inline-flex min-h-[36px] items-center gap-1 self-start text-xs font-semibold" style={{ color: "var(--accent)" }}>
        <ChevronDown size={14} aria-hidden style={{ transform: aberto ? "rotate(180deg)" : undefined }} /> {aberto ? "Fechar" : `Passo a passo${copies.length ? ` e ${copies.length} copies novas` : ""}`}
      </button>
      {aberto && (
        <div className="mt-1 space-y-2 text-sm">
          <ol className="list-decimal space-y-1 pl-5 leading-relaxed">{passos.map((p) => <li key={p}>{p}</li>)}</ol>
          <Copies copies={copies} />
        </div>
      )}
      {isAdmin && <AcoesMeta clientId={clientId} s={s} />}
      <Acoes s={s} podeEditar={podeEditar} decidir={decidir} />
    </article>
  );
}

// ---------------------------------------------------------------- Roteirista de conteúdo

export function RoteirosProntos({ clientId, podeEditar, mostrarExecutar = true }: { clientId: string; podeEditar: boolean; mostrarExecutar?: boolean }) {
  const q = useSugestoes(clientId, "conteudo", 21);
  const decidir = useDecidir(clientId, "conteudo");
  const pautas = usePautas(clientId);
  const a = agente("conteudo");
  const itens = q.data ?? [];
  const [levando, setLevando] = useState(false);
  const [erroPlanejador, setErroPlanejador] = useState<string | null>(null);
  const [sucessoPlanejador, setSucessoPlanejador] = useState<string | null>(null);
  const guardaPlanejador = useRef(false);
  const noPlanejador = new Set((pautas.q.data?.pautas ?? []).map((p) => p.ideia_id));
  async function levar(s: Sugestao) {
    if (guardaPlanejador.current || !pautas.q.isSuccess || pautas.q.data.semTabela) return;
    guardaPlanejador.current = true; setLevando(true); setErroPlanejador(null); setSucessoPlanejador(null);
    const p = s.conteudo as PecaConteudo;
    try {
    await pautas.criar.mutateAsync({
      client_id: clientId, ideia_id: `agente:${s.id}`, titulo: p.titulo, formato: p.formato, objetivo: p.objetivo, status: "escolhida",
      motivo: p.por_que || null, origem_tipo: "dado", origem_texto: p.evidencias.join(" · ") || null, gancho: p.gancho,
      roteiro: p.formato === "reels" ? p.cenas.map((c) => `${c.fala}${c.tela ? ` [tela: ${c.tela}]` : ""}${c.visual ? ` (imagem: ${c.visual})` : ""}`) : p.slides.map((sl, n) => `Slide ${n + 1}: ${sl.titulo}${sl.texto ? `. ${sl.texto}` : ""}`),
      cta: p.cta, aviso: null, dia: null, post_id: null,
    });
    try { await decidir(s.id, "feita"); setSucessoPlanejador("Roteiro salvo no planejador. Abra o planejamento da semana para definir a data e acompanhar a produção."); }
    catch { setErroPlanejador("O roteiro foi salvo no planejador, mas a fila de revisão não foi atualizada. Confira a pauta no planejador antes de repetir a operação."); }
    } catch { setErroPlanejador("Não foi possível salvar o roteiro no planejador. A proposta foi preservada; tente novamente."); }
    finally { guardaPlanejador.current = false; setLevando(false); }
  }
  return (
    <Secao id="ag-conteudo">
      <Cabecalho a={a} clientId={clientId} ultima={itens[0]?.criado_em ?? null} aoTerminar={() => q.refetch()} mostrarExecutar={mostrarExecutar} />
      {pautas.q.isError && <p role="alert">Não foi possível conferir o planejador. <button type="button" className="underline" onClick={() => void pautas.q.refetch()}>Tentar novamente</button></p>}
      {pautas.q.data?.semTabela && <p role="status">Planejador indisponível nesta instalação. Os roteiros continuam disponíveis para revisão e cópia.</p>}
      {erroPlanejador && <p role="alert">{erroPlanejador}</p>}
      {sucessoPlanejador && <p role="status">{sucessoPlanejador}</p>}
      {q.isPending ? <p role="status">Carregando roteiros…</p> : q.isError ? <p role="alert">Não foi possível carregar os roteiros. <button type="button" className="underline" onClick={() => void q.refetch()}>Tentar novamente</button></p> : <Lista itens={itens} vazio="Nenhum roteiro aberto neste intervalo. Confira os dados e o estado da rodada antes de preparar novos materiais." render={(s) => (
        <CartaoPeca key={s.id} s={s} podeEditar={podeEditar} decidir={(e) => decidir(s.id, e)} levando={levando} levar={podeEditar && pautas.q.isSuccess && !pautas.q.data.semTabela && !noPlanejador.has(`agente:${s.id}`) ? () => void levar(s) : undefined} />
      )} />}
    </Secao>
  );
}

function CartaoPeca({ s, podeEditar, decidir, levar, levando }: { s: Sugestao; podeEditar: boolean; decidir: (e: Estado) => Promise<void>; levar?: () => void; levando?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const p = s.conteudo as PecaConteudo;
  if (!p?.formato) return null;
  return (
    <article className="flex flex-col rounded-xl border p-3" style={cartao(s)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{p.formato === "reels" ? `Reels · ${p.cenas.length} cenas` : `Carrossel · ${p.slides.length} slides`} · {p.objetivo}</span>
      <h4 className="mt-0.5 text-[15px] font-semibold leading-snug">{p.titulo}</h4>
      <p className="mt-1 text-sm"><b>Gancho:</b> “{p.gancho}”</p>
      {p.por_que && <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>{p.por_que}</p>}
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="mt-2 inline-flex min-h-[36px] items-center gap-1 self-start text-xs font-semibold" style={{ color: "var(--accent)" }}>
        <ChevronDown size={14} aria-hidden style={{ transform: aberto ? "rotate(180deg)" : undefined }} /> {aberto ? "Fechar" : p.formato === "reels" ? "Ver roteiro e legenda" : "Ver slides e legenda"}
      </button>
      {aberto && (
        <div className="mt-1 space-y-2 text-sm">
          {p.formato === "reels" ? (
            <ol className="space-y-2">
              {p.cenas.map((c, n) => (
                <li key={n} className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
                  <div className="text-[11px] font-semibold" style={{ color: "var(--muted)" }}>Cena {n + 1}{c.visual ? ` · ${c.visual}` : ""}</div>
                  <p className="mt-0.5 leading-relaxed">{c.fala}</p>
                  {c.tela && <p className="mt-0.5 text-xs font-semibold" style={{ color: "var(--accent)" }}>Na tela: {c.tela}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <ol className="space-y-2">
              {p.slides.map((sl, n) => (
                <li key={n} className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
                  <div className="text-[11px] font-semibold" style={{ color: "var(--muted)" }}>Slide {n + 1}</div>
                  <p className="font-semibold">{sl.titulo}</p>
                  {sl.texto && <p className="mt-0.5 leading-relaxed">{sl.texto}</p>}
                </li>
              ))}
            </ol>
          )}
          <div className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
            <div className="text-[11px] font-semibold" style={{ color: "var(--muted)" }}>Legenda</div>
            <p className="mt-0.5 whitespace-pre-line leading-relaxed">{p.legenda}</p>
            {p.hashtags.length > 0 && <p className="mt-1 text-xs" style={{ color: "var(--accent)" }}>{p.hashtags.join(" ")}</p>}
          </div>
          {p.evidencias.length > 0 && <ul className="list-disc pl-5 text-xs" style={{ color: "var(--ink-2)" }}>{p.evidencias.map((e) => <li key={e}>{e}</li>)}</ul>}
          {p.brain.length > 0 && <p className="flex flex-wrap items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}><Brain size={12} aria-hidden /> Brand Brain: {p.brain.map((b) => <code key={b} className="rounded px-1" style={{ background: "var(--surface-2)" }}>{b}</code>)}</p>}
        </div>
      )}
      <Acoes s={s} podeEditar={podeEditar} decidir={decidir} extra={<>
        <BotaoCopiar texto={pecaParaTexto(p)} rotulo="Copiar tudo" />
        {levar && <button type="button" className="btn inline-flex items-center gap-1" disabled={levando} onClick={levar}><CalendarPlus size={14} aria-hidden /> {levando ? "Salvando no planejador…" : "Levar ao planejador"}</button>}
      </>} />
    </article>
  );
}

// ---------------------------------------------------------------- o que os agentes aprenderam

interface Licao { id: string; agente: string; texto: string; evidencia: string[]; n: number; sinal: "faz" | "evita"; confianca: "alta" | "media"; origem: string; estado: string; atualizado_em: string }
const ORIGEM: Record<string, string> = { posts: "Instagram", conversas: "conversas do WhatsApp", anuncios: "anúncios", resultados: "resultado das sugestões" };
const NOME_AGENTE: Record<string, string> = { conteudo: "Roteirista", recuperacao: "Recuperação e atendimento", anuncios: "Gestor de anúncios", campanhas: "Estrategista" };

/** Lições que o sistema tirou sozinho dos dados da clínica e que os agentes usam em toda rodada. A equipe pode vetar. */
export function AprendizadosAgentes({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [verVetadas, setVerVetadas] = useState(false);
  const [vetando, setVetando] = useState(false);
  const [erroLicao, setErroLicao] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["agentes-aprendizados", clientId],
    queryFn: async () => {
      const { data, error } = await db.from("agentes_aprendizados").select("id, agente, texto, evidencia, n, sinal, confianca, origem, estado, atualizado_em")
        .eq("client_id", clientId).in("estado", ["ativo", "vetado"]).order("confianca").order("n", { ascending: false }).limit(80);
      if (error) throw error;
      return (data ?? []) as Licao[];
    },
  });
  async function vetar(id: string, v: boolean) {
    setVetando(true); setErroLicao(null);
    try {
      const { error } = await db.rpc("aprendizado_vetar", { p_id: id, p_vetar: v });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["agentes-aprendizados", clientId] });
    } catch { setErroLicao("Não foi possível salvar a decisão sobre esta lição. Tente novamente."); }
    finally { setVetando(false); }
  }
  // A mesma lição aparece para mais de um agente (o Estrategista reaproveita); na tela, uma vez só.
  const vistas = new Set<string>();
  const todas = (q.data ?? []).filter((l) => { if (vistas.has(l.texto)) return false; vistas.add(l.texto); return true; });
  const ativas = todas.filter((l) => l.estado === "ativo"), vetadas = todas.filter((l) => l.estado === "vetado");
  const lista = verVetadas ? [...ativas, ...vetadas] : ativas;
  return (
    <section aria-labelledby="ag-aprendeu" className="space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div>
        <h3 id="ag-aprendeu" className="flex items-center gap-1.5 text-sm font-semibold"><Lightbulb size={16} aria-hidden style={{ color: "var(--accent)" }} /> O que os agentes aprenderam com os dados desta clínica</h3>
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>Todo dia o sistema compara o que funcionou e o que não funcionou (posts, conversas, anúncios e o resultado das próprias sugestões) e reescreve estas lições. Só vira lição o que tem amostra mínima e diferença grande; o que deixa de valer some sozinho. Os agentes seguem estas lições em toda rodada.{podeEditar ? " Se uma lição não faz sentido, vete: o agente para de usar." : ""}</p>
      </div>
      {erroLicao && <p role="alert">{erroLicao}</p>}
      {q.isLoading ? <p role="status">Conferindo as lições da clínica…</p> : q.isError ? <p role="alert">Não foi possível carregar o aprendizado. <button type="button" className="underline" onClick={() => void q.refetch()}>Tentar novamente</button></p> : lista.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>Ainda sem lições. Elas aparecem quando há dado suficiente (pelo menos 12 posts com alcance, 25 conversas comerciais lidas ou 3 campanhas com resultado).</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((l) => (
            <li key={l.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", opacity: l.estado === "vetado" ? 0.55 : 1 }}>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                <span style={{ color: l.sinal === "faz" ? "var(--ok, var(--accent))" : "var(--crit)" }}>{l.sinal === "faz" ? "Fazer" : "Evitar"}</span>
                <span style={{ color: "var(--muted)" }}>· {NOME_AGENTE[l.agente] ?? l.agente} · fonte: {ORIGEM[l.origem] ?? l.origem} · confiança {l.confianca}</span>
              </div>
              <p className="mt-1 leading-relaxed" style={{ color: "var(--ink)" }}>{l.texto}</p>
              {Array.isArray(l.evidencia) && l.evidencia.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs" style={{ color: "var(--ink-2)" }}>{l.evidencia.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>}
              {podeEditar && (
                <button type="button" disabled={vetando} className="mt-1 inline-flex min-h-[32px] items-center gap-1 text-xs" style={{ color: "var(--muted)" }} onClick={() => void vetar(l.id, l.estado !== "vetado")}>
                  <ThumbsDown size={13} aria-hidden /> {l.estado === "vetado" ? "Voltar a usar" : "Não faz sentido, vetar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {vetadas.length > 0 && <button type="button" className="text-xs font-semibold" style={{ color: "var(--accent)" }} onClick={() => setVerVetadas(!verVetadas)}>{verVetadas ? "Esconder vetadas" : `Ver ${vetadas.length} vetada${vetadas.length === 1 ? "" : "s"}`}</button>}
    </section>
  );
}

// ---------------------------------------------------------------- atendente de IA (piloto, modo sombra)

interface RascunhoAtendente {
  id: string; gatilho_em: string; gatilho_texto: string; acao: string; mensagem: string | null; motivo: string | null; risco: string | null; erro: string | null;
  faltou: string[]; resposta_humana: string | null; tempo_humano_s: number | null; avaliacao: string | null; avaliacao_motivo: string | null;
}
const ACAO_ATENDENTE: Record<string, string> = { responder: "Responderia", passar_humano: "Passaria para a equipe", descartado: "Barrado pelas regras" };

/** Só admin: o que o atendente teria respondido a cada paciente, ao lado da resposta real da clínica. Nada é enviado. */
export function AtendentePiloto({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["atendente-piloto", clientId],
    queryFn: async () => {
      const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [cfg, rs, fatos] = await Promise.all([
        db.from("atendente_config").select("modo").eq("client_id", clientId).maybeSingle(),
        db.from("atendente_rascunhos").select("id, gatilho_em, gatilho_texto, acao, mensagem, motivo, risco, erro, faltou, resposta_humana, tempo_humano_s, avaliacao, avaliacao_motivo")
          .eq("client_id", clientId).gte("gatilho_em", desde).order("gatilho_em", { ascending: false }).limit(300),
        db.from("brain_itens").select("estado").eq("client_id", clientId).eq("memoria", "comercial").like("chave", "atend_%"),
      ]);
      const f = (fatos.data ?? []) as { estado: string }[];
      return { modo: (cfg.data?.modo as string) ?? "desligado", rascunhos: (rs.data ?? []) as RascunhoAtendente[], aprovados: f.filter((x) => x.estado === "aprovado").length, propostos: f.filter((x) => x.estado === "proposto").length };
    },
  });
  const [ver, setVer] = useState(12);
  const atualizar = () => qc.invalidateQueries({ queryKey: ["atendente-piloto", clientId] });
  async function modo(m: string) { await db.rpc("atendente_definir_modo", { p_client_id: clientId, p_modo: m }); await atualizar(); }
  async function avaliar(r: RascunhoAtendente, a: "boa" | "ruim") {
    let motivo: string | null = null;
    if (a === "ruim") { motivo = window.prompt("O que estava errado? (o atendente aprende com isso)", r.avaliacao_motivo ?? ""); if (motivo === null) return; }
    await db.rpc("atendente_avaliar", { p_id: r.id, p_avaliacao: r.avaliacao === a ? null : a, p_motivo: motivo });
    await atualizar();
  }
  const d = q.data;
  const rs = d?.rascunhos ?? [];
  const n = resumoPiloto(rs.map((r) => ({ ...r, faltou: Array.isArray(r.faltou) ? r.faltou : [] })));
  return (
    <section aria-labelledby="ag-atendente" className="space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="ag-atendente" className="flex items-center gap-1.5 text-sm font-semibold"><Headset size={16} aria-hidden style={{ color: "var(--accent)" }} /> Atendente de IA · piloto em modo sombra</h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>Para cada mensagem de paciente, o atendente escreve o que responderia, só com fatos aprovados no Brand Brain, e passa para a equipe tudo o que for clínico, urgente ou reclamação. <b>Nada é enviado ao paciente.</b> Aqui você compara com a resposta real da clínica e avalia; as avaliações voltam para o atendente. Visível só para a equipe Doctor Creator.</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs">Modo
          <select value={d?.modo ?? "desligado"} onChange={(e) => modo(e.target.value)} className="min-h-[32px] rounded-md border px-1.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <option value="desligado">Desligado</option>
            <option value="sombra">Sombra (escreve, não envia)</option>
          </select>
        </label>
      </div>
      {d && (d.aprovados < 3) && (
        <p className="rounded-md p-2 text-xs" style={{ background: "var(--surface-2)" }}>
          <b>Fatos de atendimento:</b> {d.aprovados} aprovado{d.aprovados === 1 ? "" : "s"}{d.propostos ? `, ${d.propostos} proposto${d.propostos === 1 ? "" : "s"} pelo agente a partir das respostas da secretária` : ""}. Sem endereço, horário, convênios e como agendar aprovados, o atendente só acolhe e passa para a equipe. <Link to="/admin/brain" className="font-semibold" style={{ color: "var(--accent)" }}>Aprovar no Brand Brain →</Link>
        </p>
      )}
      {rs.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-md p-2" style={{ background: "var(--surface-2)" }}><dt style={{ color: "var(--muted)" }}>Mensagens de paciente (7 dias)</dt><dd className="text-base font-semibold">{n.total}</dd></div>
          <div className="rounded-md p-2" style={{ background: "var(--surface-2)" }}><dt style={{ color: "var(--muted)" }}>Responderia sozinho</dt><dd className="text-base font-semibold">{n.total ? Math.round((100 * n.responderia) / n.total) : 0}%</dd></div>
          <div className="rounded-md p-2" style={{ background: "var(--surface-2)" }}><dt style={{ color: "var(--muted)" }}>Tempo da clínica hoje (mediana)</dt><dd className="text-base font-semibold">{duracao(n.medianaHumanoS)}</dd></div>
          <div className="rounded-md p-2" style={{ background: "var(--surface-2)" }}><dt style={{ color: "var(--muted)" }}>Clínica levou mais de 15 min</dt><dd className="text-base font-semibold">{n.demorou15} de {n.comTempo}</dd></div>
        </dl>
      )}
      {n.faltou.length > 0 && <p className="text-xs" style={{ color: "var(--ink-2)" }}><b>O que mais faltou saber:</b> {n.faltou.map(([k, v]) => `${k} (${v})`).join("; ")}.</p>}
      {q.isLoading ? null : rs.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>{d?.modo === "sombra" ? "Ligado. Os primeiros rascunhos aparecem na próxima leitura das conversas (a cada 20 minutos, das 7h às 21h)." : "Desligado. Ligue o modo sombra para começar o piloto nesta clínica."}</p>
      ) : (
        <ul className="space-y-2">
          {rs.slice(0, ver).map((r) => (
            <li key={r.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
                <span>{new Date(r.gatilho_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="font-semibold uppercase tracking-wide" style={{ color: r.acao === "responder" ? "var(--accent)" : r.acao === "descartado" ? "var(--crit)" : "var(--ink-2)" }}>{ACAO_ATENDENTE[r.acao] ?? r.acao}{r.risco ? ` · ${r.risco}` : ""}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-xs" style={{ color: "var(--ink-2)" }}><b>Paciente:</b> {r.gatilho_texto}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md p-2" style={{ background: "var(--surface-2)" }}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Atendente (em menos de 1 min)</div>
                  <p className="mt-0.5 whitespace-pre-line">{r.mensagem ?? "(sem texto)"}</p>
                  {(r.erro || r.motivo) && <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>{r.erro ? `Barrado: ${r.erro}` : r.motivo}</p>}
                </div>
                <div className="rounded-md p-2" style={{ background: "var(--surface-2)" }}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Clínica ({duracao(r.tempo_humano_s)})</div>
                  <p className="mt-0.5 whitespace-pre-line">{r.resposta_humana ?? "Ainda sem resposta."}</p>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button type="button" aria-pressed={r.avaliacao === "boa"} className="inline-flex min-h-[32px] items-center gap-1 text-xs" style={{ color: r.avaliacao === "boa" ? "var(--accent)" : "var(--muted)" }} onClick={() => avaliar(r, "boa")}><ThumbsUp size={13} aria-hidden /> Boa</button>
                <button type="button" aria-pressed={r.avaliacao === "ruim"} className="inline-flex min-h-[32px] items-center gap-1 text-xs" style={{ color: r.avaliacao === "ruim" ? "var(--crit)" : "var(--muted)" }} onClick={() => avaliar(r, "ruim")}><ThumbsDown size={13} aria-hidden /> Ruim</button>
                {r.avaliacao_motivo && <span className="text-[11px]" style={{ color: "var(--muted)" }}>“{r.avaliacao_motivo}”</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rs.length > ver && <button type="button" className="text-xs font-semibold" style={{ color: "var(--accent)" }} onClick={() => setVer(ver + 20)}>Ver mais</button>}
    </section>
  );
}

// ---------------------------------------------------------------- painel "Agentes de IA"

/** Um espaço de trabalho por problema, reutilizando as entregas e ações das telas de origem. */
export function PainelAgentes({ clientId, produto, selecionado, onSelecionar }: {
  clientId: string; produto: "hub" | "sap"; selecionado?: string; onSelecionar: (id: IdAgente, irParaEntregas?: boolean) => void;
}) {
  const { podeEditar } = useClientRole(clientId);
  const { isAdmin } = useAuth();
  const [verResultados, setVerResultados] = useState(false);
  const [verPiloto, setVerPiloto] = useState(false);
  return <div className="space-y-5">
    <CentroTrabalhoAgentes clientId={clientId} produto={produto} selecionado={selecionado} onSelecionar={onSelecionar} renderEntregas={(id) => {
      if (id === "conteudo") return <RoteirosProntos clientId={clientId} podeEditar={podeEditar} mostrarExecutar={false} />;
      if (id === "recuperacao" && produto === "hub") return <RecuperarHoje clientId={clientId} podeEditar={podeEditar} mostrarExecutar={false} />;
      if (id === "anuncios") return <GestorAnunciosIA clientId={clientId} podeEditar={podeEditar} mostrarExecutar={false} />;
      if (id === "campanhas") return <EstrategiasIA clientId={clientId} podeEditar={podeEditar} mostrarExecutar={false} />;
      return null;
    }} />
    <details className="agent-secondary-panel" onToggle={(e) => setVerResultados(e.currentTarget.open)}>
      <summary>Acompanhar indicadores e aprendizado da clínica</summary>
      {verResultados && <div className="space-y-4"><ProvaResultado clientId={clientId} />{produto === "hub" && <AprendizadosAgentes clientId={clientId} podeEditar={podeEditar} />}</div>}
    </details>
    {produto === "hub" && isAdmin && <details className="agent-secondary-panel" onToggle={(e) => setVerPiloto(e.currentTarget.open)}>
      <summary>Teste de atendimento: avaliar respostas sem enviar ao paciente</summary>
      {verPiloto && <AtendentePiloto clientId={clientId} />}
    </details>}
  </div>;
}
