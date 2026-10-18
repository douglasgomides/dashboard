// Sistema agêntico na tela: o painel "Agentes de IA" (Hub e SAP) e o que cada agente preparou, na tela onde a pessoa
// trabalha (Recuperação no WhatsApp, Gestor de anúncios em Anúncios, Roteirista em Ideias). Os agentes rodam sozinhos
// no horário (src/lib/agentes-catalogo.ts); o resultado da recuperação é medido sozinho pelas conversas e pelo CRM.
// Marcar à mão é atalho, não obrigação. Nada é enviado, publicado ou alterado em anúncio pelo painel.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Brain, CalendarPlus, CheckCircle2, ChevronDown, Loader2, MessageCircle, Play, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { rodarFluxoAteFim } from "@/lib/agentes-data";
import { AGENTES, type AgenteCatalogo, type IdAgente } from "@/lib/agentes-catalogo";
import { pecaParaTexto, type CopyAnuncio, type PecaConteudo } from "@/lib/agentes-sugestoes";
import { usePautas } from "@/components/planejador-conteudo";
import { BotaoCopiar } from "@/components/botao-copiar";

const db = supabase as any;
type Estado = "proposta" | "feita" | "descartada";
interface Sugestao {
  id: string; agente: "recuperacao" | "anuncios" | "conteudo"; tipo: string; titulo: string; detalhe: string | null; evidencias: string[]; brain: string[];
  conteudo: any; mensagem: string | null; conversa_id: string | null; campanha_id: string | null; prioridade: number; estado: Estado;
  resultado: string | null; medido_em: string | null; criado_em: string;
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
      return (data ?? []) as Sugestao[];
    },
  });
}

function useDecidir(clientId: string, ag: string) {
  const qc = useQueryClient();
  return async (id: string, estado: Estado, resultado?: string) => {
    const { error } = await db.rpc("sugestao_decidir", { p_id: id, p_estado: estado, p_resultado: resultado ?? null });
    await qc.invalidateQueries({ queryKey: ["sugestoes-agentes", clientId, ag] });
    if (error) throw error;
  };
}

/** Cabeçalho comum: quem é o agente, quando roda, quando entregou, e "Rodar agora" para a equipe. */
function Cabecalho({ a, clientId, ultima, aoTerminar }: { a: AgenteCatalogo; clientId: string; ultima: string | null; aoTerminar: () => void }) {
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
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>{a.entrega}</p>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>Roda sozinho: {a.frequencia.toLowerCase()}{ultima ? ` · última entrega ${ha(ultima)}` : ""} · {a.quemAprova}</p>
        {andando && <p className="mt-1 text-xs" style={{ color: "var(--muted)" }} aria-live="polite">{andando}</p>}
        {erro && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{erro}</p>}
      </div>
      {isAdmin && (
        <button type="button" className="btn inline-flex items-center gap-1.5" disabled={!!andando} onClick={rodar} title="Rodar este agente agora para esta clínica">
          {andando ? <Loader2 size={14} aria-hidden className="animate-spin" /> : <Play size={14} aria-hidden />} {andando ? "Rodando…" : "Rodar agora"}
        </button>
      )}
    </div>
  );
}

function Acoes({ s, podeEditar, decidir, extra }: { s: Sugestao; podeEditar: boolean; decidir: (e: Estado) => Promise<void>; extra?: React.ReactNode }) {
  const [salvando, setSalvando] = useState(false);
  const ir = async (e: Estado) => { setSalvando(true); try { await decidir(e); } finally { setSalvando(false); } };
  if (!podeEditar) return extra ? <div className="mt-2 flex flex-wrap gap-2">{extra}</div> : null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {extra}
      {s.estado === "proposta" ? (
        <>
          <button type="button" className="btn inline-flex items-center gap-1" disabled={salvando} onClick={() => ir("feita")}><CheckCircle2 size={14} aria-hidden /> Feito</button>
          <button type="button" className="inline-flex min-h-[36px] items-center gap-1 px-2 text-xs" style={{ color: "var(--muted)" }} disabled={salvando} onClick={() => ir("descartada")}><XCircle size={14} aria-hidden /> Descartar</button>
        </>
      ) : (
        <button type="button" className="inline-flex min-h-[36px] items-center px-2 text-xs" style={{ color: "var(--muted)" }} disabled={salvando} onClick={() => ir("proposta")}>Desfazer</button>
      )}
    </div>
  );
}

