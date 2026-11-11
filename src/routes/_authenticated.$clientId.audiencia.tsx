import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getClientFontes, getMonthlyMetrics, getPostsForAnalytics } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import {
  getAudiencia,
  fmtN,
  fmtPct,
  soma,
  pctDe,
  nomeDaCidade,
  ROTULO_GENERO,
  leituraDemografia,
  leituraOrigem,
  melhoresJanelas,
  horasDoDia,
  DIAS_SEMANA,
  type Audiencia,
  type Bloco,
} from "@/lib/audiencia";
import { horasDosPosts, diasDosPosts, recomendacaoDeHorario } from "@/lib/horarios";
import { fatosDoPublico, fatosSemInstagram } from "@/lib/leitura/fatos-instagram";
import { hojeBrasilia } from "@/lib/status-fonte";
import { BarrasPareadas } from "@/components/barras";
import { MapaDeCalor } from "@/components/mapa-de-calor";
import { MapaBrasil, MapaMundo, nomeDoPais } from "@/components/mapa-coropletico";
import { ufDaCidade } from "@/lib/geo-br";
import { ESTADOS_BR } from "@/lib/mapas";
import { Users, Target, Heart, Clock, MapPin, Globe, UserPlus, UserMinus, Scale, Eye, Layers, CalendarClock, Trophy, FileText, BarChart3, VenetianMask, Cake, RefreshCw } from "lucide-react";
import { NxCard, NxKpi, NxPizza, NxColunas, NxLinhaTempo, NxLegenda } from "@/components/nx";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxAviso, NxCarregando, NxErro, NxVazio } from "@/components/nx/blocos";
import { NxComoCalcula } from "@/components/nx/anuncios-graficos";
import { IgAbas, IgBarras, IgDividida } from "@/components/nx/instagram";

