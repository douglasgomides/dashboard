import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useResultado } from "@/hooks/use-resultado";
import { useClientRole } from "@/hooks/use-client-role";
import { useAuth } from "@/hooks/use-auth";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { getAcompanhamentos, salvarAcompanhamento } from "@/lib/client-data";
import {
  combinar,
  mudarStatus,
  PESOS_PADRAO,
  ROTULO_STATUS,
  TRANSICOES,
  ABERTOS,
  type Acompanhamento,
  type Status,
} from "@/lib/oportunidades";
import { categoriaDaArea, ROTULO_RESPONSAVEL, type Insight, type Responsavel } from "@/lib/insight";
import { NextBestActionPanel, PriorityBadge, prioridadeDe } from "@/components/next-best-action";
import { ListaLimitacoes } from "@/components/insight-card";
import { History } from "lucide-react";
import { IconeTabler } from "@/components/icons/tabler";
import { NxCard } from "@/components/nx";
import { PlanoAviso, PlanoCabecalho, PlanoChip, PlanoComo, PlanoContadores, PlanoLinha, PlanoVazio } from "@/components/nx/plano-pecas";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";

export const Route = createFileRoute("/_authenticated/$clientId/oportunidades")({
  component: OportunidadesPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

const ABAS: { id: string; rotulo: string; filtro: (s: Status) => boolean }[] = [
  { id: "abertas", rotulo: "Para fazer", filtro: (s) => s === "nova" || s === "em_analise" },
  { id: "andamento", rotulo: "Em andamento", filtro: (s) => s === "em_execucao" || s === "adiada" },
  { id: "historico", rotulo: "Histórico e resultados", filtro: (s) => !ABERTOS.includes(s) },
];

const fmtData = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Execucao({
  acomp,
  podeEditar,
  email,
  onSalvar,
  salvando,
}: {
  acomp: Acompanhamento;
  podeEditar: boolean;
  email: string | null;
  onSalvar: (a: Acompanhamento) => void;
  salvando: boolean;
}) {
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const proximos = TRANSICOES[acomp.status];
  const ir = (para: Status) => {
    try {
      setErro(null);
      onSalvar(mudarStatus(acomp, para, email, nota || undefined));
      setNota("");
    } catch (e) {
      setErro(mensagemDeErroAcao(e));
    }
  };
  const editar = (parcial: Partial<Acompanhamento>) => onSalvar({ ...acomp, ...parcial, atualizadoEm: new Date().toISOString() });
  const campo = "min-h-[44px] w-full rounded-lg border px-3 text-sm";
  const estiloCampo = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span style={{ color: "var(--muted)" }}>Status:</span>
        <b>{ROTULO_STATUS[acomp.status]}</b>
        {!podeEditar && <span className="text-xs" style={{ color: "var(--muted)" }}>(seu acesso é de leitura)</span>}
      </div>

      {podeEditar && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block" style={{ color: "var(--ink-2)" }}>Responsável</span>
            <select className={campo} style={estiloCampo} value={acomp.responsavel} onChange={(e) => editar({ responsavel: e.target.value as Responsavel })} disabled={salvando}>
              {(Object.keys(ROTULO_RESPONSAVEL) as Responsavel[]).map((r) => (
                <option key={r} value={r}>{ROTULO_RESPONSAVEL[r]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block" style={{ color: "var(--ink-2)" }}>Prazo</span>
            <input type="date" className={campo} style={estiloCampo} value={acomp.prazo ?? ""} onChange={(e) => editar({ prazo: e.target.value || null })} disabled={salvando} />
          </label>
        </div>
      )}

      {acomp.checklist.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Checklist</legend>
          <ul className="space-y-1">
            {acomp.checklist.map((c, k) => (
              <li key={k}>
                <label className="flex min-h-[44px] items-start gap-3 rounded-lg px-1 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0"
                    checked={c.feito}
                    disabled={!podeEditar || salvando}
                    onChange={() => editar({ checklist: acomp.checklist.map((x, j) => (j === k ? { ...x, feito: !x.feito } : x)) })}
                  />
                  <span style={{ color: "var(--ink)", textDecoration: c.feito ? "line-through" : undefined }}>{c.texto}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {podeEditar && proximos.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="mb-1 block" style={{ color: "var(--ink-2)" }}>Nota (opcional)</span>
            <input className={campo} style={estiloCampo} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: pausado no Gerenciador em 14/10" />
          </label>
          <div className="flex flex-wrap gap-2">
            {proximos.map((p) => (
              <button
                key={p}
                type="button"
                disabled={salvando}
                onClick={() => ir(p)}
                className="min-h-[44px] rounded-lg border px-4 text-sm font-semibold disabled:opacity-60"
                style={p === "em_execucao" || p === "concluida" ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--ink)" }}
              >
                {p === "em_execucao" ? "Iniciar ação" : p === "concluida" ? "Marcar como concluída" : p === "resultado_avaliado" ? "Avaliar resultado" : `Mover para "${ROTULO_STATUS[p]}"`}
              </button>
            ))}
          </div>
          {erro && <p className="text-sm" style={{ color: "var(--crit)" }}>{erro}</p>}
        </div>
      )}

      {(acomp.status === "concluida" || acomp.status === "resultado_avaliado") && (
        <div className="space-y-2 rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
          <div className="text-sm font-semibold">Resultado (separado de "concluída")</div>
          {podeEditar ? (
            <>
              <select
                className={campo}
                style={estiloCampo}
                value={acomp.resultado?.avaliacao ?? ""}
                onChange={(e) =>
                  editar({ resultado: { avaliacao: e.target.value as NonNullable<Acompanhamento["resultado"]>["avaliacao"], texto: acomp.resultado?.texto ?? "", em: new Date().toISOString() } })
                }
              >
                <option value="">Ainda não avaliado</option>
                <option value="melhorou">Melhorou o indicador</option>
                <option value="sem_efeito">Sem efeito visível</option>
                <option value="piorou">Piorou</option>
                <option value="inconclusivo">Inconclusivo (pouco dado)</option>
              </select>
              <textarea
                className="w-full rounded-lg border p-3 text-sm"
                style={estiloCampo}
                rows={2}
                placeholder="O que aconteceu com o indicador depois da ação? Cite os números."
                value={acomp.resultado?.texto ?? ""}
                onChange={(e) => acomp.resultado && editar({ resultado: { ...acomp.resultado, texto: e.target.value } })}
              />
            </>
          ) : (
            <p className="text-sm">{acomp.resultado ? `${acomp.resultado.avaliacao}: ${acomp.resultado.texto}` : "Ainda não avaliado."}</p>
          )}
        </div>
      )}

      {podeEditar && (
        <label className="block text-sm">
          <span className="mb-1 block" style={{ color: "var(--ink-2)" }}>A recomendação fez sentido? (feedback para melhorar as regras)</span>
          <textarea className="w-full rounded-lg border p-3 text-sm" style={estiloCampo} rows={2} value={acomp.feedback ?? ""} onChange={(e) => editar({ feedback: e.target.value || null })} />
        </label>
      )}

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          <History size={14} aria-hidden /> Histórico
        </div>
        <ol className="space-y-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
          {[...acomp.historico].reverse().map((h, k) => (
            <li key={k}>
              {fmtData(h.em)} · {h.de ? `${ROTULO_STATUS[h.de]} → ` : ""}
              <b style={{ color: "var(--ink)" }}>{ROTULO_STATUS[h.para]}</b>
              {h.por ? ` · ${h.por}` : ""}
              {h.nota ? ` · “${h.nota}”` : ""}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function OportunidadesPage() {
  const { clientId } = Route.useParams();
  const { user } = useAuth();
  const { podeEditar } = useClientRole(clientId);
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  const periodLabel = formatRangeLabel({ start, end });
  const { r, carregando, fontesComFalha, carregandoFontes, refazerFontes } = useResultado(clientId, start, end);
  const qc = useQueryClient();
  const salvos = useQuery({ queryKey: ["acoes", clientId], queryFn: () => getAcompanhamentos(clientId), retry: false });
  const [aba, setAba] = useState("abertas");
  const [aberto, setAberto] = useState<{ insight: Insight | null; acomp: Acompanhamento } | null>(null);

  const salvar = useMutation({
    mutationFn: salvarAcompanhamento,
    onSuccess: (res, a) => {
      qc.setQueryData(["acoes", clientId], (old: { itens: Acompanhamento[]; local: boolean } | undefined) => ({
        local: res.local,
        itens: [...(old?.itens ?? []).filter((x) => x.insightId !== a.insightId), a],
      }));
      setAberto((cur) => (cur && cur.acomp.insightId === a.insightId ? { ...cur, acomp: a } : cur));
    },
  });

  const lista = useMemo(() => (r ? combinar(clientId, r.insights, salvos.data?.itens ?? []) : []), [r, salvos.data, clientId]);
  const filtro = ABAS.find((a) => a.id === aba)!.filtro;
  const visiveis = lista.filter((x) => filtro(x.acomp.status));

  if (fontesComFalha) return <div className="card" role="alert"><h1>As recomendações não puderam ser conferidas</h1><p>Uma fonte de resultados falhou. Tente novamente antes de iniciar uma ação.</p><button className="btn" type="button" onClick={() => void refazerFontes()}>Tentar novamente</button></div>;
  if (carregando || carregandoFontes || !r || salvos.isLoading) {
    return <div className="mx-auto h-40 w-full max-w-5xl animate-pulse rounded-xl" style={{ background: "var(--surface-2)" }} aria-busy="true" />;
  }
  if (salvos.isError) return <div className="card" role="alert"><h1>O acompanhamento não carregou</h1><p>Não foi possível conferir o histórico. Tente novamente antes de alterar uma ação.</p><button className="btn" type="button" disabled={salvos.isFetching} onClick={() => void salvos.refetch()}>Tentar novamente</button></div>;

  const contar = (id: string) => lista.filter((x) => ABAS.find((a) => a.id === id)!.filtro(x.acomp.status)).length;
  const altasAbertas = lista.filter((x) => x.insight && ABERTOS.includes(x.acomp.status) && prioridadeDe(x.insight) === "alta").length;
  const TOM_PRIO = { alta: "dn", media: "or", baixa: "b" } as const;

  return (
    <div className="nexo-plano">
      <PlanoCabecalho
        titulo="O que melhorar primeiro"
        pergunta="As recomendações do período em ordem de prioridade, e o que já foi feito com cada uma."
        periodo={periodLabel}
      />

      <PlanoContadores
        rotulo="Oportunidades por andamento"
        itens={[
          { rotulo: "Para fazer", valor: contar("abertas"), tom: "b" },
          { rotulo: "Alta prioridade", valor: altasAbertas, tom: "dn", nota: "abertas" },
          { rotulo: "Em andamento", valor: contar("andamento"), tom: "or" },
          { rotulo: "No histórico", valor: contar("historico"), tom: "up", nota: "feitas, avaliadas ou expiradas" },
        ]}
      />

      {salvos.data?.local && (
        <PlanoAviso titulo="Acompanhamento guardado só neste navegador">
          A tabela de acompanhamento ainda não foi criada no banco. Outras pessoas da equipe não veem estas mudanças.
        </PlanoAviso>
      )}

      <NxCard
        nivel={2}
        id="op-lista"
        icone={<IconeTabler nome="bulb" tamanho={17} traco={1.7} />}
        titulo={ABAS.find((a) => a.id === aba)!.rotulo}
        subtitulo="Cada recomendação vem de uma regra fixa sobre os dados do período."
      >
        <div className="pl-abas" role="tablist" aria-label="Filtrar oportunidades">
          {ABAS.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} aria-pressed={aba === a.id} onClick={() => setAba(a.id)} className="pl-aba">
              {a.rotulo} <b>({contar(a.id)})</b>
            </button>
          ))}
        </div>

        {visiveis.length === 0 ? (
          <PlanoVazio titulo={aba === "abertas" ? "Nada para fazer agora" : aba === "andamento" ? "Nada em andamento" : "Histórico vazio"}>
            {aba === "abertas"
              ? "Nenhuma recomendação com evidência suficiente neste período. Quando os dados mostrarem algo para agir, ela aparece aqui."
              : aba === "andamento"
                ? "Nenhuma ação em andamento. Abra uma oportunidade e toque em “Iniciar ação”."
                : "Nada no histórico ainda."}
          </PlanoVazio>
        ) : (
          <ol className="pl-lista">
            {visiveis.map(({ insight, acomp }, k) => {
              const p = insight ? prioridadeDe(insight) : null;
              return (
                <PlanoLinha
                  key={acomp.insightId}
                  posicao={k + 1}
                  tom={p ? TOM_PRIO[p] : "g"}
                  apagada={!ABERTOS.includes(acomp.status)}
                  titulo={acomp.titulo}
                  apoio={insight ? categoriaDaArea(insight.area) : "Regra não disparou mais neste período"}
                  chips={
                    <>
                      {p && <PriorityBadge p={p} />}
                      <PlanoChip rotulo="Responsável" icone="users">{ROTULO_RESPONSAVEL[acomp.responsavel] ?? "Responsável a definir"}</PlanoChip>
                      <PlanoChip rotulo="Status" tom={acomp.status === "em_execucao" ? "b" : acomp.status === "concluida" || acomp.status === "resultado_avaliado" ? "up" : "g"}>
                        {ROTULO_STATUS[acomp.status]}
                      </PlanoChip>
                      {acomp.prazo && (
                        <PlanoChip rotulo="Prazo" icone="calendar">
                          até {acomp.prazo.split("-").reverse().join("/")}
                        </PlanoChip>
                      )}
                    </>
                  }
                  acao={
                    <button type="button" onClick={() => setAberto({ insight, acomp })} className="pl-botao">
                      Entender e agir
                    </button>
                  }
                />
              );
            })}
          </ol>
        )}
      </NxCard>

      <PlanoComo titulo="Como a prioridade é calculada">
        <p>
          Cada recomendação vem de uma regra fixa sobre os dados (nunca de texto gerado por IA). A prioridade vai de 0 a 100 e soma cinco notas de 0 a 5:
          impacto ({PESOS_PADRAO.impacto * 100}%), urgência ({PESOS_PADRAO.urgencia * 100}%), confiança dos dados ({PESOS_PADRAO.confianca * 100}%), facilidade de execução ({PESOS_PADRAO.facilidade * 100}%) e alinhamento estratégico ({PESOS_PADRAO.alinhamento * 100}%).
        </p>
        <p>Urgência: ruim = 5, atenção = 3, bom = 1. Impacto e confiança: alto = 5, médio = 3, baixo = 1. Facilidade: mexer em verba ou postar = 4; atendimento e comercial = 3; conectar fonte = 2. Alinhamento: 3 para todas as áreas até a equipe definir prioridades por cliente.</p>
        <p>“Concluída” quer dizer que a ação foi feita; “Resultado avaliado” quer dizer que alguém conferiu o efeito no indicador. Uma recomendação aberta cuja regra deixou de disparar vira “Expirada”, e o histórico fica.</p>
      </PlanoComo>

      {r.limitacoes.length > 0 && (
        <PlanoAviso
          tom="b"
          titulo={`O que o painel ainda não consegue dizer (${r.limitacoes.length})`}
          detalhe={<ListaLimitacoes itens={r.limitacoes} />}
        >
          {r.limitacoes.length === 1 ? "Um ponto do período" : `${r.limitacoes.length} pontos do período`} sem dado suficiente para afirmar. Abra a lista antes de concluir.
        </PlanoAviso>
      )}

      {aberto && (
        <NextBestActionPanel
          insight={
            aberto.insight ?? {
              id: aberto.acomp.insightId,
              area: "resumo",
              tom: "atencao",
              titulo: aberto.acomp.titulo,
              diagnostico: "A regra que gerou esta recomendação não disparou no período selecionado. O acompanhamento continua aqui.",
              evidencia: "—",
              confianca: "baixa",
              impacto: "baixo",
              responsavel: aberto.acomp.responsavel,
            }
          }
          clientId={clientId}
          onFechar={() => setAberto(null)}
          rodape={<>{salvar.isError && <p role="alert" style={{ color: "var(--crit)" }}>A alteração não foi salva. {mensagemDeErroAcao(salvar.error)}</p>}<Execucao acomp={aberto.acomp} podeEditar={podeEditar} email={user?.email ?? null} onSalvar={(a) => salvar.mutate(a)} salvando={salvar.isPending} /></>}
        />
      )}
    </div>
  );
}
