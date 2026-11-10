import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Carregando } from "@/components/sem-fonte";
import { useQuery } from "@tanstack/react-query";
import { InfoDica } from "@/components/visual";
import { NxCard, NxLinhaTempo } from "@/components/nx";
import { CmAviso, CmBarras, CmKpi, CmLeitura, CmMetodo, CmRecolhido, CmTopo, icT } from "@/components/nx/comercial-base";
import {
  getWtsResumo,
  getWtsPorDepartamento,
  getWtsPorAgente,
  getWtsVolumeDiario,
  getWtsFilaDoCliente,
} from "@/lib/client-data";
import { avisoContaCompartilhada, avisoFilaEsquecida, avisoLote } from "@/lib/fila-whatsapp";
import { SyncButton } from "@/components/sync-button";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtNum } from "@/lib/format";
import { CustoWhatsapp } from "@/components/custo-whatsapp";
import { ConversasWhatsapp } from "@/components/conversas-whatsapp";
import { useAuth } from "@/hooks/use-auth";
import { useClientRole } from "@/hooks/use-client-role";
import { RecuperarHoje } from "@/components/agentes-ia";
import { AtendimentoConversas } from "@/components/atendimento-conversas";

// Atendimento no WhatsApp: uma tela só com duas abas. "Números" (volume, espera, equipe) e, para a equipe,
// "Conversas e auditoria" (cada conversa com a leitura e a auditoria comercial), que antes era /conversas.
export const Route = createFileRoute("/_authenticated/$clientId/atendimento")({
  validateSearch: (s: Record<string, unknown>): { aba?: "numeros" | "conversas"; conversa?: string } => ({
    aba: s.aba === "conversas" ? "conversas" : undefined,
    conversa: typeof s.conversa === "string" ? s.conversa : undefined,
  }),
  component: AtendimentoPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

// Tempo de espera vai de segundos a horas na mesma tabela. Segundo cru é
// ilegível e minuto arredondado esconde a diferença entre 40s e 4min.
function dur(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || !Number.isFinite(seg)) return "—";
  const s = Math.max(0, Math.trunc(seg));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function AtendimentoPage() {
  const { clientId } = Route.useParams();
  const { aba, conversa } = Route.useSearch();
  const { isAdmin } = useAuth();
  const { podeEditar } = useClientRole(clientId);
  const navigate = Route.useNavigate();
  const atual = aba === "conversas" && isAdmin ? "conversas" : "numeros";
  const ir = (a: "numeros" | "conversas") => navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, aba: a === "conversas" ? "conversas" : undefined, conversa: undefined }) as never });
  return (
    <div className="space-y-4">
      {/* Na aba de números, a pergunta da tela vem primeiro; a lista do dia para recuperar pacientes fica logo depois. */}
      {atual === "conversas" && <RecuperarHoje clientId={clientId} podeEditar={podeEditar} />}
      {isAdmin && (
        <div className="flex max-w-full flex-wrap gap-1 rounded-xl border p-1 text-sm" role="tablist" aria-label="Atendimento no WhatsApp" style={{ borderColor: "var(--line)", width: "fit-content", background: "var(--white)" }}>
          {([["numeros", "Números do atendimento"], ["conversas", "Conversas e auditoria"]] as const).map(([id, rot]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={atual === id}
              onClick={() => ir(id)}
              className="min-h-[40px] rounded-lg px-3 font-semibold"
              style={{ background: atual === id ? "var(--b6)" : "transparent", color: atual === id ? "var(--b1)" : "var(--muted-ink)" }}
            >
              {rot}
            </button>
          ))}
        </div>
      )}
      {atual === "conversas" ? <ConversasWhatsapp clientId={clientId} conversaInicial={conversa} /> : <NumerosWhatsapp clientId={clientId} />}
      {atual === "numeros" && <RecuperarHoje clientId={clientId} podeEditar={podeEditar} />}
    </div>
  );
}

