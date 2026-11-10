import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAdsDiagnosticoPorObjetivo,
  getPostsForAnalytics,
  getComentariosVozDoPaciente,
  getAcompanhamentos,
  salvarAcompanhamento,
} from "@/lib/client-data";
import { resolveDateRange } from "@/lib/date-range";
import { analisarVozDoPaciente } from "@/lib/voz-do-paciente";
import type { Acompanhamento, Status } from "@/lib/oportunidades";
import type { Responsavel } from "@/lib/insight";
import { useQualidadeDados } from "@/components/qualidade-dados";
import { useLeituraConversas } from "@/components/atendimento-resumo";
import { useClientRole } from "@/hooks/use-client-role";
import {
  atendimentoParaAcoes,
  montarProximasAcoes,
  statusDoBanco,
  STATUS_PARA_BANCO,
  ROTULO_SEVERIDADE,
  ROTULO_CATEGORIA,
  ROTULO_DONO,
  ROTULO_STATUS_ACAO,
  type ProximaAcao,
  type Severidade,
  type StatusAcao,
  type Categoria,
  type Dono,
} from "@/lib/proximas-acoes";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";
import { IconeTabler } from "@/components/icons/tabler";
import { NxCard, type NxTom } from "@/components/nx";
import { PlanoCabecalho, PlanoChip, PlanoComo, PlanoContadores, PlanoLinha, PlanoAviso, PlanoVazio } from "@/components/nx/plano-pecas";

export const Route = createFileRoute(
  "/_authenticated/$clientId/proximas-acoes",
)({
  component: ProximasAcoesPage,
});

const layout = getRouteApi("/_authenticated/$clientId");
const DONO_PARA_RESP: Record<Dono, Responsavel> = {
  doctor_creator: "equipe_hub",
  cliente: "medico",
  trafego: "gestor_trafego",
  conteudo: "social_media",
  atendimento: "atendimento",
};
const PREFIXO = "pa:"; // id na tabela acoes_acompanhamento (a mesma das Oportunidades)

type FiltroStatus = "abertas" | StatusAcao | "todas";

const TOM_SEV: Record<Severidade, NxTom> = { alta: "dn", media: "or", baixa: "b" };

function Filtro({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} className="pl-aba">
      {children}
    </button>
  );
}