export const Route = createFileRoute("/_authenticated/$clientId/audiencia")({
  component: AudienciaPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
const ic = (Icon: typeof Users) => <Icon size={17} strokeWidth={1.7} aria-hidden />;
const ia = (Icon: typeof Users) => <Icon size={16} strokeWidth={1.8} aria-hidden />;
const rotuloFaixa = (chave: string) => (chave === "U" ? "Idade não informada" : `${chave} anos`);
const como = (titulo: string, texto: ReactNode) => <NxComoCalcula titulo={`Como ler: ${titulo}`}>{texto}</NxComoCalcula>;

type Aba = "demografia" | "alcance" | "interacoes" | "horarios";
const ABAS: { id: Aba; rotulo: string; icone: ReactNode }[] = [
  { id: "demografia", rotulo: "Quem segue", icone: ia(Users) },
  { id: "alcance", rotulo: "Alcance e origem", icone: ia(Target) },
  { id: "interacoes", rotulo: "Interações", icone: ia(Heart) },
  { id: "horarios", rotulo: "Melhores horários", icone: ia(CalendarClock) },
];

// Quando a Meta recusa um bloco, diz o motivo em vez de mostrar zero.
function Falha({ b }: { b: Extract<Bloco<unknown>, { ok: false }> }) {
  return <NxAviso tom="atencao" titulo="A Meta não devolveu este bloco:">{b.erro}</NxAviso>;
}

/** As frases que cada aba já escrevia, agora num cartão simples do detalhe (a leitura do topo é uma só). */
function EmPalavras({ itens }: { itens: string[] }) {
  if (!itens.length) return null;
  return (
    <NxCard titulo="Em palavras simples" subtitulo="O que os números desta aba mostram">
      <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 15, lineHeight: "22px", fontWeight: 500 }}>
        {itens.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </NxCard>
  );
}

function Demografia({ a }: { a: Audiencia }) {
  const base = a.seguidores.ok ? a.seguidores.dados.faixa_etaria : [];
  const alc = a.alcancados_no_mes.ok ? a.alcancados_no_mes.dados.faixa_etaria : [];
  const faixas = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  const tb = soma(base);
  const ta = soma(alc);
  return (
    <>
      <EmPalavras itens={leituraDemografia(a)} />
      <div className="nx-grade nx-grade--2">
        <NxCard icone={ic(VenetianMask)} titulo="Gênero dos seguidores" subtitulo="Quem não declarou aparece como não informado">
          {como("Gênero dos seguidores", 'Informado pelo Instagram. "Não informado" é quem não declarou.')}
          {a.seguidores.ok ? (
            <NxPizza rotulo="Gênero dos seguidores" fatias={a.seguidores.dados.genero.map((g) => ({ rotulo: `${ROTULO_GENERO[g.chave] ?? g.chave} · ${fmtN(g.valor)}`, valor: g.valor }))} />
          ) : (
            <Falha b={a.seguidores} />
          )}
        </NxCard>
        <NxCard icone={ic(Heart)} titulo="Quem engaja" subtitulo="Por idade">
          {como("Quem engaja", <>Pessoas que curtiram, comentaram, salvaram ou compartilharam ({a.engajados_no_mes.ok ? a.engajados_no_mes.dados.mes : "mês"}).</>)}
          {a.engajados_no_mes.ok ? (
            soma(a.engajados_no_mes.dados.faixa_etaria) >= 50 ? (
              <IgBarras itens={a.engajados_no_mes.dados.faixa_etaria.map((p) => ({ rotulo: rotuloFaixa(p.chave), valor: p.valor }))} />
            ) : (
              <NxAviso tom="info" titulo="Poucas pessoas engajaram neste mês para mostrar a divisão por idade." />
            )
          ) : (
            <Falha b={a.engajados_no_mes} />
          )}
        </NxCard>
      </div>

      <NxCard icone={ic(Target)} titulo="Seguidores × alcançados" subtitulo="% por faixa etária">
        {como("Seguidores e alcançados", <>% por faixa etária. Alcance: {a.alcancados_no_mes.ok ? a.alcancados_no_mes.dados.mes : "mês"}. Se o alcance pesa mais que a base numa faixa, o conteúdo está chegando a gente nova ali.</>)}
        {a.seguidores.ok && a.alcancados_no_mes.ok && tb > 0 && ta > 0 ? (
          <BarrasPareadas
            categorias={faixas}
            a={faixas.map((f) => pctDe(base.find((x) => x.chave === f)?.valor ?? 0, tb))}
            b={faixas.map((f) => pctDe(alc.find((x) => x.chave === f)?.valor ?? 0, ta))}
            nomeA="Seguidores"
            nomeB="Alcançados"
          />
        ) : (
          <NxAviso tom="info" titulo="Sem dado suficiente para comparar neste mês." />
        )}
      </NxCard>

      <Geografia seguidores={a.seguidores} />
    </>
  );
}

function Alcance({ a }: { a: Audiencia }) {
  return (
    <>
      <EmPalavras itens={leituraOrigem(a)} />
      <div className="nx-grade nx-grade--2">
        <NxCard icone={ic(Users)} titulo="Alcance" subtitulo={`Seguidores × não seguidores · últimos ${a.periodo.dias} dias (janela fixa)`}>
          {como("Alcance", <>Contas únicas alcançadas nos últimos {a.periodo.dias} dias ({a.periodo.de} a {a.periodo.ate}).</>)}
          {a.alcance_por_tipo_de_seguidor.ok ? (
            <IgDividida
              rotulo="Alcance"
              partes={[
                { rotulo: "Seguidores", valor: a.alcance_por_tipo_de_seguidor.dados.seguidores, cor: "var(--b1)" },
                { rotulo: "Não seguidores", valor: a.alcance_por_tipo_de_seguidor.dados.nao_seguidores, cor: "var(--b3)" },
              ]}
            />
          ) : (
            <Falha b={a.alcance_por_tipo_de_seguidor} />
          )}
        </NxCard>
        <NxCard icone={ic(Eye)} titulo="Visualizações" subtitulo="Seguidores × não seguidores">
          {como("Visualizações", "Quantas vezes o conteúdo foi visto, no mesmo período.")}
          {a.visualizacoes_por_tipo_de_seguidor.ok ? (
            <IgDividida
              rotulo="Visualizações"
              partes={[
                { rotulo: "Seguidores", valor: a.visualizacoes_por_tipo_de_seguidor.dados.seguidores, cor: "var(--b1)" },
                { rotulo: "Não seguidores", valor: a.visualizacoes_por_tipo_de_seguidor.dados.nao_seguidores, cor: "var(--b3)" },
              ]}
            />
          ) : (
            <Falha b={a.visualizacoes_por_tipo_de_seguidor} />
          )}
        </NxCard>
      </div>

      <NxCard icone={ic(Layers)} titulo="Origem das visualizações" subtitulo="Por tipo de conteúdo">
        {como("Origem das visualizações", "Reels, carrossel, post, stories e anúncios. Alcance e interações vêm da Meta no mesmo período.")}
        {a.origem.ok ? (
          <>
            <IgBarras itens={a.origem.dados.map((i) => ({ rotulo: i.conteudo, valor: i.visualizacoes }))} formato={(v) => `${fmtN(v)} views`} />
            <div className="ig-origem">
              {a.origem.dados.map((i) => (
                <div key={i.conteudo} className="ig-origem__item">
                  <b>{i.conteudo}</b>
                  <dl>
                    <div><dt>Views</dt><dd>{fmtN(i.visualizacoes)}</dd></div>
                    <div><dt>Alcance</dt><dd>{fmtN(i.alcance)}</dd></div>
                    <div><dt>Interações</dt><dd>{i.interacoes > 0 ? fmtN(i.interacoes) : "Sem dado"}</dd></div>
                    <div title="Interações por alcance"><dt>Interação</dt><dd>{i.interacoes > 0 && i.alcance > 0 ? fmtPct(pctDe(i.interacoes, i.alcance), 1) : "Sem dado"}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Falha b={a.origem} />
        )}
      </NxCard>

      <NxCard icone={ic(UserPlus)} titulo="Seguiu × deixou de seguir" subtitulo={`Saldo dos últimos ${a.periodo.dias} dias (janela fixa da Meta, não segue o período escolhido)`}>
        {como("Seguiu e deixou de seguir", <>Saldo dos últimos {a.periodo.dias} dias, direto da Meta.</>)}
        {a.seguiram_e_deixaram.ok ? (
          <div className="nx-grade nx-grade--3">
            <NxKpi icone={ic(UserPlus)} rotulo="Seguiram" valor={fmtN(a.seguiram_e_deixaram.dados.seguiram)} />
            <NxKpi icone={ic(UserMinus)} rotulo="Deixaram de seguir" valor={fmtN(a.seguiram_e_deixaram.dados.deixaram_de_seguir)} />
            <NxKpi icone={ic(Scale)} rotulo="Saldo" valor={`${a.seguiram_e_deixaram.dados.saldo >= 0 ? "+" : ""}${fmtN(a.seguiram_e_deixaram.dados.saldo)}`} />
          </div>
        ) : (
          <Falha b={a.seguiram_e_deixaram} />
        )}
      </NxCard>
    </>
  );
}

const CORES_INTERACAO = { Curtidas: "var(--b1)", Comentários: "var(--b3)", Salvamentos: "var(--b4)", Compartilhamentos: "var(--or)" } as const;

function Interacoes({ a, clientId, start, end }: { a: Audiencia; clientId: string; start: string; end: string }) {
  const diario = useQuery({ queryKey: ["aud-diario", clientId, start, end], queryFn: () => getMonthlyMetrics(clientId, start, end) });
  const dias = (diario.data ?? []).filter((d) => d.likes != null || d.comments != null || d.saves != null || d.shares != null);
  const tot = a.interacoes.ok ? a.interacoes.dados : null;
  const somaT = tot ? tot.curtidas + tot.comentarios + tot.salvamentos + tot.compartilhamentos : 0;
  const leitura: string[] = [];
  if (tot && somaT > 0) {
    const itens = [
      { n: "curtidas", v: tot.curtidas },
      { n: "comentários", v: tot.comentarios },
      { n: "salvamentos", v: tot.salvamentos },
      { n: "compartilhamentos", v: tot.compartilhamentos },
    ].sort((x, y) => y.v - x.v);
    leitura.push(`Nos últimos ${a.periodo.dias} dias, ${fmtPct(pctDe(itens[0].v, somaT))} das interações foram ${itens[0].n}.`);
    leitura.push(`Salvamentos e compartilhamentos, que indicam conteúdo que a pessoa quer guardar ou repassar, somam ${fmtPct(pctDe(tot.salvamentos + tot.compartilhamentos, somaT))} das interações.`);
  }
  return (
    <>
      <EmPalavras itens={leitura} />
      <div className="ig-duas-uma">
        <NxCard icone={ic(Heart)} titulo="Interações" subtitulo="Curtidas, comentários, salvos e compartilhados">
          {como("Interações", <>Últimos {a.periodo.dias} dias ({a.periodo.de} a {a.periodo.ate}).</>)}
          {tot ? (
            <IgBarras
              total={somaT}
              itens={[
                { rotulo: "Curtidas", valor: tot.curtidas },
                { rotulo: "Comentários", valor: tot.comentarios },
                { rotulo: "Salvamentos", valor: tot.salvamentos },
                { rotulo: "Compartilhamentos", valor: tot.compartilhamentos },
              ]}
            />
          ) : (
            a.interacoes.ok === false && <Falha b={a.interacoes} />
          )}
        </NxCard>
        <NxCard icone={ic(BarChart3)} titulo="Interações por dia" subtitulo="Histórico diário gravado, no período do topo">
          {como("Interações por dia", "Do histórico diário gravado, no período escolhido no topo da página. Cada linha é um tipo de interação, com a mesma escala.")}
          {diario.isLoading ? (
            <NxCarregando texto="Lendo o histórico diário…" linhas={2} />
          ) : dias.length === 0 ? (
            <NxAviso tom="info" titulo="Nenhum dia do período tem interações gravadas." />
          ) : (
            <>
              <NxLegenda itens={Object.entries(CORES_INTERACAO).map(([rotulo, cor]) => ({ rotulo, cor }))} />
              <NxLinhaTempo
                rotulo={`Interações por dia, ${dias.length} dias: curtidas, comentários, salvamentos e compartilhamentos`}
                datas={dias.map((d) => d.date)}
                series={[
                  { rotulo: "Curtidas", valores: dias.map((d) => d.likes ?? 0), cor: CORES_INTERACAO.Curtidas },
                  { rotulo: "Comentários", valores: dias.map((d) => d.comments ?? 0), cor: CORES_INTERACAO.Comentários },
                  { rotulo: "Salvamentos", valores: dias.map((d) => d.saves ?? 0), cor: CORES_INTERACAO.Salvamentos },
                  { rotulo: "Compartilhamentos", valores: dias.map((d) => d.shares ?? 0), cor: CORES_INTERACAO.Compartilhamentos },
                ]}
                formatarData={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                formatarValor={(n) => fmtN(n)}
              />
            </>
          )}
        </NxCard>
      </div>
    </>
  );
}

function Horarios({ a, clientId, start, end }: { a: Audiencia; clientId: string; start: string; end: string }) {
  const posts = useQuery({ queryKey: ["aud-posts-h", clientId, start, end], queryFn: () => getPostsForAnalytics(clientId, start, end + "T23:59:59") });
  const mapa = a.horarios.ok ? a.horarios.dados.mapa : null;
  const janelas = useMemo(() => (mapa ? melhoresJanelas(mapa, 5) : []), [mapa]);
  const porHora = useMemo(() => (mapa ? horasDoDia(mapa) : []), [mapa]);
  const horasPosts = useMemo(() => horasDosPosts(posts.data ?? []), [posts.data]);
  const diasPosts = useMemo(() => diasDosPosts(posts.data ?? []), [posts.data]);
  const leitura = recomendacaoDeHorario({ janelas, horasPosts, diasPosts });
  const colunasHora = useMemo(() => porHora.map((v, h) => ({ rotulo: `${h}h`, valor: v, texto: fmtN(v) })).filter((_, h) => h >= 6), [porHora]);
  const pico = colunasHora.reduce((m, c, i) => (c.valor > (colunasHora[m]?.valor ?? -1) ? i : m), 0);
  return (
    <>
      <EmPalavras itens={leitura} />
      <NxCard icone={ic(Clock)} titulo="Seguidores online" subtitulo="Dia da semana × hora (Brasília). Mais escuro, mais gente online">
        {como("Seguidores online", <>Média de seguidores online por dia da semana e hora, em horário de Brasília{a.horarios.ok ? `, nos últimos ${a.horarios.dados.dias} dias` : ""}. Cor mais forte, mais gente online.</>)}
        {mapa ? <MapaDeCalor mapa={mapa} /> : a.horarios.ok === false && <Falha b={a.horarios} />}
      </NxCard>
      {mapa && (
        <div className="nx-grade nx-grade--2">
          <NxCard icone={ic(Trophy)} titulo="5 melhores janelas" subtitulo="Dia e hora com mais gente online">
            {como("5 melhores janelas", "Seguidores online (média) em cada janela.")}
            <IgBarras semPercentual itens={janelas.map((j) => ({ rotulo: `${DIAS_SEMANA[j.dia]}, ${j.hora}h`, valor: j.online }))} formato={(v) => `${fmtN(v)} online`} />
          </NxCard>
          <NxCard icone={ic(Clock)} titulo="Por hora do dia" subtitulo="Média dos 7 dias, das 6h às 23h">
            {como("Por hora do dia", "Média dos sete dias da semana.")}
            <NxColunas dados={colunasHora} destaque={pico} formatarEixo={fmtN} rotulo="Seguidores online por hora do dia" />
          </NxCard>
        </div>
      )}
      <NxCard icone={ic(FileText)} titulo="E os seus posts?" subtitulo="Engajamento mediano por hora de publicação">
        {como("E os seus posts", "Engajamento mediano por hora de publicação, só horas com 3+ posts no período escolhido no topo.")}
        {posts.isLoading ? (
          <NxCarregando linhas={2} />
        ) : horasPosts.length === 0 ? (
          <NxAviso tom="info" titulo="Nenhuma hora tem 3 ou mais posts no período," >então não dá para comparar horários dos posts com segurança.</NxAviso>
        ) : (
          <IgBarras semPercentual itens={horasPosts.slice(0, 8).map((h) => ({ rotulo: `${h.hora}h (${h.posts} posts)`, valor: Math.round(h.mediana) }))} formato={(v) => fmtN(v)} />
        )}
      </NxCard>
    </>
  );
}

function AudienciaPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
  const hoje = hojeBrasilia();
  const [aba, setAba] = useState<Aba>("demografia");

  const fontes = useQuery({ queryKey: ["fontes", clientId], queryFn: () => getClientFontes(clientId) });
  const temIg = fontes.data?.tem_instagram === true;
  const aud = useQuery({
    queryKey: ["audiencia", clientId],
    queryFn: () => getAudiencia(clientId),
    enabled: temIg,
    staleTime: 20 * 60_000,
    retry: false,
  });

  const a = aud.data?.dados;
  const kpis = useMemo(() => {
    if (!a) return null;
    const faixas = a.seguidores.ok ? a.seguidores.dados.faixa_etaria.filter((p) => p.chave !== "U") : [];
    const totalFaixas = a.seguidores.ok ? soma(a.seguidores.dados.faixa_etaria) : 0;
    const topo = faixas.length ? faixas.reduce((m, p) => (p.valor > m.valor ? p : m)) : null;
    const generos = a.seguidores.ok ? a.seguidores.dados.genero : [];
    const totalG = soma(generos);
    const gen = generos.filter((g) => g.chave !== "U").sort((x, y) => y.valor - x.valor)[0] ?? null;
    const janela = a.horarios.ok ? (melhoresJanelas(a.horarios.dados.mapa, 1)[0] ?? null) : null;
    return { topo, totalFaixas, gen, totalG, janela };
  }, [a]);

  // A leitura é da janela de 30 dias que a Meta devolve (fixa, não segue o período do topo). Só regra, nada guardado.
  const fatos = useMemo(() => {
    if (!temIg) return fatosSemInstagram("audiencia", { de: start, ate: end }, hoje);
    if (!a || !kpis) return null;
    return fatosDoPublico({
      de: a.periodo.de.slice(0, 10),
      ate: a.periodo.ate.slice(0, 10),
      hoje,
      dias: a.periodo.dias,
      faixas: a.seguidores.ok ? a.seguidores.dados.faixa_etaria : null,
      alcance: a.alcance_por_tipo_de_seguidor.ok ? a.alcance_por_tipo_de_seguidor.dados : null,
      saldo: a.seguiram_e_deixaram.ok ? a.seguiram_e_deixaram.dados : null,
      janelaOnline: kpis.janela,
    });
  }, [temIg, a, kpis, start, end, hoje]);

  const cabecalho = {
    tela: "audiencia" as const,
    titulo: "Público do Instagram",
    pergunta: "Quem acompanha o perfil e quando está online?",
    meta: <span>Lido ao vivo da Meta · janela de {a?.periodo.dias ?? 30} dias</span>,
    acao: temIg ? (
      <button type="button" className="nx-botao" onClick={() => aud.refetch()} disabled={aud.isFetching}>
        <RefreshCw size={16} aria-hidden />
        {aud.isFetching ? "Lendo da Meta…" : "Atualizar audiência"}
      </button>
    ) : undefined,
  };
  const pagina = (corpo: ReactNode, leitura: ReactNode) => (
    <div className="nexo-ig">
      <PaginaNexo {...cabecalho} leitura={leitura} corpo={corpo} />
    </div>
  );

  if (fontes.isLoading) return pagina(<NxCarregando linhas={4} />, <LeituraDaTela fatos={null} carregando semSelo />);
  if (fontes.error) {
    return pagina(
      <NxErro texto="Não consegui verificar as fontes deste cliente. Atualize a página." onTentar={() => void fontes.refetch()} />,
      <LeituraDaTela fatos={null} carregando={false} erro="As fontes não responderam." semSelo />,
    );
  }
  if (!temIg) {
    return pagina(
      <NxVazio titulo="Instagram não conectado" falta="uma conta de Instagram ligada ao Nexo. Sem ela não há seguidores nem alcance para mostrar" quem="equipe_hub" passo="ligar a conta de Instagram do médico à Business Manager do cliente" />,
      <LeituraDaTela fatos={fatos} carregando={false} semSelo />,
    );
  }
  if (aud.isLoading) return pagina(<NxCarregando texto="Lendo a audiência na Meta…" linhas={4} />, <LeituraDaTela fatos={null} carregando semSelo />);
  if (aud.error || !aud.data) {
    return pagina(
      <NxErro texto="Falha ao ler a audiência. Tente de novo em instantes." onTentar={() => void aud.refetch()} />,
      <LeituraDaTela fatos={null} carregando={false} erro="A Meta não respondeu." semSelo />,
    );
  }
  if (aud.data.nada_a_fazer) {
    return pagina(
      <NxVazio titulo="Audiência indisponível" falta={aud.data.nada_a_fazer} quem="equipe_hub" passo="gerar o token da Meta do cliente" />,
      <LeituraDaTela fatos={null} carregando={false} erro="A audiência está indisponível." semSelo />,
    );
  }
  if (aud.data.erro || !a || !kpis) {
    return pagina(
      <NxErro texto={aud.data.erro ?? "A Meta não respondeu."} onTentar={() => void aud.refetch()} />,
      <LeituraDaTela fatos={null} carregando={false} erro="A Meta não respondeu." semSelo />,
    );
  }

  const alc = a.alcance_por_tipo_de_seguidor.ok ? a.alcance_por_tipo_de_seguidor.dados : null;
  const sd = a.seguiram_e_deixaram.ok ? a.seguiram_e_deixaram.dados : null;

  const cartoes = [
    <NxCartaoNumero
      key="idade"
      semMedida={!kpis.topo}
      icone={ic(Cake)}
      titulo="Faixa que mais segue"
      valor={kpis.topo ? `${kpis.topo.chave} anos` : "Sem dado"}
      legenda={
        kpis.topo
          ? `${fmtPct(pctDe(kpis.topo.valor, kpis.totalFaixas))} dos seguidores${kpis.gen ? ` · ${fmtPct(pctDe(kpis.gen.valor, kpis.totalG))} ${(ROTULO_GENERO[kpis.gen.chave] ?? kpis.gen.chave).toLowerCase()}` : ""}`
          : "a Meta não devolveu a idade"
      }
    />,
    <NxCartaoNumero
      key="fora"
      semMedida={!(alc && alc.seguidores + alc.nao_seguidores > 0)}
      icone={ic(Eye)}
      titulo="Alcance fora da base"
      valor={alc && alc.seguidores + alc.nao_seguidores > 0 ? fmtPct(pctDe(alc.nao_seguidores, alc.seguidores + alc.nao_seguidores)) : "Sem dado"}
      legenda={alc ? `não seguidores entre ${fmtN(alc.seguidores + alc.nao_seguidores)} contas alcançadas em ${a.periodo.dias} dias` : "a Meta não devolveu o alcance"}
    />,
    <NxCartaoNumero
      key="saldo"
      semMedida={!sd}
      icone={ic(Scale)}
      titulo={`Saldo de seguidores (${a.periodo.dias} dias)`}
      valor={sd ? `${sd.saldo >= 0 ? "+" : ""}${fmtN(sd.saldo)}` : "Sem dado"}
      legenda={sd ? `seguiram ${fmtN(sd.seguiram)} · deixaram ${fmtN(sd.deixaram_de_seguir)}` : "a Meta não devolveu o saldo"}
    />,
    <NxCartaoNumero
      key="online"
      semMedida={!kpis.janela}
      icone={ic(Clock)}
      titulo="Mais gente online"
      valor={kpis.janela ? `${DIAS_SEMANA[kpis.janela.dia]}, ${kpis.janela.hora}h` : "Sem dado"}
      legenda={kpis.janela ? `${fmtN(kpis.janela.online)} seguidores online em média (Brasília)` : "a Meta não devolveu os horários"}
    />,
  ] as unknown as [ReactNode, ReactNode?, ReactNode?, ReactNode?];

  // Gráfico principal: a idade de quem segue, em colunas.
  const faixasIdade = a.seguidores.ok ? a.seguidores.dados.faixa_etaria : [];
  const colunasIdade = faixasIdade.map((p) => ({ rotulo: p.chave === "U" ? "N/I" : p.chave, valor: p.valor, texto: fmtN(p.valor) }));
  const destaqueIdade = colunasIdade.length ? colunasIdade.reduce((m, c, i) => (c.rotulo !== "N/I" && c.valor > (colunasIdade[m]?.valor ?? -1) ? i : m), 0) : 0;
  const principal = (
    <NxCard nivel={2} icone={ic(Cake)} titulo="Idade dos seguidores" subtitulo="Quem segue hoje · N/I é quem não informou a idade">
      {como("Idade dos seguidores", "Quem segue a conta hoje. A Meta só informa para contas com 100 seguidores ou mais.")}
      {a.seguidores.ok ? (
        colunasIdade.length ? (
          <NxColunas dados={colunasIdade} destaque={destaqueIdade} formatarEixo={fmtN} rotulo="Seguidores por faixa de idade" />
        ) : (
          <NxAviso tom="info" titulo="A Meta não devolveu a idade dos seguidores." />
        )
      ) : (
        <Falha b={a.seguidores} />
      )}
    </NxCard>
  );

  const detalhe = (
    <div style={{ display: "grid", gap: 18 }}>
      <IgAbas rotulo="Partes do público" abas={ABAS} ativa={aba} onTrocar={setAba} />
      <div role="tabpanel" aria-label={ABAS.find((x) => x.id === aba)?.rotulo} className="nexo-ig">
        {aba === "demografia" && <Demografia a={a} />}
        {aba === "alcance" && <Alcance a={a} />}
        {aba === "interacoes" && <Interacoes a={a} clientId={clientId} start={start} end={end} />}
        {aba === "horarios" && <Horarios a={a} clientId={clientId} start={start} end={end} />}
      </div>
      <NxAviso
        tom="info"
        titulo={`Dados da Meta lidos em ${new Date(a.gerado_em).toLocaleString("pt-BR")}.`}
        detalhe={<>Alcance, visualizações e interações cobrem os últimos {a.periodo.dias} dias; a Meta não permite períodos maiores que 30 dias nestas métricas. As abas Interações e Horários dos posts usam também o período do topo ({periodLabel}).</>}
      >
        Janela fixa de {a.periodo.dias} dias.
      </NxAviso>
    </div>
  );

  return (
    <div className="nexo-ig">
      <PaginaNexo {...cabecalho} leitura={<LeituraDaTela fatos={fatos} carregando={fatos == null} semSelo />} cartoes={cartoes} principal={principal} detalhe={detalhe} />
    </div>
  );
}

// Onde os seguidores estão: Brasil por estado (somando as cidades que a Meta informa) e mundo por país.
function Geografia({ seguidores }: { seguidores: Bloco<{ faixa_etaria: { chave: string; valor: number }[]; genero: { chave: string; valor: number }[]; cidades: { chave: string; valor: number }[]; paises: { chave: string; valor: number }[] }> }) {
  const g = useMemo(() => {
    if (!seguidores.ok) return null;
    const { cidades, paises } = seguidores.dados;
    const porUf: Record<string, number> = {};
    let semEstado = 0;
    for (const c of cidades) {
      const uf = ufDaCidade(c.chave);
      if (uf) porUf[uf] = (porUf[uf] ?? 0) + c.valor;
      else semEstado += c.valor;
    }
    const porPais: Record<string, number> = {};
    for (const p of paises) porPais[p.chave] = p.valor;
    const estados = Object.entries(porUf).sort((x, y) => y[1] - x[1]);
    return { cidades, paises, porUf, porPais, estados, semEstado, totalCidades: soma(cidades) };
  }, [seguidores]);

  if (!seguidores.ok)
    return (
      <NxCard icone={ic(MapPin)} titulo="Onde estão" subtitulo="Brasil e mundo">
        <Falha b={seguidores} />
      </NxCard>
    );
  if (!g) return null;
  const nomeUf = (uf: string) => ESTADOS_BR.find((e) => e.uf === uf)?.nome ?? uf;
  const totalUf = g.estados.reduce((acc, [, v]) => acc + v, 0);

  return (
    <>
      <NxCard icone={ic(MapPin)} titulo="Onde estão no Brasil" subtitulo="Estados mais escuros têm mais seguidores">
        {como(
          "Onde estão no Brasil",
          <>
            Cada estado soma as cidades que a Meta informa ({g.cidades.length} cidades, {fmtN(g.totalCidades)} seguidores com cidade conhecida). A Meta entrega só as cidades principais, então estados com muita gente espalhada em cidades pequenas aparecem com menos do que têm de verdade.
            {g.semEstado > 0 ? <> {fmtN(g.semEstado)} seguidores estão em cidades sem estado identificado e não entram no mapa.</> : null}
          </>,
        )}
        <div className="nx-grade nx-grade--2" style={{ alignItems: "start" }}>
          <MapaBrasil porUf={g.porUf} />
          <div className="nexo-ig">
            <div>
              <h4 className="ig-sub">Estados</h4>
              <IgBarras total={totalUf} itens={g.estados.slice(0, 6).map(([uf, v]) => ({ rotulo: nomeUf(uf), chave: uf, valor: v }))} />
            </div>
            <div>
              <h4 className="ig-sub">Cidades principais</h4>
              <IgBarras total={g.totalCidades} itens={g.cidades.slice(0, 10).map((p) => ({ rotulo: nomeDaCidade(p.chave), chave: p.chave, valor: p.valor }))} />
            </div>
          </div>
        </div>
        {g.semEstado > 0 && <NxAviso tom="info" titulo={`${fmtN(g.semEstado)} seguidores em cidades sem estado identificado`}>ficam fora do mapa.</NxAviso>}
      </NxCard>

      <NxCard icone={ic(Globe)} titulo="Países" subtitulo="Países mais escuros têm mais seguidores">
        {como("Países", "Seguidores por país, como a Meta informa. A escala de cor usa a raiz do valor para os países pequenos não sumirem ao lado do Brasil. Países muito pequenos podem não aparecer no mapa, mas estão na lista.")}
        <div className="nx-grade nx-grade--2" style={{ alignItems: "center" }}>
          <MapaMundo porPais={g.porPais} />
          <IgBarras total={soma(g.paises)} itens={g.paises.slice(0, 6).map((p) => ({ rotulo: nomeDoPais(p.chave), chave: p.chave, valor: p.valor }))} />
        </div>
      </NxCard>
    </>
  );
}
