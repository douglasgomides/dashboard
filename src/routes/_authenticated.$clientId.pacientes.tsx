import { useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMediaQuery } from "@/hooks/use-is-mobile";
import { Ajuda } from "@/components/visual";
import { usePacientesPeriodo } from "@/hooks/use-pacientes-periodo";
import { CAMPOS_DIARIOS, useResultadosDiarios, type CampoDiario } from "@/hooks/use-resultados-diarios";
import { PaginaNexo } from "@/components/nx/pagina";
import { NxBlocoDoVerTudo } from "@/components/nx/cabeca-do-bloco";
import { usePublicarContagem } from "@/components/nx/abas-em-pasta";
import { NxFunilDesenhado } from "@/components/nx/funil-desenhado";
import { NxLinhaDe30Dias, type SerieDiaria } from "@/components/nx/linha-de-30-dias";
import { serieContinua } from "@/lib/linha-30-dias";
import { dePacientesDoPeriodo, rotuloDoAnterior, type VariacaoDaEtapa } from "@/lib/funil-desenhado";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { NxDescobertas, NxMaisDescobertas, NxSelo, NxVeredito } from "@/components/nx/cinco-segundos";
import { NxPessoasNaMesa } from "@/components/nx/pessoas-na-mesa";
import { ACOES_DE_PACIENTES, descobertasDePacientes, numerosDePacientes, pessoasNaMesa, vereditoDePacientes, type EntradaCincoPacientes, type NumeroDePacientes } from "@/lib/leitura/cinco-pacientes";
import { textoDaFrase, visiveisEResto } from "@/lib/leitura/cinco-segundos";
import { cabecaDaSerieDiaria, enfase, faltaDado, inteiro, primeiraQueCabe } from "@/lib/leitura/cabeca-do-bloco";
import { descobertasDaLeitura, juntarDescobertas, periodoDoVerTudo } from "@/lib/leitura/leitura-em-descobertas";
import { cabecaDeQuemChamar, cabecaDeQuemChamou, cabecaDosNaoMedidos, semRepetirOVeredito } from "@/lib/leitura/ver-tudo-pacientes";
import { NxAviso, NxCarregando, NxErro, NxRecolhido } from "@/components/nx/blocos";
import { fatosDePacientes } from "@/lib/leitura/fatos-pacientes";
import { periodosDeComparacao, somaDiaria, variacaoPct, type VariacaoPct } from "@/lib/leitura/fatos-resultados";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { hojeBrasilia } from "@/lib/status-fonte";
import { fmtBRL } from "@/lib/format";
import { DIAS_HISTORICO_RECOMPRA, FOLLOW_UP } from "@/lib/config/recompra";
import { METRICAS_META, ROTULO_META, diasDoMes, type MetricaMeta } from "@/lib/inteligencia-resultados";
import {
  CHAVES_NUMEROS,
  ROTULO_CANAL,
  ROTULO_FONTE,
  ROTULO_ORIGEM,
  TEXTO_NUMERO,
  dataBr,
  emQuePe,
  fonteDoNumero,
  legendaDoNumero,
  coberturaDoNumero,
  avisoCrmCompartilhado,
  avisoNaoMedido,
  avisoTelaHonesta,
  avisoAgendouMenosQueFechou,
  textoNaoMedido,
  notaCrmPorMedico,
  nomeCheckout,
  oQue,
  textoReembolsos,
  textoRenovacoes,
  avisoCheckout,
  vemDoCheckout,
  paraChamarAgora,
  recompraDe,
  rotuloRecompra,
  type ChaveNumero,
  type ItemPessoa,
  type Numero,
  type PacientesPeriodo,
  type VendaHistorico,
} from "@/lib/pacientes";

import "@/styles/nexo-resultados.css";
import "@/styles/nexo-cinco-resultados.css";
import { NxCard, NxKpi, NxLinhaTempo, NxListRow, NxPizza, NxTag } from "@/components/nx";
import { icT } from "@/components/nx/comercial-base";
import { NxComoCalcula } from "@/components/nx/anuncios-graficos";
import type { NomeIcone } from "@/lib/registro-de-telas";

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

export const Route = createFileRoute("/_authenticated/$clientId/pacientes")({
  component: PacientesDoPeriodo,
});

const METRICAS = ["mandaram_mensagem", "agendaram", "fecharam", "compareceram"] as const;

const fmt = (n: number | null | undefined) => (n == null ? "" : Number(n).toLocaleString("pt-BR"));
const pessoas = (n: number) => `${fmt(n)} ${n === 1 ? "pessoa" : "pessoas"}`;

/** A mesma variação no formato da etiqueta do cartão (seta na forma, não só na cor). */
function paraCartao(v: VariacaoPct | null | undefined) {
  return v && v.tom !== "flat" ? { sobe: v.tom === "up", percentual: `${Math.abs(v.pct)}%`, contexto: "vs. período anterior" } : null;
}

/** A etapa do funil desenhado para a lista de pessoas que a tela já abre ("Ver quem são"). */
const CHAVE_DA_ETAPA: Record<string, ChaveNumero> = { conversou: "mandaram_mensagem", "virou-lead": "leads_novos", atendido: "negociacao", agendou: "agendaram", fechou: "fecharam" };

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function somaDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

type MetasDefinidas = Partial<Record<MetricaMeta, number>>;

/**
 * Metas do mês em curso (tabela clinica_metas) e quanto já foi feito neste mês: as mesmas consultas de antes, agora para
 * a leitura dizer a meta como fato ("28 de 40, faltam 12"). Some sozinha sem meta e sem erro para quem não é da equipe.
 */
