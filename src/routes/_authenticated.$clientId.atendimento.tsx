import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { InfoDica } from "@/components/visual";
import { NxCard, NxLinhaTempo } from "@/components/nx";
import { CmAviso, CmBarras, CmKpi, CmLeitura, CmMetodo, CmRecolhido, icT } from "@/components/nx/comercial-base";
import { PaginaNexo } from "@/components/nx/pagina";
import { NxDescobertas, NxSelo, NxVeredito } from "@/components/nx/cinco-segundos";
import { NxAcaoPilula, NxBarras, NxCartaoNumero } from "@/components/nx/cartoes";
import { linhaDaRota } from "@/components/nx/hoje";
import type { NomeIcone } from "@/lib/registro-de-telas";
import { NxCarregando } from "@/components/nx/blocos";
import { NxDiasComFaixa } from "@/components/nx/dias-com-faixa";
import {
  getWtsResumo,
  getWtsPorDepartamento,
  getWtsPorAgente,
  getWtsVolumeDiario,
  getWtsFilaDoCliente,
  getMonthlyMetrics,
  getAdsPorDia,
} from "@/lib/client-data";
import { CAMPOS_DIARIOS, useResultadosDiarios } from "@/hooks/use-resultados-diarios";
import { avisoContaCompartilhada, avisoFilaEsquecida, avisoLote } from "@/lib/fila-whatsapp";
import { SyncButton } from "@/components/sync-button";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { faixaDoNormal, foraDaFaixa } from "@/lib/faixa-do-normal";
import { serieContinua } from "@/lib/linha-30-dias";
import { periodosDeComparacao, somaDiaria } from "@/lib/leitura/fatos-resultados";
import { ACOES_DE_ATENDIMENTO, descobertasDoAtendimento, diaCruzado, diaInicialDoCruzamento, numerosDoAtendimento, valoresNoEixo, vereditoDoAtendimento, type DiaCruzado, type EntradaCincoAtendimento, type NumeroDeAtendimento } from "@/lib/leitura/cinco-atendimento";
import { visiveisEResto, type Descoberta, type Veredito } from "@/lib/leitura/cinco-segundos";
import { hojeBrasilia } from "@/lib/status-fonte";
import { fmtNum } from "@/lib/format";
import { CustoWhatsapp } from "@/components/custo-whatsapp";
import { ConversasWhatsapp } from "@/components/conversas-whatsapp";
import { useAuth } from "@/hooks/use-auth";
import { useMediaQuery } from "@/hooks/use-is-mobile";
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
  const navigate = Route.useNavigate();
  const atual = aba === "conversas" && isAdmin ? "conversas" : "numeros";
  const ir = (a: "numeros" | "conversas") => navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, aba: a === "conversas" ? "conversas" : undefined, conversa: undefined }) as never });
  return (
    <div className="nx-atend-pagina space-y-4">
      {/* A lista "Recuperar hoje" (agente de recuperação) saiu em 11/11/2026 por decisão do João. */}
      {isAdmin && (
        <div className="nx-atend-abas flex max-w-full flex-wrap gap-1 rounded-xl border p-1 text-sm" role="tablist" aria-label="Atendimento no WhatsApp" style={{ borderColor: "var(--line)", background: "var(--white)" }}>
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
    </div>
  );
}

function NumerosWhatsapp({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const navigate = Route.useNavigate();
  // Celular: o dia cruzado só abre quando a pessoa toca num dia (o painel não cabe na régua de 1,5 tela com as descobertas).
  const estreito = useMediaQuery("(max-width: 560px)");
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

  // O dia de hoje ainda não está fechado: a faixa do normal e os totais usam só dias fechados (um dia pela metade viraria "abaixo do normal").
  const hoje = hojeBrasilia();
  const comparacao = periodosDeComparacao(start, end, hoje);
  const temAnterior = comparacao.dias >= 1;
  const ant = comparacao.anterior;
  // Formato 5 segundos: leituras extras, todas somente leitura. Cada uma custa uma chamada pequena (no máximo 31 linhas, ou 1 linha) e tem
  // retry falso e staleTime de 5 min; a falha de uma só vira "Falta dado" na própria linha, nunca derruba a tela. As chaves de
  // resultados-diarios, monthly-metrics e ads-dia são as mesmas de Resultados e da Hoje (a leitura costuma já estar no cache).
  const extra = { retry: false, staleTime: 5 * 60_000 } as const;
  const wtsDiaAnt = useQuery({ queryKey: ["wts-dia", clientId, ant.start, ant.end], queryFn: () => getWtsVolumeDiario(clientId, ant.start, ant.end), enabled: temAnterior, ...extra });
  const wtsResumoAnt = useQuery({ queryKey: ["wts-resumo", clientId, ant.start, ant.end], queryFn: () => getWtsResumo(clientId, ant.start, ant.end), enabled: temAnterior, ...extra });
  // Pessoas diferentes agora, contadas até o último dia fechado (a mesma janela do período anterior). Sem hoje no período, é a mesma chave de resumoQ.
  const wtsResumoFechado = useQuery({ queryKey: ["wts-resumo", clientId, start, comparacao.fimFechado], queryFn: () => getWtsResumo(clientId, start, comparacao.fimFechado), enabled: temAnterior, ...extra });
  const diario = useResultadosDiarios(clientId, start, end);
  const diarioAnterior = useResultadosDiarios(clientId, ant.start, ant.end);
  const fimIg = end > hoje ? hoje : end;
  const metricasIg = useQuery({ queryKey: ["monthly-metrics", clientId, start, fimIg], queryFn: () => getMonthlyMetrics(clientId, start, fimIg), ...extra });
  const anunciosDia = useQuery({ queryKey: ["ads-dia", clientId, start, fimIg], queryFn: () => getAdsPorDia(clientId, start, fimIg), ...extra });
  // O dia escolhido no gráfico: undefined = a tela ainda decide (abre no dia fora do normal de maior alcance), null = nenhum.
  const [escolhido, setEscolhido] = useState<number | null | undefined>(undefined);
  useEffect(() => setEscolhido(undefined), [clientId, start, end]);

  const { data: resumo, isLoading: loadingResumo } = resumoQ;
  const isLoading =
    loadingResumo || loadingDep || loadingAgente || loadingDia || wtsDiaAnt.isLoading || wtsResumoAnt.isLoading || wtsResumoFechado.isLoading || diario.isLoading || diarioAnterior.isLoading || metricasIg.isLoading || anunciosDia.isLoading;
  const atendimentos = n(resumo?.atendimentos);

  const conversasDoPeriodo = useMemo(
    () =>
      serieContinua(
        (volumeDiario ?? [])
          .filter((r) => String(r.dia).slice(0, 10) <= comparacao.fimFechado)
          .map((r) => ({ dia: String(r.dia).slice(0, 10), valor: nOrNull(r.atendimentos) })),
      ),
    [volumeDiario, comparacao.fimFechado],
  );

  const cabecalho = {
    tela: "atendimento" as const,
    titulo: "Qualidade do atendimento",
    pergunta: "O atendimento deu conta das conversas?",
    meta: <span>{periodLabel}</span>,
    // A sincronização é da equipe: no computador fica no cabeçalho; no celular desce para o "Ver tudo" (a pergunta fica sozinha no topo).
    acao: (
      <div className="nx-atend-sync nx-atend-sync--topo">
        <SyncButton clientId={clientId} alvo="atendimento" />
      </div>
    ),
  };

  if (isLoading) {
    return <PaginaNexo {...cabecalho} veredito={<NxVeredito veredito={null} carregando tela="atendimento" />} leitura={null} corpo={<NxCarregando texto="Lendo o atendimento…" linhas={4} />} />;
  }

  if (resumoQ.isError)
    return (
      <PaginaNexo
        {...cabecalho}
        veredito={<NxVeredito veredito={null} carregando={false} erro="A consulta falhou." tela="atendimento" />}
        leitura={null}
        corpo={
          <div role="alert" className="space-y-3 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-semibold">Não foi possível carregar os números do atendimento</h2>
            <p className="text-sm">A fonte está indisponível. Isso não significa que não houve atendimentos.</p>
            <button type="button" className="ws-action ws-action--secondary" disabled={resumoQ.isFetching} onClick={() => void resumoQ.refetch()}>
              Tentar novamente
            </button>
          </div>
        }
      />
    );

  if (!resumo || atendimentos === 0) {
    // Sem WTS (ex.: Kommo): mede pelas conversas que já chegam ao Nexo. Sem conversas, o aviso de antes.
    const semAtendimento: Veredito = {
      tipo: "sem_leitura",
      motivo: `não há atendimento do WhatsApp no período (${periodLabel}).`,
      passo: { frase: "Conferir a conexão do WhatsApp (WTS).", verbo: "conferir", quem: "equipe_hub", rotuloQuem: "Equipe Doctor Creator" },
    };
    return (
      <PaginaNexo
        {...cabecalho}
        veredito={<NxVeredito veredito={semAtendimento} carregando={false} tela="atendimento" />}
        leitura={null}
        corpo={
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

  // Formato 5 segundos (03.1.1.1): o veredito abre a tela e o gráfico de conversas por dia com a faixa do normal da própria clínica é a prova.
  // Tudo o que a tela mostrava antes mora, na mesma ordem, dentro do "Ver tudo" (fechado).
  const faixa = faixaDoNormal(conversasDoPeriodo.valores);
  const marcas = foraDaFaixa(conversasDoPeriodo.valores, faixa);

  // O que a regra recebe: as conversas por dia dos dois períodos, o histórico diário (quem chamou e quem virou lead), o alcance do Instagram
  // e as conversas do anúncio DESTA clínica. Fonte que falhou entra como null: a regra diz "Falta dado", nunca zero.
  const diasAnt = wtsDiaAnt.data;
  const linhasDiario = (diario.data ?? []).filter((l) => l.dia <= comparacao.fimFechado);
  const entrada: EntradaCincoAtendimento = {
    dias: comparacao.dias,
    conversas: conversasDoPeriodo,
    conversasAntes: diasAnt
      ? serieContinua(diasAnt.filter((r) => String(r.dia).slice(0, 10) <= ant.end).map((r) => ({ dia: String(r.dia).slice(0, 10), valor: nOrNull(r.atendimentos) })))
      : null,
    pessoas: { agora: wtsResumoFechado.data ? nOrNull(wtsResumoFechado.data.contatos_distintos) : null, antes: wtsResumoAnt.data ? nOrNull(wtsResumoAnt.data.contatos_distintos) : null },
    somas: {
      atual: somaDiaria(linhasDiario, comparacao.dias, CAMPOS_DIARIOS),
      antes: somaDiaria(diarioAnterior.data ?? [], comparacao.dias, CAMPOS_DIARIOS),
    },
    diario: linhasDiario.length
      ? {
          mandaram: valoresNoEixo(conversasDoPeriodo.datas, linhasDiario.map((l) => ({ dia: l.dia, valor: l.mandaram_mensagem }))) ?? [],
          leads: valoresNoEixo(conversasDoPeriodo.datas, linhasDiario.map((l) => ({ dia: l.dia, valor: l.leads_novos }))) ?? [],
        }
      : null,
    // Só dias fechados: o dia de hoje pela metade viraria "o anúncio quase parou" ou um alcance abaixo do comum.
    alcance: metricasIg.data
      ? metricasIg.data.map((r: { date: string; reach?: unknown }) => ({ dia: String(r.date).slice(0, 10), valor: nOrNull(r.reach) })).filter((d: { dia: string }) => d.dia <= comparacao.fimFechado)
      : null,
    anuncios: anunciosDia.data
      ? anunciosDia.data.map((r: { dia: string; conversas?: unknown }) => ({ dia: String(r.dia).slice(0, 10), valor: nOrNull(r.conversas) })).filter((d: { dia: string }) => d.dia <= comparacao.fimFechado)
      : null,
    equipe: isAdmin,
  };
  const veredito = vereditoDoAtendimento(entrada);
  const [numeroConversas, numeroTaxa, numeroPessoas] = numerosDoAtendimento(entrada);
  const cartoes = [
    <CartaoDeNumeroCinco key="conversas" n={numeroConversas} icone="message-circle" />,
    <CartaoDeNumeroCinco key="taxa" n={numeroTaxa} icone="filter" />,
    <CartaoDeNumeroCinco key="pessoas" n={numeroPessoas} icone="users" />,
  ];
  // Dia cruzado: abre no dia fora do normal de maior alcance no Instagram da clínica; tocar de novo no mesmo dia fecha.
  const inicial = estreito ? null : diaInicialDoCruzamento(entrada);
  const selecionado = escolhido !== undefined ? escolhido : inicial;
  const dia = selecionado != null ? diaCruzado(selecionado, entrada) : null;

  // Descobertas (de 0 a 5, só com a própria clínica): as 3 primeiras à vista, as outras no começo do "Ver tudo". Sem veredito, nenhuma.
  const descobertas = descobertasDoAtendimento(entrada);
  const { visiveis, resto } = visiveisEResto(descobertas.itens);
  // A ação de uma descoberta só leva a um lugar (CHAM-07: nada é enviado nem gravado): abre o "Ver tudo" na equipe ou a aba de conversas da equipe.
  function agirNaDescoberta(local: string) {
    if (local === ACOES_DE_ATENDIMENTO.porEquipe) {
      const detalhes = document.getElementById("detalhes-atendimento") as HTMLDetailsElement | null;
      if (detalhes) detalhes.open = true;
      requestAnimationFrame(() => document.getElementById("por-equipe")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } else if (local === ACOES_DE_ATENDIMENTO.conversas && isAdmin) {
      void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, aba: "conversas", conversa: undefined }) as never });
    }
  }

  return (
    <PaginaNexo
      {...cabecalho}
      veredito={<NxVeredito veredito={veredito} carregando={false} tela="atendimento" />}
      leitura={null}
      cartoes={cartoes as [ReactNode, ReactNode?, ReactNode?]}
      descobertas={
        veredito.tipo === "veredito" ? (
          <NxDescobertas
            titulo="O que os números dizem"
            apoio={<p className={descobertas.aviso ? "nx-cinco-falta" : "nx-cinco-falta nx-atendimento-ordem"}>{descobertas.aviso ?? "Em ordem de impacto"}</p>}
            itens={visiveis}
            clientId={clientId}
            dateRange={dateRangeState}
            aoAgir={agirNaDescoberta}
          />
        ) : undefined
      }
      principal={
        conversasDoPeriodo.datas.length > 0 ? (
          <NxCard id="conversas-por-dia" nivel={2} icone={icT("chart-bar")} titulo="Conversas por dia, com a faixa do normal" subtitulo={`${periodLabel} · só dias fechados`}>
            {/* No computador o dia cruzado fica ao lado do gráfico (não custa altura); no celular, embaixo. */}
            <div className="nx-atend-grafico">
              <NxDiasComFaixa
                rotulo="conversas"
                datas={conversasDoPeriodo.datas}
                valores={conversasDoPeriodo.valores}
                faixa={faixa}
                marcas={marcas}
                selecionado={selecionado}
                aoSelecionar={(i) => setEscolhido(i === selecionado ? null : i)}
              />
              {dia ? <DiaDoGrafico dia={dia} /> : <p className="nx-cinco-falta nx-dia-cruzado__dica">Toque num dia para ver o que aconteceu</p>}
            </div>
          </NxCard>
        ) : undefined
      }
      corpo={
        fila && (avisoFilaEsquecida(fila) || avisoContaCompartilhada(fila)) ? (
          <div className="cm-avisos">
            {avisoFilaEsquecida(fila) && <CmAviso tom="atencao" titulo="Fila esquecida:">{avisoFilaEsquecida(fila)}</CmAviso>}
            {/* Conta do WTS ligada a mais de um cliente: o aviso sai do cadastro, não de texto fixo. */}
            {avisoContaCompartilhada(fila) && <CmAviso tom="atencao">{avisoContaCompartilhada(fila)}</CmAviso>}
          </div>
        ) : undefined
      }
      resumoDoVerTudo="dia a dia, equipes, espera e custo"
      detalhe={
        <div className="nexo-comercial" style={{ gap: 18 }}>
          <div className="nx-atend-sync nx-atend-sync--ver-tudo">
            <SyncButton clientId={clientId} alvo="atendimento" />
          </div>
          {resto.length > 0 && <MaisDescobertasDoAtendimento itens={resto} clientId={clientId} dateRange={dateRangeState} aoAgir={agirNaDescoberta} />}
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
      }
    />
  );
}

/**
 * Um dos 3 números-chave no formato 5 segundos: o número, a legenda, a variação contra a PRÓPRIA clínica (sinal e palavra na pílula) e, sem
 * comparação, o selo "Falta dado · ..." em cinza. Sem medida, "Falta dado: motivo" (nunca 0). Só apresentação.
 */
function CartaoDeNumeroCinco({ n: numero, icone }: { n: NumeroDeAtendimento; icone: NomeIcone }) {
  const semMedida = numero.valor == null && numero.valorTexto == null;
  return (
    <NxCartaoNumero
      icone={icone}
      titulo={numero.titulo}
      valor={numero.valorTexto ?? (numero.valor != null ? fmtNum(numero.valor) : null)}
      legenda={semMedida ? undefined : numero.legenda}
      semMedida={semMedida}
      variacao={numero.textoDaVariacao ? { texto: numero.textoDaVariacao } : null}
      extra={
        semMedida ? (
          <p className="nx-cinco-falta" data-falta-dado>{`Falta dado: ${numero.motivo ?? "sem medida neste período"}`}</p>
        ) : !numero.textoDaVariacao && numero.selo ? (
          <NxSelo tom={numero.selo.tom} texto={numero.selo.texto} />
        ) : null
      }
      serie={numero.serie}
    />
  );
}

/** O dia tocado no gráfico, cruzado com o Instagram e os anúncios da própria clínica, e a "Provável causa" (regra fixa, sem IA). */
function DiaDoGrafico({ dia }: { dia: DiaCruzado }) {
  const linha = (rotulo: string, valor: number | null, falta: string | null, apoio: string | null) => (
    <div className="nx-dia-cruzado__item">
      <dt>{rotulo}</dt>
      {valor != null ? (
        <>
          <dd className="nx-dia-cruzado__valor">{fmtNum(valor)}</dd>
          {apoio && <dd className="nx-dia-cruzado__apoio">{apoio}</dd>}
        </>
      ) : (
        <dd className="nx-dia-cruzado__valor nx-dia-cruzado__valor--falta" data-falta-dado>
          {falta ?? "Falta dado"}
        </dd>
      )}
    </div>
  );
  return (
    <div className="nx-dia-cruzado" data-peca="dia-cruzado" aria-live="polite">
      <p className="nx-dia-cruzado__titulo">
        <b>{dia.titulo}</b>
        {dia.notaDaMarca && <span className="nx-dia-cruzado__nota" data-marca={dia.marca ?? undefined}>{dia.notaDaMarca}</span>}
      </p>
      <dl className="nx-dia-cruzado__grade">
        {linha("Conversas", dia.conversas, "Sem dado", dia.leads != null ? `${fmtNum(dia.leads)} viraram lead` : null)}
        {linha("Alcance no Instagram", dia.alcance.valor, dia.alcance.faltaDado, dia.alcance.comparacao)}
        {linha("Conversas pelo anúncio", dia.anuncio.valor, dia.anuncio.faltaDado, dia.anuncio.comparacao)}
      </dl>
      <p className="nx-dia-cruzado__causa" data-causa={dia.causaVinda ?? undefined}>{dia.causa}</p>
    </div>
  );
}

/** As descobertas que passam das 3 à vista (4 e 5) moram no "Ver tudo", já com os fatores do "Por quê?" abertos (nada some). Só navegam. */
function MaisDescobertasDoAtendimento({ itens, clientId, dateRange, aoAgir }: { itens: readonly Descoberta[]; clientId: string; dateRange: ReturnType<typeof clientLayoutRoute.useSearch>; aoAgir: (local: string) => void }) {
  return (
    <section className="nx-cinco-resto" aria-label="Mais descobertas do período" data-peca="mais-descobertas">
      <h3 className="nx-cinco-resto__titulo">Mais descobertas do período</h3>
      <div className="nx-cinco-resto__grade">
        {itens.map((d) => {
          const linha = d.acao.rota ? linhaDaRota(d.acao.rota) : undefined;
          return (
            <article key={d.id} className="nx-cinco-resto__item" data-descoberta-extra={d.id}>
              <NxSelo tom={d.tom} texto={d.selo} />
              <p className="nx-cinco-resto__frase">{d.frase}</p>
              <NxBarras barras={d.porque.barras} rotulo={d.porque.titulo} />
              {d.porque.obs && <p className="nx-cinco-falta">{d.porque.obs}</p>}
              {linha ? (
                <NxAcaoPilula frase={d.acao.rotulo} rotuloDaSeta="Abrir a aba de origem" para={{ tela: linha, clientId, dateRange }} />
              ) : d.acao.local ? (
                <NxAcaoPilula frase={d.acao.rotulo} rotuloDaSeta="Abrir" aoAbrir={() => aoAgir(d.acao.local as string)} />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
