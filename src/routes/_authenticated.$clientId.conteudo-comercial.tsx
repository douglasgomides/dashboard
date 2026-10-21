import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { CalendarDays, Clock, MessageCircle, Tag, Layers, ShieldAlert, Search, Info, Sparkles, Lightbulb, ArrowRight } from "lucide-react";
import { conclusoes, type Tom } from "@/lib/conteudo-comercial";
import { supabase } from "@/integrations/supabase/client";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { Painel, Kpi, Selo, Ajuda } from "@/components/visual";
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
  temas: { tema: string; posts: number; alcance: number; conversas: number; comerciais: number; pediram_preco: number; agendaram: number }[];
  semanas: { semana: string; c0: number; c1: number; c2: number; c3: number; conversas: number; agendaram: number }[];
  objecoes: { objecao: string; n: number; agendaram: number }[];
  assuntos: { assunto: string; n: number; agendaram: number }[];
  cobertura: { conversas: number; lidas: number; sem_texto: number; com_tema: number; posts: number; posts_com_tema: number };
}

const COR_TOM: Record<Tom, string> = { bom: "var(--good-text)", atencao: "var(--warn)", neutro: "var(--text-dim)" };

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
    cobertura: { conversas: Number(c.conversas ?? 0), lidas: Number(c.lidas ?? 0), sem_texto: Number(c.sem_texto ?? 0), com_tema: Number(c.com_tema ?? 0), posts: Number(c.posts ?? 0), posts_com_tema: Number(c.posts_com_tema ?? 0) },
  };
}

