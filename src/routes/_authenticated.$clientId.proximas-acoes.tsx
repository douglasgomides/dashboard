import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAdsDiagnosticoPorObjetivo, getPostsForAnalytics, getComentariosVozDoPaciente, getAcompanhamentos, salvarAcompanhamento } from "@/lib/client-data";
import { resolveDateRange } from "@/lib/date-range";
import { analisarVozDoPaciente } from "@/lib/voz-do-paciente";
import { resumirAtendimento } from "@/lib/conversa-leitura";
import type { Acompanhamento, Status } from "@/lib/oportunidades";
import type { Responsavel } from "@/lib/insight";
import { useQualidadeDados } from "@/components/qualidade-dados";
import { useLeituraConversas } from "@/components/atendimento-resumo";
import { useClientRole } from "@/hooks/use-client-role";
import {
  montarProximasAcoes, statusDoBanco, STATUS_PARA_BANCO, ROTULO_SEVERIDADE, ROTULO_CATEGORIA, ROTULO_DONO, ROTULO_STATUS_ACAO,
  type ProximaAcao, type Severidade, type StatusAcao, type Categoria, type Dono,
} from "@/lib/proximas-acoes";

export const Route = createFileRoute("/_authenticated/$clientId/proximas-acoes")({
  component: ProximasAcoesPage,
});

const layout = getRouteApi("/_authenticated/$clientId");
const COR_SEV: Record<Severidade, string> = { alta: "var(--crit)", media: "var(--warn)", baixa: "var(--accent)" };
const DONO_PARA_RESP: Record<Dono, Responsavel> = { doctor_creator: "equipe_hub", cliente: "medico", trafego: "gestor_trafego", conteudo: "social_media", atendimento: "atendimento" };
const PREFIXO = "pa:"; // id na tabela acoes_acompanhamento (a mesma das Oportunidades)

type FiltroStatus = "abertas" | StatusAcao | "todas";

function Chip({ ativo, onClick, children, cor }: { ativo: boolean; onClick: () => void; children: React.ReactNode; cor?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className="min-h-[36px] rounded-full border px-3 text-sm"
      style={{ borderColor: ativo ? cor ?? "var(--accent)" : "var(--border)", background: ativo ? `color-mix(in srgb, ${cor ?? "var(--accent)"} 12%, var(--surface))` : "var(--surface)", fontWeight: ativo ? 600 : 400 }}
    >
      {children}
    </button>
  );
}

function CartaoAcao({ a, status, podeEditar, salvando, onStatus, clientId }: { a: ProximaAcao; status: StatusAcao; podeEditar: boolean; salvando: boolean; onStatus: (s: StatusAcao) => void; clientId: string }) {
  const externo = a.rota?.startsWith("http");
  return (
    <li className="rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", borderLeft: `4px solid ${COR_SEV[a.severidade]}`, opacity: status === "resolvido" || status === "ignorado" ? 0.7 : 1 }}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: `color-mix(in srgb, ${COR_SEV[a.severidade]} 15%, transparent)`, color: COR_SEV[a.severidade] }}>
          {ROTULO_SEVERIDADE[a.severidade]}
        </span>
        <span className="rounded-full px-2 py-0.5" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>{ROTULO_CATEGORIA[a.categoria]}</span>
        <span style={{ color: "var(--text-dim)" }}>· {ROTULO_DONO[a.responsavel]}</span>
        <span className="ml-auto">
          {podeEditar ? (
            <label className="inline-flex items-center gap-1">
              <span className="sr-only">Status</span>
              {salvando && <Loader2 size={12} className="animate-spin" aria-hidden />}
              <select
                value={status}
                onChange={(e) => onStatus(e.target.value as StatusAcao)}
                className="rounded-md border px-1.5 py-0.5 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                {(Object.keys(ROTULO_STATUS_ACAO) as StatusAcao[]).map((s) => <option key={s} value={s}>{ROTULO_STATUS_ACAO[s]}</option>)}
              </select>
            </label>
          ) : (
            <span className="rounded-full px-2 py-0.5" style={{ background: "var(--surface-2)" }}>{ROTULO_STATUS_ACAO[status]}</span>
          )}
        </span>
      </div>
      <p className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>{a.recomendacao}</p>
      <dl className="mt-1.5 space-y-1 text-sm" style={{ color: "var(--ink-2)" }}>
        <div><dt className="inline font-medium" style={{ color: "var(--ink)" }}>Por que importa: </dt><dd className="inline">{a.porque}</dd></div>
        <div><dt className="inline font-medium" style={{ color: "var(--ink)" }}>Impacto esperado: </dt><dd className="inline">{a.impacto}</dd></div>
      </dl>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
        <span>{a.evidencia}</span>
        {a.rota &&
          (externo ? (
            <a href={a.rota} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--accent)" }}>
              Abrir <ExternalLink size={12} aria-hidden />
            </a>
          ) : (
            <Link to={a.rota as any} params={{ clientId } as any} className="font-semibold" style={{ color: "var(--accent)" }}>
              Ver dados →
            </Link>
          ))}
      </div>
    </li>
  );
}

