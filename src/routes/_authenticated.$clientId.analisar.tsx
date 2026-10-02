import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { definirEtapaResultado, listEtapasParaAnalise, type EtapaParaAnalise } from "@/lib/client-data";
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

function AnalisarPage() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const etapas = useQuery({
    queryKey: ["crm-etapas-analise", clientId],
    queryFn: () => listEtapasParaAnalise(clientId),
    enabled: isAdmin,
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
  if (linhas.length === 0) {
    return (
      <div>
        {head}
        <div className="card">
          <p className="note">
            Nada a analisar neste cliente. A aba lista as etapas dos CRMs do tipo WTS Chat (Clinic Desk, Support CRM,
            Synkronos). Kommo, Clint e RD Station já trazem ganho e perdido do próprio CRM.
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
    </div>
  );
}
