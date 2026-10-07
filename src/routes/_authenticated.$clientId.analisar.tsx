import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  definirEtapaKpi,
  definirEtapaResultado,
  listEtapasKpi,
  listEtapasParaAnalise,
  type EtapaKpi,
  type EtapaParaAnalise,
} from "@/lib/client-data";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/$clientId/analisar")({
  component: AnalisarPage,
});

type Resultado = "open" | "won" | "lost";

const ROTULO: Record<Resultado, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" };

const fmtN = (n: number) => n.toLocaleString("pt-BR");
const fmtBRL = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");

// O que a etapa conta hoje: o que a equipe confirmou, senão o que predomina nos leads.
function resultadoAtual(e: EtapaParaAnalise): Resultado {
  if (e.confirmado && e.resultado_confirmado) return e.resultado_confirmado;
  if (e.ganhos >= e.perdidos && e.ganhos >= e.abertos && e.ganhos > 0) return "won";
  if (e.perdidos > e.abertos && e.perdidos > 0) return "lost";
  return "open";
}


// Confirma de uma vez todas as etapas com cards que ainda estão "a confirmar", do jeito que o dashboard
// já mostra (o que a equipe confirmou, senão o palpite pelo nome). Dois cliques: o primeiro só avisa.
function ConfirmarEmLote({
  pendentes,
  confirmar,
}: {
  pendentes: EtapaParaAnalise[];
  confirmar: (e: EtapaParaAnalise) => Promise<unknown>;
}) {
  const [passo, setPasso] = useState<"parado" | "pedindo" | "gravando" | "feito">("parado");
  const [falha, setFalha] = useState<string | null>(null);
  if (pendentes.length === 0) return null;
  async function rodar() {
    setPasso("gravando");
    setFalha(null);
    try {
      for (const e of pendentes) await confirmar(e);
      setPasso("feito");
    } catch (err) {
      setFalha(err instanceof Error ? err.message : "erro desconhecido");
      setPasso("parado");
    }
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, margin: "10px 0 0" }}>
      {passo === "pedindo" ? (
        <>
          <span style={{ fontSize: 12.5 }}>
            Confirmar {pendentes.length} etapa{pendentes.length === 1 ? "" : "s"} como estão na coluna "Significa"?
          </span>
          <button type="button" className="btn" onClick={rodar}>
            Sim, confirmar
          </button>
          <button type="button" className="btn" onClick={() => setPasso("parado")}>
            Cancelar
          </button>
        </>
      ) : (
        <button type="button" className="btn" disabled={passo === "gravando"} onClick={() => setPasso("pedindo")}>
          {passo === "gravando" ? "Confirmando…" : `Confirmar as ${pendentes.length} etapas pendentes como estão`}
        </button>
      )}
      {falha && <span style={{ fontSize: 12.5, color: "var(--danger)" }}>Não consegui confirmar: {falha}</span>}
    </div>
  );
}

