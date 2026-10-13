import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, MessageCircle, ShieldAlert, Users, Megaphone, Briefcase, ExternalLink } from "lucide-react";
import { getComentariosVozDoPaciente } from "@/lib/client-data";
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

function ForaDaLista({ excluidos }: { excluidos: { comentario: Linha; motivo: MotivoExclusao }[] }) {
  const porMotivo = useMemo(() => {
    const m = new Map<MotivoExclusao, Linha[]>();
    for (const e of excluidos) (m.get(e.motivo) ?? m.set(e.motivo, []).get(e.motivo)!).push(e.comentario);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [excluidos]);
  if (excluidos.length === 0) return null;
  return (
    <details className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <ChevronDown size={16} aria-hidden /> Por que {excluidos.length} comentários ficaram de fora
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

function DuvidasPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
  const [busca, setBusca] = useState("");

  const q = useQuery({
    queryKey: ["voz-do-paciente", clientId, start, end],
    queryFn: () => getComentariosVozDoPaciente(clientId, start, end),
  });

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

  const head = (
    <div className="hpagehead">
      <h2>Voz do paciente</h2>
      <p>O que os pacientes perguntam nos comentários, já sem ruído, agrupado por assunto e com resposta pronta. Período: {periodLabel}.</p>
    </div>
  );

  if (q.isLoading) return <div>{head}<Carregando texto="Lendo os comentários…" /></div>;
  if (q.error || !voz) return <div>{head}<ErroCarga texto="Não consegui ler os comentários do período. Atualize a página." /></div>;

  const pessoas = new Set(voz.mantidos.map((m) => m.pessoa)).size;
  const grupos = filtrar(voz.grupos);
  const cuidado = filtrar(voz.gruposCuidado);

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
      </section>

      {insights.length > 0 && (
        <section className="space-y-3">
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} clientId={clientId} />
          ))}
        </section>
      )}

      {(voz.grupos.length > 0 || voz.gruposCuidado.length > 0) && (
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nas dúvidas (ex.: cortisol, valor)"
          aria-label="Buscar nas dúvidas"
          className="min-h-[44px] w-full rounded-lg border px-3 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Dúvidas que mais se repetem ({grupos.length})</h2>
        {grupos.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
            {voz.grupos.length === 0
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
          </summary>
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            Perguntas reais, mas sem repetição: vale responder no comentário. Não viram ideia de post sozinhas.
          </p>
          <ul className="mt-2 space-y-2">
            {voz.avulsas.map((m) => (
              <li key={m.comentario.id} className="rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)" }}>
                <p>{anonimizarTexto(m.textoLimpo)}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
                  {ROTULO_INTENCAO[m.intencao]}
                  {m.assunto ? ` · ${m.assunto.rotulo}` : ""}
                  {m.riscos.includes("diagnostico_individual") ? " · não dar diagnóstico pelo comentário" : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ForaDaLista excluidos={voz.excluidos} />
      <ListaLimitacoes itens={limitacoes} />
    </div>
  );
}
