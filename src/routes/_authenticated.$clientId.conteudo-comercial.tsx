import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { CalendarDays, Clock, MessageCircle, Sparkles } from "lucide-react";
import { efeitoPorDiaDaSemana, efeitoDiaSeguinte, efeitoComparavel, juntarTemas, temasSemPost, temasSemConversa, nomeFormato, temaValido, recortarPeriodo, quem, quemAgendou, coberturaComentarios, FAIXA_RESPOSTA, MIN_CONVERSAS_FAIXA, MIN_DIAS, MAX_DIAS_PERIODO, type DadosProfundos, type EfeitoPareado } from "@/lib/conteudo-comercial";
import { supabase } from "@/integrations/supabase/client";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import { fatosConteudoComercial, SEM_LEITURA_ORIGEM_POR_POST } from "@/lib/leitura/fatos-instagram";
import { hojeBrasilia } from "@/lib/status-fonte";
import { InfoDica, Miniatura } from "@/components/visual";
import { NxCard, NxKpi, NxTag, NxListRow, NxLinhaTempo } from "@/components/nx";
import { PaginaNexo } from "@/components/nx/pagina";
import { NxBlocoDoVerTudo } from "@/components/nx/cabeca-do-bloco";
import { NxDescobertas, NxMaisDescobertas } from "@/components/nx/cinco-segundos";
import { NxChip } from "@/components/nx-chip";
import { descobertasDaLeitura, periodoDoVerTudo } from "@/lib/leitura/leitura-em-descobertas";
import { visiveisEResto } from "@/lib/leitura/cinco-segundos";
import { comAcaoCurta, descobertaDaFaltaDeDado } from "@/lib/leitura/ver-tudo-crm-painel";
import {
  JA_DITOS_NO_TOPO,
  cabecaDaGrade,
  cabecaDaResposta,
  cabecaDaVendaPorTema,
  cabecaDasSemanas,
  cabecaDoMaisComum,
  cabecaDosComentariosDeCompra,
  cabecaDosTemas,
  semRepetirOAviso,
  temasJaDitos,
} from "@/lib/leitura/ver-tudo-conteudo-comercial";
import { usePublicarContagem } from "@/components/nx/abas-em-pasta";
import { NxAviso, NxCarregando, NxErro, NxTabela } from "@/components/nx/blocos";
import { NxComoCalcula } from "@/components/nx/anuncios-graficos";
import { IgBarras } from "@/components/nx/instagram";

export const Route = createFileRoute("/_authenticated/$clientId/conteudo-comercial")({
  component: ConteudoComercialPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
const db = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const fmtN = (n: number | null | undefined) => Math.round(Number(n ?? 0)).toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "Sem dado");
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const OBJ: Record<string, string> = { preco: "Preço", convenio: "Convênio", distancia: "Distância", adiamento: "Vai deixar para depois", agenda: "Agenda/horário", medo: "Medo", desconfianca: "Desconfiança", outro: "Outra" };

interface Dados {
  dias: { dia: string; posts: number; alcance: number; conversas: number; comerciais: number; agendaram: number }[];
  efeito_post: { dias_com_post: number; media_com_post: number | null; dias_sem_post: number; media_sem_post: number | null; media_dia_seguinte_com_post: number | null; media_dia_seguinte_sem_post: number | null } | null;
  grade: { dow: number; hora: number; posts: number; conversas: number; agendaram: number }[];
  temas: { tema: string; posts: number; alcance: number; conversas: number; pessoas?: number; comerciais: number; pediram_preco: number; agendaram: number; pessoas_agendaram?: number }[];
  semanas: { semana: string; c0: number; c1: number; c2: number; c3: number; conversas: number; agendaram: number }[];
  objecoes: { objecao: string; n: number; agendaram: number; pessoas?: number; pessoas_agendaram?: number }[];
  assuntos: { assunto: string; n: number; agendaram: number }[];
  cobertura: { conversas: number; pessoas: number | null; pessoas_agendaram: number | null; lidas: number; sem_texto: number; com_tema: number; posts: number; posts_com_tema: number };
}

const ic = (Icon: typeof Clock) => <Icon size={17} strokeWidth={1.7} aria-hidden />;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const INTENCOES: [keyof DadosProfundos["posts_compra"][number], string][] = [["palavra", "palavra-chave"], ["preco", "preço"], ["agendar", "agendar"], ["convenio", "convênio"], ["onde", "onde atende"], ["contato", "contato"]];
const media = (v: number) => (Math.round(v * 10) / 10).toLocaleString("pt-BR");
const INFO_PAR = "Cada dia com post é comparado com os dias sem post do mesmo dia da semana (segunda com segunda, sábado com sábado). Sem isso, o fim de semana, que tem pouco post e pouca conversa, faria o post parecer trazer conversa.";
const faltaPar = (e: EfeitoPareado) => `poucos dias equivalentes (${e.diasCom} com post e ${e.diasSem} sem; mínimo ${MIN_DIAS})`;
function avisoCobertura(pr: DadosProfundos) {
  const cob = coberturaComentarios(pr.comentarios);
  return cob != null && cob < 0.8 ? `O painel guardou ${Math.round(cob * 100)}% dos comentários que o Instagram mostra nos posts do período.` : "";
}

function profundoValido(data: unknown): DadosProfundos | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Partial<DadosProfundos>;
  const lista2 = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const c = (d.comentarios ?? {}) as Partial<DadosProfundos["comentarios"]>;
  const cb = (d.cobertura ?? {}) as Partial<DadosProfundos["cobertura"]>;
  return {
    posts_compra: lista2(d.posts_compra), compra_por_formato: lista2(d.compra_por_formato), temas_valor: lista2(d.temas_valor), resposta: lista2(d.resposta), resposta_tema: lista2(d.resposta_tema),
    comentarios: { total: Number(c.total ?? 0), compra: Number(c.compra ?? 0), posts_com_compra: Number(c.posts_com_compra ?? 0), palavra: Number(c.palavra ?? 0), guardados_posts_periodo: Number(c.guardados_posts_periodo ?? 0), instagram_posts_periodo: Number(c.instagram_posts_periodo ?? 0) },
    cobertura: { conversas: Number(cb.conversas ?? 0), com_lead: Number(cb.com_lead ?? 0), com_tema: Number(cb.com_tema ?? 0), horario_comercial: Number(cb.horario_comercial ?? 0) },
  };
}