function NumerosWhatsapp({ clientId }: { clientId: string }) {
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const resumoQ = useQuery({
    queryKey: ["wts-resumo", clientId, start, end],
    queryFn: () => getWtsResumo(clientId, start, end),
  });
  const { data: porDepartamento, isLoading: loadingDep } = useQuery({
    queryKey: ["wts-departamento", clientId, start, end],
    queryFn: () => getWtsPorDepartamento(clientId, start, end),
  });
  const { data: porAgente, isLoading: loadingAgente } = useQuery({
    queryKey: ["wts-agente", clientId, start, end],
    queryFn: () => getWtsPorAgente(clientId, start, end),
  });
  const { data: volumeDiario, isLoading: loadingDia } = useQuery({
    queryKey: ["wts-dia", clientId, start, end],
    queryFn: () => getWtsVolumeDiario(clientId, start, end),
  });
  // Abertas agora, lote de encerramento e conta compartilhada, com o dado deste cliente. Sem a RPC: null.
  const { data: fila } = useQuery({
    queryKey: ["wts-fila", clientId, start, end],
    queryFn: () => getWtsFilaDoCliente(clientId, start, end),
    retry: false,
  });

  const { data: resumo, isLoading: loadingResumo } = resumoQ;
  const isLoading = loadingResumo || loadingDep || loadingAgente || loadingDia;
  const atendimentos = n(resumo?.atendimentos);

  if (isLoading) {
    return <Carregando texto="Lendo o atendimento…" />;
  }

  if (resumoQ.isError) return <div role="alert" className="space-y-3 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}><h2 className="font-semibold">Não foi possível carregar os números do atendimento</h2><p className="text-sm">A fonte está indisponível. Isso não significa que não houve atendimentos.</p><button type="button" className="ws-action ws-action--secondary" disabled={resumoQ.isFetching} onClick={() => void resumoQ.refetch()}>Tentar novamente</button></div>;

  if (!resumo || atendimentos === 0) {
    // Sem WTS (ex.: Kommo): mede pelas conversas que já chegam ao Nexo. Sem conversas, o aviso de antes.
    return (
      <AtendimentoConversas
        clientId={clientId}
        start={start}
        end={end}
        periodLabel={periodLabel}
        vazio={
          <div className="space-y-4">
            <div className="flex justify-end">
              <SyncButton clientId={clientId} alvo="atendimento" />
            </div>
            <p style={{ color: "var(--text-dim)" }}>
              Nenhum atendimento no período ({periodLabel}). Se a conta da WTS acabou de ser ligada, use o botão acima.
            </p>
          </div>
        }
      />
    );
  }

  const semRoteamento = n(resumo?.sem_roteamento);
  const fatiaSemRoteamento = atendimentos > 0 ? (semRoteamento / atendimentos) * 100 : 0;
  const coberturaEspera = n(resumo?.espera_cobertura);

  const dias = (volumeDiario ?? []).map((r) => ({
    dia: String(r.dia).slice(0, 10),
    atendimentos: n(r.atendimentos),
    espera: nOrNull(r.espera_mediana_seg) === null ? null : Math.round(n(r.espera_mediana_seg) / 60),
  }));
  // A linha de espera só entra quando todo dia tem o dado: dia sem medida não vira zero no gráfico.
  const diasSemEspera = dias.filter((d) => d.espera === null).length;
  const esperaSeg = nOrNull(resumo?.espera_mediana_seg);
  const atencao = (esperaSeg ?? 0) > 3600 || fatiaSemRoteamento > 40;
  const deps = porDepartamento ?? [];
  const maxDep = Math.max(1, ...deps.map((r) => n(r.atendimentos)));

  return (
    <div className="nexo-comercial" style={{ gap: 18 }}>
      <CmTopo
        pergunta="O paciente é respondido rápido no WhatsApp?"
        detalhe={`Atendimento no WhatsApp · ${periodLabel}`}
        acoes={<SyncButton clientId={clientId} alvo="atendimento" />}
      />

      {fila && (avisoFilaEsquecida(fila) || avisoContaCompartilhada(fila)) && (
        <div className="cm-avisos">
          {avisoFilaEsquecida(fila) && <CmAviso tom="atencao" titulo="Fila esquecida:">{avisoFilaEsquecida(fila)}</CmAviso>}
          {/* Conta do WTS ligada a mais de um cliente: o aviso sai do cadastro, não de texto fixo. */}
          {avisoContaCompartilhada(fila) && <CmAviso tom="atencao">{avisoContaCompartilhada(fila)}</CmAviso>}
        </div>
      )}

      <section className="nx-grade nx-grade--4" aria-label="Números do atendimento">
        <CmKpi i={0} icone="message-circle" rotulo="Atendimentos" valor={fmtNum(atendimentos)} nota={`${fmtNum(n(resumo?.contatos_distintos))} pessoas diferentes`} />
        <CmKpi
          i={1}
          icone="target"
          rotulo="Espera até a 1ª resposta"
          valor={dur(esperaSeg)}
          apagado={esperaSeg === null}
          nota={`mediana de ${fmtNum(coberturaEspera)} atendimentos com o dado`}
        />
        <CmKpi
          i={2}
          icone="filter"
          rotulo="Sem roteamento"
          valor={`${fatiaSemRoteamento.toFixed(0)}%`}
          nota={`${fmtNum(semRoteamento)} de ${fmtNum(atendimentos)} caíram em “Geral”`}
          info={<InfoDica rotulo="Sobre Sem roteamento" texto="Conversa que não foi para nenhuma equipe. É o número que precisa cair: enquanto ele for alto, nenhum recorte por médica ou por especialidade vai ser confiável." />}
        />
        {fila ? (
          <CmKpi
            i={3}
            icone="inbox"
            rotulo="Abertas nos últimos 7 dias"
            valor={fmtNum(fila.abertas7d)}
            nota={fila.abertasAntigas > 0 ? `mais ${fmtNum(fila.abertasAntigas)} abertas há mais de 7 dias (fila esquecida)` : "nenhuma conversa esquecida aberta"}
          />
        ) : (
          <CmKpi
            i={3}
            icone="inbox"
            rotulo="Ainda abertas"
            valor={fmtNum(n(resumo?.em_andamento))}
            nota={`das iniciadas no período, inclusive as esquecidas; ${fmtNum(n(resumo?.concluidos))} concluídas`}
          />
        )}
      </section>

      <div className="cm-par">
        <NxCard id="volume" nivel={2} icone={icT("chart-bar")} titulo="Volume por dia e espera até a 1ª resposta" subtitulo={periodLabel}>
          {dias.length === 0 ? (
            <p className="nx-vazio text-sm">Sem volume por dia neste período.</p>
          ) : (
            <NxLinhaTempo
              rotulo="Atendimentos por dia e espera até a 1ª resposta"
              datas={dias.map((d) => d.dia)}
              series={[
                { rotulo: "Atendimentos", valores: dias.map((d) => d.atendimentos), cor: "var(--b1)", area: true },
                ...(diasSemEspera === 0 ? [{ rotulo: "Espera em min (mediana)", valores: dias.map((d) => d.espera ?? 0), cor: "var(--or)", eixo: "dir" as const }] : []),
              ]}
              formatarData={(iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`}
              formatarValor={(v) => fmtNum(Math.round(v))}
            />
          )}
          {diasSemEspera > 0 && dias.length > 0 && (
            <p className="cm-barra__nota" style={{ margin: 0 }}>
              A espera fica fora do gráfico: {fmtNum(diasSemEspera)} {diasSemEspera === 1 ? "dia não tem" : "dias não têm"} o dado, e dia sem medida não vira zero.
            </p>
          )}
        </NxCard>
        <NxCard id="por-equipe" nivel={2} icone={icT("users")} titulo="Por equipe" subtitulo="Atendimentos de cada equipe e a espera mediana">
          {deps.length === 0 ? (
            <p className="nx-vazio text-sm">Sem equipes neste período.</p>
          ) : (
            <CmBarras
              rotulo="Atendimentos por equipe"
              max={maxDep}
              itens={deps.map((r) => ({
                chave: r.departamento,
                rotulo: r.departamento,
                valor: n(r.atendimentos),
                texto: fmtNum(n(r.atendimentos)),
                apoio: nOrNull(r.fatia) === null ? undefined : `${n(r.fatia).toFixed(1)}%`,
                nota: `espera ${dur(nOrNull(r.espera_mediana_seg))} · até fechar ${dur(nOrNull(r.atendimento_mediano_seg))}`,
                tom: r.departamento === "Geral" ? ("or" as const) : undefined,
              }))}
            />
          )}
        </NxCard>
      </div>

      <div className="cm-par cm-par--igual">
      <CmLeitura
        id="resumo-atendimento"
        titulo="Em resumo"
        itens={[
          { texto: `${fmtNum(atendimentos)} atendimentos de ${fmtNum(n(resumo?.contatos_distintos))} pessoas no período.` },
          {
            texto:
              esperaSeg == null
                ? "Sem dado de espera até a 1ª resposta neste período."
                : `Na metade dos atendimentos, a 1ª resposta veio em até ${dur(esperaSeg)}${(esperaSeg ?? 0) > 3600 ? ": acima de 1 hora. Resposta demorada pode fazer o paciente procurar outra clínica." : "."}`,
            tom: (esperaSeg ?? 0) > 3600 ? "atencao" : atencao ? "flat" : "up",
          },
          { texto: fatiaSemRoteamento > 40 ? `${fatiaSemRoteamento.toFixed(0)}% das conversas não foram para nenhuma equipe: organizar o roteamento é o primeiro ajuste.` : "", tom: "atencao" },
        ]}
      />

      <NxCard id="tempo-fechar" nivel={2} icone={icT("calendar")} titulo="Tempo até fechar" subtitulo="Quando a conversa é encerrada; não é tempo de atendimento">
        <div className="cm-numerao">
          <b>{dur(nOrNull(resumo?.atendimento_mediano_seg))}</b>
          <span>mediana entre abrir e encerrar a conversa</span>
        </div>
        {/* O timeService da WTS é relógio de parede entre abrir e encerrar. Quando muitos encerramentos saem em lote
            (calculado por cliente em wts_fila_do_cliente), o número descreve a arrumação da fila, não o atendimento. */}
        <CmMetodo titulo="Por que este número não mede o atendimento">
          <p>
            Ele mede o intervalo entre abrir e encerrar a conversa, não o tempo de conversa.{" "}
            {fila && avisoLote(fila) ? `${avisoLote(fila)} Por isso o número descreve o hábito de arrumar a fila, não o atendimento. ` : ""}A métrica que
            vale olhar aqui é a <strong>espera até a 1ª resposta</strong>.
          </p>
        </CmMetodo>
      </NxCard>
      </div>

      <CustoWhatsapp clientId={clientId} />

      <CmRecolhido titulo="Ver tabelas por equipe e por atendente" subtitulo="Atendimentos, concluídos, espera e tempo até fechar de cada um">
        <div className="cm-tabela">
          <table className="empilha">
            <thead>
              <tr>
                <th className="text-left">Equipe</th>
                <th className="text-right">Atendimentos</th>
                <th className="text-right">Fatia</th>
                <th className="text-right">Espera</th>
                <th className="text-right">Até fechar</th>
              </tr>
            </thead>
            <tbody>
              {deps.map((r) => (
                <tr key={r.departamento}>
                  <td data-label="Equipe" style={{ fontWeight: 600 }}>{r.departamento}</td>
                  <td data-label="Atendimentos" className="cm-num">{fmtNum(n(r.atendimentos))}</td>
                  <td data-label="Fatia" className="text-right">{nOrNull(r.fatia) === null ? "—" : `${n(r.fatia).toFixed(1)}%`}</td>
                  <td data-label="Espera" className="text-right">{dur(nOrNull(r.espera_mediana_seg))}</td>
                  <td data-label="Até fechar" className="text-right">{dur(nOrNull(r.atendimento_mediano_seg))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cm-tabela">
          <table className="empilha">
            <thead>
              <tr>
                <th className="text-left">Atendente</th>
                <th className="text-right">Atendimentos</th>
                <th className="text-right">Concluídos</th>
                <th className="text-right">Espera</th>
                <th className="text-right">Até fechar</th>
              </tr>
            </thead>
            <tbody>
              {(porAgente ?? []).map((r) => (
                <tr key={r.agente}>
                  <td data-label="Atendente" style={{ fontWeight: 600 }}>{r.agente}</td>
                  <td data-label="Atendimentos" className="cm-num">{fmtNum(n(r.atendimentos))}</td>
                  <td data-label="Concluídos" className="text-right">{fmtNum(n(r.concluidos))}</td>
                  <td data-label="Espera" className="text-right">{dur(nOrNull(r.espera_mediana_seg))}</td>
                  <td data-label="Até fechar" className="text-right">{dur(nOrNull(r.atendimento_mediano_seg))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CmRecolhido>
    </div>
  );
}