function CartaoAcao({
  a,
  posicao,
  status,
  podeEditar,
  salvando,
  onStatus,
  clientId,
}: {
  a: ProximaAcao;
  posicao: number;
  status: StatusAcao;
  podeEditar: boolean;
  salvando: boolean;
  onStatus: (s: StatusAcao) => void;
  clientId: string;
}) {
  const externo = a.rota?.startsWith("http");
  const fechada = status === "resolvido" || status === "ignorado";
  return (
    <PlanoLinha
      posicao={posicao}
      tom={TOM_SEV[a.severidade]}
      apagada={fechada}
      titulo={a.recomendacao}
      apoio={a.porque}
      chips={
        <>
          <PlanoChip rotulo="Prioridade" tom={TOM_SEV[a.severidade]}>
            {ROTULO_SEVERIDADE[a.severidade]}
          </PlanoChip>
          <PlanoChip rotulo="Responsável" icone="users">
            {ROTULO_DONO[a.responsavel]}
          </PlanoChip>
          <PlanoChip rotulo="Categoria">{ROTULO_CATEGORIA[a.categoria]}</PlanoChip>
          {!podeEditar && (
            <PlanoChip rotulo="Status" tom={status === "em_andamento" ? "b" : status === "resolvido" ? "up" : "g"}>
              {ROTULO_STATUS_ACAO[status]}
            </PlanoChip>
          )}
        </>
      }
      acao={
        <>
          {podeEditar && (
            <label className="inline-flex items-center gap-1.5">
              <span className="sr-only">Status</span>
              {salvando && <Loader2 size={14} className="animate-spin" aria-hidden />}
              <select value={status} onChange={(e) => onStatus(e.target.value as StatusAcao)} className="pl-select">
                {(Object.keys(ROTULO_STATUS_ACAO) as StatusAcao[]).map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_ACAO[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {a.rota &&
            (externo ? (
              <a href={a.rota} target="_blank" rel="noreferrer" className="pl-botao">
                Abrir <ExternalLink size={14} aria-hidden />
              </a>
            ) : (
              <Link to={a.rota as any} params={{ clientId } as any} className="pl-botao">
                Ver dados →
              </Link>
            ))}
        </>
      }
      rotuloDetalhe="Por que esta ação foi sugerida"
      detalhe={
        <>
          <p>
            <b>Impacto esperado: </b>
            {a.impacto}
          </p>
          <p style={{ color: "var(--muted-ink)" }}>{a.evidencia}</p>
        </>
      }
    />
  );
}


// Central de Próximas Ações: tudo o que o painel encontrou, virado em tarefa priorizada.
function ProximasAcoesPage() {
  const { clientId } = Route.useParams();
  const { start, end } = resolveDateRange(layout.useSearch());
  const { podeEditar, papel } = useClientRole(clientId);
  const qc = useQueryClient();
  const opts = { staleTime: 5 * 60_000, retry: false } as const;

  // Cada fonte é lida em paralelo; uma que falhar não derruba as outras.
  const problemas = useQualidadeDados(clientId);
  const ads = useQuery({
    queryKey: ["ads-diag-objetivo", clientId, start, end],
    queryFn: () => getAdsDiagnosticoPorObjetivo(clientId, start, end),
    ...opts,
  });
  const qualidadeLeads = useQuery({
    queryKey: ["qualidade-leads-campanha", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "qualidade_leads_campanha",
        { p_client: clientId, p_de: start, p_ate: end.slice(0, 10) },
      );
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as any;
    },
    ...opts,
  });
  const posts = useQuery({
    queryKey: ["posts-analytics", clientId, start, end],
    queryFn: () => getPostsForAnalytics(clientId, start, end),
    ...opts,
  });
  const voz = useQuery({
    queryKey: ["voz-do-paciente", clientId, start, end],
    queryFn: () => getComentariosVozDoPaciente(clientId, start, end),
    ...opts,
  });
  const conversas = useLeituraConversas(clientId);
  const auditoria = useQuery({
    queryKey: ["auditoria-comercial", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "auditoria_comercial",
        { p_client: clientId, p_de: start, p_ate: end.slice(0, 10) },
      );
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as any;
    },
    ...opts,
  });
  const acomp = useQuery({
    queryKey: ["acompanhamentos", clientId],
    queryFn: () => getAcompanhamentos(clientId),
    ...opts,
  });

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
    const vozR = voz.data
      ? analisarVozDoPaciente((voz.data as any).comentarios ?? [], {
          donos: (voz.data as any).donos,
        })
      : null;
    const atend = atendimentoParaAcoes(conversas.data ?? [], start, end);
    const f = auditoria.data?.funil;
    return montarProximasAcoes({
      problemas: problemas.data ?? [],
      ads: ads.data ?? null,
      campanhasSemQualificado: ((qualidadeLeads.data?.direto ?? []) as any[])
        .filter((c) => Number(c.avancaram) === 0)
        .map((c) => ({
          campanha: c.campanha,
          gasto: Number(c.gasto),
          leads: Number(c.leads),
        })),
      posts: (posts.data as any[]) ?? [],
      duvidas: vozR?.grupos ?? [],
      atendimento: atend?.resumo ?? null,
      atendimentoParados: atend?.parados ?? null,
      // Contado por conversa no banco (pediu e não recebeu). Subtrair os totais dava zero quando havia
      // quem recebesse o preço sem pedir; sem o campo, a ação não aparece em vez de mostrar número errado.
      precoPedidoSemResposta:
        f?.preco_sem_resposta != null ? Number(f.preco_sem_resposta) : null,
      ocultarInternasBaixas: papel !== "admin",
    });
  }, [
    problemas.data,
    ads.data,
    qualidadeLeads.data,
    posts.data,
    voz.data,
    conversas.data,
    auditoria.data,
    start,
    end,
    papel,
  ]);

  const statusDe = (id: string): StatusAcao =>
    statusDoBanco(
      acomp.data?.itens.find((x) => x.insightId === PREFIXO + id)?.status,
    );
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
      historico: [
        ...(atual?.historico ?? []),
        {
          em: agora,
          por: null,
          de: (atual?.status ?? null) as any,
          para: STATUS_PARA_BANCO[s] as Status,
        },
      ],
      feedback: atual?.feedback ?? null,
      resultado: atual?.resultado ?? null,
      criadoEm: atual?.criadoEm ?? agora,
      atualizadoEm: agora,
    };
    try {
      await salvarAcompanhamento(novo);
      await qc.invalidateQueries({ queryKey: ["acompanhamentos", clientId] });
    } catch (e) {
      setErroSalvar(mensagemDeErroAcao(e));
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
  const abertas = acoes.filter((a) =>
    ["pendente", "em_andamento"].includes(statusDe(a.id)),
  );
  const conta = (sev: Severidade) =>
    abertas.filter((a) => a.severidade === sev).length;
  const categorias = [...new Set(acoes.map((a) => a.categoria))];

  const esperando = carregando.length > 0 && !acoes.length;
  const filtrosAtivos = fSev !== "todas" || fStatus !== "abertas" || fCat !== "todas";

  return (
    <div className="nexo-plano">
      <PlanoCabecalho
        titulo="O próximo passo da equipe"
        pergunta="O que fazer agora, das prioridades altas para as baixas. As sugestões não executam nada fora do Nexo: a equipe executa e atualiza o status."
      />

      <PlanoContadores
        rotulo="Ações abertas por prioridade"
        itens={[
          { rotulo: "Abertas", valor: esperando ? "…" : abertas.length, tom: "b", nota: "pendentes ou em andamento" },
          { rotulo: "Alta", valor: esperando ? "…" : conta("alta"), tom: "dn", nota: "fazer primeiro" },
          { rotulo: "Média", valor: esperando ? "…" : conta("media"), tom: "or" },
          { rotulo: "Baixa", valor: esperando ? "…" : conta("baixa"), tom: "g" },
        ]}
      />

      {/* Leitura das fontes: mostra o progresso em vez de parecer tela travada */}
      {carregando.length > 0 && (
        <p className="flex items-center gap-2 text-sm" role="status" style={{ color: "var(--text-2)" }}>
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Lendo {fontes.length - carregando.length} de {fontes.length} fontes…
          faltam: {carregando.map((f) => f.rotulo).join(", ")}.
        </p>
      )}
      {comErro.length > 0 && (
        <div role="alert">
          <PlanoAviso titulo={<>Não deu para ler: {comErro.map((f) => f.rotulo).join(", ")}</>}>
            As ações abaixo vêm das outras fontes.{" "}
            <button type="button" className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--b1)" }} onClick={() => comErro.forEach((f) => f.q.refetch())}>
              <RefreshCw size={12} aria-hidden /> Tentar de novo
            </button>
          </PlanoAviso>
        </div>
      )}
      {erroSalvar && (
        <p className="text-sm" role="alert" style={{ color: "var(--crit)" }}>
          Não salvou o status: {erroSalvar}
        </p>
      )}
      {acomp.data?.local && (
        <PlanoAviso titulo="Status guardado só neste navegador">A tabela de acompanhamento ainda não está disponível.</PlanoAviso>
      )}

      <NxCard
        nivel={2}
        id="pa-lista"
        icone={<IconeTabler nome="checklist" tamanho={17} traco={1.7} />}
        titulo="O que fazer agora"
        subtitulo={filtrosAtivos ? `${visiveis.length} de ${acoes.length} ações com os filtros escolhidos` : `${visiveis.length} ${visiveis.length === 1 ? "ação aberta" : "ações abertas"}, em ordem de prioridade`}
      >
        {/* Filtros */}
        {acoes.length > 0 && (
          <div className="grid gap-2">
            <div className="pl-abas" role="group" aria-label="Status">
              {(["abertas", "pendente", "em_andamento", "resolvido", "ignorado", "todas"] as FiltroStatus[]).map((s) => (
                <Filtro key={s} ativo={fStatus === s} onClick={() => setFStatus(s)}>
                  {s === "abertas" ? "Abertas" : s === "todas" ? "Todos os status" : ROTULO_STATUS_ACAO[s]}
                </Filtro>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="pl-abas" role="group" aria-label="Prioridade">
                <Filtro ativo={fSev === "todas"} onClick={() => setFSev("todas")}>
                  Todas as prioridades
                </Filtro>
                {(["alta", "media", "baixa"] as Severidade[]).map((s) => (
                  <Filtro key={s} ativo={fSev === s} onClick={() => setFSev(s)}>
                    {ROTULO_SEVERIDADE[s]}
                  </Filtro>
                ))}
              </div>
              {categorias.length > 1 && (
                <select value={fCat} onChange={(e) => setFCat(e.target.value as any)} aria-label="Categoria" className="pl-select">
                  <option value="todas">Todas as categorias</option>
                  {categorias.map((c) => (
                    <option key={c} value={c}>
                      {ROTULO_CATEGORIA[c]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* Lista */}
        {!carregando.length && acoes.length === 0 && (
          <PlanoVazio titulo={comErro.length ? "A leitura das prioridades está incompleta" : "Nenhuma ação identificada neste período"}>
            {comErro.length
              ? "Algumas fontes não puderam ser consultadas. Tente carregá-las novamente antes de concluir que não há pendências."
              : "As fontes consultadas não geraram sugestões pelas regras atuais. Isso não garante ausência de problemas: confira a cobertura dos dados e as fontes conectadas."}
          </PlanoVazio>
        )}
        {acoes.length > 0 && visiveis.length === 0 && (
          <div className="pl-vazio">
            <p className="pl-vazio__texto">
              Nenhuma ação com esses filtros.{" "}
              <button
                type="button"
                className="font-semibold"
                style={{ color: "var(--b1)" }}
                onClick={() => {
                  setFSev("todas");
                  setFStatus("todas");
                  setFCat("todas");
                }}
              >
                Limpar filtros
              </button>
            </p>
          </div>
        )}
        {esperando && (
          <ul className="pl-lista" aria-hidden>
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-24 animate-pulse rounded-[14px]" style={{ background: "var(--field)" }} />
            ))}
          </ul>
        )}
        {visiveis.length > 0 && (
          <ol className="pl-lista">
            {visiveis.map((a, k) => (
              <CartaoAcao
                key={a.id}
                a={a}
                posicao={k + 1}
                status={statusDe(a.id)}
                podeEditar={podeEditar}
                salvando={salvando === a.id}
                onStatus={(s) => mudarStatus(a, s)}
                clientId={clientId}
              />
            ))}
          </ol>
        )}
      </NxCard>

      <PlanoComo titulo="Como as prioridades são escolhidas">
        <p>
          Como as ações são escolhidas: dado com erro e fonte parada
          (verificação de qualidade), campanha com veredito “Cortar” ou “Atrai
          mas não converte”, campanha com 5+ leads e nenhum qualificado no CRM,
          post com 1,5x mais salvamento/compartilhamento que o típico, dúvida
          feita por 2+ pessoas, paciente que escreveu nos últimos 7 dias e
          ficou sem resposta (dentro do período escolhido, sem contar card
          fechado no CRM), 1ª resposta acima de 1 hora e preço pedido sem
          resposta, contado em cada conversa.
        </p>
      </PlanoComo>
    </div>
  );
}
