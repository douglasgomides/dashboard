// A leitura do período vira descoberta (quick-ver-tudo, João 13/11/2026: "essa leitura do período eu não to gostando... muito pequeno,
// muita informação pra ler e não passa nada de informação"). O bloco "Leitura do período" (O que aconteceu / Por quê / Próximo passo /
// Ver mais) sai do "Ver tudo" de toda tela no formato 5 segundos. Cada fato dele que o topo (veredito, 3 números, a prova e as
// descobertas) ainda não diz vira um cartão de descoberta, no mesmo desenho das de cima: selo, frase curta com o número em destaque,
// UMA ação e "Por quê?" com barras. O próximo passo vira a ação do fato que ele resolve; os passos do "Ver mais" viram mais descobertas.
// O que o topo já diz não volta (nada repetido); o que só a leitura dizia nunca some (MEDV-02). Módulo puro: sem React, banco ou rede.
import { DESCOBERTAS_A_VISTA, barrasDoPorque, caberEm90, checarDescoberta, checarFraseCinco, type AcaoDaDescoberta, type Descoberta } from "./cinco-segundos";
import { frasePasso, montarTexto, rotuloPeriodo } from "./texto";
import type { BarraDoFato, Fato, FatosDaTela, LinhaTexto, PassoFato, PassoTexto, TextoDoResumo, TomFato } from "./tipos";

/**
 * O período da leitura numa linha ("15/10 a 13/11, comparado com 15/09 a 14/10"), que a leitura mostrava no topo dela: agora mora uma
 * vez só, pequeno, no começo do "Ver tudo". null sem fatos.
 */
export function periodoDoVerTudo(fatos: FatosDaTela | null | undefined): string | null {
  return fatos ? rotuloPeriodo(fatos.periodo) : null;
}

/** Muda quando uma regra desta conversão muda. */
export const VERSAO_REGRAS_LEITURA_EM_DESCOBERTAS = 1;

/** Ação local que toda tela entende: abre o "Ver tudo" da própria tela, onde está o número (como a seta do "Próximo passo" fazia). */
export const ABRIR_VER_TUDO = "abrir-ver-tudo";

export interface EntradaDaLeituraEmDescobertas {
  /** Os fatos da leitura da tela (os mesmos que a LeituraDaTela recebia). null = ainda carregando. */
  fatos: FatosDaTela | null;
  /** As descobertas da regra própria da tela (todas: as à vista e as do "Ver tudo"). */
  descobertas: readonly Descoberta[];
  /** O que já está escrito no topo, além das descobertas: a frase e o apoio do veredito, os 3 números e a prova (texto pronto da tela). */
  textoDoTopo?: readonly string[];
  /** Fatos que a regra do topo já diz com outras palavras (por id). Só para o que o número sozinho não acha. */
  jaDitos?: readonly string[];
  /** Um lugar melhor que o "Ver tudo" para a ação de um fato ou passo (rota de origem ou chave local). null = abrir o "Ver tudo". */
  acaoDoFato?: (fatoId: string | undefined) => AcaoDaDescoberta | null;
  /** Tira os passos de arrumação interna do dado (soEquipe): a Hoje não os mostra ao médico, só na linha "Para a equipe". */
  semPassosDaEquipe?: boolean;
  /**
   * A leitura no modo resumo (Resultados da clínica, D-07): o que aconteceu, o que mais preocupa e a ação da semana, sem "Ver mais". Com ele,
   * só isso vira descoberta (era o que a leitura daquela tela mostrava).
   */
  resumo?: TextoDoResumo | null;
}

// ---------- números já ditos ----------

const NUMERO = /R\$\s?\d[\d.]*(?:,\d+)?|\d[\d.]*(?:,\d+)?\s?%|\d[\d.]*(?:,\d+)?/g;

const valorDe = (t: string): number => Number(t.replace(/[^\d,]/g, "").replace(",", "."));

/**
 * As "fichas" de número de um texto, normalizadas para comparar: reais pelo valor inteiro ("R$ 33,33" e "R$ 33" são a mesma ficha),
 * percentual sem sinal ("+20%" e "▲ 20%"), e número solto de 10 para cima (abaixo disso coincide demais). Dia e hora ("15/10", "10h")
 * não contam.
 */
