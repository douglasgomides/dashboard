import type { ReactNode } from "react";
import { brazilWeekdayAndHour } from "@/lib/report-metrics";
import { DIAS_CURTOS } from "@/lib/mapa-dos-posts";
import { dataDiaMes, numeroCurto, temaParaExibir } from "@/lib/texto-que-cabe";

/** O post da lista da tela: só os campos que o Top 5 mostra (todos medidos; o que falta vira "Falta dado", nunca 0). */
export interface PostDoTop5 {
  id: string;
  caption?: string | null;
  format?: string | null;
  tema?: string | null;
  reach?: number | null;
  saved?: number | null;
  media_follows?: number | null;
  posted_at?: string | null;
  permalink?: string | null;
}

const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");

/** Capa em degradê do piloto: Reels em escuro; estático e carrossel em azul; formato sem classificação em cinza. */
function capaDoFormato(f: string | null | undefined): { tipo: "reels" | "estatico" | "sem"; rotulo: string | null } {
  if (f === "reels") return { tipo: "reels", rotulo: "▶ Reels" };
  if (f === "estatico") return { tipo: "estatico", rotulo: "▣ Estático" };
  if (f === "carrossel") return { tipo: "estatico", rotulo: "▤ Carrossel" };
  return { tipo: "sem", rotulo: null };
}

/** "21/10 qua 18h", no dia e na hora de Brasília. Sem data: null (a tela diz "Falta dado"). */
function quandoPostou(iso: string | null | undefined): string | null {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return null;
  const { weekday, hour } = brazilWeekdayAndHour(iso);
  return `${dataDiaMes(iso)} ${DIAS_CURTOS[weekday].toLowerCase()} ${hour}h`;
}

const Falta = ({ rotulo }: { rotulo: string }) => (
  <span className="nx-top5__falta" data-falta-dado>
    {rotulo}: Falta dado
  </span>
);

/**
 * "Seus 5 posts que mais salvaram" à vista, entre as descobertas e o "Ver tudo" (piloto de 12/11/2026; João 13/11/2026: o Top 5 fica na tela
 * mesmo passando da régua de 1,5 tela). Cada cartão: capa em degradê com o formato e o lugar, os salvos como número grande, a legenda em 3
 * linhas (texto inteiro no title), o alcance, quantos seguiram, o tema e o dia. No celular a fileira rola de lado com encaixe; só ela rola.
 */
export function NxTop5Salvos({ posts, acao }: { posts: readonly PostDoTop5[]; acao?: ReactNode }) {
  return (
    <section id="top5-salvaram" className="nx-top5" data-peca="top5-salvaram" aria-labelledby="top5-salvaram-titulo">
      <div className="nx-top5__cabeca">
        <h2 id="top5-salvaram-titulo" className="nx-top5__titulo">
          Seus 5 posts que mais salvaram
        </h2>
        {posts.length > 1 && (
          <p className="nx-top5__dica" aria-hidden>
            Deslize →
          </p>
        )}
        {acao && <div className="nx-top5__acao">{acao}</div>}
      </div>
      {/* data-rola: no celular a fileira rola de lado de propósito (só ela; a página não). */}
      <ol className="nx-top5__lista" data-rola aria-label="Os posts, do que mais salvou para o que menos salvou">
        {posts.map((p, k) => {
          const capa = capaDoFormato(p.format);
          const legenda = (p.caption ?? "").trim();
          const tema = temaParaExibir(p.tema) ?? (p.tema?.trim() || null);
          const quando = quandoPostou(p.posted_at);
          const corpo = (
            <>
              <span className="nx-top5__capa" data-capa={capa.tipo}>
                {capa.rotulo ? <span className="nx-top5__fmt">{capa.rotulo}</span> : <span className="nx-top5__fmt nx-top5__fmt--falta">Formato: Falta dado</span>}
                <span className="nx-top5__pos">#{k + 1}</span>
              </span>
              <span className="nx-top5__corpo">
                {k === 0 && <span className="nx-top5__campeao">★ Campeão do período</span>}
                <span className="nx-top5__salvos">
                  <b>{fmtN(Number(p.saved))}</b> <small>salvos</small>
                </span>
                {legenda ? (
                  <span className="nx-top5__legenda" title={legenda}>
                    {legenda}
                  </span>
                ) : (
                  <span className="nx-top5__legenda">
                    <Falta rotulo="Legenda" />
                  </span>
                )}
                <span className="nx-top5__meta">
                  {p.reach != null ? <span>{numeroCurto(Number(p.reach))} pessoas alcançadas</span> : <Falta rotulo="Alcance" />}
                  {p.media_follows != null ? <span>+{fmtN(Number(p.media_follows))} seguiram</span> : <Falta rotulo="Seguiram" />}
                  <span>
                    {tema ?? <Falta rotulo="Tema" />} · {quando ?? <Falta rotulo="Dia" />}
                  </span>
                </span>
              </span>
            </>
          );
          const rotulo = `${k + 1}º lugar: ${fmtN(Number(p.saved))} salvos${capa.rotulo ? `, ${capa.rotulo.slice(2)}` : ""}`;
          return (
            <li key={p.id} className="nx-top5__item" data-formato={capa.tipo}>
              {p.permalink ? (
                <a className="nx-top5__post" href={p.permalink} target="_blank" rel="noreferrer" title={`${rotulo}. Abrir o post no Instagram`}>
                  {corpo}
                </a>
              ) : (
                <article className="nx-top5__post" aria-label={rotulo}>
                  {corpo}
                </article>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
