import { Fragment, useId, useMemo, useState } from "react";
import type { GroupStat } from "@/lib/hub-conteudo";
import { MIN_POSTS_DO_FORMATO, formatosComAmostra, type FraseDoFormato } from "@/lib/leitura/cinco-instagram";
import { DIAS_CURTOS, FRASE_SEM_MELHOR_HORARIO, MIN_POSTS_NO_HORARIO, ORDEM_DOS_DIAS, fraseDaCelula, horasDoMapa, nomeDoHorario, type CelulaDoMapa } from "@/lib/mapa-dos-posts";
import { numeroCurto, temaParaExibir } from "@/lib/texto-que-cabe";
import { NxCard } from "./base";
import { IgAbas } from "./instagram";
import "@/styles/nexo-o-que-funciona.css";

// "O que funciona no seu Instagram" (Phase 03.1.1.1, plano 07, D-01): o cartão de prova de Instagram > Desempenho, com 3 abas (Formato, Horário e
// Tema) sobre os PRÓPRIOS posts da clínica (D-02: nenhuma comparação com outras clínicas). Só apresentação: a regra (cinco-instagram.ts e
// mapa-dos-posts.ts) já calculou tudo, nenhuma peça busca, grava ou envia (CHAM-07), e todo texto sai como texto do React (nunca HTML).
// D-05: o ★ e a palavra "melhor" só aparecem onde a amostra mínima sustenta; sem dado a peça diz "Falta dado". Só tokens de nexo-system.css.

export type AbaDaProva = "formato" | "horario" | "tema";

const ABAS: { id: AbaDaProva; rotulo: string }[] = [
  { id: "formato", rotulo: "Formato" },
  { id: "horario", rotulo: "Horário" },
  { id: "tema", rotulo: "Tema" },
];
const SUBTITULO: Record<AbaDaProva, string> = {
  formato: "Salvos por post e quantos posts de cada formato você publicou.",
  horario: "Alcance médio por post, por dia e hora da publicação.",
  tema: "Salvos por post de cada tema.",
};

/** Quantos temas aparecem à vista (os outros ficam na tabela do "Ver tudo"): a régua de 1,5 tela não deixa listar todos. */
const MAXIMO_DE_TEMAS = 5;

