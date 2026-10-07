import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
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
import { Barras, BarraDividida, BarrasPareadas } from "@/components/barras";
import { MapaDeCalor } from "@/components/mapa-de-calor";
import { Carregando, ErroCarga, SemFonte, SEM_INSTAGRAM } from "@/components/sem-fonte";

export const Route = createFileRoute("/_authenticated/$clientId/audiencia")({
  component: AudienciaPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

type Aba = "demografia" | "alcance" | "interacoes" | "horarios";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "demografia", rotulo: "Demografia" },
  { id: "alcance", rotulo: "Alcance e origem" },
  { id: "interacoes", rotulo: "Interações" },
  { id: "horarios", rotulo: "Melhores horários" },
];

// Quando a Meta recusa um bloco, diz o motivo em vez de mostrar zero.
function Falha({ b }: { b: Extract<Bloco<unknown>, { ok: false }> }) {
  return (
    <p className="note" style={{ color: "var(--muted)" }}>
      A Meta não devolveu este bloco: {b.erro}
    </p>
  );
}

function Leitura({ itens }: { itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 16, background: "var(--accent-soft)" }}>
      <h2>O que isso quer dizer</h2>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6, fontSize: 13.5 }}>
        {itens.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function Demografia({ a }: { a: Audiencia }) {
  const base = a.seguidores.ok ? a.seguidores.dados.faixa_etaria : [];
  const alc = a.alcancados_no_mes.ok ? a.alcancados_no_mes.dados.faixa_etaria : [];
  const faixas = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  const tb = soma(base);
  const ta = soma(alc);
  return (
    <div>
      <Leitura itens={leituraDemografia(a)} />
      <div className="hgrid two">
        <div className="card">
          <h2>Faixa etária dos seguidores</h2>
          <p className="sub">Quem segue a conta hoje. A Meta só informa para contas com 100 seguidores ou mais.</p>
          <div style={{ marginTop: 12 }}>
            {a.seguidores.ok ? (
              <Barras itens={a.seguidores.dados.faixa_etaria.map((p) => ({ rotulo: `${p.chave} anos`, valor: p.valor }))} />
            ) : (
              <Falha b={a.seguidores} />
            )}
          </div>
        </div>
        <div className="card">
          <h2>Gênero dos seguidores</h2>
          <p className="sub">Informado pelo Instagram. "Não informado" é quem não declarou.</p>
          <div style={{ marginTop: 12 }}>
            {a.seguidores.ok ? (
              <BarraDividida
                partes={a.seguidores.dados.genero.map((g, i) => ({ rotulo: ROTULO_GENERO[g.chave] ?? g.chave, valor: g.valor, cor: ["var(--accent)", "var(--ai, #8b7cf6)", "var(--axis, #888)"][i % 3] }))}
              />
            ) : (
              <Falha b={a.seguidores} />
            )}
          </div>
        </div>
      </div>

      <div className="hgrid two">
        <div className="card">
          <h2>Seguidores x quem o conteúdo alcançou</h2>
          <p className="sub">
            % por faixa etária. Alcance: {a.alcancados_no_mes.ok ? a.alcancados_no_mes.dados.mes : "mês"}. Se o alcance pesa mais que a base numa faixa, o conteúdo está chegando a gente nova ali.
          </p>
          <div style={{ marginTop: 12 }}>
            {a.seguidores.ok && a.alcancados_no_mes.ok && tb > 0 && ta > 0 ? (
              <BarrasPareadas
                categorias={faixas}
                a={faixas.map((f) => pctDe(base.find((x) => x.chave === f)?.valor ?? 0, tb))}
                b={faixas.map((f) => pctDe(alc.find((x) => x.chave === f)?.valor ?? 0, ta))}
                nomeA="Seguidores"
                nomeB="Alcançados"
              />
            ) : (
              <p className="note">Sem dado suficiente para comparar neste mês.</p>
            )}
          </div>
        </div>
        <div className="card">
          <h2>Quem engaja</h2>
          <p className="sub">Pessoas que curtiram, comentaram, salvaram ou compartilharam ({a.engajados_no_mes.ok ? a.engajados_no_mes.dados.mes : "mês"}).</p>
          <div style={{ marginTop: 12 }}>
            {a.engajados_no_mes.ok ? (
              soma(a.engajados_no_mes.dados.faixa_etaria) >= 50 ? (
                <Barras itens={a.engajados_no_mes.dados.faixa_etaria.map((p) => ({ rotulo: `${p.chave} anos`, valor: p.valor }))} cor="var(--ai, #8b7cf6)" />
              ) : (
                <p className="note">Poucas pessoas engajaram neste mês para mostrar a divisão por idade.</p>
              )
            ) : (
              <Falha b={a.engajados_no_mes} />
            )}
          </div>
        </div>
      </div>

      <div className="hgrid two">
        <div className="card">
          <h2>Cidades dos seguidores</h2>
          <p className="sub">As 10 principais.</p>
          <div style={{ marginTop: 12 }}>
            {a.seguidores.ok ? (
              <Barras
                total={soma(a.seguidores.dados.cidades)}
                itens={a.seguidores.dados.cidades.slice(0, 10).map((p) => ({ rotulo: nomeDaCidade(p.chave), valor: p.valor }))}
              />
            ) : (
              <Falha b={a.seguidores} />
            )}
          </div>
        </div>
        <div className="card">
          <h2>Países dos seguidores</h2>
          <div style={{ marginTop: 12 }}>
            {a.seguidores.ok ? (
              <Barras itens={a.seguidores.dados.paises.slice(0, 6).map((p) => ({ rotulo: p.chave, valor: p.valor }))} />
            ) : (
              <Falha b={a.seguidores} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Alcance({ a }: { a: Audiencia }) {
  return (
    <div>
      <Leitura itens={leituraOrigem(a)} />
      <div className="hgrid two">
        <div className="card">
          <h2>Alcance: seguidores x não seguidores</h2>
          <p className="sub">Contas únicas alcançadas nos últimos {a.periodo.dias} dias ({a.periodo.de} a {a.periodo.ate}).</p>
          <div style={{ marginTop: 12 }}>
            {a.alcance_por_tipo_de_seguidor.ok ? (
              <BarraDividida
                partes={[
                  { rotulo: "Seguidores", valor: a.alcance_por_tipo_de_seguidor.dados.seguidores, cor: "var(--accent)" },
                  { rotulo: "Não seguidores", valor: a.alcance_por_tipo_de_seguidor.dados.nao_seguidores, cor: "var(--ai, #8b7cf6)" },
                ]}
              />
            ) : (
              <Falha b={a.alcance_por_tipo_de_seguidor} />
            )}
          </div>
        </div>
        <div className="card">
          <h2>Visualizações: seguidores x não seguidores</h2>
          <p className="sub">Quantas vezes o conteúdo foi visto, no mesmo período.</p>
          <div style={{ marginTop: 12 }}>
            {a.visualizacoes_por_tipo_de_seguidor.ok ? (
              <BarraDividida
                partes={[
                  { rotulo: "Seguidores", valor: a.visualizacoes_por_tipo_de_seguidor.dados.seguidores, cor: "var(--accent)" },
                  { rotulo: "Não seguidores", valor: a.visualizacoes_por_tipo_de_seguidor.dados.nao_seguidores, cor: "var(--ai, #8b7cf6)" },
                ]}
              />
            ) : (
              <Falha b={a.visualizacoes_por_tipo_de_seguidor} />
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Origem das visualizações, por tipo de conteúdo</h2>
        <p className="sub">Reels, carrossel, post, stories e anúncios. Alcance e interações vêm da Meta no mesmo período.</p>
        <div style={{ marginTop: 12 }}>
          {a.origem.ok ? (
            <>
              <Barras
                itens={a.origem.dados.map((i) => ({ rotulo: i.conteudo, valor: i.visualizacoes }))}
                formato={(v) => `${fmtN(v)} views`}
              />
              <div style={{ overflowX: "auto", marginTop: 14 }}>
                <table className="t">
                  <thead>
                    <tr>
                      <th className="l">Conteúdo</th>
                      <th>Visualizações</th>
                      <th>Alcance</th>
                      <th>Interações</th>
                      <th>Interações por alcance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.origem.dados.map((i) => (
                      <tr key={i.conteudo}>
                        <td className="l">{i.conteudo}</td>
                        <td>{fmtN(i.visualizacoes)}</td>
                        <td>{fmtN(i.alcance)}</td>
                        <td>{i.interacoes > 0 ? fmtN(i.interacoes) : "—"}</td>
                        <td>{i.interacoes > 0 && i.alcance > 0 ? fmtPct(pctDe(i.interacoes, i.alcance), 1) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Falha b={a.origem} />
          )}
        </div>
      </div>

      <div className="card">
        <h2>Quem seguiu e quem deixou de seguir</h2>
        <p className="sub">Saldo dos últimos {a.periodo.dias} dias, direto da Meta.</p>
        <div style={{ marginTop: 12 }}>
          {a.seguiram_e_deixaram.ok ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
              <div><div className="sub">Seguiram</div><b style={{ fontSize: 24 }}>{fmtN(a.seguiram_e_deixaram.dados.seguiram)}</b></div>
              <div><div className="sub">Deixaram de seguir</div><b style={{ fontSize: 24 }}>{fmtN(a.seguiram_e_deixaram.dados.deixaram_de_seguir)}</b></div>
              <div><div className="sub">Saldo</div><b style={{ fontSize: 24, color: a.seguiram_e_deixaram.dados.saldo >= 0 ? "var(--good)" : "var(--crit)" }}>{a.seguiram_e_deixaram.dados.saldo >= 0 ? "+" : ""}{fmtN(a.seguiram_e_deixaram.dados.saldo)}</b></div>
            </div>
          ) : (
            <Falha b={a.seguiram_e_deixaram} />
          )}
        </div>
      </div>
    </div>
  );
}

function Interacoes({ a, clientId, start, end }: { a: Audiencia; clientId: string; start: string; end: string }) {
  const diario = useQuery({ queryKey: ["aud-diario", clientId, start, end], queryFn: () => getMonthlyMetrics(clientId, start, end) });
  const dias = (diario.data ?? [])
    .filter((d) => d.likes != null || d.comments != null || d.saves != null || d.shares != null)
    .map((d) => ({ dia: d.date.slice(8, 10) + "/" + d.date.slice(5, 7), Curtidas: d.likes ?? 0, Comentários: d.comments ?? 0, Salvamentos: d.saves ?? 0, Compartilhamentos: d.shares ?? 0 }));
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
    <div>
      <Leitura itens={leitura} />
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Interações no período</h2>
        <p className="sub">Últimos {a.periodo.dias} dias ({a.periodo.de} a {a.periodo.ate}).</p>
        <div style={{ marginTop: 12 }}>
          {tot ? (
            <Barras
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
        </div>
      </div>
      <div className="card">
        <h2>Interações por dia</h2>
        <p className="sub">Do histórico diário gravado, no período escolhido no topo da página.</p>
        {dias.length === 0 ? (
          <p className="note" style={{ marginTop: 10 }}>Nenhum dia do período tem interações gravadas.</p>
        ) : (
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <div style={{ minWidth: Math.max(320, dias.length * 22) }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dias}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="var(--text-faint)" interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} stroke="var(--text-faint)" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Curtidas" stackId="i" fill="var(--accent)" />
                  <Bar dataKey="Comentários" stackId="i" fill="var(--ai, #8b7cf6)" />
                  <Bar dataKey="Salvamentos" stackId="i" fill="var(--good)" />
                  <Bar dataKey="Compartilhamentos" stackId="i" fill="var(--warn, #b7791f)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
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
  return (
    <div>
      <Leitura itens={leitura} />
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Quando os seguidores estão online</h2>
        <p className="sub">
          Média de seguidores online por dia da semana e hora, em horário de Brasília{a.horarios.ok ? `, nos últimos ${a.horarios.dados.dias} dias` : ""}. Cor mais forte, mais gente online.
        </p>
        <div style={{ marginTop: 12 }}>{mapa ? <MapaDeCalor mapa={mapa} /> : a.horarios.ok === false && <Falha b={a.horarios} />}</div>
      </div>
      {mapa && (
        <div className="hgrid two">
          <div className="card">
            <h2>Cinco melhores janelas</h2>
            <table className="t" style={{ marginTop: 8 }}>
              <thead>
                <tr><th className="l">Dia e hora</th><th>Seguidores online (média)</th></tr>
              </thead>
              <tbody>
                {janelas.map((j) => (
                  <tr key={`${j.dia}-${j.hora}`}>
                    <td className="l">{DIAS_SEMANA[j.dia]}, {j.hora}h</td>
                    <td>{fmtN(j.online)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Por hora do dia</h2>
            <p className="sub">Média dos sete dias da semana.</p>
            <div style={{ marginTop: 8 }}>
              <Barras
                total={0}
                itens={porHora.map((v, h) => ({ rotulo: `${h}h`, valor: v })).filter((_, h) => h >= 6)}
                formato={(v) => fmtN(v)}
              />
            </div>
          </div>
        </div>
      )}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>E os seus posts?</h2>
        <p className="sub">Engajamento mediano por hora de publicação, só horas com {3}+ posts no período ({/* período vem do topo da página */}escolhido no topo).</p>
        {posts.isLoading ? (
          <Carregando />
        ) : horasPosts.length === 0 ? (
          <p className="note" style={{ marginTop: 10 }}>Nenhuma hora tem 3 ou mais posts no período, então não dá para comparar horários dos posts com segurança.</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            <Barras total={0} itens={horasPosts.slice(0, 8).map((h) => ({ rotulo: `${h.hora}h (${h.posts} posts)`, valor: Math.round(h.mediana) }))} formato={(v) => fmtN(v)} cor="var(--ai, #8b7cf6)" />
          </div>
        )}
      </div>
    </div>
  );
}

function AudienciaPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
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

  const head = (
    <div className="hpagehead">
      <h2>Audiência</h2>
      <p>
        Quem segue, quem o conteúdo alcança, de onde vêm as visualizações e quando os seguidores estão online. Lido ao vivo da Meta; as abas
        Interações e Horários dos posts usam também o período do topo ({periodLabel}).
      </p>
      {temIg && (
        <div className="flex justify-end" style={{ marginTop: 8 }}>
          <button type="button" className="btn" onClick={() => aud.refetch()} disabled={aud.isFetching}>
            {aud.isFetching ? "Lendo da Meta…" : "Atualizar audiência"}
          </button>
        </div>
      )}
    </div>
  );

  if (fontes.isLoading) return <div>{head}<Carregando /></div>;
  if (fontes.error) return <div>{head}<ErroCarga texto="Não consegui verificar as fontes deste cliente. Atualize a página." /></div>;
  if (!temIg) return <div>{head}<SemFonte {...SEM_INSTAGRAM} /></div>;
  if (aud.isLoading) return <div>{head}<Carregando texto="Lendo a audiência na Meta…" /></div>;
  if (aud.error || !aud.data) return <div>{head}<ErroCarga texto="Falha ao ler a audiência. Tente de novo em instantes." /></div>;
  if (aud.data.nada_a_fazer) return <div>{head}<SemFonte titulo="Audiência indisponível" texto={aud.data.nada_a_fazer} quem="time Doctor Creator, gerando o token da Meta do cliente." /></div>;
  if (aud.data.erro || !aud.data.dados) return <div>{head}<ErroCarga texto={aud.data.erro ?? "A Meta não respondeu."} /></div>;
  const a = aud.data.dados;

  return (
    <div>
      {head}
      <div className="seg" role="tablist" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {ABAS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={aba === x.id} aria-pressed={aba === x.id} onClick={() => setAba(x.id)}>
            {x.rotulo}
          </button>
        ))}
      </div>
      {aba === "demografia" && <Demografia a={a} />}
      {aba === "alcance" && <Alcance a={a} />}
      {aba === "interacoes" && <Interacoes a={a} clientId={clientId} start={start} end={end} />}
      {aba === "horarios" && <Horarios a={a} clientId={clientId} start={start} end={end} />}
      <p className="note">
        Dados da Meta lidos em {new Date(a.gerado_em).toLocaleString("pt-BR")}. Alcance, visualizações e interações cobrem os últimos {a.periodo.dias} dias; a
        Meta não permite períodos maiores que 30 dias nestas métricas.
      </p>
    </div>
  );
}
