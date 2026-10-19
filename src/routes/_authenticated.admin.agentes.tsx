import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Pause, Play, ShieldAlert, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  NOME_ESTADO, controlarExecucao, decidirAprovacao, excecoes, getCatalogoFluxos, getCentralAgentes, getPassos, iniciarFluxo, rodarAgentes,
  type AprovacaoAgente, type ExecucaoAgente, type FluxoCatalogo,
} from "@/lib/agentes-data";

// Central de Agentes: o cockpit de quem orquestra. A primeira coisa na tela é o que precisa de uma pessoa agora
// (aprovações e falhas); depois as execuções. Cada botão chama uma função real do banco ou o servidor.
export const Route = createFileRoute("/_authenticated/admin/agentes")({
  component: CentralAgentes,
});

const caixa = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const dim = { color: "var(--text-dim)" } as const;
const usd = (v: number) => `US$ ${v.toFixed(v < 1 ? 4 : 2)}`;
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function CentralAgentes() {
  const qc = useQueryClient();
  const central = useQuery({ queryKey: ["central-agentes"], queryFn: getCentralAgentes, refetchInterval: 15_000 });
  const catalogo = useQuery({ queryKey: ["catalogo-fluxos"], queryFn: getCatalogoFluxos, staleTime: 600_000 });
  const clinicas = useQuery({
    queryKey: ["central-clinicas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sap_clinicas").select("client_id, nome").not("client_id", "is", null).order("nome");
      if (error) throw error;
      return (data ?? []) as { client_id: string; nome: string }[];
    },
  });
  const clientes = useQuery({ queryKey: ["central-clientes"], queryFn: async () => {
    const { data, error } = await supabase.from("clients").select("id, name");
    if (error) throw error;
    return data ?? [];
  } });
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["central-agentes"] });
  const rodar = useMutation({
    mutationFn: (id?: string) => rodarAgentes(id),
    onSuccess: recarregar,
    onError: (e: Error) => setErro(e.message),
  });

  const nomeCliente = useMemo(() => new Map([...(clientes.data ?? []).map((c) => [c.id, c.name] as const), ...(clinicas.data ?? []).map((c) => [c.client_id, c.nome] as const)]), [clinicas.data, clientes.data]);
  const fluxoPorId = useMemo(() => new Map((catalogo.data ?? []).map((f) => [f.id, f])), [catalogo.data]);
  const dados = central.data;
  const fila = dados ? excecoes(dados.execucoes, dados.aprovacoes) : [];
  const ativas = (dados?.execucoes ?? []).filter((e) => !["concluida", "cancelada"].includes(e.estado));
  const encerradas = (dados?.execucoes ?? []).filter((e) => ["concluida", "cancelada"].includes(e.estado));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm" style={dim}>
          O que os agentes estão fazendo e o que precisa de você. Mensagem para clínica, marcação no cronograma e qualquer ação de risco
          só acontecem depois da sua aprovação.
        </p>
      </header>

      {erro && (
        <div role="alert" className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--danger, #c0392b)" }}>
          {erro} <button type="button" className="ml-2 underline" onClick={() => setErro(null)}>fechar</button>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Resumo">
        <Numero rotulo="Precisam de você" valor={dados ? String(fila.length) : "…"} destaque={fila.length > 0} />
        <Numero rotulo="Em andamento" valor={dados ? String(ativas.filter((e) => !["falhou", "pausada"].includes(e.estado)).length) : "…"} />
        <Numero rotulo="Concluídas" valor={dados ? String(encerradas.filter((e) => e.estado === "concluida").length) : "…"} />
        <Numero rotulo="Custo de IA no mês" valor={dados ? usd(dados.custoMes) : "…"} nota={dados ? `${dados.chamadasMes} chamada(s)${dados.falhasIaMes ? `, ${dados.falhasIaMes} com erro` : ""} · estimativa` : undefined} />
      </section>

      <section aria-labelledby="t-fila" className="space-y-3">
        <h2 id="t-fila" className="text-base font-semibold">Precisa de você agora</h2>
        {central.isLoading && <p className="text-sm" style={dim}>Carregando…</p>}
        {dados && fila.length === 0 && <p className="rounded-xl border p-4 text-sm" style={caixa}>Nada pendente. Os agentes não estão esperando nenhuma decisão.</p>}
        {dados && fila.map((f) => {
          if (f.tipo === "aprovacao") {
            const a = dados.aprovacoes.find((x) => x.id === f.id)!;
            return <CardAprovacao key={a.id} a={a} cliente={nomeCliente.get(a.client_id) ?? `Clínica ${a.client_id.slice(0, 8)}`} aoDecidir={async (id) => { await recarregar(); rodar.mutate(id); }} onErro={setErro} />;
          }
          const e = dados.execucoes.find((x) => x.id === f.id)!;
          return (
            <div key={e.id} className="rounded-xl border p-4 text-sm" style={caixa}>
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} aria-hidden /> {f.tipo === "falha" ? "Falhou" : f.tipo === "configuracao" ? "Configuração pendente" : "Pausada pelo teto de custo"}: {fluxoPorId.get(e.fluxo)?.nome ?? e.fluxo} · {nomeCliente.get(e.client_id) ?? `Clínica ${e.client_id.slice(0, 8)}`}</p>
              <p className="mt-1" style={dim}>{e.erro}</p>
            </div>
          );
        })}
      </section>

      <IniciarServico catalogo={catalogo.data ?? []} clinicas={clinicas.data ?? []} aoIniciar={(id) => { recarregar(); rodar.mutate(id); }} onErro={setErro} />

      <section aria-labelledby="t-exec" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="t-exec" className="text-base font-semibold">Execuções</h2>
          <button type="button" onClick={() => rodar.mutate(undefined)} disabled={rodar.isPending} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold" style={caixa}>
            {rodar.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />} Rodar a fila agora
          </button>
        </div>
        {dados && dados.execucoes.length === 0 && <p className="text-sm" style={dim}>Nenhuma execução ainda. Inicie um serviço acima.</p>}
        {[...ativas, ...encerradas].map((e) => (
          <LinhaExecucao key={e.id} e={e} fluxo={fluxoPorId.get(e.fluxo)} cliente={nomeCliente.get(e.client_id) ?? `Clínica ${e.client_id.slice(0, 8)}`} rodando={rodar.isPending && rodar.variables === e.id}
            aoRodar={() => rodar.mutate(e.id)} aoControlar={async (acao) => { try { await controlarExecucao(e.id, acao); recarregar(); } catch (x) { setErro((x as Error).message); } }} />
        ))}
      </section>
    </div>
  );
}