export function fichasDeNumero(texto: string): string[] {
  const fichas: string[] = [];
  for (const m of texto.matchAll(NUMERO)) {
    const bruto = m[0];
    const i = m.index ?? 0;
    const antes = texto[i - 1] ?? "";
    const depois = texto[i + bruto.length] ?? "";
    if (antes === "/" || depois === "/" || antes === ":" || depois === ":" || /^h(?!\p{L})/u.test(texto.slice(i + bruto.length, i + bruto.length + 2))) continue;
    const v = valorDe(bruto);
    if (!Number.isFinite(v)) continue;
    if (bruto.startsWith("R$")) fichas.push(`R$${Math.round(v)}`);
    else if (bruto.trim().endsWith("%")) fichas.push(`${Math.round(v)}%`);
    else if (v >= 10) fichas.push(`${Math.round(v)}`);
  }
  return fichas;
}

/** O número que a linha afirma: o primeiro da frase; sem número na frase, o primeiro dos números que a sustentam. */
function fichaPrincipal(linha: Pick<LinhaTexto, "frase" | "numeros">): string | null {
  return fichasDeNumero(linha.frase)[0] ?? linha.numeros.flatMap((n) => fichasDeNumero(n.exibicao))[0] ?? null;
}

const normal = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function textoDaDescoberta(d: Descoberta): string[] {
  return [d.frase, d.impacto ?? "", ...d.porque.barras.map((b) => `${b.rotulo} ${b.exibicao}`)];
}

// ---------- desenho da descoberta ----------

/** O número de apoio sem o sinal de divisão (jargão na tela da clínica): "R$ 1.740 ÷ 87 conversas" vira "R$ 1.740 em 87 conversas". */
const semDivisao = (t: string) => t.replace(/\s*÷\s*/g, " em ").replace(/\s+/g, " ").trim().replace(/[.]+$/, "");

const SELO: Record<TomFato, string> = { bom: "Bom sinal", atencao: "Atenção", ruim: "Ponto fraco", neutro: "Do período" };
const MAX_IMPACTO = 40;

/** Uma fatia do total na frase ("concentrou 44% do alcance"): a barra da fatia e a do resto. */
const FATIA = /(\d+(?:,\d+)?)\s?%\s+(?:do|da|dos|das)\s+\p{L}/u;

function barrasDoFato(fato: Fato | undefined, linha: Pick<LinhaTexto, "frase" | "numeros" | "barras">): BarraDoFato[] {
  if (linha.barras && linha.barras.length >= 2) return linha.barras.slice(0, 3).map((b) => ({ ...b }));
  if (fato?.comparacao && fato.comparacao.barras.length >= 2) return fato.comparacao.barras.slice(0, 3).map((b) => ({ ...b }));
  const fatia = FATIA.exec(linha.frase);
  if (fatia) {
    const p = Math.max(0, Math.min(100, valorDe(fatia[1])));
    return [
      { rotulo: "Esta parte", exibicao: `${Math.round(p)}% do total`, fracao: p / 100 },
      { rotulo: "Todo o resto", exibicao: `${Math.round(100 - p)}% do total`, fracao: (100 - p) / 100 },
    ];
  }
  // Os números que sustentam a frase (cada um uma barra cheia, com o próprio texto); o que falta para chegar a 2 é "Falta dado".
  const medidas: BarraDoFato[] = linha.numeros
    .filter((n) => n.exibicao.length <= MAX_IMPACTO * 2)
    .slice(0, 3)
    .map((n, k) => ({ rotulo: k === 0 ? "Medido no período" : "Também medido", exibicao: semDivisao(n.exibicao), fracao: 1 }));
  // O que falta é a meta da clínica (nenhuma tela mede meta ainda); "Período anterior" não entra aqui porque a frase pode já comparar.
  for (const rotulo of ["Meta da clínica", "Melhor dia da clínica"]) {
    if (medidas.length >= 2) break;
    medidas.push({ rotulo, exibicao: "Falta dado", fracao: 0, faltou: true });
  }
  return medidas.slice(0, 3);
}

function impactoDe(linha: Pick<LinhaTexto, "numeros">): string | undefined {
  return linha.numeros.map((x) => semDivisao(x.exibicao)).find((x) => x.length <= MAX_IMPACTO && checarFraseCinco(x, MAX_IMPACTO).length === 0);
}

const semPonto = (t: string) => t.replace(/\s+/g, " ").trim().replace(/[.]+$/, "");

interface PassoDaLeitura {
  texto: PassoTexto;
  fatoId?: string;
  /** O próximo passo da leitura (o primeiro que passou no filtro); os outros eram o "Ver mais". */
  proximo: boolean;
}

