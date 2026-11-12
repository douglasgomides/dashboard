import { useMemo, type ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useClientRole } from "@/hooks/use-client-role";
import { useResultado } from "@/hooks/use-resultado";
import { usePacientesPeriodo } from "@/hooks/use-pacientes-periodo";
import { useResultadosDiarios } from "@/hooks/use-resultados-diarios";
import { NxChip } from "@/components/nx-chip";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxCartaoDaAcao, NxChipEstado, NxParaEquipe, NxProximo, SaudacaoHoje } from "@/components/nx/hoje";
import { NxCarregando, NxErro } from "@/components/nx/blocos";
import { getClient, getRoiPeriodo } from "@/lib/client-data";
import { resolveDateRange } from "@/lib/date-range";
import { variacoes } from "@/lib/diagnostico-estrategico";
import { analyzeGrowth } from "@/lib/hub-conteudo";
import { lerPeriodo } from "@/lib/leitura-periodo";
import { fatosDeResultadosComAreas, funilDosNumeros, periodosDeComparacao, somaDiaria } from "@/lib/leitura/fatos-resultados";
import { fatosDePacientes } from "@/lib/leitura/fatos-pacientes";
import { fatosDePublicacoes, fatosDoInstagram } from "@/lib/leitura/fatos-instagram";
import { acoesDaHoje, type EntradaHoje, type FonteDoDado } from "@/lib/leitura/fatos-hoje";
import type { FatosDaTela, TelaId } from "@/lib/leitura/tipos";
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

  // Topo (D-07, emenda de 12/11): um título só (a saudação grande) e, logo abaixo, o total da semana em número grande. Sem rótulo da
  // tela, sem pergunta visível, sem etiqueta da decisão e sem o chip da clínica (o nome já está na casca). Ficam o "dado até", os
  // chips de estado das fontes com bolinha e o selo, que agora é uma bolinha cinza (continua 1 por tela).
  const cabecalhoDe = (total?: number) => ({
    tela: "hoje" as const,
    titulo: "O que fazer hoje",
    pergunta: "O que fazer esta semana?",
    saudacao: <SaudacaoHoje nome={cliente.data?.name} />,
    ...(total != null ? { destaqueDoTopo: <TotalDaSemana total={total} /> } : {}),
    meta: (
      <>
        <span className="nx-chip-contexto">{`dado até ${ddmm(fim)}`}</span>
        {fontes.map((f) => (
          <NxChipEstado key={f.fonte} tom={f.tom} texto={f.ate ? `${f.fonte} até ${ddmm(f.ate)}` : f.fonte} hora={f.hora} />
        ))}
        <NxChip tipo="sem-selo" ponto />
      </>
    ),
  });
  const cabecalho = cabecalhoDe();
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
        leitura={<LeituraDaTela fatos={null} carregando={false} erro="Os indicadores estão indisponíveis." semSelo />}
        corpo={<NxErro texto="Não foi possível carregar as leituras. Os indicadores estão indisponíveis no momento." onTentar={() => void metricas.refetch()} />}
      />,
    );
  }
  if (metricas.isLoading || !r || !leitura || carregandoFontes) {
    return na(<PaginaNexo {...cabecalho} leitura={<LeituraDaTela fatos={null} carregando semSelo />} corpo={<NxCarregando linhas={3} />} />);
  }

  const { entrada, hoje: lista } = leitura;
  if (lista.tipo === "sem_leitura") {
    // Dado ruim: o mesmo "Sem leitura: motivo" de Resultados da clínica, com o passo para consertar e quem resolve.
    return na(<PaginaNexo {...cabecalho} leitura={<LeituraDaTela fatos={{ ...entrada.fatos, tela: "hoje" }} carregando={false} semSelo />} />);
  }

  // Até 4 cartões (o tipo de PaginaNexo já limita); o Próximo é o cartão de destaque da leitura, junto do aviso de poucas ações.
  const desenhadas = lista.outras.slice(0, 4);
  const [c1, c2, c3, c4] = desenhadas.map((a) => <NxCartaoDaAcao key={a.id} acao={a} clientId={clientId} dateRange={dateRangeState} />);
  // N = o Próximo (quando há) mais os cartões desenhados: o mesmo número que o médico conta na tela.
  const total = (lista.proxima ? 1 : 0) + desenhadas.length;
  return na(
    <PaginaNexo
      {...cabecalhoDe(total)}
      leitura={
        <section className="nx-hoje__leitura" data-peca="leitura" data-modo="leitura" aria-label="Próximo e aviso">
          {lista.proxima && <NxProximo acao={lista.proxima} clientId={clientId} dateRange={dateRangeState} />}
          {lista.aviso && <p className="nx-hoje__aviso">{lista.aviso}</p>}
          {equipe && lista.paraEquipe.length > 0 && <NxParaEquipe acoes={lista.paraEquipe} clientId={clientId} dateRange={dateRangeState} />}
        </section>
      }
      cartoes={lista.outras.length ? [c1, c2, c3, c4] : undefined}
    />,
  );
}
