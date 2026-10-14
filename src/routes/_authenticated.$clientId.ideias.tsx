import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Filter, Gauge, Layers, ShieldAlert, Target, Users } from "lucide-react";
import { getClientFontes, getComentariosVozDoPaciente, getPerguntasDeteccaoOriginal, getPostsForAnalytics } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import {
  buildIdeias,
  buildIdeiasRegraOriginal,
  faltasParaLimitacoes,
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
  pergunta: "Dúvida de pacientes",
  tema: "Tema que o público mais salva",
  formato: "Formato que mais alcança",
};

function Chip({ icone: Icon, children }: { icone: typeof Users; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
      <Icon size={11} aria-hidden /> {children}
    </span>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
      {children}
    </div>
  );
}

function IdeiaCard({ i, clientId, planner }: { i: Ideia; clientId: string; planner?: { api: ReturnType<typeof usePautas>; podeEditar: boolean } }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <SeloStatus tom={i.regra === "pergunta" ? "atencao" : "bom"} texto={i.regraOriginal ? `Regra original · ${REGRA_ORIGINAL_ROTULO[i.regra]}` : ORIGEM[i.regra]} />
        <Chip icone={Target}>{ROTULO_OBJETIVO[i.objetivo]}</Chip>
        <Chip icone={Gauge}>{ROTULO_CONFIANCA[i.confianca]}</Chip>
        <Chip icone={Filter}>Funil: {i.funil}</Chip>
        <Chip icone={Layers}>Estágio: {i.estagio}</Chip>
      </div>
      <div>
        <h3 className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
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
          <Rotulo>{i.regraOriginal ? "Gancho possível" : "Gancho pronto"}</Rotulo>
          <p className="mt-0.5 font-medium italic leading-snug">{i.gancho}</p>
          <div className="mt-2">
            <BotaoCopiar texto={i.gancho} rotulo="Copiar gancho" />
          </div>
        </div>
      )}

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

  // Regra original (477eb43): perguntas pela detecção original (is_question + filtro original).
  const perguntasOriginais = useQuery({
    queryKey: ["perguntas-deteccao-original", clientId, start, end],
    queryFn: () => getPerguntasDeteccaoOriginal(clientId, { start, end }),
    enabled: temIg,
  });

  const res = useMemo(() => {
    if (!posts.data || !comentarios.data) return null;
    const voz = analisarVozDoPaciente(comentarios.data.comentarios, { donos: comentarios.data.donos });
    return { ...buildIdeias(posts.data, comentarios.data.comentarios, { voz }), limitacoesVoz: voz.limitacoes, voz };
  }, [posts.data, comentarios.data]);

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

      {res.ideias.length === 0 ? (
        <div className="hempty">
          <h2>Nenhuma ideia com base suficiente neste período</h2>
          <p>O Hub não inventa ideia sem dado. Veja abaixo o que falta.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {res.ideias.map((i) => (
              <IdeiaCard key={i.id} i={i} clientId={clientId} planner={planner} />
            ))}
          </div>
        </>
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
          <li>Dúvida de pacientes: só quando 2 ou mais pessoas diferentes perguntaram sobre o mesmo assunto, depois de tirar spam, piada, desabafo e respostas de profissionais.</li>
          <li>Tema que o público mais salva: tema com 2+ posts em que o post típico foi salvo pelo menos 25% mais que o post típico da conta.</li>
          <li>Formato que mais alcança: formato com 3+ posts em que o post típico chegou a mais pessoas.</li>
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