/**
 * Os fatos e passos da leitura que o topo ainda não diz, já como descobertas (na ordem da leitura: o que aconteceu, o por quê e os
 * passos). Portão negado ou sem leitura: nenhuma (o veredito já diz "Falta dado: motivo"). Cada descoberta passa em checarDescoberta.
 */
export function descobertasDaLeitura(e: EntradaDaLeituraEmDescobertas): Descoberta[] {
  if (!e.fatos || !e.fatos.portao.ok) return [];
  const montado = montarTexto(e.fatos);
  if (montado.tipo !== "leitura") return [];
  // Modo resumo: as linhas e o passo do resumo (sem "Ver mais"); senão as da leitura (o que aconteceu, o por quê e os passos).
  const resumo = e.resumo?.tipo === "resumo" ? e.resumo : null;
  const texto = resumo
    ? { aconteceu: resumo.aconteceu, porque: resumo.preocupa, proximoPasso: resumo.acao, verMais: [] as PassoTexto[] }
    : { aconteceu: montado.aconteceu as LinhaTexto | null, porque: montado.porque, proximoPasso: montado.proximoPasso, verMais: montado.verMais };

  const jaDitos = new Set(e.jaDitos ?? []);
  const fichasDoTopo = new Set([...(e.textoDoTopo ?? []), ...e.descobertas.flatMap(textoDaDescoberta)].flatMap(fichasDeNumero));
  const frasesDoTopo = new Set([...(e.textoDoTopo ?? []), ...e.descobertas.flatMap((d) => [d.frase, d.acao.rotulo])].map(normal));
  const acaoDe = (fatoId: string | undefined, rotulo: string): AcaoDaDescoberta => {
    const lugar = e.acaoDoFato?.(fatoId);
    return lugar ? { ...lugar, rotulo } : { rotulo, local: ABRIR_VER_TUDO };
  };

  // Os passos que passaram no filtro da leitura (o próximo e os do "Ver mais"), com o fato que cada um resolve.
  const daRegra: PassoFato[] = [e.fatos.proximoPasso, ...e.fatos.outrosPassos].filter((p): p is PassoFato => p != null);
  const passos: PassoDaLeitura[] = [texto.proximoPasso, ...texto.verMais]
    .filter((p): p is PassoTexto => p != null)
    .map((p) => ({ texto: p, regra: daRegra.find((r) => frasePasso(r) === p.frase) }))
    .filter((p) => !(e.semPassosDaEquipe && p.regra?.soEquipe))
    .map((p) => ({ texto: p.texto, fatoId: p.regra?.fatoId, proximo: p.texto === texto.proximoPasso }));
  const usados = new Set<PassoDaLeitura>();
  const fatoPorId = new Map(e.fatos.fatos.map((f) => [f.id, f]));

  const coberta = (linha: LinhaTexto): boolean => {
    if (jaDitos.has(linha.fatoId)) return true;
    if (frasesDoTopo.has(normal(linha.frase))) return true;
    const ficha = fichaPrincipal(linha);
    return ficha != null && fichasDoTopo.has(ficha);
  };

  const saida: Descoberta[] = [];
  const linhas = [texto.aconteceu, texto.porque].filter((l, k, todas): l is LinhaTexto => l != null && todas.findIndex((x) => x?.fatoId === l.fatoId) === k);
  for (const linha of linhas) {
    if (coberta(linha)) continue;
    const frase = caberEm90(linha.frase);
    const passo = passos.find((p) => !usados.has(p) && p.fatoId === linha.fatoId);
    if (passo) usados.add(passo);
    const fato = fatoPorId.get(linha.fatoId);
    saida.push({
      id: `leitura-${linha.fatoId}`,
      tom: linha.tom,
      selo: SELO[linha.tom],
      frase,
      quem: passo?.texto.rotuloQuem,
      impacto: impactoDe(linha),
      acao: acaoDe(linha.fatoId, passo ? semPonto(passo.texto.frase) : "Ver os números"),
      ...(passo?.proximo ? { origem: "proximo-passo" as const } : {}),
      porque: {
        titulo: frase.endsWith("…") ? linha.frase : "O que sustenta esta frase",
        barras: barrasDoFato(fato, linha),
        ...(passo?.texto.motivo && checarFraseCinco(passo.texto.motivo).length === 0 ? { obs: passo.texto.motivo } : {}),
      },
    });
  }

  // Os passos que sobraram (o próximo passo de um fato que o topo já diz e os do "Ver mais") viram descobertas próprias, salvo o que uma
  // descoberta do topo já manda fazer.
  for (const passo of passos) {
    if (usados.has(passo)) continue;
    if (frasesDoTopo.has(normal(passo.texto.frase))) continue;
    usados.add(passo);
    const fato = passo.fatoId ? fatoPorId.get(passo.fatoId) : undefined;
    // O motivo de um passo cujo fato o topo já diz (ou substitui, como a maior perda do funil) não vira a frase: a frase é o próprio passo.
    const doFatoDito = passo.fatoId != null && jaDitos.has(passo.fatoId);
    // O motivo só vira a frase quando traz um número (é um fato); sem número ("Sem dado no CRM.") a frase é o passo e o motivo vai para o "Por quê?".
    const motivoBom = !doFatoDito && passo.texto.motivo && checarFraseCinco(caberEm90(passo.texto.motivo)).length === 0 ? caberEm90(passo.texto.motivo) : null;
    const motivo = motivoBom && fichasDeNumero(motivoBom).length > 0 ? motivoBom : null;
    const obs = !motivo && motivoBom && motivoBom.length <= 90 ? motivoBom : null;
    const frase = motivo ?? caberEm90(passo.texto.frase);
    if (frasesDoTopo.has(normal(frase))) continue;
    const linhaDoFato = fato ? { frase: fato.frase, numeros: fato.numeros, barras: fato.comparacao?.barras } : null;
    saida.push({
      id: `leitura-passo-${normal(passo.texto.frase).replace(/\s+/g, "-").slice(0, 40)}`,
      tom: "neutro",
      selo: "Próximo passo",
      frase,
      quem: passo.texto.rotuloQuem,
      acao: acaoDe(passo.fatoId, motivo ? semPonto(passo.texto.frase) : "Ver os números"),
      ...(passo.proximo ? { origem: "proximo-passo" as const } : {}),
      porque: {
        // A frase cortada em 90 caracteres não perde nada: o "Por quê?" abre com o texto inteiro do passo.
        titulo: frase.endsWith("…") ? `${motivo ? passo.texto.motivo : passo.texto.frase}` : "O que sustenta este passo",
        barras: linhaDoFato ? barrasDoFato(fato, linhaDoFato) : barrasDoPorque(undefined),
        ...(obs ? { obs } : {}),
      },
    });
  }

  return saida.filter((d) => checarDescoberta(d).length === 0);
}