function ConteudoComercialPage() {
  const { clientId } = Route.useParams();
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  const periodLabel = formatRangeLabel({ start, end });
  const q = useQuery({
    queryKey: ["conteudo-comercial", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await db.rpc("conteudo_comercial", { p_client: clientId, p_de: start, p_ate: end });
      if (error) throw new Error(error.message);
      return normalizar(data);
    },
  });

  const head = (
    <div className="hpagehead">
      <h2>Conteúdo × Comercial</h2>
      <div className="flex items-center gap-2">
        <CalendarDays size={14} aria-hidden style={{ color: "var(--accent)" }} />
        <span>{periodLabel}</span>
        <Ajuda>Cruza o que foi postado no Instagram com as conversas que chegaram no WhatsApp: por dia, por dia da semana e hora, por tema e por etapa do funil. O tema da conversa vem da leitura por IA só das mensagens do paciente, com o mesmo vocabulário de temas dos posts. Mostra coincidência no tempo, não prova que um post gerou uma conversa específica.</Ajuda>
      </div>
    </div>
  );
  if (q.isLoading) return <div>{head}<Carregando texto="Cruzando conteúdo e conversas…" /></div>;
  if (q.error) return <div>{head}<ErroCarga texto="Não consegui cruzar conteúdo e conversas agora. Tente o período menor (até 120 dias) ou atualize a página." /></div>;
  const d = q.data;
  if (!d) return <div>{head}<ErroCarga texto="Período inválido ou sem permissão para este cliente." /></div>;

  const c = d.cobertura;
  const e = d.efeito_post;
  const lidasPct = c.conversas > 0 ? Math.round(((c.lidas + c.sem_texto) / c.conversas) * 100) : 0;
  const temasComDemanda = d.temas.filter((t) => temaIdentificado(t.tema) && t.conversas > 0);
  const semConteudo = temasComDemanda.filter((t) => t.posts === 0).slice(0, 5);
  const semDemanda = d.temas.filter((t) => temaIdentificado(t.tema) && t.posts >= 2 && t.conversas === 0).slice(0, 5);
  const maxGrade = Math.max(1, ...d.grade.map((g) => g.conversas));
  const grade = new Map(d.grade.map((g) => [`${g.dow}-${g.hora}`, g]));
  const horas = Array.from({ length: 18 }, (_, i) => i + 6);

  return (
    <div className="grid gap-4">
      {head}
      {c.conversas > 0 && lidasPct < 90 && (
        <p className="flex items-start gap-2 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
          <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
          A IA já leu {lidasPct}% das {fmtN(c.conversas)} conversas do período. A leitura roda sozinha a cada 20 minutos; os números por tema, objeção e assunto ficam completos quando chegar perto de 100%.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icone={MessageCircle} rotulo="Conversas novas" valor={fmtN(c.conversas)} dica={`${fmtN(c.posts)} posts no período`} />
        <Kpi icone={CalendarDays} rotulo="Conversas em dia com post" valor={e?.media_com_post != null ? String(e.media_com_post).replace(".", ",") : "—"} dica={`média por dia · ${e?.dias_com_post ?? 0} dias`} />
        <Kpi icone={CalendarDays} rotulo="Conversas em dia sem post" valor={e?.media_sem_post != null ? String(e.media_sem_post).replace(".", ",") : "—"} dica={`média por dia · ${e?.dias_sem_post ?? 0} dias`} cor="var(--muted)" />
        <Kpi icone={Clock} rotulo="Dia seguinte ao post" valor={e?.media_dia_seguinte_com_post != null ? String(e.media_dia_seguinte_com_post).replace(".", ",") : "—"} dica={`sem post na véspera: ${e?.media_dia_seguinte_sem_post != null ? String(e.media_dia_seguinte_sem_post).replace(".", ",") : "—"}`} info="Média de conversas novas no dia seguinte a um dia com post, comparada com o dia seguinte a um dia sem post. Anúncios e sazonalidade também mexem nesse número." />
      </div>

      <Painel icone={Lightbulb} titulo="O que os números dizem" cor="var(--warn)" destaque resumo="Leitura automática do período. Coincidência no tempo e no assunto, não prova de que um post gerou uma conversa.">
        <ul className="mt-2 grid gap-3">
          {conclusoes(d).map((x) => (
            <li key={x.titulo} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", borderLeft: `3px solid ${COR_TOM[x.tom]}` }}>
              <p className="text-sm font-semibold">{x.titulo}</p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--text-dim)" }}>{x.texto}</p>
              {x.acao && <p className="mt-1 flex items-start gap-1.5 text-sm"><ArrowRight size={14} aria-hidden className="mt-0.5 shrink-0" style={{ color: COR_TOM[x.tom] }} />{x.acao}</p>}
            </li>
          ))}
        </ul>
      </Painel>

      <Painel icone={CalendarDays} titulo="Posts e conversas por dia" resumo="Como ler: as barras são os posts do dia; as linhas, as conversas novas e quantas agendaram. Se a linha sobe nos dias de barra, o conteúdo está puxando conversa.">
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <ComposedChart data={d.dias.map((x) => ({ ...x, rotulo: x.dia.slice(8, 10) + "/" + x.dia.slice(5, 7) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} minTickGap={16} />
              <YAxis yAxisId="c" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="p" orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="p" dataKey="posts" name="Posts" fill="var(--s3)" />
              <Line yAxisId="c" dataKey="conversas" name="Conversas" stroke="var(--accent)" dot={false} strokeWidth={2} />
              <Line yAxisId="c" dataKey="agendaram" name="Agendaram" stroke="var(--good-text)" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Painel>

      <Painel icone={Tag} titulo="Tema do post × assunto da conversa" resumo="Como ler: cada linha é um tema. À esquerda, o que foi postado; à direita, quantos pacientes chegaram falando desse assunto e quantos agendaram. Tema com muita conversa e pouco post é pauta pronta.">
        {temasComDemanda.length === 0 && d.temas.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>Ainda sem temas lidos neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}><th className="py-1 pr-3">Tema</th><th className="pr-3 text-right">Posts</th><th className="pr-3 text-right">Alcance</th><th className="pr-3 text-right">Conversas</th><th className="pr-3 text-right">Pediram preço</th><th className="text-right">Agendaram (taxa)</th></tr></thead>
              <tbody>
                {d.temas.slice(0, 20).map((t) => (
                  <tr key={t.tema} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-3">{nomeTema(t.tema)}</td>
                    <td className="pr-3 text-right tabular-nums">{fmtN(t.posts)}</td>
                    <td className="pr-3 text-right tabular-nums">{fmtN(t.alcance)}</td>
                    <td className="pr-3 text-right tabular-nums">{fmtN(t.conversas)}</td>
                    <td className="pr-3 text-right tabular-nums">{fmtN(t.pediram_preco)}</td>
                    <td className="text-right tabular-nums">{fmtN(t.agendaram)} <span className="text-xs" style={{ color: "var(--text-dim)" }}>{pct(t.agendaram, t.conversas)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(semConteudo.length > 0 || semDemanda.length > 0) && (
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            {semConteudo.length > 0 && <div><p className="mb-1 flex items-center gap-1 font-semibold"><Sparkles size={12} aria-hidden /> Pacientes pedem, mas não teve post</p><div className="flex flex-wrap gap-1.5">{semConteudo.map((t) => <Selo key={t.tema} cor="var(--good-text)">{t.tema} · {t.conversas}</Selo>)}</div></div>}
            {semDemanda.length > 0 && <div><p className="mb-1 font-semibold">Muito post, nenhuma conversa sobre o tema</p><div className="flex flex-wrap gap-1.5">{semDemanda.map((t) => <Selo key={t.tema}>{t.tema} · {t.posts} posts</Selo>)}</div></div>}
          </div>
        )}
      </Painel>

      <Painel icone={Clock} titulo="Dia da semana e hora" resumo="Como ler: quanto mais escura a célula, mais pacientes chamaram naquele dia e hora. O número dentro é quantos posts saíram ali. O ideal é ter posts perto das células escuras.">
        <div className="overflow-x-auto">
          <table className="text-[11px] tabular-nums">
            <thead><tr><th />{horas.map((h) => <th key={h} className="px-0.5 font-normal" style={{ color: "var(--text-dim)" }}>{h}h</th>)}</tr></thead>
            <tbody>
              {DIAS.map((nome, dow) => (
                <tr key={nome}>
                  <td className="pr-2" style={{ color: "var(--text-dim)" }}>{nome}</td>
                  {horas.map((h) => {
                    const g = grade.get(`${dow}-${h}`);
                    const forca = g ? g.conversas / maxGrade : 0;
                    return <td key={h} title={`${nome} ${h}h: ${g?.conversas ?? 0} conversas, ${g?.agendaram ?? 0} agendaram, ${g?.posts ?? 0} posts`} className="h-6 w-7 text-center" style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(forca * 85)}%, transparent)`, color: forca > 0.5 ? "white" : "var(--text)" }}>{g?.posts ? g.posts : ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>

      <Painel icone={Layers} titulo="Etapa do funil por semana" resumo="Como ler: C0 e C1 atraem gente nova; C2 e C3 chamam para consulta. Semanas com mais C2/C3 deveriam ter mais conversas e agendamentos.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}><th className="py-1 pr-3">Semana</th><th className="pr-3 text-right">C0</th><th className="pr-3 text-right">C1</th><th className="pr-3 text-right">C2</th><th className="pr-3 text-right">C3</th><th className="pr-3 text-right">Conversas</th><th className="text-right">Agendaram</th></tr></thead>
            <tbody>
              {d.semanas.map((s) => (
                <tr key={s.semana} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3">{s.semana.slice(8, 10)}/{s.semana.slice(5, 7)}</td>
                  <td className="pr-3 text-right">{s.c0}</td><td className="pr-3 text-right">{s.c1}</td><td className="pr-3 text-right">{s.c2}</td><td className="pr-3 text-right">{s.c3}</td>
                  <td className="pr-3 text-right">{fmtN(s.conversas)}</td><td className="text-right">{fmtN(s.agendaram)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel icone={ShieldAlert} titulo="Objeções que os pacientes trazem" resumo="Viram pauta: cada objeção frequente é um post que responde antes da conversa.">
          {d.objecoes.length === 0 ? <p className="text-xs" style={{ color: "var(--text-dim)" }}>Nenhuma objeção lida ainda.</p> : (
            <ul className="grid gap-1.5 text-sm">{d.objecoes.map((o) => <li key={o.objecao} className="flex justify-between gap-2"><span>{OBJ[o.objecao] ?? o.objecao}</span><span className="tabular-nums">{fmtN(o.n)} <span className="text-xs" style={{ color: "var(--text-dim)" }}>({pct(o.agendaram, o.n)} agendaram)</span></span></li>)}</ul>
          )}
        </Painel>
        <Painel icone={Search} titulo="O que os pacientes mais pedem" resumo="Assunto da conversa nas palavras da IA, sem dado pessoal.">
          {d.assuntos.length === 0 ? <p className="text-xs" style={{ color: "var(--text-dim)" }}>Nenhum assunto lido ainda.</p> : (
            <ul className="grid gap-1.5 text-sm">{d.assuntos.map((a) => <li key={a.assunto} className="flex justify-between gap-2"><span className="truncate">{a.assunto}</span><span className="tabular-nums">{fmtN(a.n)}</span></li>)}</ul>
          )}
        </Painel>
      </div>
    </div>
  );
}
