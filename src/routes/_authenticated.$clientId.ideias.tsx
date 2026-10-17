import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Filter, Gauge, Layers, MessageSquareQuote, Newspaper, ShieldAlert, Target, Users } from "lucide-react";
import { getClientFontes, getComentariosPeriodo, getComentariosVozDoPaciente, getObjecoesWhatsapp, getPerguntasDeteccaoOriginal, getPostsForAnalytics } from "@/lib/client-data";
import { ETAPAS, montarRoteiros, type Etapa, type RoteiroAnuncio } from "@/lib/roteiros-anuncio";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import {
  buildIdeias,
  buildIdeiasRegraOriginal,
  faltasParaLimitacoes,
  ideiasDeIdentificacao,
  ideiaParaTexto,
  ideiasOriginaisSemRepetir,
  montarPlano7Dias,
  REGRA_ORIGINAL_ROTULO,
  ROTULO_OBJETIVO,
  type Ideia,
} from "@/lib/hub-conteudo";
import { analisarVozDoPaciente } from "@/lib/voz-do-paciente";
import { ROTULO_CONFIANCA } from "@/lib/insight";
import { limparTexto } from "@/lib/hub-relatorio";
import { padroesDoTop, topN } from "@/lib/top-conteudo";
import { horasDosPosts } from "@/lib/horarios";
import { Carregando, ErroCarga, SemFonte, SEM_INSTAGRAM } from "@/components/sem-fonte";
import { BotaoAcao, ListaLimitacoes, OQueE, SeloStatus } from "@/components/insight-card";
import { BotaoCopiar } from "@/components/botao-copiar";
import { AcoesDaIdeia, PlanejadorSemana, usePautas } from "@/components/planejador-conteudo";
import { useClientRole } from "@/hooks/use-client-role";

export const Route = createFileRoute("/_authenticated/$clientId/ideias")({
  component: IdeiasPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

const ORIGEM: Record<Ideia["regra"], string> = {
  identificacao: "Tema que gera identificação",
  pergunta: "Dúvida de pacientes",
  tema: "Tema que o público mais salva",
  formato: "Formato que mais alcança",
};

function Chip({ icone: Icon, children }: { icone: typeof Users; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium" style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--ink-2)" }}>
      <Icon size={11} aria-hidden /> {children}
    </span>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--ink-2)" }}>
      {children}
    </div>
  );
}

/** Etapa do funil de uma ideia de post: pelo campo funil (C1/C2/C3); sem etapa definida, topo (C1). */
function etapaDaIdeia(i: Ideia): Etapa {
  if (i.funil.startsWith("C3")) return "C3";
  if (i.funil.startsWith("C2")) return "C2";
  return "C1";
}