export interface NxOQueFuncionaProps {
  /** Formatos do período (analyzeFormatsAndTemas.porFormato). */
  formatos: readonly GroupStat[];
  /** Temas do período (analyzeFormatsAndTemas.porTema). */
  temas: readonly GroupStat[];
  /** O mapa dos próprios posts (mapaDosPosts). */
  mapa: readonly CelulaDoMapa[];
  /** A melhor célula, só com a amostra mínima (melhorHorario). null = nenhuma com posts suficientes. */
  melhor: CelulaDoMapa | null;
  fraseFormato: FraseDoFormato;
  /** A aba escolhida. Sem ela a peça guarda a escolha sozinha. */
  aba?: AbaDaProva;
  aoTrocarAba?: (aba: AbaDaProva) => void;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
/** Salvos por post em número inteiro ("342 salvos", nunca "341,8 salvos": o decimal de uma média não ajuda a decidir). */
const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
/** "9,4 mil" vira "9,4k" para caber na célula. */
const curtinho = (n: number) => numeroCurto(n).replace(" mil", "k").replace(" mi", "M");

export function NxOQueFunciona({ formatos, temas, mapa, melhor, fraseFormato, aba, aoTrocarAba }: NxOQueFuncionaProps) {
  const [propria, setPropria] = useState<AbaDaProva>("formato");
  const ativa = aba ?? propria;
  const trocar = (a: AbaDaProva) => {
    setPropria(a);
    aoTrocarAba?.(a);
  };
  return (
    <NxCard id="o-que-funciona" nivel={2} titulo="O que funciona no seu Instagram" subtitulo={SUBTITULO[ativa]} className="nx-funciona">
      <div className="nx-funciona__abas" data-peca="o-que-funciona">
        <IgAbas rotulo="O que funciona: formato, horário ou tema" ativa={ativa} onTrocar={trocar} abas={ABAS} />
      </div>
      <div className="nx-funciona__painel" role="tabpanel" aria-label={ABAS.find((a) => a.id === ativa)?.rotulo} data-aba-ativa={ativa}>
        {ativa === "formato" ? <PainelDeFormato formatos={formatos} frase={fraseFormato} /> : ativa === "horario" ? <PainelDeHorario mapa={mapa} melhor={melhor} /> : <PainelDeTema temas={temas} />}
      </div>
    </NxCard>
  );
}

// ---------- Formato ----------

/** Uma barra: rótulo, a barra proporcional à maior da coluna e o número. A barra nunca é a única forma do número. */
function Barra({ rotulo, valor, maximo, texto, destaque, nota, soEstreito }: { rotulo: string; valor: number; maximo: number; texto: string; destaque?: boolean; nota?: string; soEstreito?: string }) {
  return (
    <li className="nx-funciona__barra" data-destaque={destaque ? "" : undefined}>
      <span className="nx-funciona__rotulo" title={rotulo}>
        {rotulo}
      </span>
      <span className="nx-funciona__trilho" aria-hidden>
        <i style={{ width: `${Math.max(3, Math.min(100, maximo > 0 ? (valor / maximo) * 100 : 0))}%` }} />
      </span>
      <span className="nx-funciona__valor">
        {texto}
        {nota && <small className="nx-funciona__so-largo">{nota}</small>}
        {/* Celular: a coluna "Quantos você postou" some e a contagem vem aqui, junto do número de salvos (nada deixa de aparecer). */}
        {soEstreito && <small className="nx-funciona__so-estreito">{soEstreito}</small>}
      </span>
    </li>
  );
}

function PainelDeFormato({ formatos, frase }: { formatos: readonly GroupStat[]; frase: FraseDoFormato }) {
  const lista = formatos.filter((f) => f.key !== "não classificado");
  if (lista.length === 0) return <p className="nx-cinco-falta" data-falta-dado>{"Falta dado: nenhum post do período tem formato informado."}</p>;
  const comAmostra = formatosComAmostra({ porFormato: lista as GroupStat[] });
  // O destaque de "quem mais salva" só existe com pelo menos 2 formatos com amostra (D-05).
  const lider = comAmostra.length >= 2 ? [...comAmostra].sort((a, b) => b.savedMean - a.savedMean)[0]?.key : undefined;
  const maisPostado = comAmostra.length >= 2 ? [...comAmostra].sort((a, b) => b.count - a.count)[0]?.key : undefined;
  const maxSalvos = Math.max(0, ...lista.map((f) => f.savedMean));
  const maxPosts = Math.max(0, ...lista.map((f) => f.count));
  return (
    <>
      <div className="nx-funciona__colunas">
        <section aria-label="Salvos por post">
          <h3 className="nx-funciona__coluna">Salvos por post</h3>
          <ul className="nx-funciona__barras">
            {lista.map((f) => (
              <Barra key={f.key} rotulo={f.label} valor={f.savedMean} maximo={maxSalvos} texto={`${inteiro(f.savedMean)} salvos`} destaque={f.key === lider} nota={f.count < MIN_POSTS_DO_FORMATO ? "poucos posts" : undefined} soEstreito={`${fmt(f.count)} ${f.count === 1 ? "post" : "posts"}${f.count < MIN_POSTS_DO_FORMATO ? " · poucos posts" : ""}`} />
            ))}
          </ul>
        </section>
        <section aria-label="Quantos você postou" className="nx-funciona__coluna-postou">
          <h3 className="nx-funciona__coluna">Quantos você postou</h3>
          <ul className="nx-funciona__barras" data-tom="postou">
            {lista.map((f) => (
              <Barra key={f.key} rotulo={f.label} valor={f.count} maximo={maxPosts} texto={`${fmt(f.count)} ${f.count === 1 ? "post" : "posts"}`} destaque={f.key === maisPostado && f.key !== lider} />
            ))}
          </ul>
        </section>
      </div>
      <p className="nx-funciona__frase" data-tipo={frase.tipo}>
        {frase.frase}
      </p>
    </>
  );
}

// ---------- Horário ----------

function PainelDeHorario({ mapa, melhor }: { mapa: readonly CelulaDoMapa[]; melhor: CelulaDoMapa | null }) {
  const [escolhida, setEscolhida] = useState<CelulaDoMapa | null>(null);
  const horas = useMemo(() => horasDoMapa(mapa), [mapa]);
  const porChave = useMemo(() => new Map(mapa.map((c) => [`${c.dia}-${c.hora}`, c])), [mapa]);
  const maximo = useMemo(() => Math.max(0, ...mapa.map((c) => c.alcancePorPost)), [mapa]);
  const idDaFrase = useId();
  if (mapa.length === 0) return <p className="nx-cinco-falta" data-falta-dado>{"Falta dado: nenhum post do período tem alcance medido."}</p>;
  const ehMelhor = (c: CelulaDoMapa) => !!melhor && c.dia === melhor.dia && c.hora === melhor.hora;
  const intensidade = (c: CelulaDoMapa) => (maximo > 0 ? Math.round(Math.max(12, Math.pow(c.alcancePorPost / maximo, 0.55) * 100)) : 12);
  const frase = escolhida ? fraseDaCelula(escolhida, melhor) : melhor ? `★ ${nomeDoHorario(melhor)} é seu melhor horário: ${numeroCurto(melhor.alcancePorPost)} pessoas por post.` : FRASE_SEM_MELHOR_HORARIO;
  return (
    <div className="nx-mapa-posts" data-peca="mapa-dos-posts">
      <div className="nx-mapa-posts__rola" data-rola tabIndex={0} role="group" aria-label="Mapa de horários dos seus posts, de segunda a domingo">
        <div className="nx-mapa-posts__grade" style={{ ["--colunas" as string]: horas.length }}>
          <span aria-hidden />
          {horas.map((h, k) => (
            <span key={h} className="nx-mapa-posts__hora" data-impar={k % 2 === 1 ? "" : undefined} aria-hidden>
              {h}h
            </span>
          ))}
          {ORDEM_DOS_DIAS.map((d) => (
            <Fragment key={d}>
              <span className="nx-mapa-posts__dia">{DIAS_CURTOS[d]}</span>
              {horas.map((h) => {
                const c = porChave.get(`${d}-${h}`);
                if (!c) {
                  return (
                    <span key={h} className="nx-mapa-posts__vazio" title={`${nomeDoHorario({ dia: d, hora: h })}: sem post`}>
                      ·
                    </span>
                  );
                }
                const star = ehMelhor(c);
                const rotulo = `${nomeDoHorario(c)}: ${numeroCurto(c.alcancePorPost)} pessoas por post, ${c.posts} ${c.posts === 1 ? "post" : "posts"}${star ? ", melhor horário" : ""}${c.posts < MIN_POSTS_NO_HORARIO ? ", pouco para comparar" : ""}`;
                return (
                  <button
                    key={h}
                    type="button"
                    className="nx-mapa-posts__celula"
                    style={{ ["--nx-i" as string]: intensidade(c) }}
                    data-posts={c.posts}
                    data-poucos={c.posts < MIN_POSTS_NO_HORARIO ? "" : undefined}
                    data-forte={intensidade(c) >= 80 ? "" : undefined}
                    data-melhor={star ? "" : undefined}
                    aria-pressed={escolhida?.dia === c.dia && escolhida?.hora === c.hora}
                    aria-label={rotulo}
                    aria-describedby={idDaFrase}
                    onClick={() => setEscolhida(c)}
                  >
                    <span className="nx-mapa-posts__numero">{curtinho(c.alcancePorPost)}</span>
                    {star && (
                      <span className="nx-mapa-posts__estrela" aria-hidden>
                        ★
                      </span>
                    )}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="nx-mapa-posts__legenda">
        <span>Menos alcance</span>
        <span className="nx-mapa-posts__escala" aria-hidden>
          <i style={{ ["--nx-i" as string]: 15 }} />
          <i style={{ ["--nx-i" as string]: 50 }} />
          <i style={{ ["--nx-i" as string]: 100 }} />
        </span>
        <span>Mais alcance</span>
        {melhor && <span>★ melhor</span>}
        <span>{"“·” sem post"}</span>
        <span className="nx-mapa-posts__chave-poucos">borda tracejada: só 1 post</span>
      </p>
      <p id={idDaFrase} className="nx-mapa-posts__frase" aria-live="polite" data-peca="frase-do-horario">
        {frase}
      </p>
    </div>
  );
}

// ---------- Tema ----------

function PainelDeTema({ temas }: { temas: readonly GroupStat[] }) {
  const ordenados = useMemo(() => [...temas].sort((a, b) => b.savedMean - a.savedMean), [temas]);
  if (ordenados.length === 0) return <p className="nx-cinco-falta" data-falta-dado>{"Falta dado: nenhum post do período tem tema classificado."}</p>;
  const elegiveis = ordenados.filter((t) => t.count >= MIN_POSTS_DO_FORMATO);
  // O tema campeão só existe com pelo menos 2 temas com amostra (D-05): um tema sozinho não é "o melhor".
  const campeao = elegiveis.length >= 2 ? elegiveis[0].key : undefined;
  const visiveis = ordenados.slice(0, MAXIMO_DE_TEMAS);
  const maximo = Math.max(0, ...visiveis.map((t) => t.savedMean));
  return (
    <>
      <ul className="nx-funciona__barras nx-funciona__temas">
        {visiveis.map((t) => {
          const nome = temaParaExibir(t.key) ?? t.key;
          return (
            <li key={t.key} className="nx-funciona__tema" data-destaque={t.key === campeao ? "" : undefined}>
              <span className="nx-funciona__rotulo" title={nome}>
                {nome}
                <small>{`${t.count} ${t.count === 1 ? "post" : "posts"} · ${numeroCurto(t.reachMean)} pessoas por post${t.count < MIN_POSTS_DO_FORMATO ? " · poucos posts" : ""}`}</small>
              </span>
              <span className="nx-funciona__trilho" aria-hidden>
                <i style={{ width: `${Math.max(3, Math.min(100, maximo > 0 ? (t.savedMean / maximo) * 100 : 0))}%` }} />
              </span>
              <span className="nx-funciona__valor">{inteiro(t.savedMean)}</span>
            </li>
          );
        })}
      </ul>
      <p className="nx-cinco-falta">Número da direita: salvos por post, em média.</p>
      {/* Celular: só os 3 primeiros temas ficam à vista (a régua de 1,5 tela); todos os outros estão na tabela do "Ver tudo". */}
      {visiveis.length > 3 && <p className="nx-cinco-falta nx-funciona__so-estreito">{`Mais ${visiveis.length - 3} ${visiveis.length - 3 === 1 ? "tema" : "temas"} na tabela do "Ver tudo".`}</p>}
    </>
  );
}