const RESULTADO: Record<string, string> = { enviada: "Mensagem enviada", respondeu: "Paciente respondeu", agendou: "Agendou" };

function Lista({ itens, render, vazio }: { itens: Sugestao[]; render: (s: Sugestao) => React.ReactNode; vazio: string }) {
  const [verTodas, setVerTodas] = useState(false);
  const abertas = itens.filter((s) => s.estado === "proposta");
  const outras = itens.filter((s) => s.estado !== "proposta");
  const visiveis = verTodas ? [...abertas, ...outras] : abertas;
  return (
    <>
      {visiveis.length === 0 ? <p className="text-sm" style={{ color: "var(--ink-2)" }}>{vazio}</p> : <div className="grid gap-3 lg:grid-cols-2">{visiveis.map(render)}</div>}
      {outras.length > 0 && <button type="button" className="self-start text-xs font-semibold" style={{ color: "var(--accent)" }} onClick={() => setVerTodas(!verTodas)}>{verTodas ? "Esconder as feitas e descartadas" : `Ver ${outras.length} feita${outras.length === 1 ? "" : "s"} ou descartada${outras.length === 1 ? "" : "s"}`}</button>}
    </>
  );
}

const cartao = (s: Sugestao) => ({ background: "var(--surface)", borderColor: "var(--border)", borderLeft: "3px solid var(--accent)", opacity: s.estado === "descartada" ? 0.55 : 1 });
const Secao = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <section id={id} aria-label={AGENTES.find((a) => id === `ag-${a.id}`)?.nome} className="flex flex-col gap-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>{children}</section>
);

// ---------------------------------------------------------------- Recuperação de pacientes

