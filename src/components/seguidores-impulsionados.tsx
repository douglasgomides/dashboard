import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { NxCard } from "@/components/nx/base";
import { NxColunas } from "@/components/nx/graficos";
import { NxBarrasLinha } from "@/components/nx/anuncios-graficos";
import { NxAviso, NxCarregando, NxErro, NxRecolhido, NxTabela } from "@/components/nx/blocos";
import { getAdsCampanhasPeriodo, getMonthlyMetrics, getPostsParaImpulsionados } from "@/lib/client-data";
import { ehImpulsionamento, postsImpulsionados, seguidoresPorSemana, type DiaSeguidores } from "@/lib/seguidores-semana";
import { somarDias } from "@/lib/sap-metas";
import { fmtBRL } from "@/lib/format";

const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtGasto = (n: number) => fmtBRL(n);
const TITULO_GRAFICO = { margin: "0 0 6px", fontSize: 14, lineHeight: "20px", fontWeight: 600, color: "var(--text-2)" } as const;

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

  // Semana sem dado (a Meta não informa) não vira zero no gráfico: fica só na tabela.
  const comNovos = (semanas ?? []).filter((s) => s.novos !== null);
  const comSaidas = (semanas ?? []).filter((s) => s.perderam !== null);
  const linhas = (semanas ?? []).map((s) => ({
    semana: (
      <>
        {ddmm(s.semana)} a {ddmm(somarDias(s.semana, 6))}
        {!s.completa && <span style={{ marginLeft: 4, fontSize: 13, color: "var(--muted-ink)" }}>({s.dias} dia{s.dias === 1 ? "" : "s"})</span>}
      </>
    ),
    novos: s.novos === null ? <SemDado /> : fmtN(s.novos),
    perderam: s.perderam === null ? <SemDado /> : fmtN(s.perderam),
    saldo: s.saldo === null ? <SemDado /> : <span style={{ color: s.saldo < 0 ? "var(--dn-ink)" : "var(--up-ink)" }}>{`${s.saldo > 0 ? "+" : ""}${fmtN(s.saldo)}`}</span>,
    gasto: s.gastoImpulsionamento > 0 ? fmtBRL(s.gastoImpulsionamento) : "—",
  }));
  const colunas = [
    { chave: "semana", titulo: "Semana" },
    { chave: "novos", titulo: "Novos", numerica: true },
    { chave: "perderam", titulo: "Deixaram de seguir", numerica: true },
    { chave: "saldo", titulo: "Saldo", numerica: true },
    ...(temGasto ? [{ chave: "gasto", titulo: "Gasto em impulsionamento", numerica: true }] : []),
  ];

  return (
    <NxCard rotulo="Seguidores por semana" titulo="Seguidores por semana" subtitulo={temGasto ? "Com o gasto em post impulsionado da mesma semana" : "Novos, saídas e saldo"}>
      <NxRecolhido titulo="Como ler este quadro">
        <p style={{ margin: 0, fontSize: 14, lineHeight: "20px" }}>{ajuda}</p>
      </NxRecolhido>
      {metricas.isLoading ? (
        <NxCarregando linhas={2} />
      ) : metricas.isError ? (
        <NxErro texto="Não foi possível carregar os seguidores agora." />
      ) : !semanas?.length ? (
        <NxAviso tom="info" titulo="Nenhum dia do período tem dado de seguidores." />
      ) : (
        <>
          {semanas.length >= 2 && comNovos.length >= 2 && (
            <div>
              <p style={TITULO_GRAFICO}>{temGasto ? "Seguidores novos e gasto em impulsionamento por semana" : "Seguidores novos por semana"}</p>
              {temGasto ? (
                <NxBarrasLinha
                  dados={comNovos.map((s) => ({ dia: s.semana, barra: s.novos ?? 0, linha: s.gastoImpulsionamento }))}
                  rotulo="Seguidores novos e gasto em impulsionamento por semana"
                  nomeBarra="Novos"
                  nomeLinha="Impulsionamento"
                  formatarBarra={fmtN}
                  formatarLinha={fmtGasto}
                  formatarData={ddmm}
                  altura={200}
                />
              ) : (
                <NxColunas dados={comNovos.map((s) => ({ rotulo: ddmm(s.semana), valor: s.novos ?? 0, texto: fmtN(s.novos ?? 0) }))} formatarEixo={fmtN} rotulo="Seguidores novos por semana" />
              )}
            </div>
          )}
          {comSaidas.length >= 2 && (
            <div>
              <p style={TITULO_GRAFICO}>Quem deixou de seguir por semana</p>
              <NxColunas dados={comSaidas.map((s) => ({ rotulo: ddmm(s.semana), valor: s.perderam ?? 0, texto: fmtN(s.perderam ?? 0) }))} formatarEixo={fmtN} rotulo="Quem deixou de seguir por semana" />
            </div>
          )}
          <NxTabela rotulo="Tabela de seguidores por semana" colunas={colunas} linhas={linhas} chaveDaLinha={(_, k) => semanas[k].semana} />
        </>
      )}
    </NxCard>
  );
}