function Exemplos({ itens }: { itens?: string[] }) {
  if (!itens?.length) return null;
  return (
    <div className="text-sm">
      <Rotulo>Comentários reais (confira se a leitura faz sentido)</Rotulo>
      <ul className="mt-1 space-y-1">
        {itens.slice(0, 3).map((t, k) => (
          <li key={k} className="flex gap-1.5 rounded-md px-2 py-1.5 text-[13px] leading-snug" style={{ background: "var(--surface-2)", color: "var(--ink)" }}>
            <MessageSquareQuote size={14} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--muted)" }} />
            <span>“{t}”</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Roteiro de anúncio para gravar (C1/C2/C3), a partir de dores e objeções reais.
function RoteiroCard({ r }: { r: RoteiroAnuncio }) {
  const texto = [
    `${r.etapa} · ${r.titulo}`,
    `Objetivo da campanha: ${r.objetivoCampanha}`,
    `Gancho: ${r.gancho}`,
    `Roteiro:\n${r.roteiro.map((x, k) => `${k + 1}. ${x}`).join("\n")}`,
    `Texto do anúncio: ${r.copy}`,
    `CTA: ${r.cta}`,
    `Base: ${r.baseTexto} (${r.origem})`,
  ].join("\n");
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)", borderTop: `3px solid ${ETAPAS[r.etapa].cor}` }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${ETAPAS[r.etapa].cor} 16%, transparent)`, color: "var(--ink)" }}>
          <Clapperboard size={11} aria-hidden /> Anúncio {r.etapa}
        </span>
        <Chip icone={Target}>Campanha: {r.objetivoCampanha}</Chip>
        <Chip icone={Users}>{r.baseTexto}</Chip>
      </div>
      <div>
        <h3 className="text-base font-semibold leading-snug" style={{ color: "var(--ink)" }}>{r.titulo}</h3>
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>Vem de: {r.origem}</p>
      </div>
      <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}>
        <Rotulo>Gancho (primeiros 3 segundos)</Rotulo>
        <p className="mt-0.5 font-semibold leading-snug" style={{ color: "var(--ink)" }}>{r.gancho}</p>
      </div>
      <div className="text-sm">
        <Rotulo>O que gravar</Rotulo>
        <ol className="mt-1 list-decimal space-y-1 pl-5 leading-relaxed" style={{ color: "var(--ink)" }}>
          {r.roteiro.map((x, k) => (
            <li key={k}>{x}</li>
          ))}
        </ol>
      </div>
      <div className="text-sm">
        <Rotulo>Texto do anúncio</Rotulo>
        <p className="mt-0.5" style={{ color: "var(--ink)" }}>{r.copy}</p>
        <p className="mt-1 text-xs font-semibold" style={{ color: "var(--ink-2)" }}>Botão: {r.cta}</p>
      </div>
      <Exemplos itens={r.exemplos} />
      <p className="flex gap-1.5 text-xs" style={{ color: "var(--ink-2)" }}>
        <ShieldAlert size={14} aria-hidden className="shrink-0" style={{ color: "var(--warn)" }} /> {r.aviso}
      </p>
      <div className="mt-auto">
        <BotaoCopiar texto={texto} rotulo="Copiar roteiro do anúncio" variante="primario" />
      </div>
    </article>
  );
}

function IdeiaCard({ i, clientId, planner }: { i: Ideia; clientId: string; planner?: { api: ReturnType<typeof usePautas>; podeEditar: boolean } }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)", borderTop: `3px solid ${ETAPAS[etapaDaIdeia(i)].cor}` }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <SeloStatus tom={i.regra === "pergunta" ? "atencao" : "bom"} texto={i.regraOriginal ? `Regra original · ${REGRA_ORIGINAL_ROTULO[i.regra]}` : ORIGEM[i.regra]} />
        <Chip icone={Target}>{ROTULO_OBJETIVO[i.objetivo]}</Chip>
        <Chip icone={Gauge}>{ROTULO_CONFIANCA[i.confianca]}</Chip>
        <Chip icone={Filter}>Funil: {i.funil}</Chip>
        <Chip icone={Layers}>Estágio: {i.estagio}</Chip>
      </div>
      <div>
        <h3 className="text-base font-semibold leading-snug" style={{ color: "var(--ink)" }}>
          {i.titulo}
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
          Formato recomendado: <b>{i.formato}</b>
        </p>
      </div>

      {i.regraOriginal && (
        <div className="text-sm">
          <Rotulo>O que fazer</Rotulo>
          <p className="mt-0.5">{i.acao}</p>
        </div>
      )}

      {i.gancho && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "var(--accent-soft)" }}>
          <Rotulo>Gancho pronto</Rotulo>
          <p className="mt-0.5 font-medium italic leading-snug">{i.gancho}</p>
          <div className="mt-2">
            <BotaoCopiar texto={i.gancho} rotulo="Copiar gancho" />
          </div>
        </div>
      )}

      <Exemplos itens={i.exemplos} />

      {i.roteiro.length > 0 && (
        <div className="text-sm">
          <Rotulo>Roteiro curto</Rotulo>
          <ol className="mt-1 list-decimal space-y-1 pl-5 leading-relaxed" style={{ color: "var(--text)" }}>
            {i.roteiro.map((r, k) => (
              <li key={k}>{r}</li>
            ))}
          </ol>
        </div>
      )}

      {i.cta && (
        <div className="text-sm">
          <Rotulo>Chamada no final (CTA)</Rotulo>
          <p className="mt-0.5">{i.cta}</p>
        </div>
      )}

      <div className="text-sm">
        <Rotulo>Por que vale testar</Rotulo>
        <p className="mt-0.5" style={{ color: "var(--text-dim)" }}>
          {i.porQueTestar}
        </p>
      </div>

      <details className="text-xs" style={{ color: "var(--text-dim)" }}>
        <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center font-medium" style={{ color: "var(--text-faint)" }}>
          Ver a evidência, a confiança e o que fazer
        </summary>
        <p className="leading-relaxed tabular-nums">{i.evidencia}</p>
        <p className="mt-1">Confiança: {i.motivoConfianca}.</p>
        <p className="mt-1">
          Funil: {i.funil} · Estágio: {i.estagio} · Formato: {i.formato}
        </p>
        {!i.regraOriginal && <p className="mt-1">O que fazer: {i.acao}</p>}
        {i.porque && i.porque !== i.evidencia && <p className="mt-1">Por quê: {i.porque}</p>}
      </details>

      {i.avisoSeguranca && (
        <div className="flex gap-2 rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: "var(--warn-border)", background: "var(--warn-bg)" }}>
          <ShieldAlert size={14} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} aria-hidden />
          <span>
            <b>Segurança médica: </b>
            {i.avisoSeguranca}
          </span>
        </div>
      )}

      {planner && <AcoesDaIdeia ideia={i} clientId={clientId} api={planner.api} podeEditar={planner.podeEditar} />}

      <div className="mt-auto flex flex-wrap gap-2">
        <BotaoCopiar texto={ideiaParaTexto(i)} rotulo="Copiar ideia completa" variante="primario" />
        {i.regra === "pergunta" && i.pessoas ? (
          <BotaoAcao
            texto={i.regraOriginal ? `Ver os ${i.pessoas} comentários em Dúvidas` : `Ver as ${i.pessoas} pessoas que perguntaram`}
            rota="/$clientId/duvidas"
            clientId={clientId}
            variante="secundario"
          />
        ) : null}
      </div>
    </article>
  );
}