const temaIdentificado = (tema: unknown): tema is string => typeof tema === "string" && tema.trim() !== "" && !["null", "undefined"].includes(tema.trim().toLowerCase());
const nomeTema = (tema: unknown) => temaIdentificado(tema) ? tema.trim() : "Sem tema identificado";

const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
/** Resposta fora do formato (ou sem permissão) vira null; listas ausentes viram vazias, para a tela nunca quebrar. */
function normalizar(data: unknown): Dados | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Partial<Dados>;
  const c = (d.cobertura ?? {}) as Partial<Dados["cobertura"]>;
  return {
    dias: lista(d.dias), grade: lista(d.grade), temas: lista(d.temas), semanas: lista(d.semanas), objecoes: lista(d.objecoes), assuntos: lista(d.assuntos),
    efeito_post: d.efeito_post && typeof d.efeito_post === "object" ? d.efeito_post : null,
    cobertura: { conversas: Number(c.conversas ?? 0), pessoas: c.pessoas == null ? null : Number(c.pessoas), pessoas_agendaram: c.pessoas_agendaram == null ? null : Number(c.pessoas_agendaram), lidas: Number(c.lidas ?? 0), sem_texto: Number(c.sem_texto ?? 0), com_tema: Number(c.com_tema ?? 0), posts: Number(c.posts ?? 0), posts_com_tema: Number(c.posts_com_tema ?? 0) },
  };
}

const como = (titulo: string, texto: string) => <NxComoCalcula titulo={`Como ler: ${titulo}`}>{texto}</NxComoCalcula>;
const info = (rotulo: string, texto: string) => <InfoDica texto={texto} rotulo={`Sobre ${rotulo}`} />;

