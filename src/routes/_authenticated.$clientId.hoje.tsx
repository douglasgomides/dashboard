import { useMemo, type ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useClientRole } from "@/hooks/use-client-role";
import { useResultado } from "@/hooks/use-resultado";
import { usePacientesPeriodo } from "@/hooks/use-pacientes-periodo";
import { useResultadosDiarios, type CampoDiario } from "@/hooks/use-resultados-diarios";
import { NxChip } from "@/components/nx-chip";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxCartaoDaAcao, NxChipEstado, NxParaEquipe, SaudacaoHoje } from "@/components/nx/hoje";
import { NxCarregando, NxErro } from "@/components/nx/blocos";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { NxDescobertas, NxSelo, NxVeredito } from "@/components/nx/cinco-segundos";
import type { SerieDiaria } from "@/components/nx/linha-de-30-dias";
import { getClient, getRoiPeriodo } from "@/lib/client-data";
import { resolveDateRange } from "@/lib/date-range";
import { variacoes } from "@/lib/diagnostico-estrategico";
import { dePacientesDoPeriodo } from "@/lib/funil-desenhado";
import { analyzeGrowth } from "@/lib/hub-conteudo";
import { serieContinua } from "@/lib/linha-30-dias";
import { lerPeriodo } from "@/lib/leitura-periodo";
import { fatosDeResultadosComAreas, funilDosNumeros, periodosDeComparacao, somaDiaria } from "@/lib/leitura/fatos-resultados";
import { fatosDePacientes } from "@/lib/leitura/fatos-pacientes";
import { fatosDePublicacoes, fatosDoInstagram } from "@/lib/leitura/fatos-instagram";
import { GUARDA_DE_TEXTO_DA_TELA_HOJE, acoesDaHoje, type AcaoDaHoje, type EntradaHoje, type FonteDoDado } from "@/lib/leitura/fatos-hoje";
import { barrasDoPorque, checarDescoberta, checarFraseCinco, variacaoPropria, vereditoDosFatos, visiveisEResto, type Descoberta } from "@/lib/leitura/cinco-segundos";
import type { FatosDaTela, TelaId, TomFato } from "@/lib/leitura/tipos";
import { ehEquipe } from "@/lib/registro-de-telas";
import { ddmm, statusDoCliente, tomDaFonte, type LinhaFonte } from "@/lib/saude-fontes";

// O que fazer hoje (Phase 3.1.1, plano 05): a primeira versão da tela Hoje da Phase 9 (D-06), na mesma rota que a Phase 9
// evolui. De 3 a 5 ações da semana por regra fixa (fatos-hoje.ts), com o número, quem resolve e o link para a aba de onde saíram.
// Só usa as consultas que Resultados da clínica já faz, pelas mesmas chaves de cache: nenhuma consulta nova (W3, D-05).