function Numero({ rotulo, valor, nota, destaque }: { rotulo: string; valor: string; nota?: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl border p-3" style={{ ...caixa, ...(destaque ? { borderColor: "var(--accent)" } : {}) }}>
      <p className="text-xs" style={dim}>{rotulo}</p>
      <p className="mt-1 text-lg font-bold">{valor}</p>
      {nota && <p className="text-xs" style={dim}>{nota}</p>}
    </div>
  );
}

function CardAprovacao({ a, cliente, aoDecidir, onErro }: { a: AprovacaoAgente; cliente: string; aoDecidir: (execucaoId: string) => void; onErro: (m: string) => void }) {
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const mensagem = typeof a.proposta.mensagem === "string" ? a.proposta.mensagem : null;
  const evidencia = typeof a.proposta.evidencia === "string" ? a.proposta.evidencia : null;
  async function decidir(d: "aprovada" | "rejeitada" | "correcao") {
    if (d !== "aprovada" && !comentario.trim()) { onErro("Escreva o motivo para rejeitar ou o que corrigir."); return; }
    setEnviando(true);
    try { await decidirAprovacao(a.id, d, comentario); aoDecidir(a.execucao_id); }
    catch (e) { onErro((e as Error).message); }
    finally { setEnviando(false); }
  }
  return (
    <article className="rounded-xl border p-4 text-sm" style={{ ...caixa, borderColor: a.risco === "alto" ? "var(--danger, #c0392b)" : "var(--accent)" }}>
      <p className="flex items-center gap-2 font-semibold">
        <ShieldAlert size={16} aria-hidden /> Aprovação · risco {a.risco === "alto" ? "alto" : "médio"} · {cliente}
      </p>
      <p className="mt-1">{a.resumo}</p>
      {mensagem && (
        <div className="mt-2">
          <p className="text-xs font-semibold" style={dim}>Mensagem proposta {typeof a.proposta.origem === "string" ? `(${a.proposta.origem})` : ""}</p>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg border p-3 font-sans" style={{ borderColor: "var(--border)" }}>{mensagem}</pre>
        </div>
      )}
      {evidencia && <p className="mt-2"><span className="font-semibold">Evidência:</span> {evidencia}</p>}
      {Array.isArray(a.evidencias) && a.evidencias.length > 0 && (
        <details className="mt-2"><summary className="cursor-pointer text-xs" style={dim}>Ver a base ({a.evidencias.length} item(ns))</summary>
          <ul className="mt-1 list-disc pl-5 text-xs">{a.evidencias.map((ev, i) => <li key={i}>{Object.values(ev as Record<string, unknown>).filter(Boolean).join(" · ")}</li>)}</ul>
        </details>
      )}
      <label className="mt-3 block text-xs" style={dim}>Comentário (obrigatório para corrigir ou rejeitar)
        <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border p-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={enviando} onClick={() => decidir("aprovada")} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold text-white" style={{ background: "var(--accent)" }}><CheckCircle2 size={14} aria-hidden /> Aprovar</button>
        <button type="button" disabled={enviando} onClick={() => decidir("correcao")} className="rounded-lg border px-3 py-1.5 font-semibold" style={{ borderColor: "var(--border)" }}>Pedir correção</button>
        <button type="button" disabled={enviando} onClick={() => decidir("rejeitada")} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-semibold" style={{ borderColor: "var(--border)" }}><XCircle size={14} aria-hidden /> Rejeitar</button>
      </div>
    </article>
  );
}