function SemDado() {
  return <span style={{ color: "var(--muted-ink)" }}>sem dado</span>;
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
  const linhasPosts = lista.map((i) => ({
    post: (
      <div style={{ display: "flex", gap: 8, maxWidth: 340 }}>
        {i.post?.thumbnail_url && <img src={i.post.thumbnail_url} alt="" width={36} height={36} style={{ width: 36, height: 36, flex: "none", borderRadius: 6, objectFit: "cover" }} loading="lazy" />}
        <div style={{ minWidth: 0 }}>
          {i.post ? (
            i.post.permalink ? (
              <a href={i.post.permalink} target="_blank" rel="noreferrer" style={{ color: "var(--text)", textDecoration: "underline" }}>
                {i.post.caption}
              </a>
            ) : (
              <span>{i.post.caption}</span>
            )
          ) : (
            <span>{i.campanha}</span>
          )}
          <div style={{ fontSize: 13, color: "var(--muted-ink)" }}>
            {i.post ? `Publicado em ${ddmm(i.post.posted_at.slice(0, 10))}` : "Post não encontrado nos posts sincronizados"}
            {i.primeiroDia && ` · impulsionado ${ddmm(i.primeiroDia)}${i.ultimoDia && i.ultimoDia !== i.primeiroDia ? ` a ${ddmm(i.ultimoDia)}` : ""}`}
          </div>
        </div>
      </div>
    ),
    alcance: i.alcanceOrganico === null ? <SemDado /> : fmtN(i.alcanceOrganico),
    gasto: fmtBRL(i.gasto),
    impressoes: fmtN(i.impressoes),
    cliques: fmtN(i.cliques),
    custo: i.custoPorMilImpressoes === null ? "—" : fmtBRL(i.custoPorMilImpressoes),
  }));
  return (
    <NxCard rotulo="Posts impulsionados" titulo="Posts impulsionados" subtitulo="Orgânico do post × o que o impulsionamento comprou">
      <NxRecolhido titulo="Como ler este quadro">
        <p style={{ margin: 0, fontSize: 14, lineHeight: "20px" }}>{ajuda}</p>
      </NxRecolhido>
      {posts.isLoading ? (
        <NxCarregando linhas={2} />
      ) : posts.isError ? (
        <NxErro texto="Não foi possível carregar os posts agora." />
      ) : (
        <NxTabela
          rotulo="Tabela de posts impulsionados"
          colunas={[
            { chave: "post", titulo: "Post" },
            { chave: "alcance", titulo: "Alcance do post", numerica: true },
            { chave: "gasto", titulo: "Gasto", numerica: true },
            { chave: "impressoes", titulo: "Impressões pagas", numerica: true },
            { chave: "cliques", titulo: "Cliques", numerica: true },
            { chave: "custo", titulo: "Custo por mil", numerica: true },
          ]}
          linhas={linhasPosts}
          chaveDaLinha={(_, k) => lista[k].campaign_id}
        />
      )}
    </NxCard>
  );
}