export const Route = createFileRoute("/_authenticated/$clientId/hoje")({
  component: HojePage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
const CAMPOS_FUNIL = ["mandaram_mensagem", "agendaram", "fecharam"] as const;
const C = "/_authenticated/$clientId";

const ROTULO_DA_FONTE: Record<string, string> = { instagram: "Instagram", anuncios: "Anúncios", crm: "CRM", atendimento: "WhatsApp" };
const ORDEM_DAS_FONTES = ["instagram", "anuncios", "crm", "atendimento"];

/** A hora (de São Paulo) da última leitura bem-sucedida da fonte, "03:30", quando o banco a traz. */
function horaDaFonte(l: LinhaFonte): string | null {
  if (!l.last_success_at) return null;
  const t = new Date(l.last_success_at);
  return Number.isNaN(t.getTime()) ? null : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
}

/** Fontes com dado, na ordem do selo de frescura da casca, com o tom pela regra única (âmbar com mais de 1 dia). */
function fontesDoCliente(linhas: LinhaFonte[] | undefined): (FonteDoDado & { hora: string | null })[] {
  return ORDEM_DAS_FONTES.map((f) => (linhas ?? []).find((l) => l.fonte === f))
    .filter((l): l is LinhaFonte => !!l && !!l.data_ate)
    .map((l) => ({ fonte: ROTULO_DA_FONTE[l.fonte] ?? l.fonte, tom: tomDaFonte(l), ate: l.data_ate, hora: horaDaFonte(l) }));
}

/** O número grande do topo, logo abaixo da saudação: "4 ações esta semana" ("1 ação esta semana"; "Nenhuma ação esta semana"). */
export function TotalDaSemana({ total }: { total: number }) {
  return (
    <p className="nx-hoje__total" data-peca="total-da-semana">
      {total === 0 ? (
        <span className="nx-hoje__total-texto">Nenhuma ação esta semana</span>
      ) : (
        <>
          <strong className="nx-hoje__total-numero">{total}</strong> <span className="nx-hoje__total-texto">{total === 1 ? "ação esta semana" : "ações esta semana"}</span>
        </>
      )}
    </p>
  );
}


/** Os 3 números-chave da Hoje (D-01): cada um contra o período anterior DA PRÓPRIA clínica, com a linha de 30 dias quando há série diária. */
interface NumeroDaHoje {
  id: "conversas" | "sem-atendimento" | "fecharam";
  titulo: string;
  icone: "message-circle" | "users" | "checklist";
  legenda: string;
  valor: number | null;
  antes: number | null;
  /** Para "Leads sem atendimento" menos é melhor. */
  menorEhMelhor?: boolean;
  serie?: SerieDaHoje;
  /** Por que não há número (nunca vira 0). */
  motivo?: string;
}
type SerieDaHoje = Pick<SerieDiaria, "datas" | "valores"> & { rotulo: string };

const inteiro = (n: number) => n.toLocaleString("pt-BR");

function numerosDaHoje(e: {
  atual: Record<string, number | null>;
  antes: Record<string, number | null>;
  diario: ReadonlyArray<{ dia: string } & Record<CampoDiario, number | null>>;
  fimFechado: string;
  pessoas: Parameters<typeof dePacientesDoPeriodo>[0]["dados"] | undefined;
}): NumeroDaHoje[] {
  const linhas = e.diario.filter((l) => l.dia <= e.fimFechado);
  const serieDe = (campo: CampoDiario, rotulo: string): SerieDaHoje | undefined => {
    const { datas, valores } = serieContinua(linhas.map((l) => ({ dia: l.dia, valor: l[campo] ?? null })));
    return datas.length >= 2 ? { rotulo, datas, valores } : undefined;
  };
  // Leads sem atendimento = Virou lead menos Atendido, só quando os dois foram medidos (o mesmo funil honesto de Pacientes).
  let semAtendimento: number | null = null;
  let motivo: string | undefined;
  if (e.pessoas) {
    const [, lead, atendido] = dePacientesDoPeriodo({ dados: e.pessoas, variacao: () => null }).etapas;
    if (lead.valor != null && atendido.valor != null && atendido.valor <= lead.valor) semAtendimento = lead.valor - atendido.valor;
    else motivo = lead.motivo ?? atendido.motivo ?? "Atendido passa de Virou lead, então não dá para contar.";
  } else motivo = "A lista de pessoas do período não veio.";
  return [
    { id: "conversas", titulo: "Conversas", icone: "message-circle", legenda: "no período", valor: e.atual.mandaram_mensagem ?? null, antes: e.antes.mandaram_mensagem ?? null, serie: serieDe("mandaram_mensagem", "conversas iniciadas") },
    // O período anterior de pessoas únicas não é medido: sem comparação, "Falta dado" em cinza (nunca 0).
    { id: "sem-atendimento", titulo: "Leads sem atendimento", icone: "users", legenda: "ainda esperando", valor: semAtendimento, antes: null, menorEhMelhor: true, motivo },
    { id: "fecharam", titulo: "Fecharam", icone: "checklist", legenda: "pacientes no período", valor: e.atual.fecharam ?? null, antes: e.antes.fecharam ?? null, serie: serieDe("fecharam", "fecharam") },
  ];
}

function CartaoDaHoje({ n, dias }: { n: NumeroDaHoje; dias: number }) {
  const v = variacaoPropria(n.valor, n.antes, { menorEhMelhor: n.menorEhMelhor });
  const palavra = v?.melhor === true ? "melhor" : v?.melhor === false ? "pior" : null;
  return (
    <NxCartaoNumero
      icone={n.icone}
      titulo={n.titulo}
      subtitulo={`${dias} ${dias === 1 ? "dia" : "dias"}`}
      valor={n.valor != null ? inteiro(n.valor) : null}
      legenda={n.valor != null ? n.legenda : undefined}
      semMedida={n.valor == null}
      variacao={v ? { texto: palavra ? `${v.texto} · ${palavra} que antes` : v.texto } : null}
      extra={
        n.valor == null ? (
          <p className="nx-cinco-falta" data-falta-dado>{`Falta dado: ${n.motivo ?? "sem medida neste período"}`}</p>
        ) : !v ? (
          <NxSelo tom="neutro" texto="Falta dado · sem período anterior" />
        ) : undefined
      }
      serie={n.serie}
    />
  );
}

/** O selo de cada tom da ação: sempre com o sinal (▲ ▼ ! ●) ao lado, nunca só a cor. */
const SELO_DO_TOM: Record<TomFato, string> = { bom: "Bom sinal", atencao: "Atenção", ruim: "Para resolver", neutro: "Para conferir" };

/**
 * Uma ação da Hoje vira uma descoberta (D-01): a frase é a legenda da regra (uma frase de até 90 caracteres, ou a manchete quando não há
 * legenda), o número em jogo vai no chip (só quando é um número medido e curto) e o "Por quê?" abre as barras da regra, completadas com
 * barras listradas "Falta dado" até 2 (nunca zero). A ação só navega para a aba de origem. null quando a frase não passa nas guardas.
 */
function descobertaDaAcao(a: AcaoDaHoje): Descoberta | null {
  const legenda = a.legenda?.trim();
  const manchete = a.destaque.trim();
  const frase = legenda && checarFraseCinco(legenda).length === 0 ? legenda : checarFraseCinco(manchete).length === 0 ? manchete : null;
  if (!frase) return null;
  const impacto = a.destaqueEhNumero && frase !== manchete && checarFraseCinco(manchete, 40).length === 0 ? manchete : undefined;
  const d: Descoberta = {
    id: a.id,
    tom: a.tom,
    selo: SELO_DO_TOM[a.tom],
    frase,
    quem: a.rotuloQuem,
    ...(impacto ? { impacto } : {}),
    acao: { rotulo: a.frase.replace(/\.$/, ""), rota: a.rota },
    porque: {
      titulo: "O que explica",
      barras: barrasDoPorque(a.barras, a.destaqueEhNumero ? { rotulo: "Medido no período", exibicao: manchete } : null),
      obs: `Só dados desta clínica · ${a.contexto}`,
    },
  };
  return checarDescoberta(d).length === 0 ? d : null;
}

function HojePage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  // Mesma regra de papel e mesma chave de cache da casca (app-shell): nenhuma consulta nova. Quem ainda está carregando ou não
  // tem papel conta como médico (falha fechada): a linha "Para a equipe" só é montada para admin e estrategista.
  const { isAdmin } = useAuth();
  const papel = useClientRole(clientId);
  const equipe = !papel.carregando && ehEquipe({ isAdmin, papel: papel.papel });

  // Os mesmos dados (e as mesmas chaves de cache) de MonthlyOverview em Resultados da clínica: o custo da Hoje é o de Resultados.
  const resultado = useResultado(clientId, start, end);
  const { r, metricas, hoje, fim, posts, anterior, fontes: fontesDoRegistro } = resultado;
  const pessoas = usePacientesPeriodo(clientId, start, end);
  const comparacao = periodosDeComparacao(start, end, hoje);
  const diario = useResultadosDiarios(clientId, start, end);
  const diarioAnterior = useResultadosDiarios(clientId, comparacao.anterior.start, comparacao.anterior.end);
  const roi = useQuery({ queryKey: ["roi-periodo", clientId, start, fim], queryFn: () => getRoiPeriodo(clientId, start, fim), staleTime: 5 * 60_000, retry: false });
  const cliente = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId), staleTime: 5 * 60_000, retry: false });
  const estadoDasFontes = useQuery({ queryKey: ["client-sync-status", clientId], queryFn: () => statusDoCliente(clientId), staleTime: 60_000, retry: false });
  // Lista estável: a Hoje só aparece quando as consultas terminaram (nenhuma ação some ou muda de lugar depois de mostrada).
  const carregandoFontes = resultado.carregandoFontes || pessoas.isPending || diario.isPending || diarioAnterior.isPending || roi.isPending || anterior.isPending || estadoDasFontes.isPending;

  const funil = useMemo(() => {
    const atual = somaDiaria((diario.data ?? []).filter((l) => l.dia <= comparacao.fimFechado), comparacao.dias, CAMPOS_FUNIL);
    const antes = somaDiaria(diarioAnterior.data ?? [], comparacao.dias, CAMPOS_FUNIL);
    return { funil: funilDosNumeros({ dados: pessoas.data ?? null, somaAtual: atual, somaAntes: antes }), atual, antes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas.data, diario.data, diarioAnterior.data, start, end, hoje]);

  const fontes = useMemo(() => fontesDoCliente(estadoDasFontes.data), [estadoDasFontes.data]);
  const temIg = fontesDoRegistro.data?.tem_instagram === true;
  const numeros = useMemo(
    () => numerosDaHoje({ atual: funil.atual, antes: funil.antes, diario: diario.data ?? [], fimFechado: comparacao.fimFechado, pessoas: pessoas.data }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [funil, diario.data, pessoas.data, start, end, hoje],
  );

  const leitura = useMemo(() => {
    if (!r) return null;
    const feitos = fatosDeResultadosComAreas({ resultado: r, de: start, ate: end, hoje, funil: funil.funil, roi: roi.data ?? null });
    // Fontes extras, só de dados que os hooks acima já trazem: Pacientes do período, publicações e Desempenho do Instagram.
    const extras: { tela: TelaId; rota: string; fatos: FatosDaTela }[] = [];
    if (pessoas.data) {
      extras.push({ tela: "pacientes", rota: `${C}/pacientes`, fatos: fatosDePacientes({ dados: pessoas.data, de: start, ate: end, hoje, somaAtual: funil.atual, somaAntes: funil.antes }) });
    }
    if (temIg && posts.data) {
      extras.push({ tela: "posts", rota: `${C}/posts`, fatos: fatosDePublicacoes({ de: start, ate: end, hoje, posts: posts.data }) });
      if (metricas.data) {
        // Desempenho: a mesma leitura de conteudo.tsx (função pura sobre os dias e os posts que useResultado já trouxe).
        const dias = anterior.data ?? [];
        const comp = variacoes(metricas.data, dias);
        const cresc = analyzeGrowth(metricas.data, start, end);
        extras.push({
          tela: "conteudo",
          rota: `${C}/conteudo`,
          fatos: fatosDoInstagram(lerPeriodo({ diario: metricas.data, diarioAnterior: dias, posts: posts.data }), {
            de: start,
            ate: end,
            hoje,
            posts: posts.data,
            diario: metricas.data,
            anteriorMedido: dias.some((d: { reach?: number | null }) => d.reach != null),
            variacaoLimitada: comp.limitada && comp.motivo ? { motivo: comp.motivo } : null,
            crescimento: cresc ? { novos: cresc.novos, saidas: cresc.saidas, liquido: cresc.liquido, diasMedidos: cresc.diasMedidos } : null,
          }),
        });
      }
    }
    const entrada: EntradaHoje = { fatos: feitos.fatos, porArea: feitos.porArea, insights: r.insights, limitacoes: r.limitacoes, extras, fontes };
    return { entrada, hoje: acoesDaHoje(entrada) };
  }, [r, start, end, hoje, funil, roi.data, pessoas.data, posts.data, metricas.data, anterior.data, temIg, fontes]);
  // O veredito do topo (D-01): por enquanto o da leitura de Resultados, que diz o mesmo "Falta dado" quando o portão nega (D-05).
  const veredito = useMemo(() => (leitura ? vereditoDosFatos({ ...leitura.entrada.fatos, tela: "hoje" }, GUARDA_DE_TEXTO_DA_TELA_HOJE) : null), [leitura]);

  // Topo (D-07, emenda de 12/11): um título só (a saudação grande). Sem rótulo da
  // tela, sem pergunta visível, sem etiqueta da decisão e sem o chip da clínica (o nome já está na casca). Ficam o "dado até", os
  // chips de estado das fontes com bolinha e o selo, que agora é uma bolinha cinza (continua 1 por tela).
  // 03.1.1.1: o total da semana saiu do topo e virou o título da seção de descobertas (o número aparece uma vez só).
  const cabecalho = {
    tela: "hoje" as const,
    titulo: "O que fazer hoje",
    pergunta: "O que fazer esta semana?",
    saudacao: <SaudacaoHoje nome={cliente.data?.name} />,
    meta: (
      <>
        <span className="nx-chip-contexto">{`dado até ${ddmm(fim)}`}</span>
        {fontes.map((f) => (
          <NxChipEstado key={f.fonte} tom={f.tom} texto={f.ate ? `${f.fonte} até ${ddmm(f.ate)}` : f.fonte} hora={f.hora} />
        ))}
        <NxChip tipo="sem-selo" ponto />
      </>
    ),
  };
  // O contêiner data-origem="menu" faz o log por rota contar o clique de qualquer botão da Hoje como menu (nada é gravado além disso).
  const na = (pagina: ReactNode) => (
    <div className="nx-hoje" data-origem="menu">
      {pagina}
    </div>
  );

  if (metricas.isError) {
    return na(
      <PaginaNexo
        {...cabecalho}
        veredito={<NxVeredito veredito={null} carregando={false} erro="Os indicadores estão indisponíveis." tela="hoje" />}
        leitura={null}
        corpo={<NxErro texto="Não foi possível carregar as leituras. Os indicadores estão indisponíveis no momento." onTentar={() => void metricas.refetch()} />}
      />,
    );
  }
  if (metricas.isLoading || !r || !leitura || carregandoFontes) {
    return na(<PaginaNexo {...cabecalho} veredito={<NxVeredito veredito={null} carregando tela="hoje" />} leitura={null} corpo={<NxCarregando linhas={3} />} />);
  }

  const { entrada, hoje: lista } = leitura;
  if (lista.tipo === "sem_leitura") {
    // Dado ruim: o mesmo "Falta dado: motivo" de Resultados da clínica, com o passo para consertar e quem resolve, e nenhuma ação.
    return na(<PaginaNexo {...cabecalho} veredito={<NxVeredito veredito={vereditoDosFatos({ ...entrada.fatos, tela: "hoje" }, GUARDA_DE_TEXTO_DA_TELA_HOJE)} carregando={false} tela="hoje" />} leitura={null} />);
  }

  const [c1, c2, c3] = numeros.map((n) => <CartaoDaHoje key={n.id} n={n} dias={comparacao.dias} />);
  // As ações da regra (o Próximo e as outras) viram descobertas: as 3 primeiras à vista, o resto em "Ver tudo" como cartões (nada some).
  const todas = [...(lista.proxima ? [lista.proxima] : []), ...lista.outras];
  const comDescoberta = todas.flatMap((a) => {
    const d = descobertaDaAcao(a);
    return d ? [{ a, d }] : [];
  });
  const { visiveis } = visiveisEResto(comDescoberta);
  const restantes = todas.filter((a) => !visiveis.some((v) => v.a === a));
  const mostraEquipe = equipe && lista.paraEquipe.length > 0;
  return na(
    <PaginaNexo
      {...cabecalho}
      veredito={<NxVeredito veredito={veredito} carregando={false} tela="hoje" />}
      cartoes={[c1, c2, c3]}
      descobertas={
        <NxDescobertas
          titulo={<TotalDaSemana total={todas.length} />}
          apoio={lista.aviso ? <p className="nx-hoje__aviso">{lista.aviso}</p> : undefined}
          itens={visiveis.map((v) => v.d)}
          clientId={clientId}
          dateRange={dateRangeState}
          atributos={(_, k) => {
            const a = visiveis[k].a;
            return { "data-acao-hoje": a.id, "data-area-hoje": a.areaHoje, "data-familia-hoje": a.familia, ...(a === lista.proxima ? { "data-proximo": "" } : {}) };
          }}
        />
      }
      leitura={<LeituraDaTela fatos={{ ...entrada.fatos, tela: "hoje" }} carregando={false} />}
      resumoDoVerTudo="Leitura, outras ações e a equipe"
      detalhe={
        restantes.length > 0 || mostraEquipe ? (
          <div className="nx-cinco-resto">
            {restantes.length > 0 && (
              <div className="nx-cinco-resto__grade">
                {restantes.map((a) => (
                  <NxCartaoDaAcao key={a.id} acao={a} clientId={clientId} dateRange={dateRangeState} />
                ))}
              </div>
            )}
            {mostraEquipe && <NxParaEquipe acoes={lista.paraEquipe} clientId={clientId} dateRange={dateRangeState} />}
          </div>
        ) : undefined
      }
    />,
  );
}
