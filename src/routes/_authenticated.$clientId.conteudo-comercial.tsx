import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { CalendarDays, Clock, MessageCircle, Tag, Layers, ShieldAlert, Search, Sparkles, ShoppingBag, BadgeDollarSign, Timer } from "lucide-react";
import { conclusoes, conclusoesProfundas, nomeFormato, temaValido, recortarPeriodo, efeitoPorDiaDaSemana, efeitoDiaSeguinte, efeitoComparavel, juntarTemas, temasSemPost, temasSemConversa, quem, quemAgendou, coberturaComentarios, FAIXA_RESPOSTA, MIN_CONVERSAS_FAIXA, MIN_DIAS, MAX_DIAS_PERIODO, type DadosProfundos, type EfeitoPareado } from "@/lib/conteudo-comercial";
import { supabase } from "@/integrations/supabase/client";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { InfoDica, Miniatura } from "@/components/visual";
import { NxCard, NxKpi, NxTag, NxListRow, NxLinhaTempo } from "@/components/nx";
import { IgCabecalho, IgLeitura, IgNota, IgNotas, IgMetodo, IgBarras } from "@/components/nx/instagram";
import { Carregando, ErroCarga } from "@/components/sem-fonte";

export const Route = createFileRoute("/_authenticated/$clientId/conteudo-comercial")({
  component: ConteudoComercialPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
const db = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const fmtN = (n: number | null | undefined) => Math.round(Number(n ?? 0)).toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
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
  return cob != null && cob < 0.8 ? ` O painel guardou ${Math.round(cob * 100)}% dos comentários que o Instagram mostra nos posts do período.` : "";
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

function ConteudoComercialPage() {
  const { clientId } = Route.useParams();
  const pedido = resolveDateRange(clientLayoutRoute.useSearch());
  // As leituras desta tela aceitam até 120 dias: período maior (6 meses, 1 ano) mostra os últimos 120 dias, com aviso.
  const { start, end, cortado } = recortarPeriodo(pedido.start, pedido.end);
  const periodLabel = formatRangeLabel({ start, end });
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

  const head = (
    <IgCabecalho
      titulo="O conteúdo está trazendo conversa e agendamento?"
      pergunta="Cruza os posts do Instagram com as conversas que chegaram no WhatsApp, por dia, horário, tema e etapa do funil."
      periodo={
        <>
          <CalendarDays size={15} aria-hidden /> {periodLabel}
        </>
      }
      metodo="Cruza o que foi postado no Instagram com as conversas que chegaram no WhatsApp: por dia, por dia da semana e hora, por tema e por etapa do funil. O tema da conversa vem da leitura por IA só das mensagens do paciente, com o mesmo vocabulário de temas dos posts. Mostra coincidência no tempo, não prova que um post gerou uma conversa específica."
    />
  );
  if (q.isLoading) return <div className="nexo-ig">{head}<Carregando texto="Cruzando conteúdo e conversas…" /></div>;
  if (q.error) return <div className="nexo-ig">{head}<ErroCarga texto="Não consegui cruzar conteúdo e conversas agora. Atualize a página." /></div>;
  const d = q.data;
  if (!d) return <div className="nexo-ig">{head}<ErroCarga texto="Não consegui ler este período para este cliente. Confira se você tem acesso a ele." /></div>;

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
  const info = (rotulo: string, texto: string) => <InfoDica texto={texto} rotulo={`Sobre ${rotulo}`} />;
  const como = (titulo: string, texto: string) => <IgMetodo rotulo={`Como ler: ${titulo}`}>{texto}</IgMetodo>;
  const leitura = [...conclusoes(d), ...(pr ? conclusoesProfundas(pr) : [])];

  return (
    <div className="nexo-ig">
      {head}
      {(cortado || (c.conversas > 0 && (lidasPct < 90 || temaPct < 50))) && (
        <IgNotas>
          {cortado && (
            <IgNota detalhe={`Esta tela mostra no máximo ${MAX_DIAS_PERIODO} dias. Para o período escolhido, aparecem os últimos ${MAX_DIAS_PERIODO} dias (${periodLabel}).`}>
              Mostrando só os últimos {MAX_DIAS_PERIODO} dias
            </IgNota>
          )}
          {c.conversas > 0 && lidasPct >= 90 && temaPct < 50 && (
            <IgNota
              tom="aviso"
              detalhe={`Só ${temaPct}% das ${fmtN(c.conversas)} conversas do período (${fmtN(c.com_tema)}) têm um tema identificado. As outras não falaram de um assunto do conteúdo ou não tinham texto. Os números por tema valem só para essa parte.`}
            >
              Só {temaPct}% das conversas têm tema identificado
            </IgNota>
          )}
          {c.conversas > 0 && lidasPct < 90 && (
            <IgNota
              tom="aviso"
              detalhe={`A IA já leu ${lidasPct}% das ${fmtN(c.conversas)} conversas do período. A leitura roda sozinha a cada 20 minutos; os números por tema, objeção e assunto ficam completos quando chegar perto de 100%.`}
            >
              A IA leu {lidasPct}% das conversas: números por tema ainda incompletos
            </IgNota>
          )}
        </IgNotas>
      )}

      <section className="nx-grade nx-grade--4 ig-kpis" aria-label="Números do cruzamento">
        {c.pessoas != null ? (
          <NxKpi i={0} icone={ic(MessageCircle)} rotulo="Pessoas que chamaram" valor={fmtN(c.pessoas)} nota={`${fmtN(c.conversas)} conversas novas · ${fmtN(c.posts)} posts no período`} info={info("Pessoas que chamaram", "Quem abriu mais de uma conversa no período conta uma vez só.")} />
        ) : (
          <NxKpi i={0} icone={ic(MessageCircle)} rotulo="Conversas novas" valor={fmtN(c.conversas)} nota={`${fmtN(c.posts)} posts no período`} />
        )}
        <NxKpi i={1} icone={ic(CalendarDays)} rotulo="Conversas em dia com post" valor={efeitoComparavel(efeito) ? media(efeito.mediaCom) : "—"} nota={efeitoComparavel(efeito) ? `média por dia · ${efeito.diasCom} dias` : faltaPar(efeito)} info={info("Conversas em dia com post", INFO_PAR)} />
        <NxKpi i={2} icone={ic(CalendarDays)} rotulo="Mesmo dia da semana sem post" valor={efeitoComparavel(efeito) ? media(efeito.mediaSem) : "—"} nota={efeitoComparavel(efeito) ? `média por dia · ${efeito.diasSem} dias` : faltaPar(efeito)} info={info("Mesmo dia da semana sem post", INFO_PAR)} />
        <NxKpi
          i={3}
          icone={ic(Clock)}
          rotulo="Dia seguinte ao post"
          valor={efeitoComparavel(seguinte) ? media(seguinte.mediaCom) : "—"}
          nota={efeitoComparavel(seguinte) ? `sem post na véspera: ${media(seguinte.mediaSem)}` : faltaPar(seguinte)}
          info={info("Dia seguinte ao post", "Conversas novas no dia seguinte a um dia com post, comparadas com o dia seguinte a um dia sem post, sempre no mesmo dia da semana. Anúncios e feriados também mexem nesse número.")}
        />
      </section>

      <NxCard
        i={4}
        icone={ic(CalendarDays)}
        titulo="Posts e conversas por dia"
        subtitulo="Se as conversas sobem nos dias com post, o conteúdo está puxando conversa"
        acao={como("Posts e conversas por dia", "As linhas azul e verde são as conversas novas e quantas agendaram (eixo da esquerda); a linha clara é a quantidade de posts do dia (eixo da direita). Setas do teclado escolhem o dia.")}
      >
        {d.dias.length === 0 ? (
          <IgNota>Nenhum dia do período tem posts ou conversas.</IgNota>
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
          />
        )}
      </NxCard>

      <IgLeitura
        i={5}
        titulo="O que os números dizem"
        subtitulo="Leitura automática do período. Coincidência no tempo e no assunto, não prova de que um post gerou uma conversa."
        itens={leitura.map((x) => ({ chave: x.titulo, titulo: x.titulo, texto: x.texto, acao: x.acao, tom: x.tom }))}
      />

      <NxCard
        icone={ic(Tag)}
        titulo="Tema do post × assunto da conversa"
        subtitulo="O que foi postado e quantas pessoas chegaram falando de cada tema"
        acao={como("Tema do post e assunto da conversa", "Cada linha é um tema (o mesmo tema escrito com ou sem acento conta uma vez só). À esquerda, o que foi postado; à direita, quantas pessoas chegaram falando desse assunto e quantas agendaram. Tema com muita procura e nenhum post, nem de tema parecido, é pauta pronta.")}
      >
        {(semConteudo.length > 0 || semDemanda.length > 0) && (
          <div className="nx-grade nx-grade--2">
            {semConteudo.length > 0 && (
              <div className="ig-pauta ig-pauta--bom">
                <p>
                  <Sparkles size={14} aria-hidden /> Pedem, mas não teve post do tema nem de tema parecido
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {semConteudo.map((t) => (
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
        {temas.length === 0 ? (
          <IgNota>Ainda sem temas lidos neste período.</IgNota>
        ) : (
          <div className="ig-tabela">
            <table className="w-full text-sm tabular-nums">
              <thead><tr className="text-left"><th className="py-1 pr-3">Tema</th><th className="pr-3 text-right">Posts</th><th className="pr-3 text-right">Alcance</th><th className="pr-3 text-right">{c.pessoas != null ? "Pessoas" : "Conversas"}</th><th className="pr-3 text-right">Pediram preço</th><th className="text-right">Agendaram (taxa)</th></tr></thead>
              <tbody>
                {temas.slice(0, 20).map((t) => (
                  <tr key={t.tema}>
                    <td className="py-1.5 pr-3">{nomeTema(t.tema)}</td>
                    <td className="pr-3 text-right">{fmtN(t.posts)}</td>
                    <td className="pr-3 text-right">{fmtN(t.alcance)}</td>
                    <td className="pr-3 text-right" title={`${fmtN(t.conversas)} conversas`}>{fmtN(quem(t))}</td>
                    <td className="pr-3 text-right">{fmtN(t.pediram_preco)}</td>
                    <td className="text-right">{fmtN(quemAgendou(t))} <span className="ig-taxa">{pct(quemAgendou(t), quem(t))}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </NxCard>

      <NxCard icone={ic(Clock)} titulo="Dia da semana e hora" subtitulo="Mais escuro, mais conversas começaram ali. O número é quantos posts saíram" acao={como("Dia da semana e hora", "Quanto mais escura a célula, mais conversas começaram naquele dia e hora. O número dentro é quantos posts saíram ali. O ideal é ter posts perto das células escuras.")}>
        <div className="ig-tabela">
          <table className="ig-calor">
            <thead><tr><th />{horas.map((h) => <th key={h}>{h}h</th>)}</tr></thead>
            <tbody>
              {DIAS.map((nome, dow) => (
                <tr key={nome}>
                  <td className="ig-calor__dia">{nome}</td>
                  {horas.map((h) => {
                    const g = grade.get(`${dow}-${h}`);
                    const forca = g ? g.conversas / maxGrade : 0;
                    return <td key={h} title={`${nome} ${h}h: ${g?.conversas ?? 0} conversas, ${g?.agendaram ?? 0} agendaram, ${g?.posts ?? 0} posts`} className="ig-calor__c" style={{ background: `color-mix(in srgb, var(--b1) ${Math.round(forca * 90)}%, var(--b6))`, color: forca > 0.5 ? "var(--white)" : "var(--text)" }}>{g?.posts ? g.posts : ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </NxCard>

      <NxCard
        icone={ic(ShoppingBag)}
        titulo="Posts que atraem quem quer comprar"
        subtitulo="Comentários que pedem preço, horário, convênio, endereço ou contato, no próprio post"
        acao={como("Posts que atraem quem quer comprar", "Comentários que pedem preço, horário, convênio, endereço ou contato, ou que são a palavra-chave pedida na legenda (como 'comente PROMPT'), contados no próprio post. Aqui a ligação é direta: o comentário está naquele post. Directs do Instagram não entram.")}
      >
        {qp.isLoading ? <IgNota>Lendo os comentários…</IgNota> : qp.error || !pr ? <IgNota tom="aviso">Não consegui ler os comentários agora. Atualize a página.</IgNota> : pr.posts_compra.length === 0 ? (
          <IgNota>Nenhum comentário com intenção de compra no período ({fmtN(pr.comentarios.total)} comentários lidos).{avisoCobertura(pr)}</IgNota>
        ) : (
          <>
            <p className="ig-resumo">{fmtN(pr.comentarios.compra)} de {fmtN(pr.comentarios.total)} comentários ({pct(pr.comentarios.compra, pr.comentarios.total)}) em {fmtN(pr.comentarios.posts_com_compra)} posts{pr.comentarios.palavra ? `, ${fmtN(pr.comentarios.palavra)} deles com a palavra-chave da legenda` : ""}.</p>
            {avisoCobertura(pr) && <IgNota tom="aviso">{avisoCobertura(pr).trim()}</IgNota>}
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
      </NxCard>

      <div className="nx-grade nx-grade--2">
        <NxCard icone={ic(Layers)} titulo="Etapa do funil por semana" subtitulo="C0 e C1 atraem gente nova; C2 e C3 chamam para consulta" acao={como("Etapa do funil por semana", "C0 e C1 atraem gente nova; C2 e C3 chamam para consulta. Semanas com mais C2/C3 deveriam ter mais conversas e agendamentos.")}>
          <div className="ig-tabela">
            <table className="w-full text-sm tabular-nums">
              <thead><tr className="text-left"><th className="py-1 pr-3">Semana</th><th className="pr-3 text-right">C0</th><th className="pr-3 text-right">C1</th><th className="pr-3 text-right">C2</th><th className="pr-3 text-right">C3</th><th className="pr-3 text-right">Conversas</th><th className="text-right">Agendaram</th></tr></thead>
              <tbody>
                {d.semanas.map((s) => (
                  <tr key={s.semana}>
                    <td className="py-1.5 pr-3">{s.semana.slice(8, 10)}/{s.semana.slice(5, 7)}</td>
                    <td className="pr-3 text-right">{s.c0}</td><td className="pr-3 text-right">{s.c1}</td><td className="pr-3 text-right">{s.c2}</td><td className="pr-3 text-right">{s.c3}</td>
                    <td className="pr-3 text-right">{fmtN(s.conversas)}</td><td className="text-right">{fmtN(s.agendaram)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </NxCard>
        <NxCard
          icone={ic(Timer)}
          titulo="Tempo da primeira resposta × agendamento"
          subtitulo="Quanto o paciente esperou e quantos agendaram, em horário comercial"
          acao={como("Tempo da primeira resposta", "Quanto tempo o paciente esperou pela primeira resposta de uma pessoa (robô não conta) e quantos agendaram. Só conversas que começaram em horário comercial (seg a sex 8h–18h, sáb 8h–12h). É correlação, não prova.")}
        >
          {qp.isLoading ? <IgNota>Medindo as respostas…</IgNota> : !pr || pr.cobertura.horario_comercial < MIN_CONVERSAS_FAIXA ? (
            <IgNota>Poucas conversas em horário comercial no período para comparar (mínimo de {MIN_CONVERSAS_FAIXA}).</IgNota>
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
              {pr.resposta_tema.filter((t) => temaValido(t.tema) && t.rapidas >= 10 && t.lentas >= 10).length > 0 && (
                <div className="ig-tabela">
                  <table className="w-full text-sm tabular-nums">
                    <thead><tr className="text-left"><th className="py-1 pr-3">Tema</th><th className="pr-3 text-right">Respondidas em até 1 h</th><th className="text-right">Depois de 1 h ou sem resposta</th></tr></thead>
                    <tbody>{pr.resposta_tema.filter((t) => temaValido(t.tema) && t.rapidas >= 10 && t.lentas >= 10).map((t) => (
                      <tr key={t.tema}><td className="py-1.5 pr-3">{t.tema}</td><td className="pr-3 text-right">{pct(t.rapidas_agendaram, t.rapidas)} agendaram</td><td className="text-right">{pct(t.lentas_agendaram, t.lentas)} agendaram</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </NxCard>
      </div>

        <NxCard
          icone={ic(BadgeDollarSign)}
          titulo="Tema da conversa × venda fechada no CRM"
          subtitulo="Quantas conversas de cada tema viraram venda e quanto faturaram"
          acao={como("Tema da conversa e venda fechada", "Cada conversa tem o tema lido pela IA e está ligada ao lead do CRM. Mostra quantas viraram venda e quanto faturaram. Depende de a equipe marcar o lead como ganho e preencher o valor.")}
        >
          {qp.isLoading ? <IgNota>Cruzando com o CRM…</IgNota> : !pr ? <IgNota tom="aviso">Não consegui cruzar com o CRM agora.</IgNota> : pr.temas_valor.filter((t) => temaValido(t.tema)).length === 0 ? (
            <IgNota>Ainda sem conversas com tema lido no período ({fmtN(pr.cobertura.com_tema)} de {fmtN(pr.cobertura.conversas)}).</IgNota>
          ) : (
            <>
              <div className="ig-tabela">
                <table className="w-full text-sm tabular-nums">
                  <thead><tr className="text-left"><th className="py-1 pr-3">Tema</th><th className="pr-3 text-right">Conversas</th><th className="pr-3 text-right">Com lead</th><th className="pr-3 text-right">Vendas</th><th className="pr-3 text-right">Fechamento</th><th className="pr-3 text-right">Faturado</th><th className="text-right">Ticket médio</th></tr></thead>
                  <tbody>
                    {pr.temas_valor.filter((t) => temaValido(t.tema)).slice(0, 15).map((t) => (
                      <tr key={t.tema}>
                        <td className="py-1.5 pr-3">{t.tema}</td><td className="pr-3 text-right">{fmtN(t.conversas)}</td><td className="pr-3 text-right">{fmtN(t.com_lead)}</td>
                        <td className="pr-3 text-right">{fmtN(t.ganhos)}</td><td className="pr-3 text-right">{pct(t.ganhos, t.com_lead)}</td>
                        <td className="pr-3 text-right">{t.receita > 0 ? brl(t.receita) : "—"}</td><td className="text-right">{t.ganhos_com_valor > 0 ? brl(t.receita / t.ganhos_com_valor) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <IgNota>{fmtN(pr.cobertura.com_tema)} de {fmtN(pr.cobertura.conversas)} conversas do período já têm tema lido; {fmtN(pr.cobertura.com_lead)} estão ligadas a um lead.</IgNota>
            </>
          )}
        </NxCard>

      <div className="nx-grade nx-grade--2">
        <NxCard icone={ic(ShieldAlert)} titulo="Objeções que aparecem nas conversas" subtitulo="Cada objeção frequente é um post que responde antes da conversa">
          {d.objecoes.length === 0 ? <IgNota>Nenhuma objeção lida ainda.</IgNota> : (
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
        </NxCard>
        <NxCard icone={ic(Search)} titulo="O que mais pedem nas conversas" subtitulo="Assunto da conversa nas palavras da IA, sem dado pessoal. Contado por conversa">
          {d.assuntos.length === 0 ? <IgNota>Nenhum assunto lido ainda.</IgNota> : (
            <IgBarras semPercentual itens={d.assuntos.map((a) => ({ chave: a.assunto, rotulo: a.assunto, valor: a.n }))} formato={(v) => `${fmtN(v)} conversas`} />
          )}
        </NxCard>
      </div>
    </div>
  );
}