function ConteudoComercialPage() {
  const { clientId } = Route.useParams();
  const pedido = resolveDateRange(clientLayoutRoute.useSearch());
  // As leituras desta tela aceitam até 120 dias: período maior (6 meses, 1 ano) mostra os últimos 120 dias, com aviso.
  const { start, end, cortado } = recortarPeriodo(pedido.start, pedido.end);
  const periodLabel = formatRangeLabel({ start, end });
  const hoje = hojeBrasilia();
  const q = useQuery({
    queryKey: ["conteudo-comercial", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await db.rpc("conteudo_comercial", { p_client: clientId, p_de: start, p_ate: end });
      if (error) throw new Error(error.message);
      return normalizar(data);
    },
  });

  const qp = useQuery({
    queryKey: ["conteudo-comercial-profundo", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await db.rpc("conteudo_comercial_profundo", { p_client: clientId, p_de: start, p_ate: end });
      if (error) throw new Error(error.message);
      return profundoValido(data);
    },
  });
  const pr = qp.data ?? null;

  // Contagem em cinza da aba Instagram em "De onde vêm os pacientes" (D-07): posts do período que a tela já recebeu em
  // `cobertura.posts` (nenhuma consulta nova). Erro: null ("—"); carregando: undefined; zero: null (nunca "0"). A chave do período
  // é a da pasta (o pedido), não o recorte de 120 dias desta tela.
  usePublicarContagem({
    clientId,
    de: pedido.start,
    ate: pedido.end,
    rota: "/_authenticated/$clientId/conteudo-comercial",
    valor: q.isLoading ? undefined : q.error || !q.data ? null : q.data.cobertura.posts || null,
  });

  // A leitura é do cruzamento que a tela já carrega: só regra. A origem por post não é medida e a leitura diz isso.
  const fatos = useMemo(() => {
    if (!q.data || qp.isPending) return null;
    return fatosConteudoComercial({ de: start, ate: end, hoje, dados: q.data, profundos: pr });
  }, [q.data, qp.isPending, pr, start, end, hoje]);

  const cabecalho = {
    tela: "conteudo-comercial" as const,
    titulo: "Conteúdo × Comercial",
    pergunta: "O conteúdo está trazendo conversa e agendamento?",
    decisao: "D3" as const,
    meta: <span>{periodLabel}</span>,
  };
  const pagina = (corpo: ReactNode) => (
    <div className="nexo-ig">
      <PaginaNexo {...cabecalho} leitura={null} corpo={corpo} />
    </div>
  );
  if (q.isLoading) return pagina(<NxCarregando texto="Cruzando conteúdo e conversas…" linhas={4} />);
  if (q.error) return pagina(<NxErro texto="Não consegui cruzar conteúdo e conversas agora. Atualize a página." onTentar={() => void q.refetch()} />);
  const d = q.data;
  if (!d) return pagina(<NxErro texto="Não consegui ler este período para este cliente. Confira se você tem acesso a ele." onTentar={() => void q.refetch()} />);

  const c = d.cobertura;
  // Leitura pela IA: conversa lida (com texto) ou marcada sem texto. As duas somadas são as que a IA já passou.
  const lidasPct = c.conversas > 0 ? Math.round((Math.min(c.conversas, c.lidas + c.sem_texto) / c.conversas) * 100) : 0;
  const temaPct = c.conversas > 0 ? Math.round((c.com_tema / c.conversas) * 100) : 0;
  const efeito = efeitoPorDiaDaSemana(d.dias);
  const seguinte = efeitoDiaSeguinte(d.dias);
  const temas = juntarTemas(d.temas);
  const semConteudo = temasSemPost(temas).slice(0, 5);
  const semDemanda = temasSemConversa(temas).slice(0, 5);
  const maxGrade = Math.max(1, ...d.grade.map((g) => g.conversas));
  const grade = new Map(d.grade.map((g) => [`${g.dow}-${g.hora}`, g]));
  const horas = Array.from({ length: 18 }, (_, i) => i + 6);
  const posProfundo = pr ? pr.resposta_tema.filter((t) => temaValido(t.tema) && t.rapidas >= 10 && t.lentas >= 10) : [];

  const cartoes = [
    c.pessoas != null ? (
      <NxKpi key="p" icone={ic(MessageCircle)} rotulo="Pessoas que chamaram" valor={fmtN(c.pessoas)} nota={`${fmtN(c.conversas)} conversas novas · ${fmtN(c.posts)} posts no período`} info={info("Pessoas que chamaram", "Quem abriu mais de uma conversa no período conta uma vez só.")} />
    ) : (
      <NxKpi key="p" icone={ic(MessageCircle)} rotulo="Conversas novas" valor={fmtN(c.conversas)} nota={`${fmtN(c.posts)} posts no período`} />
    ),
    <NxKpi key="c" icone={ic(CalendarDays)} rotulo="Conversas em dia com post" valor={efeitoComparavel(efeito) ? media(efeito.mediaCom) : "Sem dado"} nota={efeitoComparavel(efeito) ? `média por dia · ${efeito.diasCom} dias` : faltaPar(efeito)} info={info("Conversas em dia com post", INFO_PAR)} />,
    <NxKpi key="s" icone={ic(CalendarDays)} rotulo="Mesmo dia da semana sem post" valor={efeitoComparavel(efeito) ? media(efeito.mediaSem) : "Sem dado"} nota={efeitoComparavel(efeito) ? `média por dia · ${efeito.diasSem} dias` : faltaPar(efeito)} info={info("Mesmo dia da semana sem post", INFO_PAR)} />,
    <NxKpi
      key="d"
      icone={ic(Clock)}
      rotulo="Dia seguinte ao post"
      valor={efeitoComparavel(seguinte) ? media(seguinte.mediaCom) : "Sem dado"}
      nota={efeitoComparavel(seguinte) ? `sem post na véspera: ${media(seguinte.mediaSem)}` : faltaPar(seguinte)}
      info={info("Dia seguinte ao post", "Conversas novas no dia seguinte a um dia com post, comparadas com o dia seguinte a um dia sem post, sempre no mesmo dia da semana. Anúncios e feriados também mexem nesse número.")}
    />,
  ] as unknown as [ReactNode, ReactNode?, ReactNode?, ReactNode?];

  // quick-ver-tudo-abas (João 13/11/2026): a "Leitura do período" saiu da aba. O que ela dizia e a aba ainda não mostra (os 4 cartões e o
  // gráfico por dia) virou descoberta: no máximo 3 à vista, no lugar da leitura, e o resto no começo dos Detalhes. "Origem por post não
  // medida" fica uma vez só, no aviso dos Detalhes (com quem resolve). Leitura negada: UMA descoberta "Falta dado" com o passo.
  const textoDoTopo = [
    // Os posts do período ficam fora: "30 posts" no apoio do cartão casaria por acaso com "30 pessoas" de um assunto sem post.
    `${c.pessoas ?? ""} ${c.conversas}`,
    efeitoComparavel(efeito) ? `${media(efeito.mediaCom)} ${media(efeito.mediaSem)}` : "",
    efeitoComparavel(seguinte) ? `${media(seguinte.mediaCom)} ${media(seguinte.mediaSem)}` : "",
  ];
  const daLeitura = semRepetirOAviso(descobertasDaLeitura({ fatos, descobertas: [], jaDitos: [...JA_DITOS_NO_TOPO], textoDoTopo }), SEM_LEITURA_ORIGEM_POR_POST);
  const faltaDeDado = fatos == null ? null : descobertaDaFaltaDeDado(fatos, false);
  const { visiveis: descobertasAVista, resto: descobertasDoDetalhe } = visiveisEResto((faltaDeDado ? [faltaDeDado] : daLeitura).map(comAcaoCurta));
  const leitura =
    fatos == null ? (
      <NxCarregando texto="Lendo o cruzamento…" linhas={2} />
    ) : descobertasAVista.length ? (
      <NxDescobertas titulo="O que fazer com isso" itens={descobertasAVista} clientId={clientId} />
    ) : null;
  const periodoDaLeitura = periodoDoVerTudo(fatos);
  // O tema que uma descoberta à vista já nomeia não volta na lista "Pedem, mas não teve post".
  const semConteudoNoDetalhe = temasJaDitos(semConteudo, descobertasAVista);

  const principal = (
    <NxCard nivel={2} icone={ic(CalendarDays)} titulo="Posts e conversas por dia" subtitulo="Coincidência no tempo, não é prova">
      {d.dias.length === 0 ? (
        <NxAviso tom="info" titulo="Nenhum dia do período tem posts ou conversas." />
      ) : (
        <NxLinhaTempo
          datas={d.dias.map((x) => x.dia)}
          series={[
            { rotulo: "Conversas", valores: d.dias.map((x) => Number(x.conversas) || 0), cor: "var(--b2)", area: true },
            { rotulo: "Agendaram", valores: d.dias.map((x) => Number(x.agendaram) || 0), cor: "var(--up)" },
            { rotulo: "Posts", valores: d.dias.map((x) => Number(x.posts) || 0), cor: "var(--b4)", eixo: "dir" },
          ]}
          formatarData={(x) => `${x.slice(8, 10)}/${x.slice(5, 7)}`}
          formatarValor={fmtN}
          rotulo="Posts, conversas e agendamentos por dia"
          altura={120}
        />
      )}
    </NxCard>
  );

  // Avisos de dado e a atribuição por post (03.1.1-04, régua de 1,5 tela): são a primeira coisa dos Detalhes, e a leitura do topo
  // continua dizendo "origem por post não medida" em "Ver mais", com quem resolve. Nada saiu da tela.
  const avisos = (
    <>
      <NxAviso
        tom="info"
        titulo={`${SEM_LEITURA_ORIGEM_POR_POST}.`}
        detalhe="Hoje nenhuma fonte diz de qual post veio cada conversa. A tela mostra coincidência no tempo e no assunto, nunca qual post gerou uma conversa específica. Para medir, é preciso registrar a origem de cada contato por post."
      >
        {`Quem resolve: ${ROTULO_RESPONSAVEL.equipe_hub}.`}
      </NxAviso>
      {cortado && (
        <NxAviso tom="info" titulo={`Mostrando só os últimos ${MAX_DIAS_PERIODO} dias.`} detalhe={`Esta tela mostra no máximo ${MAX_DIAS_PERIODO} dias. Para o período escolhido, aparecem os últimos ${MAX_DIAS_PERIODO} dias (${periodLabel}).`} />
      )}
      {c.conversas > 0 && lidasPct >= 90 && temaPct < 50 && (
        <NxAviso
          tom="atencao"
          titulo={`Só ${temaPct}% das conversas têm tema identificado.`}
          detalhe={`Só ${temaPct}% das ${fmtN(c.conversas)} conversas do período (${fmtN(c.com_tema)}) têm um tema identificado. As outras não falaram de um assunto do conteúdo ou não tinham texto. Os números por tema valem só para essa parte.`}
        />
      )}
      {c.conversas > 0 && lidasPct < 90 && (
        <NxAviso
          tom="atencao"
          titulo={`A IA leu ${lidasPct}% das conversas: números por tema ainda incompletos.`}
          detalhe={`A IA já leu ${lidasPct}% das ${fmtN(c.conversas)} conversas do período. A leitura roda sozinha a cada 20 minutos; os números por tema, objeção e assunto ficam completos quando chegar perto de 100%.`}
        />
      )}
    </>
  );

  const detalhe = (
    <div style={{ display: "grid", gap: 18 }}>
      <p className="nx-ver-tudo__periodo" data-peca="periodo-do-ver-tudo">
        {periodoDaLeitura && <span>{periodoDaLeitura}</span>}
        <NxChip tipo="sem-selo" />
      </p>
      <NxMaisDescobertas itens={descobertasDoDetalhe} clientId={clientId} />
      {avisos}
      {como("Posts e conversas por dia", "Se as conversas sobem nos dias com post, pode haver relação; é coincidência no tempo, não prova. As linhas azul e verde são as conversas novas e quantas agendaram (eixo da esquerda); a linha clara é a quantidade de posts do dia (eixo da direita). Setas do teclado escolhem o dia.")}
      <NxBlocoDoVerTudo
        rotulo="Tema do post × assunto da conversa"
        cabeca={cabecaDosTemas(temas.filter((t) => temaValido(t.tema)).map((t) => ({ tema: t.tema, quem: quem(t), agendaram: quemAgendou(t) })), c.pessoas != null ? "pessoas" : "conversas")}
      >
        {como("Tema do post e assunto da conversa", "Cada linha é um tema (o mesmo tema escrito com ou sem acento conta uma vez só). À esquerda, o que foi postado; à direita, quantas pessoas chegaram falando desse assunto e quantas agendaram. Tema com muita procura e nenhum post, nem de tema parecido, é pauta pronta.")}
        {(semConteudoNoDetalhe.length > 0 || semDemanda.length > 0) && (
          <div className="nx-grade nx-grade--2">
            {semConteudoNoDetalhe.length > 0 && (
              <div className="ig-pauta ig-pauta--bom">
                <p>
                  <Sparkles size={14} aria-hidden /> Pedem, mas não teve post do tema nem de tema parecido
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {semConteudoNoDetalhe.map((t) => (
                    <NxTag key={t.tema} tom="up" titulo={`${fmtN(quem(t))} ${c.pessoas != null ? "pessoas" : "conversas"}`}>
                      {t.tema} · {fmtN(quem(t))}
                    </NxTag>
                  ))}
                </div>
              </div>
            )}
            {semDemanda.length > 0 && (
              <div className="ig-pauta">
                <p>Muito post, nenhuma conversa sobre o tema</p>
                <div className="flex flex-wrap gap-1.5">
                  {semDemanda.map((t) => (
                    <NxTag key={t.tema} tom="g">
                      {t.tema} · {t.posts} posts
                    </NxTag>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <NxTabela
          rotulo="Temas dos posts e assuntos das conversas"
          colunas={[
            { chave: "tema", titulo: "Tema" },
            { chave: "posts", titulo: "Posts", numerica: true },
            { chave: "alcance", titulo: "Alcance", numerica: true },
            { chave: "quem", titulo: c.pessoas != null ? "Pessoas" : "Conversas", numerica: true },
            { chave: "preco", titulo: "Pediram preço", numerica: true },
            { chave: "agendaram", titulo: "Agendaram (taxa)", numerica: true },
          ]}
          chaveDaLinha={(_, k) => temas[k].tema}
          linhas={temas.slice(0, 20).map((t) => ({
            tema: nomeTema(t.tema),
            posts: fmtN(t.posts),
            alcance: fmtN(t.alcance),
            quem: <span title={`${fmtN(t.conversas)} conversas`}>{fmtN(quem(t))}</span>,
            preco: fmtN(t.pediram_preco),
            agendaram: <>{fmtN(quemAgendou(t))} <span className="ig-taxa">{pct(quemAgendou(t), quem(t))}</span></>,
          }))}
          vazio={<NxAviso tom="info" titulo="Ainda sem temas lidos neste período." />}
        />
      </NxBlocoDoVerTudo>

      <NxBlocoDoVerTudo rotulo="Dia da semana e hora" cabeca={cabecaDaGrade(d.grade)}>
        {como("Dia da semana e hora", "Quanto mais escura a célula, mais conversas começaram naquele dia e hora. O número dentro é quantos posts saíram ali. O ideal é ter posts perto das células escuras.")}
        <NxTabela
          rotulo="Conversas por dia da semana e hora, com os posts que saíram"
          colunas={[{ chave: "dia", titulo: "Dia" }, ...horas.map((h) => ({ chave: `h${h}`, titulo: `${h}h`, numerica: true }))]}
          chaveDaLinha={(_, k) => DIAS[k]}
          linhas={DIAS.map((nome, dow) => ({
            dia: nome,
            ...Object.fromEntries(
              horas.map((h) => {
                const g = grade.get(`${dow}-${h}`);
                const forca = g ? g.conversas / maxGrade : 0;
                return [
                  `h${h}`,
                  <span
                    key={h}
                    className="ig-celula-calor"
                    title={`${nome} ${h}h: ${g?.conversas ?? 0} conversas, ${g?.agendaram ?? 0} agendaram, ${g?.posts ?? 0} posts`}
                    style={{ background: `color-mix(in srgb, var(--b1) ${Math.round(forca * 90)}%, var(--b6))`, color: forca > 0.5 ? "var(--white)" : "var(--text)" }}
                  >
                    {g?.posts ? g.posts : ""}
                  </span>,
                ];
              }),
            ),
          }))}
        />
      </NxBlocoDoVerTudo>

      <NxBlocoDoVerTudo
        rotulo="Posts que atraem quem quer comprar"
        cabeca={qp.isLoading ? cabecaDosComentariosDeCompra(null) : cabecaDosComentariosDeCompra(pr ? pr.comentarios : null)}
      >
        {como("Posts que atraem quem quer comprar", "Comentários que pedem preço, horário, convênio, endereço ou contato, ou que são a palavra-chave pedida na legenda (como 'comente PROMPT'), contados no próprio post. Aqui a ligação é direta: o comentário está naquele post. Directs do Instagram não entram.")}
        {qp.isLoading ? <NxCarregando texto="Lendo os comentários…" linhas={2} /> : qp.error || !pr ? <NxAviso tom="atencao" titulo="Não consegui ler os comentários agora. Atualize a página." /> : pr.posts_compra.length === 0 ? (
          <NxAviso tom="info" titulo={`Nenhum comentário com intenção de compra no período (${fmtN(pr.comentarios.total)} comentários lidos).`}>{avisoCobertura(pr)}</NxAviso>
        ) : (
          <>
            {/* Quantos comentários pedem compra, de quantos, já é a frase do bloco: aqui só a palavra-chave da legenda. */}
            {(pr.comentarios.palavra ?? 0) > 0 && <p className="ig-resumo">{fmtN(pr.comentarios.palavra)} deles com a palavra-chave da legenda.</p>}
            {avisoCobertura(pr) && <NxAviso tom="atencao" titulo={avisoCobertura(pr)} />}
            <ul className="nx-lista ig-ranking">
              {pr.posts_compra.slice(0, 8).map((p) => (
                <li key={p.post_id}>
                  <NxListRow
                    href={p.permalink ?? undefined}
                    inicio={<Miniatura url={p.thumbnail_url} formato={p.formato} className="h-14 w-14" />}
                    titulo={p.legenda || "Post sem legenda"}
                    sub={
                      <>
                        <span>{nomeFormato(p.formato)} · {temaValido(p.tema) ? p.tema : "sem tema"} · {new Date(p.posted_at).toLocaleDateString("pt-BR")}</span>
                        {INTENCOES.filter(([k]) => Number(p[k]) > 0).map(([k, r]) => <span key={k}><NxTag tom="b">{r} · {String(p[k])}</NxTag></span>)}
                      </>
                    }
                    fim={
                      <span className="ig-num-fim">
                        <b>{p.compra}</b>
                        <small>de {fmtN(p.comentarios)} comentários</small>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
            {pr.compra_por_formato.length > 1 && <p className="ig-resumo">Por formato: {pr.compra_por_formato.map((f) => `${nomeFormato(f.formato)} ${fmtN(f.compra)} em ${f.posts} posts`).join(" · ")}</p>}
          </>
        )}
      </NxBlocoDoVerTudo>

      <div className="nx-grade nx-grade--2">
        <NxBlocoDoVerTudo rotulo="Etapa do funil por semana" cabeca={cabecaDasSemanas(d.semanas)}>
          {como("Etapa do funil por semana", "C0 e C1 atraem gente nova; C2 e C3 chamam para consulta. Semanas com mais C2/C3 deveriam ter mais conversas e agendamentos.")}
          <NxTabela
            rotulo="Etapa do funil por semana"
            colunas={[
              { chave: "semana", titulo: "Semana" },
              { chave: "c0", titulo: "C0", numerica: true },
              { chave: "c1", titulo: "C1", numerica: true },
              { chave: "c2", titulo: "C2", numerica: true },
              { chave: "c3", titulo: "C3", numerica: true },
              { chave: "conversas", titulo: "Conversas", numerica: true },
              { chave: "agendaram", titulo: "Agendaram", numerica: true },
            ]}
            chaveDaLinha={(_, k) => d.semanas[k].semana}
            linhas={d.semanas.map((s) => ({ semana: `${s.semana.slice(8, 10)}/${s.semana.slice(5, 7)}`, c0: s.c0, c1: s.c1, c2: s.c2, c3: s.c3, conversas: fmtN(s.conversas), agendaram: fmtN(s.agendaram) }))}
            vazio={<NxAviso tom="info" titulo="Nenhuma semana com etapa do funil no período." />}
          />
        </NxBlocoDoVerTudo>
        <NxBlocoDoVerTudo
          rotulo="Tempo da primeira resposta × agendamento"
          cabeca={cabecaDaResposta(
            qp.isLoading || !pr ? [] : pr.resposta.map((r) => ({ rotulo: FAIXA_RESPOSTA[r.faixa] ?? r.faixa, conversas: r.conversas, agendaram: r.agendaram })),
            MIN_CONVERSAS_FAIXA,
          )}
        >
          {como("Tempo da primeira resposta", "Quanto tempo o paciente esperou pela primeira resposta de uma pessoa (robô não conta) e quantos agendaram. Só conversas que começaram em horário comercial (seg a sex 8h–18h, sáb 8h–12h). É correlação, não prova.")}
          {qp.isLoading ? <NxCarregando texto="Medindo as respostas…" linhas={2} /> : !pr || pr.cobertura.horario_comercial < MIN_CONVERSAS_FAIXA ? (
            <NxAviso tom="info" titulo={`Poucas conversas em horário comercial no período para comparar (mínimo de ${MIN_CONVERSAS_FAIXA}).`} />
          ) : (
            <>
              <ul className="ig-barras">
                {pr.resposta.map((r, i) => {
                  const taxa = r.conversas > 0 ? r.agendaram / r.conversas : 0;
                  const maxTaxa = Math.max(0.01, ...pr.resposta.map((x) => (x.conversas > 0 ? x.agendaram / x.conversas : 0)));
                  const rapida = r.faixa.startsWith("1") || r.faixa.startsWith("2");
                  return (
                    <li key={r.faixa} className="nx-hb">
                      <div className="nx-hb__linha">
                        <span className="ig-barras__rotulo">{FAIXA_RESPOSTA[r.faixa] ?? r.faixa}</span>
                        <em>{pct(r.agendaram, r.conversas)} agendaram <small>· {fmtN(r.conversas)} conversas</small></em>
                      </div>
                      <div className={`nx-trk${rapida ? "" : " ig-trk--lento"}`} aria-hidden>
                        <i style={{ width: `${Math.max(3, (taxa / maxTaxa) * 100)}%`, ["--i" as string]: i } as CSSProperties} />
                        <u />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {posProfundo.length > 0 && (
                <NxTabela
                  rotulo="Tempo de resposta por tema"
                  colunas={[
                    { chave: "tema", titulo: "Tema" },
                    { chave: "rapidas", titulo: "Respondidas em até 1 h", numerica: true },
                    { chave: "lentas", titulo: "Depois de 1 h ou sem resposta", numerica: true },
                  ]}
                  chaveDaLinha={(_, k) => posProfundo[k].tema}
                  linhas={posProfundo.map((t) => ({ tema: t.tema, rapidas: `${pct(t.rapidas_agendaram, t.rapidas)} agendaram`, lentas: `${pct(t.lentas_agendaram, t.lentas)} agendaram` }))}
                />
              )}
            </>
          )}
        </NxBlocoDoVerTudo>
      </div>

      <NxBlocoDoVerTudo
        rotulo="Tema da conversa × venda fechada no CRM"
        cabeca={qp.isLoading || !pr ? cabecaDaVendaPorTema([]) : cabecaDaVendaPorTema(pr.temas_valor.filter((t) => temaValido(t.tema)).map((t) => ({ tema: t.tema, ganhos: t.ganhos, receita: t.receita })))}
      >
        {como("Tema da conversa e venda fechada", "Cada conversa tem o tema lido pela IA e está ligada ao lead do CRM. Mostra quantas viraram venda e quanto faturaram. Depende de a equipe marcar o lead como ganho e preencher o valor.")}
        {qp.isLoading ? <NxCarregando texto="Cruzando com o CRM…" linhas={2} /> : !pr ? <NxAviso tom="atencao" titulo="Não consegui cruzar com o CRM agora." /> : pr.temas_valor.filter((t) => temaValido(t.tema)).length === 0 ? (
          <NxAviso tom="info" titulo={`Ainda sem conversas com tema lido no período (${fmtN(pr.cobertura.com_tema)} de ${fmtN(pr.cobertura.conversas)}).`} />
        ) : (
          <>
            <NxTabela
              rotulo="Tema da conversa e venda fechada no CRM"
              colunas={[
                { chave: "tema", titulo: "Tema" },
                { chave: "conversas", titulo: "Conversas", numerica: true },
                { chave: "lead", titulo: "Com lead", numerica: true },
                { chave: "vendas", titulo: "Vendas", numerica: true },
                { chave: "fechamento", titulo: "Fechamento", numerica: true },
                { chave: "faturado", titulo: "Faturado", numerica: true },
                { chave: "ticket", titulo: "Ticket médio", numerica: true },
              ]}
              chaveDaLinha={(_, k) => pr.temas_valor.filter((t) => temaValido(t.tema))[k].tema}
              linhas={pr.temas_valor.filter((t) => temaValido(t.tema)).slice(0, 15).map((t) => ({
                tema: t.tema,
                conversas: fmtN(t.conversas),
                lead: fmtN(t.com_lead),
                vendas: fmtN(t.ganhos),
                fechamento: pct(t.ganhos, t.com_lead),
                faturado: t.receita > 0 ? brl(t.receita) : "Sem dado",
                ticket: t.ganhos_com_valor > 0 ? brl(t.receita / t.ganhos_com_valor) : "Sem dado",
              }))}
            />
            <NxAviso tom="info" titulo={`${fmtN(pr.cobertura.com_tema)} de ${fmtN(pr.cobertura.conversas)} conversas do período já têm tema lido;`}>{fmtN(pr.cobertura.com_lead)} estão ligadas a um lead.</NxAviso>
          </>
        )}
      </NxBlocoDoVerTudo>

      <div className="nx-grade nx-grade--2">
        <NxBlocoDoVerTudo
          rotulo="Objeções que aparecem nas conversas"
          cabeca={cabecaDoMaisComum(d.objecoes.map((o) => ({ nome: OBJ[o.objecao] ?? o.objecao, n: o.pessoas ?? o.n })), { oQue: "a objeção mais comum", unidade: d.objecoes.some((o) => o.pessoas != null) ? "pessoas" : "conversas", vazio: "nenhuma objeção lida ainda" })}
        >
          {d.objecoes.length === 0 ? <NxAviso tom="info" titulo="Nenhuma objeção lida ainda." /> : (
            <IgBarras
              semPercentual
              itens={d.objecoes.map((o) => ({
                chave: o.objecao,
                rotulo: OBJ[o.objecao] ?? o.objecao,
                valor: o.pessoas ?? o.n,
                extra: `${o.pessoas != null ? "pessoas" : "conversas"}, ${pct(o.pessoas_agendaram ?? o.agendaram, o.pessoas ?? o.n)} agendaram`,
              }))}
              formato={fmtN}
            />
          )}
        </NxBlocoDoVerTudo>
        <NxBlocoDoVerTudo
          rotulo="O que mais pedem nas conversas"
          cabeca={cabecaDoMaisComum(d.assuntos.map((a) => ({ nome: a.assunto, n: a.n })), { oQue: "o pedido mais comum", unidade: "conversas", vazio: "nenhum assunto lido ainda" })}
        >
          {d.assuntos.length === 0 ? <NxAviso tom="info" titulo="Nenhum assunto lido ainda." /> : (
            <IgBarras semPercentual itens={d.assuntos.map((a) => ({ chave: a.assunto, rotulo: a.assunto, valor: a.n }))} formato={(v) => `${fmtN(v)} conversas`} />
          )}
        </NxBlocoDoVerTudo>
      </div>

      <NxComoCalcula titulo="Como ler esta tela">
        Cruza o que foi postado no Instagram com as conversas que chegaram no WhatsApp: por dia, por dia da semana e hora, por tema e por etapa do funil. O tema da conversa vem da leitura por IA só das mensagens do paciente, com o mesmo vocabulário de temas dos posts. Mostra coincidência no tempo, não prova que um post gerou uma conversa específica.
      </NxComoCalcula>
    </div>
  );

  return (
    <div className="nexo-ig">
      <PaginaNexo
        {...cabecalho}
        leitura={leitura}
        cartoes={cartoes}
        principal={principal}
        detalhe={detalhe}
      />
    </div>
  );
}