export function RecuperarHoje({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const { isAdmin } = useAuth();
  const q = useSugestoes(clientId, "recuperacao");
  const decidir = useDecidir(clientId, "recuperacao");
  const a = agente("recuperacao");
  const itens = q.data ?? [];
  const medidas = itens.filter((s) => s.resultado);
  const resp = medidas.filter((s) => s.resultado === "respondeu" || s.resultado === "agendou").length;
  const agendou = medidas.filter((s) => s.resultado === "agendou").length;
  return (
    <Secao id="ag-recuperacao">
            <Cabecalho a={a} clientId={clientId} ultima={itens[0]?.criado_em ?? null} aoTerminar={() => q.refetch()} />
      {medidas.length > 0 && <p className="text-xs" style={{ color: "var(--ink-2)" }}>Últimos 14 dias, medido sozinho pelas conversas e pelo CRM: {medidas.length} mensagens enviadas, {resp} responderam, {agendou} agendaram.</p>}
      <Lista itens={itens} vazio="Ninguém para recuperar agora. O agente olha de novo amanhã cedo." render={(s) => {
        const nome = primeiro(s.conversa?.pessoa?.nome);
        const msg = (s.mensagem ?? "").replace(/\[nome\]/gi, nome || "[nome]");
        return (
          <article key={s.id} className="flex flex-col rounded-xl border p-3" style={cartao(s)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{s.conversa?.pessoa?.nome || "Sem nome"}{s.conversa?.canal ? <span className="font-normal" style={{ color: "var(--muted)" }}> · {s.conversa.canal}</span> : null}</span>
              {s.resultado && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--surface-2)", color: s.resultado === "agendou" ? "var(--ok, var(--accent))" : "var(--ink-2)" }}>{RESULTADO[s.resultado] ?? s.resultado}</span>}
            </div>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>{s.titulo}</p>
            <p className="mt-2 rounded-lg p-2.5 text-sm leading-relaxed" style={{ background: "var(--surface-2)" }}>{msg}</p>
            {s.detalhe && <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>Por quê: {s.detalhe}</p>}
            <Acoes s={s} podeEditar={podeEditar} decidir={(e) => decidir(s.id, e)} extra={<>
              <BotaoCopiar texto={msg} rotulo="Copiar mensagem" />
              {s.conversa_id && isAdmin && <Link to="/$clientId/atendimento" params={{ clientId }} search={{ aba: "conversas", conversa: s.conversa_id } as never} className="inline-flex min-h-[36px] items-center gap-1 px-2 text-xs font-semibold" style={{ color: "var(--accent)" }}><MessageCircle size={14} aria-hidden /> Ver conversa</Link>}
            </>} />
          </article>
        );
      }} />
    </Secao>
  );
}

// ---------------------------------------------------------------- Gestor de anúncios

const ROTULO_SINAL: Record<string, string> = { sem_resultado: "Gastando sem resultado", custo_subiu: "Custo subiu", fadiga: "Criativo cansado", escalar: "Pode escalar" };

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

export function GestorAnunciosIA({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const q = useSugestoes(clientId, "anuncios", 10);
  const decidir = useDecidir(clientId, "anuncios");
  const a = agente("anuncios");
  const itens = q.data ?? [];
  return (
    <Secao id="ag-anuncios">
      <Cabecalho a={a} clientId={clientId} ultima={itens[0]?.criado_em ?? null} aoTerminar={() => q.refetch()} />
      <Lista itens={itens} vazio="Nenhuma campanha fora do normal. O agente olha a conta de novo amanhã cedo." render={(s) => <CartaoAnuncio key={s.id} s={s} podeEditar={podeEditar} decidir={(e) => decidir(s.id, e)} />} />
    </Secao>
  );
}

function CartaoAnuncio({ s, podeEditar, decidir }: { s: Sugestao; podeEditar: boolean; decidir: (e: Estado) => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const passos: string[] = s.conteudo?.passos ?? [];
  const copies: CopyAnuncio[] = s.conteudo?.copies ?? [];
  return (
    <article className="flex flex-col rounded-xl border p-3" style={cartao(s)}>
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: s.tipo === "escalar" ? "var(--accent)" : "var(--warn)" }}>{ROTULO_SINAL[s.tipo] ?? s.tipo}</span>
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
      <Acoes s={s} podeEditar={podeEditar} decidir={decidir} />
    </article>
  );
}

// ---------------------------------------------------------------- Roteirista de conteúdo

export function RoteirosProntos({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const q = useSugestoes(clientId, "conteudo", 21);
  const decidir = useDecidir(clientId, "conteudo");
  const pautas = usePautas(clientId);
  const a = agente("conteudo");
  const itens = q.data ?? [];
  const noPlanejador = new Set((pautas.q.data?.pautas ?? []).map((p) => p.ideia_id));
  function levar(s: Sugestao) {
    const p = s.conteudo as PecaConteudo;
    pautas.criar.mutate({
      client_id: clientId, ideia_id: `agente:${s.id}`, titulo: p.titulo, formato: p.formato, objetivo: p.objetivo, status: "escolhida",
      motivo: p.por_que || null, origem_tipo: "dado", origem_texto: p.evidencias.join(" · ") || null, gancho: p.gancho,
      roteiro: p.formato === "reels" ? p.cenas.map((c) => `${c.fala}${c.tela ? ` [tela: ${c.tela}]` : ""}${c.visual ? ` (imagem: ${c.visual})` : ""}`) : p.slides.map((sl, n) => `Slide ${n + 1}: ${sl.titulo}${sl.texto ? `. ${sl.texto}` : ""}`),
      cta: p.cta, aviso: null, dia: null, post_id: null,
    }, { onSuccess: () => decidir(s.id, "feita") });
  }
  return (
    <Secao id="ag-conteudo">
      <Cabecalho a={a} clientId={clientId} ultima={itens[0]?.criado_em ?? null} aoTerminar={() => q.refetch()} />
      <Lista itens={itens} vazio="Nenhum roteiro aberto. O agente entrega a próxima semana na segunda-feira." render={(s) => (
        <CartaoPeca key={s.id} s={s} podeEditar={podeEditar} decidir={(e) => decidir(s.id, e)} levar={podeEditar && !noPlanejador.has(`agente:${s.id}`) ? () => levar(s) : undefined} />
      )} />
    </Secao>
  );
}

function CartaoPeca({ s, podeEditar, decidir, levar }: { s: Sugestao; podeEditar: boolean; decidir: (e: Estado) => Promise<void>; levar?: () => void }) {
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
        {levar && <button type="button" className="btn inline-flex items-center gap-1" onClick={levar}><CalendarPlus size={14} aria-hidden /> Levar ao planejador</button>}
      </>} />
    </article>
  );
}

// ---------------------------------------------------------------- painel "Agentes de IA"

/** Uma linha por agente: o que faz, quando roda, o que está esperando a equipe e onde abrir. */
export function PainelAgentes({ clientId, produto }: { clientId: string; produto: "hub" | "sap" }) {
  const q = useQuery({
    queryKey: ["painel-agentes", clientId],
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [sug, camp, brain] = await Promise.all([
        db.from("sugestoes_agentes").select("agente, estado, resultado, criado_em").eq("client_id", clientId).gte("criado_em", desde).limit(2000),
        db.from("campanhas_ideias").select("estado, criado_em").eq("client_id", clientId).gte("criado_em", desde).limit(500),
        db.from("brain_itens").select("estado, criado_em").eq("client_id", clientId).gte("criado_em", desde).limit(500),
      ]);
      const por: Record<string, { abertas: number; feitas: number; ultima: string | null; nota?: string }> = {};
      const soma = (id: string, aberta: boolean, feita: boolean, em: string) => {
        const p = (por[id] ??= { abertas: 0, feitas: 0, ultima: null });
        if (aberta) p.abertas++; if (feita) p.feitas++;
        if (!p.ultima || em > p.ultima) p.ultima = em;
      };
      for (const s of (sug.data ?? []) as { agente: string; estado: string; resultado: string | null; criado_em: string }[]) soma(s.agente, s.estado === "proposta", s.estado === "feita", s.criado_em);
      for (const c of (camp.data ?? []) as { estado: string; criado_em: string }[]) soma("campanhas", c.estado === "proposta", ["aprovada", "em_andamento", "concluida"].includes(c.estado), c.criado_em);
      for (const b of (brain.data ?? []) as { estado: string; criado_em: string }[]) soma("brain", b.estado === "proposto", b.estado === "aprovado", b.criado_em);
      const rec = ((sug.data ?? []) as { agente: string; resultado: string | null }[]).filter((s) => s.agente === "recuperacao" && s.resultado);
      if (rec.length) (por.recuperacao ??= { abertas: 0, feitas: 0, ultima: null }).nota = `${rec.filter((s) => s.resultado === "respondeu" || s.resultado === "agendou").length} responderam e ${rec.filter((s) => s.resultado === "agendou").length} agendaram (30 dias, medido sozinho)`;
      return por;
    },
  });
  const lista = AGENTES.filter((a) => produto === "hub" || a.ondeSap);
  return (
    <div className="space-y-3">
      <div className="hpagehead">
        <h2>Agentes de IA</h2>
        <p>Cada agente trabalha sozinho no horário: puxa os dados, a IA pensa a partir do Brand Brain e prepara o trabalho. A equipe só revisa e executa. Cada um aprende com o resultado do que propôs antes. Nenhum agente envia mensagem a paciente, publica, mexe em anúncio ou toma decisão clínica.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {lista.map((a) => {
          const p = q.data?.[a.id];
          const destino = produto === "sap" ? a.ondeSap : a.ondeHub;
          const rota = destino?.startsWith("/") ? destino : produto === "sap" ? `/sap/${clientId}/${destino}` : `/${clientId}/${destino}`;
          return (
            <article key={a.id} className="flex flex-col rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-[15px] font-semibold"><Bot size={16} aria-hidden style={{ color: "var(--accent)" }} /> {a.nome}</h3>
                {p?.abertas ? <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent, #fff)" }}>{p.abertas} para revisar</span> : null}
              </div>
              <p className="mt-0.5 text-xs italic" style={{ color: "var(--muted)" }}>{a.papel}</p>
              <dl className="mt-2 space-y-1 text-xs" style={{ color: "var(--ink-2)" }}>
                <div><dt className="inline font-semibold">Lê: </dt><dd className="inline">{a.le}</dd></div>
                <div><dt className="inline font-semibold">Entrega: </dt><dd className="inline">{a.entrega}</dd></div>
                <div><dt className="inline font-semibold">Quando: </dt><dd className="inline">{a.frequencia}{p?.ultima ? ` · última entrega ${ha(p.ultima)}` : " · ainda sem entrega"}</dd></div>
                <div><dt className="inline font-semibold">Quem aprova: </dt><dd className="inline">{a.quemAprova}</dd></div>
                {p?.nota && <div><dt className="inline font-semibold">Resultado: </dt><dd className="inline">{p.nota}</dd></div>}
              </dl>
              <a href={rota} className="mt-2 self-start text-xs font-semibold" style={{ color: "var(--accent)" }}>Abrir →</a>
            </article>
          );
        })}
      </div>
    </div>
  );
}