function AnalisarPage() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const etapas = useQuery({
    queryKey: ["crm-etapas-analise", clientId],
    queryFn: () => listEtapasParaAnalise(clientId),
    enabled: isAdmin,
  });

  const etapasKpi = useQuery({
    queryKey: ["crm-etapas-kpi", clientId],
    queryFn: () => listEtapasKpi(clientId),
    enabled: isAdmin,
  });

  const salvarKpi = useMutation({
    mutationFn: definirEtapaKpi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-etapas-kpi", clientId] });
      queryClient.invalidateQueries({ queryKey: ["crm-metricas-essenciais", clientId] });
    },
  });

  const salvar = useMutation({
    mutationFn: definirEtapaResultado,
    onSuccess: () => {
      // Os números do Comercial dependem do outcome dos leads.
      queryClient.invalidateQueries({ queryKey: ["crm-etapas-analise", clientId] });
      queryClient.invalidateQueries({ queryKey: ["crm-metricas-essenciais", clientId] });
      queryClient.invalidateQueries({ queryKey: ["crm-pipeline-kanban", clientId] });
      queryClient.invalidateQueries({ queryKey: ["crm-atividade-recente", clientId] });
    },
  });

  const head = (
    <div className="hpagehead">
      <h2>A analisar</h2>
      <p>
        Onde o dashboard não tem certeza do que o CRM do cliente quer dizer. Aqui a equipe confirma, e a confirmação vale
        para os números de agora e para as próximas sincronizações.
      </p>
    </div>
  );

  if (!isAdmin) {
    return (
      <div>
        {head}
        <p className="note">Esta aba é só da equipe Doctor Creator.</p>
      </div>
    );
  }
  if (etapas.isLoading) return <div>{head}<p className="note">Carregando as etapas…</p></div>;
  if (etapas.error) {
    return (
      <div>
        {head}
        <div className="card">
          <p className="note">
            Não consegui ler as etapas: {etapas.error instanceof Error ? etapas.error.message : "erro desconhecido"}. Se a
            mensagem fala de função inexistente, a migration da aba ainda não foi aplicada no banco.
          </p>
        </div>
      </div>
    );
  }

  const linhas = etapas.data ?? [];
  const kpis = etapasKpi.data ?? [];
  if (linhas.length === 0 && kpis.length === 0) {
    return (
      <div>
        {head}
        <div className="card">
          <p className="note">
            Nada a analisar neste cliente: ele não tem etapas de CRM sincronizadas.
          </p>
        </div>
      </div>
    );
  }

  // Pontos de atenção por conexão.
  const porConexao = new Map<string, EtapaParaAnalise[]>();
  for (const l of linhas) porConexao.set(l.connection_id, [...(porConexao.get(l.connection_id) ?? []), l]);

  const alertas: string[] = [];
  for (const grupo of porConexao.values()) {
    const comCards = grupo.filter((g) => g.total > 0);
    const decididos = grupo.reduce((a, g) => a + g.ganhos + g.perdidos, 0);
    const aConfirmar = comCards.filter((g) => !g.confirmado);
    if (comCards.length > 0 && decididos === 0) {
      alertas.push(
        "Nenhum card está como ganho ou perdido. Sem isso o dashboard não calcula conversão, e tudo aparece como em disputa.",
      );
    }
    if (aConfirmar.length > 0) {
      alertas.push(
        `${aConfirmar.length} de ${comCards.length} etapas com cards ainda não foram confirmadas pela equipe (o que aparece hoje é palpite pelo nome da etapa).`,
      );
    }
  }

  return (
    <div>
      {head}

      {alertas.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Pontos de atenção</h2>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6, fontSize: 13 }}>
            {alertas.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {[...porConexao.entries()].map(([conexao, grupo]) => {
        const painelNome = (id: string) => grupo.find((g) => g.pipeline_id === id)?.pipeline_name ?? id;
        const paineis = [...new Set(grupo.map((g) => g.pipeline_id))];
        return (
          <div key={conexao} className="card" style={{ marginBottom: 16 }}>
            <h2>{paineis.map(painelNome).join(" · ")}</h2>
            <p className="sub">
              Para cada etapa, diga o que significa. Ao mudar, os cards da etapa são atualizados na hora.
            </p>
            <ConfirmarEmLote
              pendentes={grupo.filter((g) => g.total > 0 && !g.confirmado)}
              confirmar={(e) =>
                salvar.mutateAsync({
                  connectionId: e.connection_id,
                  pipelineId: e.pipeline_id,
                  statusId: e.status_id,
                  outcome: resultadoAtual(e),
                })
              }
            />
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="t">
                <thead>
                  <tr>
                    <th className="l">Etapa</th>
                    <th>Cards</th>
                    <th>Valor</th>
                    <th>Hoje conta como</th>
                    <th className="l">Significa</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.map((e) => {
                    const atual = resultadoAtual(e);
                    const gravando =
                      salvar.isPending &&
                      salvar.variables?.connectionId === e.connection_id &&
                      salvar.variables?.pipelineId === e.pipeline_id &&
                      salvar.variables?.statusId === e.status_id;
                    return (
                      <tr key={`${e.pipeline_id}|${e.status_id}`} style={{ opacity: e.total === 0 ? 0.55 : 1 }}>
                        <td className="l">
                          {e.status_name}
                          {paineis.length > 1 && <span className="sub2">{e.pipeline_name}</span>}
                        </td>
                        <td>{fmtN(e.total)}</td>
                        <td>{e.valor > 0 ? fmtBRL(e.valor) : "—"}</td>
                        <td>
                          {e.total === 0
                            ? "—"
                            : `${fmtN(e.ganhos)} ganho · ${fmtN(e.perdidos)} perdido · ${fmtN(e.abertos)} aberto`}
                        </td>
                        <td className="l">
                          <select
                            value={atual}
                            disabled={gravando}
                            aria-label={`Significado da etapa ${e.status_name}`}
                            onChange={(ev) =>
                              salvar.mutate({
                                connectionId: e.connection_id,
                                pipelineId: e.pipeline_id,
                                statusId: e.status_id,
                                outcome: ev.target.value as Resultado,
                              })
                            }
                            style={{
                              padding: "5px 8px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              color: "var(--ink)",
                              fontSize: 12.5,
                            }}
                          >
                            {(Object.keys(ROTULO) as Resultado[]).map((r) => (
                              <option key={r} value={r}>
                                {ROTULO[r]}
                              </option>
                            ))}
                          </select>
                          <span className="sub2">
                            {gravando ? "salvando…" : e.confirmado ? "confirmado pela equipe" : e.total > 0 ? "a confirmar" : ""}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {salvar.isError && (
              <p className="note">
                Não consegui salvar: {salvar.error instanceof Error ? salvar.error.message : "erro desconhecido"}.
              </p>
            )}
          </div>
        );
      })}

      {etapasKpi.error ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Cards do Comercial</h2>
          <p className="note txt">
            A marcação de quais etapas contam como consulta agendada e em atendimento ainda não está disponível neste banco:
            falta aplicar a migração <code>20261002150000_crm_etapa_kpi.sql</code>. Até lá, esses dois números aparecem como
            "a configurar" no Comercial.
          </p>
        </div>
      ) : (
        kpis.length > 0 && <SecaoKpi etapas={kpis} salvar={salvarKpi} />
      )}
    </div>
  );
}

function SecaoKpi({
  etapas,
  salvar,
}: {
  etapas: EtapaKpi[];
  salvar: { mutate: (a: Parameters<typeof definirEtapaKpi>[0]) => void; isPending: boolean; isError: boolean; error: unknown };
}) {
  const porConexao = new Map<string, EtapaKpi[]>();
  for (const e of etapas) porConexao.set(e.connection_id, [...(porConexao.get(e.connection_id) ?? []), e]);
  const nenhumaMarcada = etapas.every((e) => !e.consulta_agendada);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Cards do Comercial</h2>
      <p className="sub">
        Marque quais etapas contam como <b>consulta agendada</b> e como <b>em atendimento</b>. O nome da etapa sozinho engana
        (por exemplo, "Redequação da agenda" ainda não é agendada), então a decisão é da equipe. A marcação aparece nos cards na
        hora.
      </p>
      {nenhumaMarcada && (
        <p className="note">Hoje nenhuma etapa deste cliente conta como consulta agendada, e o card mostra 0.</p>
      )}
      {[...porConexao.entries()].map(([conexao, grupo]) => (
        <div key={conexao} style={{ overflowX: "auto", marginTop: 10 }}>
          <table className="t">
            <thead>
              <tr>
                <th className="l">Funil · etapa</th>
                <th>Cards</th>
                <th>Consulta agendada</th>
                <th>Em atendimento</th>
              </tr>
            </thead>
            <tbody>
              {grupo.map((e) => (
                <tr key={`${e.pipeline_id}|${e.status_id}`} style={{ opacity: e.total === 0 ? 0.55 : 1 }}>
                  <td className="l">
                    {e.status_name}
                    <span className="sub2">{e.pipeline_name}</span>
                  </td>
                  <td>{fmtN(e.total)}</td>
                  {(["consulta_agendada", "em_atendimento"] as const).map((kpi) => {
                    const marcada = kpi === "consulta_agendada" ? e.consulta_agendada : e.em_atendimento;
                    const padrao = kpi === "consulta_agendada" ? e.padrao_consulta : e.padrao_atendimento;
                    const origem = kpi === "consulta_agendada" ? e.origem_consulta : e.origem_atendimento;
                    return (
                      <td key={kpi}>
                        <input
                          type="checkbox"
                          checked={marcada}
                          disabled={padrao || salvar.isPending}
                          aria-label={`${kpi === "consulta_agendada" ? "Consulta agendada" : "Em atendimento"}: ${e.status_name}`}
                          onChange={(ev) =>
                            salvar.mutate({
                              connectionId: e.connection_id,
                              pipelineId: e.pipeline_id,
                              statusId: e.status_id,
                              kpi,
                              ativo: ev.target.checked,
                            })
                          }
                        />
                        <span className="sub2">{padrao ? "pelo nome" : origem === "sugestao" ? "sugerido" : marcada ? "equipe" : ""}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {salvar.isError && (
        <p className="note">Não consegui salvar: {salvar.error instanceof Error ? salvar.error.message : "erro desconhecido"}.</p>
      )}
    </div>
  );
}