const ORDEM_DO_TOM: Record<TomFato, number> = { ruim: 0, atencao: 1, bom: 2, neutro: 3 };

/**
 * As descobertas da tela e as da leitura numa lista só. A ordem da regra própria da tela não muda, e as da leitura vêm depois delas. A
 * exceção é a mais forte, por impacto como hoje: uma descoberta "ruim" da leitura entra antes da primeira de cima que não é ruim, e pode
 * tomar o lugar dela entre as 3 à vista (só a ruim: uma de atenção trocando uma de cima mexeria na altura da tela, que nunca cresce).
 */
export function juntarDescobertas(proprias: readonly Descoberta[], daLeitura: readonly Descoberta[]): Descoberta[] {
  const ids = new Set(proprias.map((d) => d.id));
  const lista = [...proprias];
  for (const d of daLeitura) {
    if (ids.has(d.id)) continue;
    ids.add(d.id);
    const k = d.tom === "ruim" ? lista.findIndex((x) => ORDEM_DO_TOM[x.tom] > ORDEM_DO_TOM[d.tom]) : -1;
    if (k < 0) lista.push(d);
    else lista.splice(k, 0, d);
  }
  return lista;
}

/**
 * As à vista e as do "Ver tudo", com as descobertas da leitura juntas (juntarDescobertas). Quantas ficam à vista não muda por causa da
 * leitura: as mesmas da regra própria (no máximo 3). A régua de altura com o "Ver tudo" fechado nunca cresce (D-08); o que a leitura traz a
 * mais mora no "Ver tudo", e só uma "ruim" pode tomar o lugar de uma de cima.
 */
export function visiveisERestoComLeitura(proprias: readonly Descoberta[], daLeitura: readonly Descoberta[]): { visiveis: Descoberta[]; resto: Descoberta[] } {
  const juntas = juntarDescobertas(proprias, daLeitura);
  const n = Math.min(DESCOBERTAS_A_VISTA, proprias.length);
  return { visiveis: juntas.slice(0, n), resto: juntas.slice(n) };
}