// Central de Próximas Ações: tudo o que o painel encontrou, virado em tarefa priorizada.
function ProximasAcoesPage() {
  const { clientId } = Route.useParams();
  const { start, end } = resolveDateRange(layout.useSearch());
  const { podeEditar } = useClientRole(clientId);
  const qc = useQueryClient();
  const opts = { staleTime: 5 * 60_000, retry: false } as const;

  // Cada fonte é lida em paralelo; uma que falhar não derruba as outras.
  const problemas = useQualidadeDados(clientId);
  const ads = useQuery({ queryKey: ["ads-diag-objetivo", clientId, start, end], queryFn: () => getAdsDiagnosticoPorObjetivo(clientId, start, end), ...opts });
  const qualidadeLeads = useQuery({
    queryKey: ["qualidade-leads-campanha", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("qualidade_leads_campanha", { p_client: clientId, p_de: start, p_ate: end.slice(0, 10) });
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as any;
    },
    ...opts,
  });
  const posts = useQuery({ queryKey: ["posts-analytics", clientId, start, end], queryFn: () => getPostsForAnalytics(clientId, start, end), ...opts });
  const voz = useQuery({ queryKey: ["voz-do-paciente", clientId, start, end], queryFn: () => getComentariosVozDoPaciente(clientId, start, end), ...opts });
  const conversas = useLeituraConversas(clientId);
  const auditoria = useQuery({
    queryKey: ["auditoria-comercial", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("auditoria_comercial", { p_client: clientId, p_de: start, p_ate: end.slice(0, 10) });
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as any;
    },
    ...opts,
  });
  const acomp = useQuery({ queryKey: ["acompanhamentos", clientId], queryFn: () => getAcompanhamentos(clientId), ...opts });

  const fontes = [
    { rotulo: "Qualidade dos dados", q: problemas },
    { rotulo: "Anúncios", q: ads },
    { rotulo: "Qualidade dos leads", q: qualidadeLeads },
    { rotulo: "Posts", q: posts },
    { rotulo: "Dúvidas dos pacientes", q: voz },
    { rotulo: "Conversas do WhatsApp", q: conversas },
    { rotulo: "Auditoria das conversas", q: auditoria },
  ];
  const carregando = fontes.filter((f) => f.q.isLoading);
  const comErro = fontes.filter((f) => f.q.isError);

  const acoes = useMemo(() => {
    const vozR = voz.data ? analisarVozDoPaciente((voz.data as any).comentarios ?? [], { donos: (voz.data as any).donos }) : null;
    const leituras = conversas.data ?? [];
    const f = auditoria.data?.funil;
    return montarProximasAcoes({
      problemas: problemas.data ?? [],
      ads: ads.data ?? null,
      campanhasSemQualificado: ((qualidadeLeads.data?.direto ?? []) as any[])
        .filter((c) => Number(c.avancaram) === 0)
        .map((c) => ({ campanha: c.campanha, gasto: Number(c.gasto), leads: Number(c.leads) })),
      posts: (posts.data as any[]) ?? [],
      duvidas: vozR?.grupos ?? [],
      atendimento: leituras.length ? resumirAtendimento(leituras) : null,
      precoPedidoSemResposta: f ? Math.max(0, Number(f.preco_pedido) - Number(f.preco_apresentado)) : null,
    });
  }, [problemas.data, ads.data, qualidadeLeads.data, posts.data, voz.data, conversas.data, auditoria.data]);

  const statusDe = (id: string): StatusAcao => statusDoBanco(acomp.data?.itens.find((x) => x.insightId === PREFIXO + id)?.status);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  async function mudarStatus(a: ProximaAcao, s: StatusAcao) {
    setSalvando(a.id);
    setErroSalvar(null);
    const agora = new Date().toISOString();
    const atual = acomp.data?.itens.find((x) => x.insightId === PREFIXO + a.id);
    const novo: Acompanhamento = {
      clientId,
      insightId: PREFIXO + a.id,
      titulo: a.recomendacao,
      status: STATUS_PARA_BANCO[s] as Status,
      responsavel: DONO_PARA_RESP[a.responsavel],
      prazo: atual?.prazo ?? null,
      checklist: atual?.checklist ?? [],
      historico: [...(atual?.historico ?? []), { em: agora, por: null, de: (atual?.status ?? null) as any, para: STATUS_PARA_BANCO[s] as Status }],
      feedback: atual?.feedback ?? null,
      resultado: atual?.resultado ?? null,
      criadoEm: atual?.criadoEm ?? agora,
      atualizadoEm: agora,
    };
    try {
      await salvarAcompanhamento(novo);
      await qc.invalidateQueries({ queryKey: ["acompanhamentos", clientId] });
    } catch (e) {
      setErroSalvar(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  }

  const [fSev, setFSev] = useState<Severidade | "todas">("todas");
  const [fStatus, setFStatus] = useState<FiltroStatus>("abertas");
  const [fCat, setFCat] = useState<Categoria | "todas">("todas");
  const visiveis = acoes.filter((a) => {
    const s = statusDe(a.id);
    if (fSev !== "todas" && a.severidade !== fSev) return false;
    if (fCat !== "todas" && a.categoria !== fCat) return false;
    if (fStatus === "abertas") return s === "pendente" || s === "em_andamento";
    return fStatus === "todas" || s === fStatus;
  });
  const abertas = acoes.filter((a) => ["pendente", "em_andamento"].includes(statusDe(a.id)));
  const conta = (sev: Severidade) => abertas.filter((a) => a.severidade === sev).length;
  const categorias = [...new Set(acoes.map((a) => a.categoria))];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header>
        <h1 className="sr-only">Próximas ações</h1>
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          O que o painel encontrou nos dados deste cliente, virado em tarefa: o que fazer, por quê, o que muda e quem faz. Nada é feito sozinho; marque o status conforme a equipe avança.
        </p>
      </header>

      {/* Resumo no topo */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { r: "Abertas", v: abertas.length, cor: "var(--ink)" },
          { r: "Alta", v: conta("alta"), cor: COR_SEV.alta },
          { r: "Média", v: conta("media"), cor: COR_SEV.media },
          { r: "Baixa", v: conta("baixa"), cor: COR_SEV.baixa },
        ].map((k) => (
          <div key={k.r} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>{k.r}</div>
            <div className="text-2xl font-semibold tabular-nums" style={{ color: k.cor }}>{carregando.length && !acoes.length ? "…" : k.v}</div>
          </div>
        ))}
      </div>

      {/* Leitura das fontes: mostra o progresso em vez de parecer tela travada */}
      {carregando.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" role="status" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink-2)" }}>
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Lendo {fontes.length - carregando.length} de {fontes.length} fontes… faltam: {carregando.map((f) => f.rotulo).join(", ")}.
        </p>
      )}
      {comErro.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm" role="alert" style={{ borderColor: "var(--warn)", background: "var(--surface)" }}>
          <CircleAlert size={16} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} aria-hidden />
          <span>
            Não deu para ler: <b>{comErro.map((f) => f.rotulo).join(", ")}</b>. As ações abaixo vêm das outras fontes.{" "}
            <button type="button" className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--accent)" }} onClick={() => comErro.forEach((f) => f.q.refetch())}>
              <RefreshCw size={12} aria-hidden /> Tentar de novo
            </button>
          </span>
        </p>
      )}
      {erroSalvar && <p className="text-sm" role="alert" style={{ color: "var(--crit)" }}>Não salvou o status: {erroSalvar}</p>}
      {acomp.data?.local && <p className="text-xs" style={{ color: "var(--text-dim)" }}>Status guardado só neste navegador (a tabela de acompanhamento ainda não está disponível).</p>}

      {/* Filtros */}
      {acoes.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Prioridade">
            <Chip ativo={fSev === "todas"} onClick={() => setFSev("todas")}>Todas as prioridades</Chip>
            {(["alta", "media", "baixa"] as Severidade[]).map((s) => (
              <Chip key={s} ativo={fSev === s} onClick={() => setFSev(s)} cor={COR_SEV[s]}>{ROTULO_SEVERIDADE[s]}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
            {(["abertas", "pendente", "em_andamento", "resolvido", "ignorado", "todas"] as FiltroStatus[]).map((s) => (
              <Chip key={s} ativo={fStatus === s} onClick={() => setFStatus(s)}>{s === "abertas" ? "Abertas" : s === "todas" ? "Todos os status" : ROTULO_STATUS_ACAO[s]}</Chip>
            ))}
            {categorias.length > 1 && (
              <select value={fCat} onChange={(e) => setFCat(e.target.value as any)} aria-label="Categoria" className="ml-auto min-h-[36px] rounded-lg border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <option value="todas">Todas as categorias</option>
                {categorias.map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Lista */}
      {!carregando.length && acoes.length === 0 && (
        <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <CheckCircle2 size={28} className="mx-auto" style={{ color: "var(--good)" }} aria-hidden />
          <p className="mt-2 font-semibold">Nenhuma ação pendente para este período.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            O painel olhou {fontes.length - comErro.length} fontes (dados, anúncios, leads, posts, dúvidas, WhatsApp e auditoria) e não achou nada que peça ação. Se faltar fonte conectada, ela aparece no aviso de cobertura no topo.
          </p>
        </div>
      )}
      {acoes.length > 0 && visiveis.length === 0 && (
        <p className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink-2)" }}>
          Nenhuma ação com esses filtros. <button type="button" className="font-semibold" style={{ color: "var(--accent)" }} onClick={() => { setFSev("todas"); setFStatus("todas"); setFCat("todas"); }}>Limpar filtros</button>
        </p>
      )}
      {carregando.length > 0 && acoes.length === 0 && (
        <ul className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => <li key={i} className="h-28 animate-pulse rounded-xl" style={{ background: "var(--surface-2)" }} />)}
        </ul>
      )}
      <ul className="space-y-2">
        {visiveis.map((a) => (
          <CartaoAcao key={a.id} a={a} status={statusDe(a.id)} podeEditar={podeEditar} salvando={salvando === a.id} onStatus={(s) => mudarStatus(a, s)} clientId={clientId} />
        ))}
      </ul>
      <p className="text-xs" style={{ color: "var(--text-dim)" }}>
        Como as ações são escolhidas: dado com erro e fonte parada (verificação de qualidade), campanha com veredito “Cortar” ou “Atrai mas não converte”, campanha com 5+ leads e nenhum qualificado no CRM, post com 1,5x mais salvamento/compartilhamento que o típico, dúvida feita por 2+ pessoas, paciente sem resposta, 1ª resposta acima de 1 hora e preço pedido sem resposta. A lista completa com score e histórico continua na aba Oportunidades.
      </p>
    </div>
  );
}