function useMetasDoMes(clientId: string, hoje: string) {
  const dm = diasDoMes(hoje);
  const metas = useQuery({
    queryKey: ["clinica-metas", clientId],
    queryFn: async (): Promise<MetasDefinidas> => {
      const { data, error } = await (supabase as any).from("clinica_metas").select("metrica,valor").eq("client_id", clientId);
      if (error) throw new Error(error.message);
      const out: MetasDefinidas = {};
      for (const r of data ?? []) out[r.metrica as MetricaMeta] = Number(r.valor);
      return out;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const temMeta = !!metas.data && Object.keys(metas.data).length > 0;
  const mes = usePacientesPeriodo(clientId, dm.inicio, hoje, temMeta);
  const definidas = METRICAS_META.filter((k) => metas.data?.[k]);
  const paraFatos = useMemo(() => {
    const out: Partial<Record<MetricaMeta, { meta: number; atual: number | null }>> = {};
    if (!mes.data) return out;
    for (const k of definidas) out[k] = { meta: metas.data![k]!, atual: mes.data.numeros?.[k]?.valor ?? null };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes.data, metas.data]);
  return { dm, metas, mes, definidas, paraFatos, carregando: metas.isPending || (temMeta && mes.isLoading) };
}

function PacientesDoPeriodo() {
  const { clientId } = Route.useParams();
  // Celular: a grade de pessoas na mesa usa no máximo 40 pontos (a escala sobe um degrau), para o cartão caber na régua de 1,5 tela.
  const estreito = useMediaQuery("(max-width: 560px)");
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const { isAdmin } = useAuth();
  const hoje = hojeBrasilia();
  const [aberta, setAberta] = useState<ChaveNumero | null>(null);
  const [chamarTodos, setChamarTodos] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);

  const q = usePacientesPeriodo(clientId, start, end);
  // O dia de hoje ainda não está fechado no histórico: compara só dias fechados, com o mesmo número de dias nos dois lados.
  const comparacao = periodosDeComparacao(start, end, hoje);
  // A comparação com o período anterior vem do histórico diário (instantâneo e igual nos dois lados). A conta pesada
  // de pessoas únicas do período anterior estourava o limite de 8 s do banco nas clínicas grandes.
  const diario = useResultadosDiarios(clientId, start, end);
  const diarioAnterior = useResultadosDiarios(clientId, comparacao.anterior.start, comparacao.anterior.end);
  const somas = useMemo(
    () => ({
      atual: somaDiaria((diario.data ?? []).filter((l) => l.dia <= comparacao.fimFechado), comparacao.dias, CAMPOS_DIARIOS),
      antes: somaDiaria(diarioAnterior.data ?? [], comparacao.dias, CAMPOS_DIARIOS),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diario.data, diarioAnterior.data, start, end, hoje],
  );
  const metas = useMetasDoMes(clientId, hoje);
  const historico = useQuery({
    queryKey: ["pacientes-vendas", clientId, hoje],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("pacientes_vendas", {
        p_client: clientId,
        p_de: somaDias(hoje, -DIAS_HISTORICO_RECOMPRA),
        p_ate: hoje,
      });
      if (error) throw new Error(error.message);
      return data as { total: number; itens: VendaHistorico[] };
    },
    staleTime: 10 * 60_000,
  });

  // Quem chamar agora: lista de pessoas da equipe. Fica na tela e fora da leitura (a leitura só recebe números).
  const chamar = useMemo(() => (q.data ? paraChamarAgora(historico.data?.itens ?? [], q.data.listas.agendaram.itens, hoje) : []), [q.data, historico.data, hoje]);

  // Leitura do período: calculada na hora, só do que a tela já carregou (sem consulta nova, sem IA). Só números entram.
  const fatos = useMemo(
    () => (q.data ? fatosDePacientes({ dados: q.data, de: start, ate: end, hoje, somaAtual: somas.atual, somaAntes: somas.antes, metas: metas.paraFatos }) : null),
    [q.data, start, end, hoje, somas, metas.paraFatos],
  );

  // Contagem em cinza das abas Funil e Jornada (D-07): as pessoas que viraram lead no período, que esta tela já carregou (nenhuma
  // consulta nova). Carregando: undefined (não vira "—"); erro ou sem dado: null; zero: null (a aba mostra "—", nunca "0").
  usePublicarContagem({
    clientId,
    de: start,
    ate: end,
    rota: "/_authenticated/$clientId/pacientes",
    valor: q.isLoading ? undefined : q.isError || !q.data ? null : q.data.numeros.leads_novos?.valor || null,
  });

  // Linha de 30 dias dos cartões de pessoas: o histórico diário que a tela já carregou (nenhuma consulta nova). Só dias fechados; dia
  // sem linha ou sem valor é buraco, nunca zero.
  const seriesDosCartoes = useMemo(() => {
    const out: Partial<Record<ChaveNumero, SerieDiaria>> = {};
    const linhas = (diario.data ?? []).filter((l) => l.dia <= comparacao.fimFechado);
    for (const k of METRICAS) {
      const { datas, valores } = serieContinua(linhas.map((l) => ({ dia: l.dia, valor: l[k as CampoDiario] ?? null })));
      if (datas.length >= 2) out[k] = { rotulo: TEXTO_NUMERO[k].rotulo.toLowerCase(), datas, valores };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diario.data, start, end, hoje]);

  // O funil desenhado: a mesma conta dos números da tela, só desenhada. A variação vem do diário (período anterior em memória),
  // convertida só quando o tom não é "flat"; a conta pesada de pessoas do período anterior continua proibida (estoura 8 s).
  const funilDesenhado = useMemo(() => {
    if (!q.data) return null;
    const variacao = (chave: string): VariacaoDaEtapa | null => {
      const v = variacaoPct(somas.atual[chave], somas.antes[chave]);
      return v && v.tom !== "flat" ? { pct: v.pct, sobe: v.tom === "up" } : null;
    };
    return dePacientesDoPeriodo({ dados: q.data, variacao });
  }, [q.data, somas]);

  function abrir(k: ChaveNumero) {
    setAberta((atual) => (atual === k ? null : k));
    requestAnimationFrame(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  // "Ver quem são" da gaveta do funil: sempre mostra a lista (não alterna, para não fechar a que já estava aberta).
  function mostrar(k: ChaveNumero) {
    setAberta(k);
    requestAnimationFrame(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const rotuloPeriodo = formatRangeLabel({ start, end });
  const cabecalho = {
    tela: "pacientes" as const,
    titulo: "Pacientes do período",
    pergunta: "Onde as pessoas travam do contato até a venda?",
    decisao: "D1" as const,
    meta: <span>{rotuloPeriodo}</span>,
  };

  if (q.isLoading)
    return <PaginaNexo {...cabecalho} veredito={<NxVeredito veredito={null} carregando tela="pacientes" />} leitura={null} corpo={<NxCarregando texto="Contando as pessoas do período…" linhas={4} />} />;
  if (q.isError || !q.data)
    return (
      <PaginaNexo
        {...cabecalho}
        veredito={<NxVeredito veredito={null} carregando={false} erro="A consulta falhou." tela="pacientes" />}
        leitura={null}
        corpo={<NxErro texto="Não foi possível carregar os pacientes do período. A consulta falhou." onTentar={() => void q.refetch()} />}
      />
    );

  const d = q.data;
  const eng = d.numeros.engajaram_instagram;
  const vc = (k: string) => variacaoPct(somas.atual[k], somas.antes[k]);

  const novas = d.numeros.leads_novos?.valor, antigos = d.numeros.antigos?.valor;
  const rosca = novas != null && antigos != null && novas + antigos > 0 ? { novas, antigos } : null;
  const indisponiveis = CHAVES_NUMEROS.filter((k) => d.numeros[k] && d.numeros[k]!.valor == null);

  const ICONE: Partial<Record<ChaveNumero, NomeIcone>> = { mandaram_mensagem: "message-circle", agendaram: "calendar", fecharam: "checklist", compareceram: "stethoscope" };
  const linhasDia = (diario.data ?? []).filter((l) => l.mandaram_mensagem != null || l.agendaram != null);
  const avisosLeitura = [avisoAgendouMenosQueFechou(d), avisoTelaHonesta(d), eng].filter(Boolean).length;

  const cartoes = METRICAS.filter((k) => d.numeros[k]).map((k, i) => (
    <CartaoDePessoas
      key={k}
      i={i}
      chave={k}
      icone={ICONE[k] ?? "users"}
      numero={d.numeros[k]}
      ativo={aberta === k}
      onAbrir={() => abrir(k)}
      // A mudança contra o período anterior já está no funil do topo (quick-ver-tudo): aqui só o número de pessoas, a fonte e a linha.
      variacao={null}
      serie={seriesDosCartoes[k]}
    />
  ));

  const avisos = [
    avisoCrmCompartilhado(d) && (
      <NxAviso key="crm" tom="critico" titulo="CRM compartilhado:">
        {avisoCrmCompartilhado(d)}
      </NxAviso>
    ),
    d.cliente_de_teste && (
      <NxAviso key="teste" tom="atencao" titulo="Clínica de teste:">
        estes números não entram nas somas da carteira.
      </NxAviso>
    ),
    notaCrmPorMedico(d) && (
      <NxAviso key="medico" tom="info" titulo="CRM por médico:">
        {notaCrmPorMedico(d)}
      </NxAviso>
    ),
  ].filter(Boolean);

  // Formato 5 segundos (03.1.1.1): o veredito da maior perda abre a tela; "Pessoas na mesa" (Virou lead menos Atendido) é o número-chave 1 e
  // aparece uma vez só na página visível. A leitura de antes e tudo o que a tela mostrava moram no "Ver tudo", fechado.
  const carregandoFontes = diario.isPending || diarioAnterior.isPending || metas.carregando;
  const veredito = funilDesenhado ? vereditoDePacientes({ funil: funilDesenhado, fatos }) : null;
  const entradaCinco: EntradaCincoPacientes | null = funilDesenhado
    ? {
        funil: funilDesenhado,
        somas,
        numeros: Object.fromEntries(CHAVES_NUMEROS.map((k) => [k, d.numeros[k]?.valor ?? null])),
        fatos,
        dias: comparacao.dias,
      }
    : null;
  const [numeroMesa, numeroAgenda, numeroFecharam] = entradaCinco ? numerosDePacientes(entradaCinco) : [];
  const mesa = funilDesenhado ? pessoasNaMesa(funilDesenhado, { maximoDePontos: estreito ? 40 : 100 }) : { faltaDado: "O funil do período não veio." };
  // "Ver quem está esperando" só abre uma lista que a tela já tem (D-04: nada é enviado): a dos leads, ou a de quem foi atendido.
  const listaDaMesa: ChaveNumero | null = d.listas?.leads_novos ? "leads_novos" : d.listas?.negociacao ? "negociacao" : null;
  const cartoesCinco = [
    numeroMesa && (
      <CartaoDeNumeroCinco
        key="mesa"
        n={numeroMesa}
        icone="users"
        desenho={mesa.faltaDado == null ? <NxPessoasNaMesa mesa={mesa} /> : undefined}
        acao={
          mesa.faltaDado == null && listaDaMesa ? (
            <button type="button" className="nx-botao" onClick={() => mostrar(listaDaMesa)}>
              Ver quem está esperando
            </button>
          ) : undefined
        }
      />
    ),
    numeroAgenda && <CartaoDeNumeroCinco key="agendam" n={numeroAgenda} icone="calendar" />,
    numeroFecharam && <CartaoDeNumeroCinco key="fecharam" n={numeroFecharam} icone="checklist" serie={seriesDosCartoes.fecharam} />,
  ].filter(Boolean) as ReactNode[];

  // Descobertas (de 0 a 5, só com a própria clínica): as 3 primeiras à vista, as outras no começo do "Ver tudo". Sem leitura, nenhuma.
  const descobertas = entradaCinco ? descobertasDePacientes(entradaCinco) : { itens: [], aviso: null };
  // A leitura do período saiu do "Ver tudo" (João 13/11/2026): o que ela dizia e o topo ainda não diz vira descoberta. A "maior perda" é do
  // veredito (a regra nova olha cada passagem): a frase antiga da leitura sobre a maior perda não volta.
  const fraseDoVeredito = veredito?.tipo === "veredito" ? textoDaFrase(veredito.frase) : null;
  const daLeitura = descobertasDaLeitura({
    fatos,
    descobertas: descobertas.itens,
    jaDitos: ["maior-perda"],
    textoDoTopo: [
      fraseDoVeredito ?? "",
      ...(funilDesenhado?.etapas ?? []).map((e) => `${e.texto} ${e.variacao ? `${Math.abs(Math.round(e.variacao.pct))}%` : ""}`),
      ...[numeroMesa, numeroAgenda, numeroFecharam].map((n) => (n ? `${n.valorTexto ?? n.valor ?? ""} ${n.textoDaVariacao ?? ""}` : "")),
    ],
  });
  const { visiveis, resto: restoDaRegra } = visiveisEResto(juntarDescobertas(descobertas.itens, daLeitura));
  // O que repete o veredito não volta no "Ver tudo" ("Entre Agendou e Fechou, 30% passam" quando o veredito já diz os 30%).
  const resto = semRepetirOVeredito(restoDaRegra, fraseDoVeredito);
  const avisoDasDescobertas = visiveis.length >= 3 ? null : descobertas.aviso;
  // A ação de uma descoberta só abre uma lista que a tela já tem ou leva ao funil desenhado (CHAM-07: nada é enviado nem gravado).
  function agirNaDescoberta(local: string) {
    const lista: Record<string, ChaveNumero> = { [ACOES_DE_PACIENTES.leads]: "leads_novos", [ACOES_DE_PACIENTES.agendaram]: "agendaram", [ACOES_DE_PACIENTES.fecharam]: "fecharam" };
    const chave = lista[local];
    if (chave && d.listas?.[chave]) mostrar(chave);
    else if (local === ACOES_DE_PACIENTES.funil) document.getElementById("funil")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <PaginaNexo
      {...cabecalho}
      veredito={<NxVeredito veredito={veredito} carregando={carregandoFontes} tela="pacientes" />}
      leitura={null}
      periodoDoVerTudo={carregandoFontes ? null : periodoDoVerTudo(fatos)}
      semSeloNoVerTudo
      cartoes={cartoesCinco.length ? (cartoesCinco as [ReactNode, ReactNode?, ReactNode?]) : undefined}
      descobertas={
        carregandoFontes || veredito?.tipo !== "veredito" ? undefined : (
          <NxDescobertas
            titulo="O que fazer com isso"
            apoio={<p className={avisoDasDescobertas ? "nx-cinco-falta" : "nx-cinco-falta nx-pacientes-ordem"}>{avisoDasDescobertas ?? "Em ordem de impacto"}</p>}
            itens={visiveis}
            clientId={clientId}
            dateRange={dateRangeState}
            aoAgir={agirNaDescoberta}
          />
        )
      }
      resumoDoVerTudo="etapa por etapa, listas e evolução por dia"
      principal={
        funilDesenhado ? (
          <NxCard id="funil" nivel={2} icone={icT("filter")} titulo="Do contato à venda" subtitulo={`${rotuloPeriodo} · toque numa etapa`}>
            <NxFunilDesenhado
              titulo="Do contato à venda"
              funil={funilDesenhado}
              rotuloDoAnterior={rotuloDoAnterior(comparacao.dias)}
              acaoDaEtapa={(etapa, fechar) => {
                const chave = CHAVE_DA_ETAPA[etapa.id];
                if (!chave || etapa.valor == null) return null;
                return (
                  <button
                    type="button"
                    className="nxr-ver"
                    onClick={() => {
                      fechar();
                      mostrar(chave);
                    }}
                  >
                    Ver quem são
                  </button>
                );
              }}
            />
          </NxCard>
        ) : undefined
      }
      corpo={
        <div className="nexo-results-overview">
          {avisos.length > 0 && <div className="nxr-avisos">{avisos}</div>}

          <div ref={listaRef} className="scroll-mt-4" hidden={!aberta}>
            {aberta && <ListaDePessoas chave={aberta} dados={d} clientId={clientId} isAdmin={isAdmin} hoje={hoje} onFechar={() => setAberta(null)} />}
          </div>
        </div>
      }
      detalhe={
        <div className="nexo-results-overview">
          <NxMaisDescobertas itens={resto} clientId={clientId} dateRange={dateRangeState} aoAgir={agirNaDescoberta} />
          {cartoes.length > 0 && (
            <NxBlocoDoVerTudo
              rotulo="Pessoas de cada etapa"
              cabeca={(() => {
                const chamaram = d.numeros.mandaram_mensagem?.valor;
                const fecharam = d.numeros.fecharam?.valor;
                return chamaram == null
                  ? faltaDado(d.numeros.mandaram_mensagem?.motivo_sem_dado ?? "o CRM não respondeu")
                  : primeiraQueCabe(
                      [
                        fecharam != null ? [{ texto: "Cada pessoa conta uma vez: " }, enfase(inteiro(chamaram)), { texto: ` chamaram e ${inteiro(fecharam)} fecharam.` }] : null,
                        [{ texto: "Cada pessoa conta uma vez: " }, enfase(inteiro(chamaram)), { texto: " chamaram no período." }],
                      ],
                      "neutro",
                      "o CRM não respondeu",
                    );
              })()}
            >
              <div className="nx-grade nx-grade--4">{cartoes}</div>
            </NxBlocoDoVerTudo>
          )}
          {linhasDia.length >= 3 && (
            <NxBlocoDoVerTudo rotulo="Evolução por dia" cabeca={cabecaDaSerieDiaria(linhasDia.map((l) => ({ dia: l.dia, valor: l.mandaram_mensagem })), "contatos")}>
            <NxCard id="evolucao" nivel={2} icone={icT("chart-bar")} titulo="Evolução por dia" subtitulo={rotuloPeriodo}>
              <NxLinhaTempo
                rotulo="Pessoas que chamaram e agendamentos por dia"
                datas={linhasDia.map((l) => l.dia)}
                series={[
                  { rotulo: "Chamaram", valores: linhasDia.map((l) => l.mandaram_mensagem ?? 0), cor: "var(--b1)", area: true },
                  { rotulo: "Agendaram", valores: linhasDia.map((l) => l.agendaram ?? 0), cor: "var(--or)", eixo: "dir" },
                ]}
                formatarData={dataCurta}
                formatarValor={(n) => fmt(Math.round(n))}
                altura={180}
              />
              <NxComoCalcula titulo="Como ler este gráfico">
                <p className="nxr-apoio">Pessoas que chamaram (eixo da esquerda) e agendamentos (eixo da direita). Cada ponto conta as pessoas daquele dia. A soma dos dias pode ser maior que o número do cartão, porque quem chamou em dois dias conta uma vez só no período.</p>
              </NxComoCalcula>
            </NxCard>
            </NxBlocoDoVerTudo>
          )}

          <NxBlocoDoVerTudo
            cabeca={cabecaDeQuemChamar({
              total: chamar.length,
              atrasados: chamar.filter((c) => c.tipo === "recompra" && c.faltam < 0).length,
              carregando: historico.isLoading,
              semVendas: d.numeros.fecharam.valor == null ? (d.numeros.fecharam.motivo_sem_dado ?? null) : null,
            })}
          >
          <NxCard
            id="chamar-agora"
            nivel={2}
            icone={icT("message-circle")}
            titulo="Para chamar agora"
            subtitulo={`Quem já pode voltar pelo procedimento que fez e quem agendou e sumiu${chamar.length ? ` · ${fmt(chamar.length)} ${chamar.length === 1 ? "pessoa" : "pessoas"}` : ""}`}
            acao={
              <Ajuda>
                O prazo de volta de cada procedimento está na configuração do Nexo (toxina de 120 a 180 dias, preenchimento de 270 a 365, bioestimulador 365, laser e tecnologias 30, consulta 30, implante hormonal 180). Procedimento sem prazo aparece como "definir prazo" na lista de quem fechou. Olha as vendas dos últimos {DIAS_HISTORICO_RECOMPRA} dias.
              </Ajuda>
            }
          >
            <p className="nxr-apoio">
              Vence em até {FOLLOW_UP.diasAntesDaRecompra} dias (ou já venceu) o prazo de voltar, ou agendou e, depois de {FOLLOW_UP.diasAgendouSemRetorno} dias, não aparece que foi na consulta nem que fechou.
            </p>
            {historico.isLoading ? (
              <NxCarregando texto="Procurando quem já pode voltar…" linhas={2} />
            ) : historico.isError ? (
              <p className="nxr-apoio" role="alert">Não deu para ler as vendas anteriores agora. A lista de quem agendou e sumiu continua abaixo.</p>
            ) : null}
            {chamar.length === 0 && !historico.isLoading ? (
              <p className="nxr-apoio">
                {d.numeros.fecharam.valor == null && d.numeros.fecharam.motivo_sem_dado
                  ? `Sem as vendas, não dá para saber quem volta. ${d.numeros.fecharam.motivo_sem_dado}`
                  : "Ninguém para chamar agora."}
              </p>
            ) : (
              <ul className="nx-lista">
                {chamar.slice(0, chamarTodos ? 100 : 8).map((c) => (
                  <li key={c.id}>
                    <NxListRow
                      titulo={c.nome ?? "Sem nome no cadastro"}
                      sub={<span>{c.motivo}.</span>}
                      fim={
                        <>
                          <NxTag tom={c.tipo === "recompra" ? (c.faltam < 0 ? "dn" : "or") : "b"}>
                            {c.tipo === "recompra" ? (c.faltam < 0 ? `atrasado ${-c.faltam} dias` : c.faltam === 0 ? "hoje" : `em ${c.faltam} dias`) : "fazer follow-up"}
                          </NxTag>
                          {isAdmin && c.conversa_id && <BotaoConversa clientId={clientId} conversaId={c.conversa_id} />}
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            {chamar.length > 8 && (
              <button type="button" className="nx-botao" style={{ justifySelf: "start" }} onClick={() => setChamarTodos(!chamarTodos)}>
                {chamarTodos ? "Mostrar só os 8 primeiros" : `Ver todos (${fmt(Math.min(chamar.length, 100))}${chamar.length > 100 ? " de " + fmt(chamar.length) : ""})`}
              </button>
            )}
          </NxCard>
          </NxBlocoDoVerTudo>

          {rosca && (
            <NxBlocoDoVerTudo rotulo="Quem chamou" cabeca={cabecaDeQuemChamou(rosca)}>
            <NxCard id="rosca" nivel={2} icone={icT("users")} titulo="Quem chamou" subtitulo={`${rotuloPeriodo} · ${fmt(rosca.novas + rosca.antigos)} pessoas`}>
              <NxPizza
                rotulo="Quem chamou"
                fatias={[
                  { rotulo: `Pessoas novas · ${fmt(rosca.novas)}`, valor: rosca.novas, cor: "var(--b1)" },
                  { rotulo: `Pacientes antigos · ${fmt(rosca.antigos)}`, valor: rosca.antigos, cor: "var(--b4)" },
                ]}
              />
            </NxCard>
            </NxBlocoDoVerTudo>
          )}

          <MetasDoMesNx clientId={clientId} isAdmin={isAdmin} metas={metas} />

          {indisponiveis.length > 0 && (
            <NxBlocoDoVerTudo cabeca={cabecaDosNaoMedidos(indisponiveis.length)}>
            <NxRecolhido titulo={`Números que não aparecem aqui (${indisponiveis.length})`} resumo="O que não é medido nesta clínica, por quê e o que fazer">
              <ul className="nx-lista">
                {indisponiveis.map((k) => (
                  <li key={k}>
                    <NxListRow
                      titulo={`${TEXTO_NUMERO[k].rotulo}: ${textoNaoMedido(d.numeros[k]).toLowerCase()}`}
                      sub={
                        <>
                          <span>{d.numeros[k]?.motivo_sem_dado ?? "A fonte não respondeu."}</span>
                          {typeof d.numeros[k]?.o_que_fazer === "string" && <span>{`O que fazer: ${d.numeros[k]?.o_que_fazer}`}</span>}
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
              {avisoNaoMedido(d) && <p className="nxr-apoio">{avisoNaoMedido(d)}</p>}
            </NxRecolhido>
            </NxBlocoDoVerTudo>
          )}

          {avisosLeitura > 0 && (
            <NxRecolhido titulo={`Avisos sobre a leitura dos números (${avisosLeitura})`} resumo="Regras diferentes entre os números e o que não conta como contato">
              {avisoAgendouMenosQueFechou(d) && <NxAviso tom="atencao" titulo="Fecharam e agendaram:">{avisoAgendouMenosQueFechou(d)}</NxAviso>}
              {avisoTelaHonesta(d) && <NxAviso tom="info" titulo="Mudou em 01/11:">{avisoTelaHonesta(d)!.replace(/^Mudou em 01\/11:\s*/, "")}</NxAviso>}
              {eng && (
                <NxAviso tom="info" titulo={`${TEXTO_NUMERO.engajaram_instagram.rotulo}:`}>
                  {eng.valor == null ? (
                    <>sem dado. {eng.motivo_sem_dado}</>
                  ) : (
                    <>
                      <button type="button" className="nxr-link" onClick={() => abrir("engajaram_instagram")} aria-expanded={aberta === "engajaram_instagram"}>
                        {pessoas(eng.valor)}
                      </button>{" "}
                      {fmt(Number(eng.so_comentaram ?? 0))} só comentaram em post, {fmt(Number(eng.so_story ?? 0))} só reagiram ou responderam story. Não contam como contato.
                    </>
                  )}
                </NxAviso>
              )}
            </NxRecolhido>
          )}
        </div>
      }
    />
  );
}

/**
 * Um dos 3 números-chave no formato 5 segundos: o número, a legenda, a variação contra a PRÓPRIA clínica (sinal e palavra na pílula) e, sem
 * comparação, o selo "Falta dado · sem período anterior" em cinza. Sem medida, "Falta dado: motivo" (nunca 0). Só apresentação.
 */
function CartaoDeNumeroCinco({ n, icone, serie, desenho, acao }: { n: NumeroDePacientes; icone: NomeIcone; serie?: SerieDiaria; desenho?: ReactNode; acao?: ReactNode }) {
  const semMedida = n.valor == null && n.valorTexto == null;
  return (
    <NxCartaoNumero
      icone={icone}
      titulo={n.titulo}
      valor={n.valorTexto ?? (n.valor != null ? fmt(n.valor) : null)}
      legenda={semMedida ? undefined : n.legenda}
      semMedida={semMedida}
      variacao={n.textoDaVariacao ? { texto: n.textoDaVariacao } : null}
      extra={
        <>
          {semMedida ? (
            <p className="nx-cinco-falta" data-falta-dado>{`Falta dado: ${n.motivo ?? "sem medida neste período"}`}</p>
          ) : !n.textoDaVariacao && n.selo ? (
            <NxSelo tom={n.selo.tom} texto={n.selo.texto} />
          ) : null}
          {desenho}
        </>
      }
      serie={serie}
      acao={acao}
    />
  );
}

/** Um número de pessoas no cartão: o valor, a variação e o botão que abre quem são. Sem dado aparece como texto, nunca como zero. */
function CartaoDePessoas({ chave, numero, icone, ativo, onAbrir, variacao, serie, i }: { chave: ChaveNumero; numero: Numero | undefined; icone: NomeIcone; ativo: boolean; onAbrir: () => void; variacao?: VariacaoPct | null; serie?: SerieDiaria; i: number }) {
  const t = TEXTO_NUMERO[chave];
  const semDado = !numero || numero.valor == null;
  const dv = semDado ? null : paraCartao(variacao);
  const notas = semDado
    ? [numero?.motivo_sem_dado ?? "A fonte não respondeu."]
    : [dv ? null : legendaDoNumero(chave, numero), coberturaDoNumero(numero), chave === "fecharam" ? avisoCheckout(numero) : null].filter(Boolean);
  return (
    <NxKpi
      i={i}
      icone={icT(icone)}
      rotulo={t.rotulo}
      valor={semDado ? textoNaoMedido(numero) : fmt(numero!.valor)}
      variacao={dv}
      nota={notas.length ? notas.join(" · ") : undefined}
      info={<Ajuda>{fonteDoNumero(chave, numero)}</Ajuda>}
      extra={
        semDado ? undefined : (
          <div className="nxr-extra">
            {serie && <NxLinhaDe30Dias {...serie} />}
            <button type="button" className="nxr-ver" onClick={onAbrir} aria-expanded={ativo} aria-label={`${t.rotulo}: ${fmt(numero!.valor)}. Ver quem são`}>
              Ver quem são
            </button>
          </div>
        )
      }
    />
  );
}

/** Metas do mês no desenho novo: cada meta é um número ("28 de 40") com o que falta, sem ritmo, projeção nem status. */
function MetasDoMesNx({ clientId, isAdmin, metas }: { clientId: string; isAdmin: boolean; metas: ReturnType<typeof useMetasDoMes> }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const { dm, metas: consulta, mes, definidas } = metas;
  if (consulta.isLoading || consulta.isError || !consulta.data) return null;
  const dados = consulta.data;
  if (!definidas.length && !isAdmin) return null;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      for (const k of METRICAS_META) {
        const txt = (rascunho[k] ?? "").trim();
        const v = txt === "" ? null : Math.round(Number(txt));
        if (v != null && (!Number.isFinite(v) || v <= 0)) throw new Error(`Meta de "${ROTULO_META[k]}" precisa ser um número maior que zero.`);
        if (v == null) {
          const { error } = await (supabase as any).from("clinica_metas").delete().eq("client_id", clientId).eq("metrica", k);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await (supabase as any).from("clinica_metas").upsert({ client_id: clientId, metrica: k, valor: v, atualizado_em: new Date().toISOString() });
          if (error) throw new Error(error.message);
        }
      }
      await qc.invalidateQueries({ queryKey: ["clinica-metas", clientId] });
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <NxCard
      id="metas"
      nivel={2}
      icone={icT("checklist")}
      titulo="Metas do mês"
      subtitulo={`Mês em curso: dia ${dm.passados} de ${dm.total}`}
      acao={
        isAdmin && !editando ? (
          <button
            type="button"
            className="nx-botao"
            onClick={() => {
              setRascunho(Object.fromEntries(METRICAS_META.map((k) => [k, String(dados[k] ?? "")])));
              setEditando(true);
            }}
          >
            {definidas.length ? "Editar metas" : "Definir metas"}
          </button>
        ) : undefined
      }
    >
      {editando ? (
        <div className="nxr-form">
          {METRICAS_META.map((k) => (
            <label key={k}>
              {ROTULO_META[k]} por mês
              <input type="number" min={1} inputMode="numeric" value={rascunho[k] ?? ""} onChange={(e) => setRascunho({ ...rascunho, [k]: e.target.value })} placeholder="sem meta" />
            </label>
          ))}
          {erro && <p role="alert" className="nxr-apoio">{erro}</p>}
          <div className="nxr-acoes">
            <button type="button" className="nx-botao" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar metas"}</button>
            <button type="button" className="nx-botao" disabled={salvando} onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      ) : !definidas.length ? (
        <p className="nxr-apoio">Ainda não há metas para esta clínica. A clínica só vê esta área depois que a equipe define.</p>
      ) : (
        <div className="nx-grade nx-grade--3">
          {definidas.map((k, i) => {
            if (mes.isLoading) return <p key={k} className="nxr-apoio">Calculando {ROTULO_META[k].toLowerCase()}…</p>;
            const atual = mes.data?.numeros?.[k]?.valor;
            if (atual == null)
              return <NxCartaoNumero key={k} icone="checklist" titulo={ROTULO_META[k]} valor={null} semMedida legenda="Não medido neste mês, então a meta não pode ser acompanhada." />;
            const meta = dados[k]!;
            const faltam = Math.max(meta - Number(atual), 0);
            // D-07: abaixo da meta cadastrada vira laranja, com o texto dito (nunca só a cor). Sem ritmo nem projeção: só o número contra a meta.
            return (
              <NxCartaoNumero
                key={k}
                icone="checklist"
                titulo={ROTULO_META[k]}
                valor={`${fmt(Number(atual))} de ${fmt(meta)}`}
                legenda={faltam > 0 ? `Faltam ${fmt(faltam)} neste mês.` : "Meta batida neste mês."}
                abaixoDaMeta={faltam > 0 ? "abaixo da meta" : undefined}
                meta={{ rotulo: "da meta do mês", fracao: Number(atual) / meta }}
              />
            );
          })}
        </div>
      )}
    </NxCard>
  );
}

function BotaoConversa({ clientId, conversaId }: { clientId: string; conversaId: string }) {
  return (
    <Link to="/$clientId/atendimento" params={{ clientId }} search={{ aba: "conversas", conversa: conversaId } as never} className="nx-botao" style={{ minHeight: 36, padding: "0 12px", fontSize: 13 }}>
      <MessageCircle size={14} aria-hidden /> Abrir conversa
    </Link>
  );
}

/** Uma linha de resumo acima da lista: de onde vieram ou como se dividem. */
function Divisao({ chave, numero, dados }: { chave: ChaveNumero; numero: Numero; dados: PacientesPeriodo }) {
  const partes: string[] = [];
  const obj = (k: string) => (numero[k] ?? {}) as Record<string, number>;
  if (chave === "mandaram_mensagem") {
    const c = obj("por_canal");
    partes.push(`WhatsApp: ${fmt(c.whatsapp ?? 0)}`, `Instagram Direct: ${fmt(c.instagram ?? 0)}`);
    if (c.outro) partes.push(`outros canais: ${fmt(c.outro)}`);
  } else if (chave === "leads_novos") {
    const o = obj("por_origem");
    for (const [k, rot] of Object.entries(ROTULO_ORIGEM)) if (o[k]) partes.push(`${rot}: ${fmt(o[k])}`);
    if (Number(numero.origem_pela_conversa ?? 0) > 0) partes.push(`${fmt(Number(numero.origem_pela_conversa))} com a origem lida na conversa`);
  } else if (chave === "abordados") {
    if (!dados.tem_funil_prospeccao) partes.push("A clínica não usa funil de prospecção ativa no CRM");
    else partes.push(`responderam: ${fmt(Number(numero.responderam ?? 0))}`, `agendaram: ${fmt(Number(numero.agendaram ?? 0))}`, `fecharam: ${fmt(Number(numero.fecharam ?? 0))}`);
  } else if (chave === "antigos") {
    const f = obj("por_fonte");
    if (f.crm_antes) partes.push(`${fmt(f.crm_antes)} já estavam no CRM antes`);
    if (f.crm_origem) partes.push(`${fmt(f.crm_origem)} o CRM marca como paciente antigo`);
    if (f.conversa) partes.push(`${fmt(f.conversa)} a conversa diz que já é paciente`);
  } else if (chave === "agendaram" || chave === "negociacao") {
    const f = obj("por_fonte");
    partes.push(`pelo CRM: ${fmt(f.crm ?? 0)}`, `pela conversa: ${fmt(f.conversa ?? 0)}`, `nos dois: ${fmt(f.crm_e_conversa ?? 0)}`);
  } else if (chave === "fecharam") {
    const vendas = Number(numero.vendas ?? 0), semValor = Number(numero.sem_valor ?? 0);
    const checkout = vemDoCheckout(numero);
    // Venda conta pessoas (o número grande); os cards ganhos (orçamentos) ficam como informação secundária.
    if (!checkout && numero.ja_no_crm != null && Number(numero.ja_no_crm) > 0)
      partes.push(`${fmt(Number(numero.ja_no_crm))} já eram pacientes ou já estavam no CRM antes do período`);
    const vendasCrm = Number(numero.vendas_crm ?? 0);
    if (checkout && vendasCrm > 0) partes.push(`${fmt(vendas - vendasCrm)} vendas pela ${nomeCheckout(numero)} e ${fmt(vendasCrm)} pelo CRM`);
    else partes.push(checkout ? `${fmt(vendas)} vendas pela ${nomeCheckout(numero)}` : `${fmt(vendas)} ${vendas === 1 ? "orçamento ganho" : "orçamentos ganhos"} no CRM (quem fechou mais de um conta uma vez)`);
    if (checkout && Number(numero.em_protesto ?? 0) > 0) partes.push(`${fmt(Number(numero.em_protesto))} em protesto (contam como venda, como na ${nomeCheckout(numero)})`);
    // Com metade ou mais das vendas sem valor, a soma engana (HOMS: 100 vendas, só 1 com valor, "total R$ 86").
    if (vendas > 0 && semValor * 2 >= vendas) partes.push(`só ${fmt(vendas - semValor)} com valor ${checkout ? "no checkout" : "no CRM"}, então o total não aparece`);
    else {
      partes.push(`total ${fmtBRL(Number(numero.valor_total ?? 0))}`);
      if (semValor > 0) partes.push(`${fmt(semValor)} sem valor ${checkout ? "no checkout" : "no CRM"}`);
    }
    const reembolsos = textoReembolsos(numero, fmtBRL);
    if (reembolsos) partes.push(reembolsos);
    const renovacoes = textoRenovacoes(numero, fmtBRL);
    if (renovacoes) partes.push(renovacoes);
    if (Number(numero.ganho_prospeccao_sem_valor ?? 0) > 0)
      partes.push(`${fmt(Number(numero.ganho_prospeccao_sem_valor))} "ganhos" sem valor da prospecção contados como resposta, não como venda`);
  } else if (chave === "engajaram_instagram") {
    partes.push(`só comentaram: ${fmt(Number(numero.so_comentaram ?? 0))}`, `só reagiram ou responderam story: ${fmt(Number(numero.so_story ?? 0))}`);
  }
  if (!partes.length) return null;
  return <p className="nxr-apoio">{partes.join(" · ")}</p>;
}

function ListaDePessoas({ chave, dados, clientId, isAdmin, hoje, onFechar }: { chave: ChaveNumero; dados: PacientesPeriodo; clientId: string; isAdmin: boolean; hoje: string; onFechar: () => void }) {
  const lista = dados.listas[chave];
  const numero = dados.numeros[chave];
  const t = TEXTO_NUMERO[chave];
  return (
    <NxCard
      id="lista-aberta"
      nivel={2}
      icone={icT("users")}
      titulo={`${t.rotulo}: ${chave === "fecharam" ? pessoas(Number(numero.valor ?? 0)) : pessoas(lista.total)}`}
      acao={<button type="button" className="nx-botao" onClick={onFechar}>Fechar</button>}
    >
      <Divisao chave={chave} numero={numero} dados={dados} />
      {lista.itens.length === 0 ? (
        <p className="nxr-apoio">Ninguém neste período.</p>
      ) : (
        <ul className="nx-lista">
          {lista.itens.map((i, idx) => (
            <LinhaPessoa key={`${i.id}:${idx}`} chave={chave} item={i} clientId={clientId} isAdmin={isAdmin} hoje={hoje} />
          ))}
        </ul>
      )}
      {lista.total > lista.itens.length && <p className="nxr-apoio">Mostrando as {fmt(lista.itens.length)} mais recentes de {fmt(lista.total)}.</p>}
    </NxCard>
  );
}

function LinhaPessoa({ chave, item, clientId, isAdmin, hoje }: { chave: ChaveNumero; item: ItemPessoa; clientId: string; isAdmin: boolean; hoje: string }) {
  const pe = emQuePe(item);
  const que = oQue(item);
  const detalhes: string[] = [];
  if (item.canal) detalhes.push(ROTULO_CANAL[item.canal] ?? item.canal);
  if (chave === "leads_novos" && item.origem) detalhes.push(`veio de: ${ROTULO_ORIGEM[item.origem] ?? item.origem}${item.origem_fonte === "conversa" ? " (lido na conversa)" : ""}`);
  if (chave === "engajaram_instagram") detalhes.push(item.tipo === "comentou" ? "comentou em post" : "reagiu ou respondeu story");
  if (chave === "abordados") detalhes.push(item.fechou ? "fechou" : item.agendou ? "agendou" : item.respondeu ? "respondeu" : "ainda não respondeu");
  if (chave === "antigos" && item.fontes?.length) detalhes.push(`como sabemos: ${item.fontes.map((f) => ROTULO_FONTE[f] ?? f).join(", ")}`);
  if ((chave === "agendaram" || chave === "negociacao") && item.fonte) detalhes.push(`fonte: ${ROTULO_FONTE[item.fonte] ?? item.fonte}`);
  if (chave === "agendaram" && item.agendou_em) {
    detalhes.push(`agendou em ${dataBr(item.agendou_em)}`);
    if (item.compareceu_depois) detalhes.push("foi na consulta");
    else if (item.fechou_depois) detalhes.push("fechou");
  }
  let recompra: string | null = null;
  if (chave === "fecharam") {
    if (item.valor != null && Number(item.valor) > 0) detalhes.push(fmtBRL(Number(item.valor)));
    else detalhes.push(item.fonte === "checkout" ? "sem valor no checkout" : "sem valor no CRM");
    if (item.data) detalhes.push(`em ${dataBr(item.data)}`);
    if (item.data) recompra = rotuloRecompra(recompraDe({ data: item.data, procedimento: item.procedimento ?? null, interesse: item.leitura?.interesse ?? null, funil: item.funil ?? null }, undefined, hoje));
  } else if (item.data && chave !== "agendaram") {
    detalhes.push(dataBr(item.data));
  }
  return (
    <li>
      <NxListRow
        titulo={
          <>
            {item.nome ?? "Sem nome no cadastro"}
            {que && <span>{chave === "fecharam" ? ": fechou " : ": "}{que}</span>}
          </>
        }
        sub={
          <>
            <span>{[pe && chave !== "fecharam" ? pe : null, ...detalhes].filter(Boolean).join(" · ")}</span>
            {recompra && <span>{recompra}</span>}
          </>
        }
        fim={isAdmin && item.conversa_id ? <BotaoConversa clientId={clientId} conversaId={item.conversa_id} /> : undefined}
      />
    </li>
  );
}
