import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Lightbulb, Repeat, Target, TrendingDown } from "lucide-react";
import {
  comparar,
  faixaTamanho,
  fmtMetrica,
  grupoEspecialidade,
  montarGrupo,
  responder,
  MIN_CLIENTES,
  MIN_POSTS,
  ROTULO_FORMATO,
  ROTULO_METRICA,
  ROTULO_OBJETIVO,
  type ClienteBench,
  type Comparacao,
  type Formato,
  type Objetivo,
  type PostBench,
  type Posicao,
} from "@/lib/benchmark-estrategico";

// Benchmark estratégico (admin): um cliente contra a mediana e o top 25% de um grupo comparável.
// Responde: está acima ou abaixo do padrão? O que repetir? Onde perde? Qual formato tem mais oportunidade?

const COR_POS: Record<Posicao, string> = { top: "var(--good)", acima: "var(--good)", media: "var(--ink-2)", abaixo: "var(--crit)", sem_dado: "var(--muted)" };
const ROTULO_POS: Record<Posicao, string> = { top: "Top 25%", acima: "Acima da mediana", media: "Na mediana", abaixo: "Abaixo da mediana", sem_dado: "Sem dado" };

function Seletor({ rotulo, valor, onChange, opcoes, todos = "Todos" }: { rotulo: string; valor: string; onChange: (v: string) => void; opcoes: { v: string; r: string }[]; todos?: string | null }) {
  return (
    <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs sm:flex-none" style={{ color: "var(--muted)" }}>
      {rotulo}
      <select value={valor} onChange={(e) => onChange(e.target.value)} autoComplete="off" className="min-h-[40px] rounded-lg border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" }}>
        {todos != null && <option value="">{todos}</option>}
        {opcoes.map((o) => (
          <option key={o.v} value={o.v}>{o.r}</option>
        ))}
      </select>
    </label>
  );
}

function Resposta({ icone: Icon, titulo, cor, children }: { icone: typeof Target; titulo: string; cor: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: cor }}>
        <Icon size={14} aria-hidden /> {titulo}
      </div>
      <div className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{children}</div>
    </div>
  );
}