// Plano da semana montado só com as ideias da lista, para copiar e colar na agenda da equipe.
function PlanoDaSemana({ ideias, originais, hora }: { ideias: Ideia[]; originais: Ideia[]; hora: number | null }) {
  const [comOriginais, setComOriginais] = useState(ideias.length === 0);
  // As ideias da regra original entram depois das novas (a ordem das novas não muda).
  const texto = useMemo(() => {
    if (!comOriginais) return limparTexto(montarPlano7Dias(ideias, hora));
    const pergFirst = (xs: Ideia[]) => [...xs].sort((a, b) => Number(b.regra === "pergunta") - Number(a.regra === "pergunta"));
    return limparTexto(montarPlano7Dias([...pergFirst(ideias), ...pergFirst(originais)], hora, { manterOrdem: true }));
  }, [comOriginais, ideias, originais, hora]);
  if (!texto) return null;
  return (
    <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Plano de 7 dias</h2>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Monta a semana com as ideias acima. Dúvidas de pacientes entram primeiro.
          </p>
        </div>
        <BotaoCopiar texto={texto} rotulo="Copiar plano da semana" />
      </div>
      {originais.length > 0 && (
        <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
          <input type="checkbox" checked={comOriginais} onChange={(e) => setComOriginais(e.target.checked)} />
          Incluir as {originais.length} ideia(s) da regra original no plano
        </label>
      )}
      <pre className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed" style={{ font: "inherit" }}>
        {texto}
      </pre>
    </section>
  );
}

type Cruzamento = ReturnType<typeof buildIdeiasRegraOriginal> & ReturnType<typeof ideiasOriginaisSemRepetir>;

