import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { CalendarRange, Rocket } from "lucide-react";
import { Painel } from "@/components/visual";
import { LEGENDA } from "@/components/grafico";
import { getAdsCampanhasPeriodo, getMonthlyMetrics, getPostsParaImpulsionados } from "@/lib/client-data";
import { ehImpulsionamento, postsImpulsionados, seguidoresPorSemana, type DiaSeguidores } from "@/lib/seguidores-semana";
import { somarDias } from "@/lib/sap-metas";
import { fmtBRL } from "@/lib/format";

const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dim = { color: "var(--text-dim)" } as const;

/** Seguidores por semana (novos, deixaram de seguir, saldo) com o gasto em impulsionamento da mesma semana. */
export function SeguidoresSemana({ clientId, start, end }: { clientId: string; start: string; end: string }) {
  const metricas = useQuery({ queryKey: ["conteudo-metrics", clientId, start, end], queryFn: () => getMonthlyMetrics(clientId, start, end) });
  const ads = useQuery({ queryKey: ["ads-campanhas-periodo", clientId, start, end], queryFn: () => getAdsCampanhasPeriodo(clientId, start, end), retry: false });

  const semanas = useMemo(() => {
    if (!metricas.data) return null;
    const gasto = new Map<string, number>();
    if (ads.data) {
      const imp = new Set(ads.data.cadastro.filter((c) => ehImpulsionamento(c.name)).map((c) => c.campaign_id));
      for (const l of ads.data.linhas) if (imp.has(l.campaign_id)) gasto.set(l.date, (gasto.get(l.date) ?? 0) + (Number(l.spend) || 0));
    }
    return seguidoresPorSemana(metricas.data as unknown as DiaSeguidores[], gasto);
  }, [metricas.data, ads.data]);

  const temGasto = !!semanas?.some((s) => s.gastoImpulsionamento > 0);
  const ajuda = (
    <>
      Semana de segunda a domingo. Novos e deixaram de seguir vêm da Meta; a Meta só informa quem deixou de seguir nos últimos ~28 dias, então antes
      disso aparece "sem dado" (não é zero). O saldo é a contagem total no fim da semana menos a do fim da semana anterior. O gasto é só das campanhas de
      post impulsionado.
    </>
  );

  return (
    <Painel icone={CalendarRange} titulo="Seguidores por semana" resumo={temGasto ? "Com o gasto em post impulsionado da mesma semana" : "Novos, saídas e saldo"} ajuda={ajuda}>
      {metricas.isLoading ? (
        <p className="note" style={{ margin: 0 }}>Carregando…</p>
      ) : metricas.isError ? (
        <p className="note" style={{ margin: 0 }}>Não foi possível carregar os seguidores agora.</p>
      ) : !semanas?.length ? (
        <p className="note" style={{ margin: 0 }}>Nenhum dia do período tem dado de seguidores.</p>
      ) : (
        <>
          {semanas.length >= 2 && (
            <div className="grafico-caixa" style={{ height: 230, marginTop: 10 }}>
              <ResponsiveContainer>
                <ComposedChart data={semanas.map((s) => ({ semana: ddmm(s.semana), Novos: s.novos, "Deixaram de seguir": s.perderam, Impulsionamento: temGasto ? s.gastoImpulsionamento : undefined }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="semana" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                  <YAxis yAxisId="s" tick={{ fontSize: 11, fill: "var(--muted)" }} width={44} tickFormatter={(v) => fmtN(Number(v))} />
                  {temGasto && <YAxis yAxisId="g" orientation="right" tick={{ fontSize: 11, fill: "var(--muted)" }} width={56} tickFormatter={(v) => fmtBRL(Number(v))} />}
                  <Tooltip
                    formatter={(v, nome) => (v === null || v === undefined ? "sem dado" : nome === "Impulsionamento" ? fmtBRL(Number(v)) : fmtN(Number(v)))}
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend {...LEGENDA} />
                  <Bar yAxisId="s" dataKey="Novos" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="s" dataKey="Deixaram de seguir" fill="var(--crit)" radius={[3, 3, 0, 0]} />
                  {temGasto && <Line yAxisId="g" dataKey="Impulsionamento" stroke="var(--warn)" strokeWidth={2} dot />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={dim}>
                  <th className="py-1 pr-3 font-medium">Semana</th>
                  <th className="py-1 pr-3 text-right font-medium">Novos</th>
                  <th className="py-1 pr-3 text-right font-medium">Deixaram de seguir</th>
                  <th className="py-1 pr-3 text-right font-medium">Saldo</th>
                  {temGasto && <th className="py-1 text-right font-medium">Gasto em impulsionamento</th>}
                </tr>
              </thead>
              <tbody>
                {semanas.map((s) => (
                  <tr key={s.semana} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-3">
                      {ddmm(s.semana)} a {ddmm(somarDias(s.semana, 6))}
                      {!s.completa && <span className="ml-1 text-xs" style={{ color: "var(--muted)" }}>({s.dias} dia{s.dias === 1 ? "" : "s"})</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{s.novos === null ? <SemDado /> : fmtN(s.novos)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{s.perderam === null ? <SemDado /> : fmtN(s.perderam)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums" style={{ color: s.saldo === null ? undefined : s.saldo < 0 ? "var(--crit)" : "var(--good)" }}>
                      {s.saldo === null ? <SemDado /> : `${s.saldo > 0 ? "+" : ""}${fmtN(s.saldo)}`}
                    </td>
                    {temGasto && <td className="py-1.5 text-right tabular-nums">{s.gastoImpulsionamento > 0 ? fmtBRL(s.gastoImpulsionamento) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Painel>
  );
}

function SemDado() {
  return <span style={{ color: "var(--muted)" }}>sem dado</span>;
}

/** Posts impulsionados: o alcance orgânico do post ao lado do que o impulsionamento comprou. */
export function PostsImpulsionados({ clientId, start, end }: { clientId: string; start: string; end: string }) {
  const ads = useQuery({ queryKey: ["ads-campanhas-periodo", clientId, start, end], queryFn: () => getAdsCampanhasPeriodo(clientId, start, end), retry: false });
  const temImpulso = !!ads.data?.cadastro.some((c) => ehImpulsionamento(c.name));
  const posts = useQuery({
    queryKey: ["posts-impulsionados", clientId, start],
    queryFn: () => getPostsParaImpulsionados(clientId, somarDias(start, -180) + "T00:00:00-03:00"),
    enabled: temImpulso,
  });
  const lista = useMemo(
    () => (ads.data && posts.data ? postsImpulsionados(ads.data.cadastro, ads.data.linhas, posts.data) : []),
    [ads.data, posts.data],
  );
  if (!temImpulso || (!posts.isLoading && !lista.length)) return null;

  const ajuda = (
    <>
      Campanhas criadas pelo botão "Impulsionar" do Instagram. O post é achado pelo início da legenda que a Meta põe no nome da campanha. Alcance orgânico é o
      alcance total do post no Instagram (a Meta não separa o que veio do anúncio nesse número). A Meta não informa seguidores ganhos por post impulsionado,
      por isso não aparece aqui.
    </>
  );
  return (
    <Painel icone={Rocket} titulo="Posts impulsionados" resumo="Orgânico do post × o que o impulsionamento comprou" ajuda={ajuda}>
      {posts.isLoading ? (
        <p className="note" style={{ margin: 0 }}>Carregando…</p>
      ) : posts.isError ? (
        <p className="note" style={{ margin: 0 }}>Não foi possível carregar os posts agora.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={dim}>
                <th className="py-1 pr-3 font-medium">Post</th>
                <th className="py-1 pr-3 text-right font-medium">Alcance do post</th>
                <th className="py-1 pr-3 text-right font-medium">Gasto</th>
                <th className="py-1 pr-3 text-right font-medium">Impressões pagas</th>
                <th className="py-1 pr-3 text-right font-medium">Cliques</th>
                <th className="py-1 text-right font-medium">Custo por mil</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.campaign_id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3" style={{ maxWidth: 340 }}>
                    <div className="flex gap-2">
                      {i.post?.thumbnail_url && <img src={i.post.thumbnail_url} alt="" width={36} height={36} className="shrink-0 rounded object-cover" style={{ width: 36, height: 36 }} loading="lazy" />}
                      <div className="min-w-0">
                        {i.post ? (
                          i.post.permalink ? (
                            <a href={i.post.permalink} target="_blank" rel="noreferrer" className="line-clamp-2 underline" style={{ color: "var(--text)" }}>
                              {i.post.caption}
                            </a>
                          ) : (
                            <span className="line-clamp-2">{i.post.caption}</span>
                          )
                        ) : (
                          <span className="line-clamp-2">{i.campanha}</span>
                        )}
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {i.post ? `Publicado em ${ddmm(i.post.posted_at.slice(0, 10))}` : "Post não encontrado nos posts sincronizados"}
                          {i.primeiroDia && ` · impulsionado ${ddmm(i.primeiroDia)}${i.ultimoDia && i.ultimoDia !== i.primeiroDia ? ` a ${ddmm(i.ultimoDia)}` : ""}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{i.alcanceOrganico === null ? <SemDado /> : fmtN(i.alcanceOrganico)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtBRL(i.gasto)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtN(i.impressoes)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtN(i.cliques)}</td>
                  <td className="py-2 text-right tabular-nums">{i.custoPorMilImpressoes === null ? "—" : fmtBRL(i.custoPorMilImpressoes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Painel>
  );
}
