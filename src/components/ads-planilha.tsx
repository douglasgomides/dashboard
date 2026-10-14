import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, FileSpreadsheet, Info, Layers, MessageCircle, UserPlus, Wallet } from "lucide-react";
import { Ajuda, Kpi, Painel, Selo } from "@/components/visual";
import { fmtBRL, fmtNum } from "@/lib/format";
import type { AdsPlanilhaLinha } from "@/lib/client-data";

// Impulsionamentos lidos da planilha do gestor de tráfego. Existe enquanto a conta de anúncios do cliente não é lida
// pela Meta nem pela Windsor. A planilha é SEMANAL e tem uma linha por post em cada análise: por isso o painel mostra
// gasto por semana de análise, nunca por dia, e não tem impressões, cliques nem CTR (a planilha não traz).

const dd = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

interface Semana {
  dia: string;
  gasto: number | null; // null quando nenhuma linha da semana tem valor (semana sem dado, não semana de R$ 0)
  semValor: number;
  linhas: AdsPlanilhaLinha[];
}

function agruparSemanas(linhas: AdsPlanilhaLinha[]): Semana[] {
  const mapa = new Map<string, AdsPlanilhaLinha[]>();
  for (const l of linhas) mapa.set(l.analise_em, [...(mapa.get(l.analise_em) ?? []), l]);
  return [...mapa.entries()]
    .map(([dia, ls]) => {
      const comValor = ls.filter((l) => l.valor_periodo != null);
      return {
        dia,
        gasto: comValor.length ? comValor.reduce((a, l) => a + (l.valor_periodo ?? 0), 0) : null,
        semValor: ls.length - comValor.length,
        linhas: ls,
      };
    })
    .sort((a, b) => (a.dia < b.dia ? -1 : 1));
}

function razao(gasto: number, resultado: number): string {
  return resultado > 0 ? fmtBRL(gasto / resultado) : "—";
}

interface PostAcumulado {
  post_url: string;
  nome: string | null;
  tipo: string | null;
  desativado: boolean;
  total: number | null;
  de: string;
  dataNoFuturo: boolean;
}

// Uma linha por post com o último "Valor Investido Total" conhecido. Entram TODOS os posts da planilha, inclusive os
// que só aparecem no bloco de data inválida ("30/12/2026"): para esses vale o valor dali, marcado como data inválida.
function acumuladoPorPost(linhas: AdsPlanilhaLinha[], hoje: string): PostAcumulado[] {
  const porPost = new Map<string, AdsPlanilhaLinha[]>();
  for (const l of linhas) porPost.set(l.post_url, [...(porPost.get(l.post_url) ?? []), l]);
  const out: PostAcumulado[] = [];
  for (const [url, ls] of porPost) {
    const validas = ls.filter((l) => l.analise_em <= hoje).sort((a, b) => (a.analise_em < b.analise_em ? 1 : -1));
    const futuras = ls.filter((l) => l.analise_em > hoje);
    const comTotal = validas.find((l) => l.valor_total != null);
    const base = comTotal ?? futuras.find((l) => l.valor_total != null) ?? validas[0] ?? futuras[0];
    const recente = validas[0] ?? futuras[0];
    out.push({
      post_url: url,
      nome: base.nome ?? recente.nome,
      tipo: recente.tipo,
      desativado: /desativ/i.test(recente.status ?? ""),
      total: base.valor_total,
      de: base.analise_em,
      dataNoFuturo: base.analise_em > hoje,
    });
  }
  return out.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
}

