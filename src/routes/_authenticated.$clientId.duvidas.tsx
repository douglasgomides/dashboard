import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, MessageCircle, ShieldAlert, Users, Megaphone, Briefcase, ExternalLink } from "lucide-react";
import { getComentariosVozDoPaciente, getPerguntasDeteccaoOriginal } from "@/lib/client-data";
import { computeDuvidasFrequentes } from "@/lib/report-metrics";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import {
  analisarVozDoPaciente,
  anonimizarTexto,
  grupoParaTexto,
  insightsDaVoz,
  ROTULO_INTENCAO,
  ROTULO_MOTIVO,
  type GrupoDuvida,
  type MotivoExclusao,
  type Nivel,
  type ResultadoVoz,
} from "@/lib/voz-do-paciente";
import type { Limitacao } from "@/lib/insight";
import { InsightCard, ListaLimitacoes, OQueE, SeloStatus } from "@/components/insight-card";
import { BotaoCopiar } from "@/components/botao-copiar";
import { SyncButton } from "@/components/sync-button";
import { Carregando, ErroCarga } from "@/components/sem-fonte";

export const Route = createFileRoute("/_authenticated/$clientId/duvidas")({
  component: DuvidasPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

type Linha = Awaited<ReturnType<typeof getComentariosVozDoPaciente>>["comentarios"][number];

const ROTULO_NIVEL: Record<Nivel, string> = { alta: "alto", media: "médio", baixa: "baixo" };

function Chip({ children, forte = false }: { children: React.ReactNode; forte?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={forte ? { background: "var(--warn-bg)", color: "var(--text)" } : { background: "var(--surface-2)", color: "var(--text-dim)" }}
    >
      {children}
    </span>
  );
}

function Bloco({ titulo, icone: Icon, children, fundo = "var(--surface-2)" }: { titulo: string; icone: typeof Users; children: React.ReactNode; fundo?: string }) {
  return (
    <div className="rounded-lg p-3 text-sm" style={{ background: fundo }}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        <Icon size={12} aria-hidden /> {titulo}
      </div>
      <div className="mt-1 leading-relaxed" style={{ color: "var(--text)" }}>
        {children}
      </div>
    </div>
  );
}

function GrupoCard({ g }: { g: GrupoDuvida<Linha> }) {
  const [aberto, setAberto] = useState(false);
  const comercial = g.intencao === "preco" || g.intencao === "agendamento";
  return (
    <article
      className="rounded-xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)", borderLeft: `4px solid ${g.cuidadoMedico ? "var(--danger-border)" : comercial ? "var(--warn-border)" : "var(--good-border)"}` }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {g.cuidadoMedico ? <SeloStatus tom="ruim" texto="Cuidado médico" /> : comercial ? <SeloStatus tom="atencao" texto="Responder hoje" /> : <SeloStatus tom="bom" texto="Vira conteúdo" />}
        <Chip>
          <Users size={11} aria-hidden /> {g.pessoas} {g.pessoas === 1 ? "pessoa" : "pessoas"}
        </Chip>
        <Chip>{ROTULO_INTENCAO[g.intencao]}</Chip>
        {!g.cuidadoMedico && <Chip>Potencial de conteúdo {ROTULO_NIVEL[g.potencialConteudo]}</Chip>}
        {g.urgenciaComercial === "alta" && <Chip forte>Chance de virar consulta</Chip>}
      </div>
      <h3 className="mt-2 text-[15px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
        {g.rotulo}
      </h3>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
        {g.resumo}
      </p>

      <ul className="mt-3 space-y-1.5">
        {g.exemplos.map((e, k) => (
          <li key={k} className="rounded-lg border-l-2 py-1 pl-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            "{e.texto}"
            <span className="ml-1 text-xs" style={{ color: "var(--text-faint)" }}>
              {e.autor}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid gap-2">
        <Bloco titulo={g.cuidadoMedico ? "Resposta de segurança para o comentário" : "Resposta para o comentário"} icone={MessageCircle} fundo="var(--accent-soft)">
          <p>{g.sugestaoResposta}</p>
          <div className="mt-2">
            <BotaoCopiar texto={g.sugestaoResposta} rotulo="Copiar resposta" variante="primario" />
          </div>
        </Bloco>
        {g.abordagemComercial && (
          <Bloco titulo="Abordagem comercial (no direct)" icone={Briefcase}>
            {g.abordagemComercial}
          </Bloco>
        )}
        {g.sugestaoPost && (
          <Bloco titulo={`Sugestão de post · ${g.sugestaoPost.formato}`} icone={Megaphone}>
            <p className="font-medium">{g.sugestaoPost.titulo}</p>
            <p className="mt-1" style={{ color: "var(--text-dim)" }}>
              Gancho: <i>{g.sugestaoPost.gancho}</i>
            </p>
            <div className="mt-2">
              <BotaoCopiar texto={grupoParaTexto(g)} rotulo="Copiar pauta completa" />
            </div>
          </Bloco>
        )}
        {g.avisoCfm && (
          <div className="flex gap-2 rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: "var(--warn-border)", background: "var(--warn-bg)", color: "var(--text)" }}>
            <ShieldAlert size={14} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} aria-hidden />
            <span>
              <b>Atenção (CFM): </b>
              {g.avisoCfm}
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium"
        style={{ color: "var(--accent)" }}
      >
        <ChevronDown size={15} style={{ transform: aberto ? "rotate(180deg)" : undefined }} aria-hidden />
        {aberto ? "Esconder" : `Ver ${g.comentarios === 1 ? "o comentário" : `os ${g.comentarios} comentários`}`}
      </button>
      {aberto && (
        <ul className="mt-1 space-y-2">
          {g.itens.map((i) => {
            const post = i.comentario.instagram_posts;
            return (
              <li key={i.comentario.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <p style={{ color: "var(--text)" }}>{anonimizarTexto(i.textoLimpo)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--text-faint)" }}>
                  {i.comentario.commented_at && <span>{new Date(i.comentario.commented_at).toLocaleDateString("pt-BR")}</span>}
                  {post?.tema && <span>· {post.tema}</span>}
                  {post?.permalink && (
                    <a href={post.permalink} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-1" style={{ color: "var(--accent)" }}>
                      Abrir o post para responder <ExternalLink size={12} aria-hidden />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

function ForaDaLista({ excluidos, busca = "" }: { excluidos: { comentario: Linha; motivo: MotivoExclusao }[]; busca?: string }) {
  const porMotivo = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const m = new Map<MotivoExclusao, Linha[]>();
    for (const e of excluidos) {
      if (t && !e.comentario.text.toLowerCase().includes(t)) continue;
      (m.get(e.motivo) ?? m.set(e.motivo, []).get(e.motivo)!).push(e.comentario);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [excluidos, busca]);
  if (excluidos.length === 0) return null;
  const mostrados = porMotivo.reduce((a, [, rows]) => a + rows.length, 0);
  return (
    <details className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <ChevronDown size={16} aria-hidden /> Por que {excluidos.length} comentários ficaram de fora
        {busca.trim() ? ` (${mostrados} com "${busca.trim()}")` : ""}
      </summary>
      <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
        Nem todo comentário com "?" é dúvida de paciente. Estes saíram antes de agrupar, cada um por um motivo. Se algum deveria ter ficado, avise a equipe Doctor Creator.
      </p>
      <ul className="mt-3 space-y-3">
        {porMotivo.map(([motivo, rows]) => (
          <li key={motivo} className="rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)" }}>
            <p className="font-semibold" style={{ color: "var(--text)" }}>
              {ROTULO_MOTIVO[motivo].titulo}: {rows.length}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
              {ROTULO_MOTIVO[motivo].explicacao}
            </p>
            <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--text-dim)" }}>
              {rows.slice(0, 4).map((r) => (
                <li key={r.id}>"{anonimizarTexto(r.text).slice(0, 140)}"</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------------------------
// Camada 3: "Todas as perguntas detectadas" pela DETECÇÃO ORIGINAL (477eb43), sem a triagem nova.
// Mesma regra, mesma contagem e os mesmos elementos da tela de antes: dúvidas mais repetidas
// (Jaccard ≥ 0,4, conta comentários), lista plana com miniatura, @ completo, data, tema e "ver post ↗",
// busca no texto de todas as perguntas e filtro por tema do post. Cada pergunta diz também o que a
// triagem nova fez com ela, para nada sumir em silêncio.
// ---------------------------------------------------------------------------------------------

type PerguntaOriginal = Awaited<ReturnType<typeof getPerguntasDeteccaoOriginal>>["perguntas"][number];
type StatusTriagem = { tom: "bom" | "atencao" | "neutro"; texto: string };

function statusNaTriagemNova(voz: ResultadoVoz<Linha> | null) {
  const mapa = new Map<string, StatusTriagem>();
  if (!voz) return mapa;
  for (const m of voz.mantidos) mapa.set(m.comentario.id, { tom: "bom", texto: "Também na triagem nova" });
  for (const e of voz.excluidos) mapa.set(e.comentario.id, { tom: "atencao", texto: `Triagem nova tirou: ${ROTULO_MOTIVO[e.motivo].titulo}` });
  return mapa;
}

function SeloTriagem({ s }: { s?: StatusTriagem }) {
  const st = s ?? { tom: "neutro" as const, texto: "Fora da leitura da triagem nova (outro período ou limite)" };
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={
        st.tom === "bom"
          ? { background: "var(--good-bg)", color: "var(--text)" }
          : st.tom === "atencao"
            ? { background: "var(--warn-bg)", color: "var(--text)" }
            : { background: "var(--surface-2)", color: "var(--text-dim)" }
      }
    >
      {st.texto}
    </span>
  );
}

function QuestionCard({ q, status }: { q: PerguntaOriginal; status?: StatusTriagem }) {
  const post = q.instagram_posts;
  return (
    <div className="flex gap-3 rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      {post?.thumbnail_url && <img src={post.thumbnail_url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />}
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm">{q.text}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-faint)" }}>
          {q.author_username && <span>@{q.author_username}</span>}
          {q.commented_at && (
            <>
              <span>·</span>
              <span>{new Date(q.commented_at).toLocaleDateString("pt-BR")}</span>
            </>
          )}
          {post?.tema && (
            <>
              <span>·</span>
              <span>{post.tema}</span>
            </>
          )}
          {post?.permalink && (
            <>
              <span>·</span>
              <a href={post.permalink} target="_blank" rel="noreferrer" className="inline-block py-1.5" style={{ color: "var(--accent)" }}>
                ver post ↗
              </a>
            </>
          )}
        </div>
        <div className="mt-1">
          <SeloTriagem s={status} />
        </div>
      </div>
    </div>
  );
}

// "Dúvidas mais repetidas" da regra original: agrupamento por palavras-chave em comum (sem IA),
// o número "N×" conta comentários e o texto é o comentário mais curtido do grupo.
function DuvidasFrequentesOriginais({ questions, status }: { questions: PerguntaOriginal[]; status: Map<string, StatusTriagem> }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const clusters = useMemo(() => computeDuvidasFrequentes(questions, { threshold: 0.4, minSize: 2 }), [questions]);
  if (clusters.length === 0) return null;
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h3 className="mb-1 text-sm font-semibold">Dúvidas mais repetidas (detecção original, {clusters.length})</h3>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        Perguntas com o mesmo assunto agrupadas por palavras-chave em comum (sem IA). Aqui o número conta comentários, não pessoas: a mesma pessoa perguntando 2 vezes
        conta 2. Quanto mais gente pergunta a mesma coisa, maior a chance de virar um post que resolve de vez.
      </p>
      <div className="space-y-2">
        {clusters.map((c, i) => (
          <div key={i} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words">{c.representative.text}</p>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                {c.count}×
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpenIdx((v) => (v === i ? null : i))}
              aria-expanded={openIdx === i}
              className="mt-1 inline-flex min-h-[44px] items-center text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              {openIdx === i ? "Ocultar" : "Ver"} os {c.count} comentários
            </button>
            {openIdx === i && (
              <div className="mt-2 space-y-2">
                {c.items.map((item) => (
                  <QuestionCard key={item.id} q={item} status={status.get(item.id)} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TodasAsPerguntas({
  periodLabel,
  voz,
  aberto,
  setAberto,
  semPeriodo,
  setSemPeriodo,
  dados,
}: {
  periodLabel: string;
  voz: ResultadoVoz<Linha> | null;
  aberto: boolean;
  setAberto: (v: boolean) => void;
  semPeriodo: boolean;
  setSemPeriodo: (v: boolean) => void;
  dados: { isLoading: boolean; error: unknown; data?: Awaited<ReturnType<typeof getPerguntasDeteccaoOriginal>> };
}) {
  const [busca, setBusca] = useState("");
  const [temaFilter, setTemaFilter] = useState("");
  const rows = dados.data?.perguntas ?? [];
  const status = useMemo(() => statusNaTriagemNova(voz), [voz]);

  const temas = useMemo(() => {
    const set = new Set<string>();
    for (const q of rows) if (q.instagram_posts?.tema) set.add(q.instagram_posts.tema);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows.filter((q) => !term || q.text.toLowerCase().includes(term)).filter((q) => !temaFilter || q.instagram_posts?.tema === temaFilter);
  }, [rows, busca, temaFilter]);

  const cruzamento = useMemo(() => {
    let na = 0;
    let tirou = 0;
    let fora = 0;
    for (const q of rows) {
      const s = status.get(q.id);
      if (!s) fora++;
      else if (s.tom === "bom") na++;
      else tirou++;
    }
    return { na, tirou, fora };
  }, [rows, status]);

  const botao = (ativo: boolean) => ({
    borderColor: ativo ? "var(--accent)" : "var(--border)",
    background: ativo ? "var(--accent-soft)" : "var(--surface-2)",
    color: ativo ? "var(--accent)" : "var(--text)",
  });

  return (
    <details
      id="todas-as-perguntas"
      open={aberto}
      onToggle={(e) => setAberto((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none flex-wrap items-center gap-2 text-sm font-semibold">
        <ChevronDown size={16} aria-hidden style={{ transform: aberto ? "rotate(180deg)" : undefined }} />
        Todas as perguntas detectadas{dados.data ? ` (${rows.length})` : ""}
        <span className="text-xs font-normal" style={{ color: "var(--text-dim)" }}>
          Detecção original: todos os comentários marcados como pergunta
        </span>
      </summary>

      <div className="mt-3 space-y-3">
        <div className="rounded-xl border p-4 text-sm" style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}>
          Dúvidas reais que pacientes deixaram nos comentários — matéria-prima pra pauta, não conteúdo pronto. A detecção de "é pergunta?" é heurística
          (pontuação/palavra interrogativa); sorteios, convites para seguir e respostas do próprio perfil são tirados da lista. Quem decide o que virar conteúdo
          continua sendo o time.
        </div>

        <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
          <p>
            <b style={{ color: "var(--text)" }}>Esta lista usa a detecção original:</b> todo comentário marcado como pergunta (pontuação ou palavra interrogativa) fica.
            Só saem textos com menos de 6 letras/números, respostas do próprio perfil e sorteio/convite (13 padrões). Na dúvida, o comentário fica.
          </p>
          <p className="mt-1">
            <b style={{ color: "var(--text)" }}>A Voz do paciente, acima, usa a triagem nova:</b> remove também spam, piada, profissionais de saúde, conversa entre
            seguidores, só @ e a mesma pessoa repetindo, e conta pessoas em vez de comentários. Cada pergunta abaixo mostra o que a triagem nova fez com ela.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Quais perguntas ler">
          <button type="button" onClick={() => setSemPeriodo(false)} aria-pressed={!semPeriodo} className="min-h-[44px] rounded-lg border px-3 text-sm" style={botao(!semPeriodo)}>
            Período do cabeçalho ({periodLabel})
          </button>
          <button type="button" onClick={() => setSemPeriodo(true)} aria-pressed={semPeriodo} className="min-h-[44px] rounded-lg border px-3 text-sm" style={botao(semPeriodo)}>
            Últimas 200, de qualquer data (como era antes)
          </button>
        </div>

        {dados.isLoading ? (
          <p style={{ color: "var(--text-dim)" }}>Carregando…</p>
        ) : dados.error || !dados.data ? (
          <ErroCarga texto="Não consegui ler as perguntas pela detecção original. Atualize a página." />
        ) : (
          <>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-dim)" }}>
              <span>
                {dados.data.lidos} comentários marcados como pergunta lidos{dados.data.noLimite ? ` (limite de ${dados.data.limite}: os mais recentes)` : ""}
              </span>
              <span>{rows.length} perguntas pela detecção original</span>
              <span>{cruzamento.na} também estão na triagem nova</span>
              <span>{cruzamento.tirou} a triagem nova tirou (com o motivo)</span>
              {cruzamento.fora > 0 && <span>{cruzamento.fora} fora da leitura da triagem nova</span>}
            </p>

            <DuvidasFrequentesOriginais questions={rows} status={status} />

            <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nas perguntas…"
                aria-label="Buscar em todas as perguntas detectadas"
                className="min-h-[44px] min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm sm:min-w-[200px]"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              />
              {temas.length > 0 && (
                <select
                  value={temaFilter}
                  onChange={(e) => setTemaFilter(e.target.value)}
                  aria-label="Filtrar por tema do post"
                  className="min-h-[44px] max-w-full rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                >
                  <option value="">Todos os temas</option>
                  {temas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
              <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                {filtered.length} pergunta{filtered.length === 1 ? "" : "s"}
              </span>
            </div>

            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
                {rows.length === 0
                  ? "Ainda sem comentários sincronizados. O sync de comentários roda no job diário."
                  : "Nenhuma pergunta encontrada com esses filtros."}
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((q) => (
                  <QuestionCard key={q.id} q={q} status={status.get(q.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}

function DuvidasPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
  const [busca, setBusca] = useState("");
  const [semPeriodo, setSemPeriodo] = useState(false);
  const [todasAbertas, setTodasAbertas] = useState(false);

  const q = useQuery({
    queryKey: ["voz-do-paciente", clientId, start, end],
    queryFn: () => getComentariosVozDoPaciente(clientId, start, end),
  });
  // Camada 3: a detecção original (477eb43), com a mesma regra e a mesma leitura de antes.
  const original = useQuery({
    queryKey: ["perguntas-deteccao-original", clientId, semPeriodo ? "sem-periodo" : start, semPeriodo ? "" : end],
    queryFn: () => getPerguntasDeteccaoOriginal(clientId, semPeriodo ? null : { start, end }),
  });
  const abrirTodas = () => {
    setTodasAbertas(true);
    requestAnimationFrame(() => document.getElementById("todas-as-perguntas")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const voz = useMemo(() => (q.data ? analisarVozDoPaciente(q.data.comentarios, { donos: q.data.donos }) : null), [q.data]);
  const insights = useMemo(() => (voz ? insightsDaVoz(voz) : []), [voz]);
  const limitacoes = useMemo<Limitacao[]>(() => {
    if (!voz || !q.data) return [];
    const l = [...voz.limitacoes];
    if (q.data.noLimite)
      l.push({ id: "voz-limite", area: "ideias", texto: `O período tem mais de ${q.data.comentarios.length} comentários; a leitura usou os mais recentes. Diminua o período para ler todos.`, resolve: "social_media" });
    l.push({
      id: "voz-heuristica",
      area: "ideias",
      texto: "A triagem é feita por regras de texto (sem IA): ironia e perguntas muito curtas podem ser classificadas errado. Os motivos de cada exclusão estão listados abaixo para conferir.",
      resolve: "equipe_hub",
    });
    return l;
  }, [voz, q.data]);

  const filtrar = (gs: GrupoDuvida<Linha>[]) => {
    const t = busca.trim().toLowerCase();
    if (!t) return gs;
    return gs.filter((g) => [g.rotulo, g.resumo, ...g.itens.map((i) => i.textoLimpo)].join(" ").toLowerCase().includes(t));
  };
  const termoBusca = busca.trim().toLowerCase();

  const head = (
    <div className="hpagehead">
      <h2>Voz do paciente</h2>
      <p>O que os pacientes perguntam nos comentários, já sem ruído, agrupado por assunto e com resposta pronta. Período: {periodLabel}.</p>
    </div>
  );

  if (q.isLoading) return <div>{head}<Carregando texto="Lendo os comentários…" /></div>;
  const camada3 = (
    <TodasAsPerguntas
      periodLabel={periodLabel}
      voz={voz}
      aberto={todasAbertas}
      setAberto={setTodasAbertas}
      semPeriodo={semPeriodo}
      setSemPeriodo={setSemPeriodo}
      dados={original}
    />
  );
  if (q.error || !voz)
    return (
      <div className="space-y-4">
        {head}
        <ErroCarga texto="Não consegui ler os comentários do período. Atualize a página." />
        {camada3}
      </div>
    );

  const pessoas = new Set(voz.mantidos.map((m) => m.pessoa)).size;
  const grupos = filtrar(voz.grupos);
  const cuidado = filtrar(voz.gruposCuidado);
  const avulsas = termoBusca
    ? voz.avulsas.filter((m) => [m.textoLimpo, m.comentario.text, m.assunto?.rotulo ?? ""].join(" ").toLowerCase().includes(termoBusca))
    : voz.avulsas;

  return (
    <div className="space-y-4">
      {head}
      <div className="flex justify-end">
        <SyncButton clientId={clientId} alvo="comentarios" />
      </div>

      <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <div className="text-2xl font-semibold tabular-nums">{voz.total}</div>
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>comentários lidos</div>
          </div>
          <div>
            <div className="text-2xl font-semibold tabular-nums">{voz.mantidos.length}</div>
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>perguntas reais, de {pessoas} pessoas</div>
          </div>
          <div>
            <div className="text-2xl font-semibold tabular-nums">{voz.excluidos.length}</div>
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>ficaram de fora (piada, spam, desabafo…)</div>
          </div>
        </div>
        <OQueE>
          O painel lê os comentários marcados como pergunta e os que falam de preço ou de agendamento. Depois tira o que não é paciente perguntando (resposta do próprio
          perfil, outros profissionais de saúde, spam, piada, conversa entre seguidores) e junta as perguntas sobre o mesmo assunto. "Pessoas" conta cada @ uma vez só.
        </OQueE>
        <div className="mt-3 rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
          <p className="font-semibold" style={{ color: "var(--text)" }}>
            Duas regras nesta tela
          </p>
          <p className="mt-1">
            <b style={{ color: "var(--text)" }}>Triagem nova</b> (Voz do paciente, aqui em cima): remove spam, piada, profissionais de saúde, conversa entre seguidores e
            repetidos. <b style={{ color: "var(--text)" }}>{voz.mantidos.length}</b> perguntas reais de {voz.total} comentários lidos no período.
          </p>
          <p className="mt-1">
            <b style={{ color: "var(--text)" }}>Detecção original</b> (Todas as perguntas detectadas, no fim da página): todos os comentários marcados como pergunta, menos
            sorteio, convite e resposta do próprio perfil.{" "}
            <b style={{ color: "var(--text)" }}>{original.data ? original.data.perguntas.length : "…"}</b> perguntas
            {semPeriodo ? " (últimas 200, de qualquer data)" : " no período"}.
          </p>
          <button type="button" onClick={abrirTodas} className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium" style={{ color: "var(--accent)" }}>
            Ver todas as perguntas detectadas <ChevronDown size={14} aria-hidden />
          </button>
        </div>
      </section>

      {insights.length > 0 && (
        <section className="space-y-3">
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} clientId={clientId} />
          ))}
        </section>
      )}

      {(voz.grupos.length > 0 || voz.gruposCuidado.length > 0 || voz.avulsas.length > 0 || voz.excluidos.length > 0) && (
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nas dúvidas (ex.: cortisol, valor)"
          aria-label="Buscar nas dúvidas, nas perguntas de uma pessoa só e nos comentários que ficaram de fora"
          className="min-h-[44px] w-full rounded-lg border px-3 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Dúvidas que mais se repetem ({grupos.length})</h2>
        {grupos.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
            {voz.total === 0
              ? "Ainda sem comentários sincronizados neste período. O sync de comentários roda no job diário."
              : voz.grupos.length === 0
                ? "Nenhum assunto foi perguntado por 2 pessoas diferentes ou mais neste período. Aumente o período para juntar mais comentários."
                : "Nenhuma dúvida com esse termo."}
          </p>
        ) : (
          grupos.map((g) => <GrupoCard key={g.id} g={g} />)
        )}
      </section>

      {cuidado.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Pedem dose ou remédio: responder com cuidado ({cuidado.length})</h2>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Estas perguntas não viram post: responder com dose, marca ou nome de remédio é prescrever sem consulta. Use a resposta de segurança.
          </p>
          {cuidado.map((g) => (
            <GrupoCard key={g.id} g={g} />
          ))}
        </section>
      )}

      {voz.avulsas.length > 0 && (
        <details className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-semibold">
            <ChevronDown size={16} aria-hidden /> Ver as {voz.avulsas.length} perguntas que só uma pessoa fez
            {termoBusca ? ` (${avulsas.length} com "${busca.trim()}")` : ""}
          </summary>
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            Perguntas reais, mas sem repetição: vale responder no comentário. Não viram ideia de post sozinhas.
          </p>
          <ul className="mt-2 space-y-2">
            {avulsas.map((m) => {
              const post = m.comentario.instagram_posts;
              return (
                <li key={m.comentario.id} className="rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)" }}>
                  <p>{anonimizarTexto(m.textoLimpo)}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
                    {ROTULO_INTENCAO[m.intencao]}
                    {m.assunto ? ` · ${m.assunto.rotulo}` : ""}
                    {m.riscos.includes("diagnostico_individual") ? " · não dar diagnóstico pelo comentário" : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--text-faint)" }}>
                    {m.comentario.commented_at && <span>{new Date(m.comentario.commented_at).toLocaleDateString("pt-BR")}</span>}
                    {post?.tema && <span>· {post.tema}</span>}
                    {post?.permalink && (
                      <a href={post.permalink} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-1" style={{ color: "var(--accent)" }}>
                        Abrir o post para responder <ExternalLink size={12} aria-hidden />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
            {termoBusca && avulsas.length === 0 && (
              <li className="text-xs" style={{ color: "var(--text-dim)" }}>
                Nenhuma pergunta de uma pessoa só com esse termo.
              </li>
            )}
          </ul>
        </details>
      )}

      <ForaDaLista excluidos={voz.excluidos} busca={busca} />
      {camada3}
      <ListaLimitacoes itens={limitacoes} />
    </div>
  );
}