// Ideias geradas pelas regras originais (477eb43), sem repetir as da regra nova.
function IdeiasRegraOriginal({ orig, carregando, erro, clientId, planner }: { orig: Cruzamento | null; carregando: boolean; erro: boolean; clientId: string; planner?: { api: ReturnType<typeof usePautas>; podeEditar: boolean } }) {
  if (carregando) return <Carregando texto="Calculando as ideias da regra original…" />;
  if (erro) return <ErroCarga texto="Não consegui ler as perguntas para a regra original. Atualize a página." />;
  if (!orig) return null;
  return (
    <section className="space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div>
        <h2 className="text-sm font-semibold">Ideias pela regra original ({orig.extras.length})</h2>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          As regras de antes continuam valendo. Aqui só entra o que a regra nova não trouxe: {orig.ideias.length} ideia(s) pela regra original,{" "}
          {orig.repetidas.length} já estão na lista acima (mesmos comentários, mesmo tema ou mesmo formato).
        </p>
      </div>
      {orig.extras.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {orig.extras.map((i) => (
            <IdeiaCard key={i.id} i={i} clientId={clientId} planner={planner} />
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Nenhuma ideia a mais: tudo o que a regra original encontrou já está na lista acima.
        </p>
      )}
      {(orig.repetidas.length > 0 || orig.diferencas.length > 0 || orig.faltas.length > 0) && (
        <details className="text-xs" style={{ color: "var(--text-dim)" }}>
          <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center font-medium" style={{ color: "var(--text-faint)" }}>
            Ver o que a regra original encontrou e o que faltou
          </summary>
          {orig.repetidas.length > 0 && (
            <>
              <p className="mt-1 font-semibold" style={{ color: "var(--text)" }}>
                Já na lista acima
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {orig.repetidas.map(({ original, nova }) => (
                  <li key={original.id}>
                    {REGRA_ORIGINAL_ROTULO[original.regra]}: "{original.titulo}" ({original.formato}; funil {original.funil}; estágio {original.estagio}) = "{nova.titulo}"
                  </li>
                ))}
              </ul>
            </>
          )}
          {orig.diferencas.length > 0 && (
            <>
              <p className="mt-2 font-semibold" style={{ color: "var(--text)" }}>
                Mesma ideia, detalhe diferente
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {orig.diferencas.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          )}
          {orig.faltas.length > 0 && (
            <>
              <p className="mt-2 font-semibold" style={{ color: "var(--text)" }}>
                Regras sem ideia neste período (regra original)
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {orig.faltas.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
    </section>
  );
}

function IdeiasPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const fontes = useQuery({ queryKey: ["fontes", clientId], queryFn: () => getClientFontes(clientId) });
  const pautasApi = usePautas(clientId);
  const { podeEditar } = useClientRole(clientId);
  const planner = { api: pautasApi, podeEditar };
  const temIg = fontes.data?.tem_instagram === true;
  const posts = useQuery({
    queryKey: ["ideias-posts", clientId, start, end],
    queryFn: () => getPostsForAnalytics(clientId, start, end + "T23:59:59"),
    enabled: temIg,
  });
  const comentarios = useQuery({
    queryKey: ["voz-do-paciente", clientId, start, end],
    queryFn: () => getComentariosVozDoPaciente(clientId, start, end),
    enabled: temIg,
  });

  // Todos os comentários do período (com o tema do post): elogios e relatos viram "Tema que gera identificação".
  const todosComentarios = useQuery({
    queryKey: ["comentarios-periodo", clientId, start, end],
    queryFn: () => getComentariosPeriodo(clientId, start, end),
    enabled: temIg,
    staleTime: 5 * 60_000,
  });
  // Objeções das conversas de WhatsApp (auditoria por IA), para os anúncios C3.
  const objecoes = useQuery({
    queryKey: ["objecoes-whatsapp", clientId, start, end],
    queryFn: () => getObjecoesWhatsapp(clientId, start, end),
    enabled: fontes.data?.tem_atendimento === true,
    staleTime: 10 * 60_000,
    retry: false,
  });

  // Regra original (477eb43): perguntas pela detecção original (is_question + filtro original).
  const perguntasOriginais = useQuery({
    queryKey: ["perguntas-deteccao-original", clientId, start, end],
    queryFn: () => getPerguntasDeteccaoOriginal(clientId, { start, end }),
    enabled: temIg,
  });

  const res = useMemo(() => {
    if (!posts.data || !comentarios.data) return null;
    const voz = analisarVozDoPaciente(comentarios.data.comentarios, { donos: comentarios.data.donos });
    const base = buildIdeias(posts.data, comentarios.data.comentarios, { voz });
    const ident = ideiasDeIdentificacao(todosComentarios.data ?? []);
    return { ...base, ideias: [...base.ideias, ...ident.ideias], faltas: [...base.faltas, ...(todosComentarios.data ? ident.faltas : [])], limitacoesVoz: voz.limitacoes, voz };
  }, [posts.data, comentarios.data, todosComentarios.data]);

  // Anúncios para gravar, por etapa (C1/C2/C3), das dores e objeções reais.
  const roteiros = useMemo(() => {
    if (!res) return [];
    return montarRoteiros({
      grupos: res.voz.grupos.map((g) => ({ id: g.id, rotulo: g.rotulo, termo: g.termo, intencao: g.intencao, pessoas: g.pessoas, exemplos: g.exemplos, cuidadoMedico: g.cuidadoMedico })),
      identificacao: res.ideias.filter((i) => i.regra === "identificacao").map((i) => ({ tema: i.tema, pessoas: i.pessoas ?? 0, exemplos: i.exemplos ?? [] })),
      objecoesWhatsapp: objecoes.data ?? null,
    });
  }, [res, objecoes.data]);

  // Ideias da regra original que a regra nova não trouxe (sem repetir; repetidas e diferenças ficam listadas).
  const orig = useMemo(() => {
    if (!res || !posts.data || !perguntasOriginais.data) return null;
    const r = buildIdeiasRegraOriginal(posts.data, perguntasOriginais.data.perguntas);
    return { ...r, ...ideiasOriginaisSemRepetir(res.ideias, r.ideias, res.voz) };
  }, [res, posts.data, perguntasOriginais.data]);

  // O que o melhor conteúdo do período tem em comum, e a hora em que os posts renderam mais (para o plano da semana).
  const melhores = useMemo(() => {
    const todos = posts.data ?? [];
    const top = topN(todos, "post", "saved", 20).concat(topN(todos, "reel", "saved", 20)).sort((x, y) => y.v - x.v).slice(0, 20);
    return padroesDoTop(top.map((x) => x.p), todos);
  }, [posts.data]);
  const horaSugerida = useMemo(() => horasDosPosts(posts.data ?? [])[0]?.hora ?? null, [posts.data]);

  const head = (
    <div className="hpagehead">
      <h2>
        Ideias{res && res.ideias.length > 0 ? ` (${res.ideias.length})` : ""}
        {orig && orig.extras.length > 0 ? ` + ${orig.extras.length} da regra original` : ""}
      </h2>
      <p>Ideias de post com gancho e roteiro prontos, tiradas só de dúvidas reais repetidas e do que já funcionou no perfil. Transforme em pauta, gere o roteiro e monte a semana no planejador abaixo. Período: {periodLabel}.</p>
    </div>
  );

  if (fontes.isLoading) return <div>{head}<Carregando /></div>;
  if (fontes.error) return <div>{head}<ErroCarga texto="Não consegui verificar as fontes deste cliente. Atualize a página." /></div>;
  if (!temIg) return <div>{head}<SemFonte {...SEM_INSTAGRAM} /></div>;
  if (posts.isLoading || comentarios.isLoading) return <div>{head}<Carregando texto="Calculando ideias…" /></div>;
  if (posts.error || comentarios.error || !res) return <div>{head}<ErroCarga texto="Falha ao ler posts e comentários do período." /></div>;

  const limitacoes = [...faltasParaLimitacoes(res.faltas), ...res.limitacoesVoz];

  return (
    <div className="space-y-4">
      {head}
      {melhores.frases.length > 0 && (
        <section className="rounded-xl border p-4" style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold">O que o seu melhor conteúdo tem em comum</h2>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Os 20 posts e Reels que mais foram salvos no período, comparados com todos os outros. Padrão para testar, não regra.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
            {melhores.frases.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-dim)" }}>
        <span>{res.totalPosts} posts no período</span>
        <span>
          {res.totalPerguntas} perguntas reais de pacientes (de {res.totalComentarios} comentários lidos)
        </span>
        {res.pedidosDeCuidado > 0 && <span>{res.pedidosDeCuidado} pedidos de dose ou remédio ficaram fora das ideias</span>}
        {perguntasOriginais.data && <span>{perguntasOriginais.data.perguntas.length} perguntas de pacientes pela detecção original</span>}
      </p>

      {/* Atalhos por etapa do funil, com quantas ideias e anúncios há em cada uma. */}
      <nav className="flex flex-wrap gap-2" aria-label="Etapas do funil">
        {(["C1", "C2", "C3"] as Etapa[]).map((e) => {
          const nPosts = res.ideias.filter((i) => etapaDaIdeia(i) === e).length;
          const nAds = roteiros.filter((r) => r.etapa === e).length;
          return (
            <a key={e} href={`#etapa-${e}`} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-3 text-sm font-semibold" style={{ borderColor: ETAPAS[e].cor, color: "var(--ink)", background: `color-mix(in srgb, ${ETAPAS[e].cor} 10%, var(--surface))` }}>
              {ETAPAS[e].nome}
              <span className="text-xs font-normal" style={{ color: "var(--ink-2)" }}>{nPosts} post{nPosts === 1 ? "" : "s"} · {nAds} anúncio{nAds === 1 ? "" : "s"}</span>
            </a>
          );
        })}
      </nav>

      {res.ideias.length === 0 && roteiros.length === 0 ? (
        <div className="hempty">
          <h2>Nenhuma ideia com base suficiente neste período</h2>
          <p>O Nexo não inventa ideia sem dado. Veja abaixo o que falta.</p>
        </div>
      ) : (
        (["C1", "C2", "C3"] as Etapa[]).map((e) => {
          const ideiasEtapa = res.ideias.filter((i) => etapaDaIdeia(i) === e);
          const adsEtapa = roteiros.filter((r) => r.etapa === e);
          return (
            <section key={e} id={`etapa-${e}`} className="scroll-mt-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-4 pl-3" style={{ borderColor: ETAPAS[e].cor }}>
                <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>{ETAPAS[e].nome}</h2>
                <span className="text-sm" style={{ color: "var(--ink-2)" }}>{ETAPAS[e].papel} · anúncio com objetivo de {ETAPAS[e].objetivoCampanha.toLowerCase()}</span>
              </div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--ink-2)" }}>
                <Newspaper size={15} aria-hidden /> Posts para publicar
              </h3>
              {ideiasEtapa.length ? (
                <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {ideiasEtapa.map((i) => (
                    <IdeiaCard key={i.id} i={i} clientId={clientId} planner={planner} />
                  ))}
                </div>
              ) : (
                <p className="mb-5 text-sm" style={{ color: "var(--ink-2)" }}>Nenhuma ideia de post com base suficiente nesta etapa no período.</p>
              )}
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--ink-2)" }}>
                <Clapperboard size={15} aria-hidden /> Anúncios para gravar
              </h3>
              {adsEtapa.length ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {adsEtapa.map((r) => (
                    <RoteiroCard key={r.id} r={r} />
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                  {e === "C1"
                    ? "Sem tema com relatos ou elogios de 3 pessoas diferentes ainda (precisa de posts com tema classificado)."
                    : e === "C2"
                      ? "Sem dúvida de saúde repetida por 2 pessoas ou mais no período."
                      : "Sem objeção repetida nos comentários nem nas conversas de WhatsApp lidas no período."}
                </p>
              )}
            </section>
          );
        })
      )}

      <IdeiasRegraOriginal orig={orig} carregando={perguntasOriginais.isLoading} erro={!!perguntasOriginais.error} clientId={clientId} planner={planner} />

      <PlanejadorSemana clientId={clientId} api={pautasApi} podeEditar={podeEditar} />

      {(res.ideias.length > 0 || (orig?.extras.length ?? 0) > 0) && <PlanoDaSemana ideias={res.ideias} originais={orig?.extras ?? []} hora={horaSugerida} />}

      <ListaLimitacoes itens={limitacoes} titulo="O que ainda limita as ideias" />

      <section className="rounded-xl border p-4 text-xs" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          De onde vêm as ideias
        </h2>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Dúvida de pacientes: só comentários classificados como pergunta (elogio, relato pessoal e marcação de amigo não entram), quando 2 ou mais pessoas diferentes perguntaram sobre o mesmo assunto. O gancho nunca copia o comentário.</li>
          <li>Tema que gera identificação: elogios e relatos pessoais de 3 ou mais pessoas diferentes nos posts do mesmo tema.</li>
          <li>Anúncios para gravar: C1 dos temas que geram identificação; C2 das dúvidas de saúde e comparações; C3 das objeções (preço, convênio, medo, "não é para mim", adiar, agenda) nos comentários e nas conversas de WhatsApp lidas pela IA. C3 é para campanha de mensagens.</li>
          <li>Tema que o público mais salva: tema com 8+ posts em que o post típico foi salvo pelo menos 25% mais que o post típico da conta.</li>
          <li>Formato que mais alcança: formato com 8+ posts em que o post típico chegou a mais pessoas que o post típico da conta. Com menos de 8 posts, o dado não vira conclusão.</li>
          <li>
            Regra original: as mesmas três regras como eram antes. A pergunta repetida usa todos os comentários marcados como pergunta (sem a triagem nova), agrupa por
            palavras em comum e conta comentários; o título é o próprio comentário e o formato vem do tipo da dúvida (preço, agendar, uso, sintoma, resultado, geral).
            Só aparece o que a regra nova não trouxe.
          </li>
        </ul>
        <OQueE>
          "Post típico" é o do meio: colocando os posts em ordem, é o que fica no centro. Ele não é puxado por um único post que viralizou. Temas e formatos só entram com 8 ou
          mais posts no período.
        </OQueE>
      </section>
    </div>
  );
}