function IniciarServico({ catalogo, clinicas, aoIniciar, onErro }: { catalogo: FluxoCatalogo[]; clinicas: { client_id: string; nome: string }[]; aoIniciar: (id: string) => void; onErro: (m: string) => void }) {
  const [cliente, setCliente] = useState("");
  const [fluxo, setFluxo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const f = catalogo.find((x) => x.id === fluxo);
  return (
    <section aria-labelledby="t-iniciar" className="rounded-xl border p-4 text-sm" style={caixa}>
      <h2 id="t-iniciar" className="text-base font-semibold">Iniciar um serviço</h2>
      <p className="mt-1 text-xs" style={dim}>O Brand Brain não começa aqui: atualize na própria tela Brand Brain. Esta Central só mostra o registro técnico de cada leitura.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs" style={dim}>Clínica (SAP)
          <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="mt-1 block max-w-full rounded-lg border p-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <option value="">Escolha</option>
            {clinicas.map((c) => <option key={c.client_id} value={c.client_id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="text-xs" style={dim}>Serviço
          <select value={fluxo} onChange={(e) => setFluxo(e.target.value)} className="mt-1 block max-w-full rounded-lg border p-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <option value="">Escolha</option>
            {catalogo.filter((x) => x.id !== "brain_carga").map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </label>
        <button type="button" disabled={!cliente || !f || enviando} className="rounded-lg px-3 py-2 font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}
          onClick={async () => { setEnviando(true); try { aoIniciar(await iniciarFluxo(cliente, f!)); } catch (e) { onErro((e as Error).message); } finally { setEnviando(false); } }}>
          Iniciar
        </button>
      </div>
      {f && (
        <div className="mt-3">
          <p>{f.objetivo}</p>
          <ol className="mt-1 list-decimal pl-5 text-xs" style={dim}>
            {f.passos.map((p) => <li key={p.nome}>{p.descricao}{p.risco !== "baixo" ? ` · aprovação (risco ${p.risco === "alto" ? "alto" : "médio"})` : ""}</li>)}
          </ol>
        </div>
      )}
    </section>
  );
}

function LinhaExecucao({ e, fluxo, cliente, rodando, aoRodar, aoControlar }: {
  e: ExecucaoAgente; fluxo?: FluxoCatalogo; cliente: string; rodando: boolean; aoRodar: () => void; aoControlar: (a: "pausar" | "retomar" | "cancelar") => void;
}) {
  const [aberta, setAberta] = useState(false);
  const passos = useQuery({ queryKey: ["agente-passos", e.id, e.atualizado_em], queryFn: () => getPassos(e.id), enabled: aberta });
  const passoAtual = fluxo?.passos[e.passo_atual];
  const encerrada = ["concluida", "falhou", "cancelada"].includes(e.estado);
  return (
    <article className="rounded-xl border p-3 text-sm" style={caixa}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setAberta(!aberta)} className="flex items-center gap-1.5 text-left font-semibold" aria-expanded={aberta}>
          {aberta ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />} {fluxo?.nome ?? e.fluxo} · {cliente}
        </button>
        <span className="text-xs font-semibold">{NOME_ESTADO[e.estado]}</span>
      </div>
      <p className="mt-1 text-xs" style={dim}>
        {encerrada ? `Encerrada ${quando(e.encerrado_em)}` : `Passo: ${passoAtual?.descricao ?? "—"}`}
        {e.estado === "aguardando" && e.proximo_em ? ` · volta ${quando(e.proximo_em)}` : ""} · custo {usd(Number(e.custo_usd))} · atualizada {quando(e.atualizado_em)}
      </p>
      {e.erro && <p className="mt-1 text-xs">{e.erro}</p>}
      {!encerrada && (
        <div className="mt-2 flex flex-wrap gap-2">
          {["pendente", "aguardando"].includes(e.estado) && (
            <button type="button" onClick={aoRodar} disabled={rodando} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: "var(--border)" }}>
              {rodando ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Play size={12} aria-hidden />} Rodar agora
            </button>
          )}
          {e.estado !== "pausada" && <button type="button" onClick={() => aoControlar("pausar")} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs" style={{ borderColor: "var(--border)" }}><Pause size={12} aria-hidden /> Pausar</button>}
          {e.estado === "pausada" && <button type="button" onClick={() => aoControlar("retomar")} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs" style={{ borderColor: "var(--border)" }}><Play size={12} aria-hidden /> Retomar</button>}
          <button type="button" onClick={() => { if (confirm("Cancelar esta execução? As aprovações pendentes serão descartadas.")) aoControlar("cancelar"); }} className="rounded-lg border px-2.5 py-1 text-xs" style={{ borderColor: "var(--border)" }}>Cancelar</button>
        </div>
      )}
      {aberta && (
        <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-semibold">Registro de passos</p>
          {passos.isLoading && <p className="text-xs" style={dim}>Carregando…</p>}
          {passos.data?.length === 0 && <p className="text-xs" style={dim}>Nenhum passo rodou ainda.</p>}
          <ol className="mt-1 space-y-1 text-xs">
            {(passos.data ?? []).map((p) => (
              <li key={p.id} className="rounded-md border p-2" style={{ borderColor: "var(--border)" }}>
                <span className="font-semibold">{p.ok === false ? "✗" : "✓"} {fluxo?.passos.find((x) => x.nome === p.nome)?.descricao ?? p.nome}</span>
                <span style={dim}> · {quando(p.criado_em)}{p.ferramenta ? ` · ${p.ferramenta}` : ""}{p.ms != null ? ` · ${(p.ms / 1000).toFixed(1)}s` : ""}{Number(p.custo_usd) ? ` · ${usd(Number(p.custo_usd))}` : ""}</span>
                {p.erro && <p className="mt-0.5">{p.erro}</p>}
                {p.saida != null && <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-words" style={dim}>{JSON.stringify(p.saida)}</pre>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}