export function AdsPlanilhaPainel({ linhas: todas, start, end }: { linhas: AdsPlanilhaLinha[]; start: string; end: string }) {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  // A planilha tem um bloco com data no futuro (30/12/2026, acumulados): fica fora das semanas de análise.
  const linhas = useMemo(() => todas.filter((l) => l.analise_em <= hoje), [todas, hoje]);
  const acumulado = useMemo(() => acumuladoPorPost(todas, hoje), [todas, hoje]);
  const semanas = useMemo(() => agruparSemanas(linhas), [linhas]);
  const validas = semanas.filter((s) => s.gasto != null);
  const noPeriodo = validas.filter((s) => s.dia >= start && s.dia <= end);
  const ultima = validas[validas.length - 1] ?? null;

  const linhasPeriodo = noPeriodo.flatMap((s) => s.linhas);
  const gasto = noPeriodo.reduce((a, s) => a + (s.gasto ?? 0), 0);
  const seguidores = linhasPeriodo.reduce((a, l) => a + (l.seguidores_periodo ?? 0), 0);
  const gastoComSeguidor = linhasPeriodo.filter((l) => l.seguidores_periodo != null).reduce((a, l) => a + (l.valor_periodo ?? 0), 0);
  const mensagens = linhasPeriodo.reduce((a, l) => a + (l.mensagens_periodo ?? 0), 0);
  const gastoComMensagem = linhasPeriodo.filter((l) => l.mensagens_periodo != null).reduce((a, l) => a + (l.valor_periodo ?? 0), 0);

  const serie = validas.slice(-14).map((s) => ({ dia: dd(s.dia), gasto: s.gasto ?? 0, incompleta: s.semValor > 0 }));

  const postsUltima = ultima
    ? [...ultima.linhas].filter((l) => (l.valor_periodo ?? 0) > 0).sort((a, b) => (b.valor_periodo ?? 0) - (a.valor_periodo ?? 0))
    : [];

  return (
    <div className="space-y-4">
      <div
        className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm"
        style={{ background: "color-mix(in srgb, var(--warn) 12%, transparent)", borderColor: "var(--border)" }}
      >
        <FileSpreadsheet size={16} aria-hidden className="shrink-0" style={{ color: "var(--warn)" }} />
        <div className="min-w-0 flex-1">
          <b>Fonte: planilha do gestor de tráfego, atualizada a cada análise semanal.</b>{" "}
          <span style={{ color: "var(--text-dim)" }}>
            Não é a conta de anúncios da Meta. O valor é por semana de análise, não por dia.
            {ultima ? ` Última análise com valores: ${ddmmaaaa(ultima.dia)}.` : ""}
          </span>
        </div>
        <Ajuda>
          Os impulsionamentos desta cliente correm numa conta de anúncios que ainda não está ligada ao dashboard. Enquanto isso, os números vêm da
          planilha do gestor: gasto de cada post no período entre duas análises, seguidores e mensagens que ele anotou. A planilha não traz
          impressões, cliques nem CTR. Valores negativos, datas no futuro e ganhos de seguidores que não fecham com "antes" e "depois" são
          descartados, em vez de aparecerem na tela. Todos os posts da planilha aparecem no quadro de acumulado, ao fim da página.
        </Ajuda>
      </div>

      {noPeriodo.length === 0 ? (
        <div className="rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
          <Info size={14} className="mr-1.5 inline" aria-hidden />
          Nenhuma análise da planilha caiu em {ddmmaaaa(start)} a {ddmmaaaa(end)}. Amplie o período para ver as semanas abaixo.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi
            icone={Wallet}
            rotulo="Investido"
            valor={fmtBRL(gasto)}
            dica={`${noPeriodo.length} ${noPeriodo.length === 1 ? "semana analisada" : "semanas analisadas"}`}
            cor="var(--s1)"
          />
          <Kpi
            icone={UserPlus}
            rotulo="Seguidores ganhos"
            valor={fmtNum(seguidores)}
            dica={`Custo por seguidor ${razao(gastoComSeguidor, seguidores)}`}
            cor="var(--good)"
          />
          <Kpi
            icone={MessageCircle}
            rotulo="Mensagens"
            valor={fmtNum(mensagens)}
            dica={`Custo por mensagem ${razao(gastoComMensagem, mensagens)}`}
            cor="var(--accent)"
          />
        </div>
      )}

      {serie.length > 0 && (
        <Painel
          icone={Wallet}
          titulo="Investimento por semana de análise"
          resumo="Cada barra é o gasto entre uma análise e a anterior"
          cor="var(--s1)"
          ajuda={<>Barras mais claras marcam análises em que alguma linha estava sem valor na planilha: o total dessa semana pode estar menor que o real.</>}
        >
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: "var(--text-dim)", fontSize: 11 }} stroke="var(--border)" />
                <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} stroke="var(--border)" tickFormatter={(v) => `R$ ${fmtNum(Number(v))}`} width={72} />
                <Tooltip
                  formatter={(v) => [fmtBRL(Number(v)), "Investido"]}
                  labelFormatter={(l) => `Análise de ${l}`}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                />
                <Bar
                  dataKey="gasto"
                  fill="var(--s1)"
                  radius={[4, 4, 0, 0]}
                  shape={(p: { x?: number; y?: number; width?: number; height?: number; payload?: { incompleta?: boolean } }) => (
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.width}
                      height={p.height}
                      rx={4}
                      fill="var(--s1)"
                      fillOpacity={p.payload?.incompleta ? 0.4 : 1}
                    />
                  )}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Painel>
      )}

      {ultima && postsUltima.length > 0 && (
        <Painel
          icone={FileSpreadsheet}
          titulo={`Posts impulsionados na análise de ${ddmmaaaa(ultima.dia)}`}
          resumo={`${postsUltima.length} posts com gasto no período`}
          cor="var(--accent)"
          ajuda={
            <>
              C1 é post para ganhar seguidores; C2 é post para gerar mensagem. "Manter" e "Parar" são a decisão que o gestor registrou na
              planilha, não uma classificação do dashboard.
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                  <th className="py-1.5 pr-3 font-medium">Post</th>
                  <th className="py-1.5 pr-3 font-medium">Tipo</th>
                  <th className="py-1.5 pr-3 font-medium">Decisão</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Gasto</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Resultado</th>
                  <th className="py-1.5 text-right font-medium">Custo</th>
                </tr>
              </thead>
              <tbody>
                {postsUltima.map((l) => {
                  const ehMsg = l.tipo === "C2";
                  const res = ehMsg ? l.mensagens_periodo : l.seguidores_periodo;
                  const custo = ehMsg ? l.custo_mensagem : l.custo_seguidor;
                  const parar = (l.acao ?? "").toUpperCase().includes("PARAR");
                  return (
                    <tr key={l.post_url} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="max-w-[320px] py-2 pr-3">
                        <a href={l.post_url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 hover:underline">
                          <span className="line-clamp-2">{l.nome ?? l.post_url}</span>
                          <ExternalLink size={12} className="mt-1 shrink-0" aria-hidden />
                        </a>
                      </td>
                      <td className="py-2 pr-3">
                        <Selo titulo={ehMsg ? "Gerar mensagens" : "Ganhar seguidores"}>{l.tipo ?? "—"}</Selo>
                      </td>
                      <td className="py-2 pr-3">
                        <Selo cor={parar ? "var(--danger)" : "var(--good)"}>{l.acao ?? "—"}</Selo>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtBRL(l.valor_periodo ?? 0)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {res == null ? "—" : `${fmtNum(res)} ${ehMsg ? "msgs" : "seg."}`}
                      </td>
                      <td className="py-2 text-right tabular-nums">{custo == null ? "—" : fmtBRL(custo)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Painel>
      )}
      {acumulado.length > 0 && (
        <Painel
          icone={Layers}
          titulo="Investimento acumulado por post"
          resumo={`${acumulado.length} posts na planilha · ${fmtBRL(acumulado.reduce((a, p) => a + (p.total ?? 0), 0))} somados`}
          cor="var(--s2)"
          ajuda={
            <>
              Último "Valor Investido Total" que a planilha registra de cada post, de todas as análises. Posts marcados com data inválida só
              aparecem no bloco da planilha datado de 30/12/2026, que está no futuro: o valor está lá, mas não dá para dizer até quando vale.
              Posts sem valor ficam com "—" em vez de R$ 0.
            </>
          }
        >
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                  <th className="py-1.5 pr-3 font-medium">Post</th>
                  <th className="py-1.5 pr-3 font-medium">Tipo</th>
                  <th className="py-1.5 pr-3 font-medium">Situação</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Investido acumulado</th>
                  <th className="py-1.5 text-right font-medium">Valor de</th>
                </tr>
              </thead>
              <tbody>
                {acumulado.map((p) => (
                  <tr key={p.post_url} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="max-w-[320px] py-2 pr-3">
                      <a href={p.post_url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 hover:underline">
                        <span className="line-clamp-2">{p.nome ?? p.post_url}</span>
                        <ExternalLink size={12} className="mt-1 shrink-0" aria-hidden />
                      </a>
                    </td>
                    <td className="py-2 pr-3">
                      <Selo>{p.tipo ?? "—"}</Selo>
                    </td>
                    <td className="py-2 pr-3">
                      <Selo cor={p.desativado ? "var(--muted)" : "var(--good)"}>{p.desativado ? "Desativado" : "Ativo"}</Selo>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.total == null ? "—" : fmtBRL(p.total)}</td>
                    <td className="py-2 text-right text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>
                      {p.dataNoFuturo ? `${ddmmaaaa(p.de)} (data inválida na planilha)` : ddmmaaaa(p.de)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      )}
    </div>
  );
}