function TabelaComparacao({ c }: { c: Comparacao }) {
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm empilha">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--ink-2)", background: "var(--surface-2)" }}>
            <th className="px-3 py-2">Métrica (mediana por post)</th>
            <th className="px-3 py-2 text-right">Cliente</th>
            <th className="px-3 py-2 text-right">Mediana do grupo</th>
            <th className="px-3 py-2 text-right">Top 25%</th>
            <th className="px-3 py-2">Posição</th>
          </tr>
        </thead>
        <tbody>
          {c.linhas.map((l) => (
            <tr key={l.metrica} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-2" data-label="Métrica">{ROTULO_METRICA[l.metrica]}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums" data-label="Cliente">{fmtMetrica(l.metrica, l.cliente)}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-label="Mediana do grupo">{fmtMetrica(l.metrica, l.medianaGrupo)}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-label="Top 25%">{fmtMetrica(l.metrica, l.top25)}</td>
              <td className="px-3 py-2" data-label="Posição">
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold" style={{ color: COR_POS[l.posicao] }}>
                  {l.posicao === "abaixo" ? <ArrowDownRight size={13} aria-hidden /> : l.posicao === "sem_dado" || l.posicao === "media" ? null : <ArrowUpRight size={13} aria-hidden />}
                  {ROTULO_POS[l.posicao]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Grade compacta: uma linha por formato ou objetivo, só as taxas que decidem o veredito.
function GradeRecortes({ titulo, itens }: { titulo: string; itens: { rotulo: string; c: Comparacao | null }[] }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold">{titulo}</h4>
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm empilha">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--ink-2)", background: "var(--surface-2)" }}>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2 text-right">Posts</th>
              <th className="px-3 py-2 text-right">Engajamento (cliente · grupo)</th>
              <th className="px-3 py-2 text-right">Salvamento (cliente · grupo)</th>
              <th className="px-3 py-2 text-right">Compartilh. (cliente · grupo)</th>
            </tr>
          </thead>
          <tbody>
            {itens.map(({ rotulo, c }) => {
              const l = (m: "engajamento" | "taxaSalvamento" | "compartilhamentos") => c?.linhas.find((x) => x.metrica === m);
              const cel = (m: "engajamento" | "taxaSalvamento" | "compartilhamentos") => {
                const x = l(m);
                if (!c || !x) return <span style={{ color: "var(--muted)" }}>—</span>;
                return (
                  <span className="tabular-nums">
                    <b style={{ color: COR_POS[x.posicao] }}>{fmtMetrica(m, x.cliente)}</b> · {fmtMetrica(m, x.medianaGrupo)}
                  </span>
                );
              };
              return (
                <tr key={rotulo} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2 font-medium" data-label="">
                    {rotulo}
                    {c?.limitado && <span className="ml-1 text-xs font-normal" style={{ color: "var(--muted)" }}>(grupo pequeno)</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" data-label="Posts">{c ? c.postsCliente : <span style={{ color: "var(--muted)" }}>menos de {MIN_POSTS}</span>}</td>
                  <td className="px-3 py-2 text-right" data-label="Engajamento">{cel("engajamento")}</td>
                  <td className="px-3 py-2 text-right" data-label="Salvamento">{cel("taxaSalvamento")}</td>
                  <td className="px-3 py-2 text-right" data-label="Compartilhamentos">{cel("compartilhamentos")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BenchmarkEstrategico({ clientes, posts, dias }: { clientes: ClienteBench[]; posts: PostBench[]; dias: number }) {
  const comPosts = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of posts) n.set(p.client_id, (n.get(p.client_id) ?? 0) + 1);
    return clientes.filter((c) => (n.get(c.id) ?? 0) >= MIN_POSTS).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [clientes, posts]);
  const [alvo, setAlvo] = useState("");
  const [esp, setEsp] = useState("");
  const [tam, setTam] = useState("");
  const [formato, setFormato] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const atual = alvo || comPosts[0]?.id || "";
  const cliente = clientes.find((c) => c.id === atual);

  const especialidades = [...new Set(comPosts.map((c) => grupoEspecialidade(c.especialidade)))].sort();
  const tamanhos = [...new Set(comPosts.map((c) => faixaTamanho(c.seguidores)))];
  // O cliente escolhido sempre entra no próprio grupo (é comparado com os outros).
  const grupo = useMemo(() => {
    const g = montarGrupo(comPosts, { especialidade: esp || undefined, tamanho: tam || undefined });
    return g.includes(atual) ? g : [...g, atual];
  }, [comPosts, esp, tam, atual]);
  const outros = grupo.filter((id) => id !== atual).length;

  const respostas = useMemo(() => (atual ? responder(posts, comPosts, atual, grupo) : null), [posts, comPosts, atual, grupo]);
  const principal = useMemo(() => (atual ? comparar(posts, comPosts, atual, grupo, { formato: formato || undefined, objetivo: objetivo || undefined }) : null), [posts, comPosts, atual, grupo, formato, objetivo]);
  const porFormato = useMemo(() => (["reels", "carrossel", "estatico", "stories"] as Formato[]).map((f) => ({ rotulo: ROTULO_FORMATO[f], c: atual ? comparar(posts, comPosts, atual, grupo, { formato: f }) : null })), [posts, comPosts, atual, grupo]);
  const porObjetivo = useMemo(() => (["percepcao", "confianca", "venda", "multiplicacao"] as Objetivo[]).map((o) => ({ rotulo: ROTULO_OBJETIVO[o], c: atual ? comparar(posts, comPosts, atual, grupo, { objetivo: o }) : null })), [posts, comPosts, atual, grupo]);

  if (comPosts.length < 2) {
    return (
      <section className="mb-6 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h3 className="text-[15px] font-semibold">Benchmark estratégico</h3>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>Precisa de pelo menos 2 clientes com {MIN_POSTS} posts ou mais nos últimos {dias} dias para comparar.</p>
      </section>
    );
  }

  const v = respostas?.padrao.veredito;
  return (
    <section className="mb-6 rounded-xl border p-4 sm:p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }} aria-label="Benchmark estratégico">
      <h3 className="text-lg font-semibold">Benchmark estratégico</h3>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
        O cliente contra a <b>mediana</b> e o <b>top 25%</b> de um grupo comparável, nos últimos {dias} dias. Cada cliente entra com a própria mediana
        (mínimo de {MIN_POSTS} posts). O veredito usa só taxas (alcance ÷ seguidores, engajamento e salvamento), que não dependem do tamanho da conta.
        Só para a equipe.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Seletor rotulo="Cliente" valor={atual} onChange={setAlvo} todos={null} opcoes={comPosts.map((c) => ({ v: c.id, r: c.nome }))} />
        <Seletor rotulo="Comparar com: especialidade" valor={esp} onChange={setEsp} todos="Todas" opcoes={especialidades.map((e) => ({ v: e, r: e }))} />
        <Seletor rotulo="Tamanho da conta" valor={tam} onChange={setTam} todos="Todos" opcoes={tamanhos.map((t) => ({ v: t, r: t }))} />
        <Seletor rotulo="Formato" valor={formato} onChange={setFormato} opcoes={(Object.keys(ROTULO_FORMATO) as Formato[]).map((f) => ({ v: f, r: ROTULO_FORMATO[f] }))} />
        <Seletor rotulo="Objetivo do conteúdo" valor={objetivo} onChange={setObjetivo} opcoes={(Object.keys(ROTULO_OBJETIVO) as Objetivo[]).map((o) => ({ v: o, r: ROTULO_OBJETIVO[o] }))} />
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        {cliente ? `${cliente.nome}: ${grupoEspecialidade(cliente.especialidade)} · ${faixaTamanho(cliente.seguidores)}${cliente.seguidores ? ` (${cliente.seguidores.toLocaleString("pt-BR")} seguidores)` : ""}. ` : ""}
        Grupo de comparação: {outros} {outros === 1 ? "cliente" : "clientes"}.
        {outros < MIN_CLIENTES ? ` Com menos de ${MIN_CLIENTES}, não há top 25% e as conclusões ficam limitadas: amplie o grupo (especialidade "Todas").` : ""}
      </p>

      {respostas && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Resposta icone={Target} titulo="Acima ou abaixo do padrão?" cor={v === "acima" ? "var(--good)" : v === "abaixo" ? "var(--crit)" : "var(--muted)"}>
            {respostas.padrao.texto}
          </Resposta>
          <Resposta icone={Repeat} titulo="O que repetir" cor="var(--good)">
            {respostas.repetir.length || respostas.temasFortes.length ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {respostas.repetir.map((t) => <li key={t}>{t}</li>)}
                {respostas.temasFortes.map((t) => (
                  <li key={t.tema}>Tema “{t.tema}”: {(t.taxaSalvamento * 100).toFixed(1).replace(".", ",")}% de salvamento em {t.posts} posts, acima do normal deste cliente.</li>
                ))}
              </ul>
            ) : (
              <span style={{ color: "var(--ink-2)" }}>Nenhum formato ou objetivo claramente acima do grupo{respostas.limitado ? " (grupo pequeno para afirmar)" : ""}.</span>
            )}
          </Resposta>
          <Resposta icone={TrendingDown} titulo="Onde está perdendo" cor="var(--crit)">
            {respostas.perdendo.length ? (
              <ul className="list-disc space-y-0.5 pl-4">{respostas.perdendo.map((t) => <li key={t}>{t}</li>)}</ul>
            ) : (
              <span style={{ color: "var(--ink-2)" }}>Nenhum formato ou objetivo claramente abaixo{respostas.limitado ? " (grupo pequeno para afirmar)" : ""}.</span>
            )}
          </Resposta>
          <Resposta icone={Lightbulb} titulo="Maior oportunidade" cor="var(--accent)">
            {respostas.oportunidade ?? <span style={{ color: "var(--ink-2)" }}>Sem formato com sinal claro de oportunidade no grupo escolhido.</span>}
          </Resposta>
        </div>
      )}

      <div className="mt-5 grid gap-4">
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">
            Cliente x grupo{formato || objetivo ? `: ${[formato && ROTULO_FORMATO[formato as Formato], objetivo && ROTULO_OBJETIVO[objetivo as Objetivo]].filter(Boolean).join(" · ")}` : " (todos os posts)"}
          </h4>
          {principal ? (
            <>
              <TabelaComparacao c={principal} />
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                {principal.postsCliente} posts do cliente · {principal.clientesNoGrupo} clientes no grupo. Stories não têm salvamento na API do Instagram.
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>O cliente tem menos de {MIN_POSTS} posts neste recorte. Escolha outro formato ou objetivo.</p>
          )}
        </div>
        <GradeRecortes titulo="Por formato" itens={porFormato} />
        <GradeRecortes titulo="Por objetivo do conteúdo" itens={porObjetivo} />
      </div>
    </section>
  );
}
