// Texto da leitura montado por modelo, só com regra fixa (sem IA). A tela mostra o que sai daqui e mais nada:
//   - portão negado → "Sem leitura: motivo", passo para consertar e quem resolve (nenhuma linha de conclusão);
//   - portão ok → o que aconteceu (com número ao lado), por quê, UM próximo passo (D-05) e o resto em "ver mais".
// Todo texto passa por checarTextoDaLeitura antes de chegar à tela: o que reprova é descartado, nunca mostrado.
// Módulo puro.
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import { checarLinguagemCFM } from "@/lib/linguagem-cfm";
import { textoSemDadoPessoal } from "@/lib/brand-brain";
import { VERBOS_PROVISORIOS, type FatosDaTela, type Fato, type LinhaTexto, type PassoFato, type PassoTexto, type PeriodoLeitura, type TextoDaLeitura, type TextoDoResumo } from "./tipos";

// ---------- frases e rótulos ----------
const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const fechar = (t: string) => {
  const s = t.replace(/\s+/g, " ").trim();
  return /[.!?]$/.test(s) ? s : `${s}.`;
};
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** "Conferir a conexão do Instagram." (verbo com inicial maiúscula + complemento + ponto). */
export function frasePasso(p: PassoFato): string {
  return `${cap(p.verbo)} ${p.texto.replace(/[.\s]+$/, "")}.`;
}

/** Subtítulo da leitura: "11/10 a 09/11, comparado com 11/09 a 10/10" (sem anterior: só o período). */
export function rotuloPeriodo(p: PeriodoLeitura): string {
  const atual = `${ddmm(p.de)} a ${ddmm(p.ate)}`;
  return p.anterior ? `${atual}, comparado com ${ddmm(p.anterior.de)} a ${ddmm(p.anterior.ate)}` : atual;
}

// ---------- filtro de linguagem (D-04, LEIT-07) ----------
const JARGAO = /(?<!\p{L})(CTR|CPC|CPM|CPL|ROAS|leads?|engajamento|taxa de convers(?:ão|ao))(?!\p{L})/iu;
// Previsão, promessa e projeção não entram na leitura (brief: "Projeção em 30 dias", "meta em risco").
const PREVISAO = /(?<!\p{L})(vai|vão|deve|devem|irá|irão|provavelmente|garante|garantem|projeção|projecao|previsão|previsao)(?!\p{L})|(?<!\p{L})em risco(?!\p{L})/iu;
// Reproduzidas de scripts/test-textos-sem-fonte.ts (CAUSAL e RESSALVA). Verbo que afirma causa; a frase só passa se
// marcar a incerteza ("pode", "hipótese"), negar a causa ("não prova", "não que", "não dá para saber/medir") ou citar
// a fonte com ano. "trouxe 40%" (origem por post não medida) cai aqui.
const CAUSAL = /(?<!\p{L})(traz|trazem|trazendo|trouxe|chega pelo|chegam pelo|derruba|derrubam|converte|convertem|causa|causou|gera|geram|gerando|faz (?:subir|cair)|mais chance de|quer dizer que|esfria|esfriam|quase nunca é)(?!\p{L})/iu;
const RESSALVA = /(?<!\p{L})(pode|podem|poderia|hipótese)(?!\p{L})|não prova|não que|não dá para (?:saber|medir)|\([^()]*\b(?:19|20)\d{2}\)/iu;
const frases = (t: string) => t.split(/(?<=[.!?])\s+|\s+·\s+/).map((s) => s.trim()).filter(Boolean);

const MAX_CARACTERES = 220;
const MAX_FRASES = 2;

/** Lista de problemas do texto (vazia = pode ir para a tela). */
export function checarTextoDaLeitura(texto: string): string[] {
  const t = texto.replace(/\s+/g, " ").trim();
  const problemas: string[] = [];
  const jargao = JARGAO.exec(t);
  if (jargao) problemas.push(`jargão: "${jargao[0]}"`);
  const previsao = PREVISAO.exec(t);
  if (previsao) problemas.push(`previsão ou promessa: "${previsao[0]}"`);
  const causais = frases(t).filter((f) => CAUSAL.test(f) && !RESSALVA.test(f));
  if (causais.length) problemas.push(`frase causal sem ressalva: "${causais[0]}"`);
  const cfm = checarLinguagemCFM(t);
  if (!cfm.ok) problemas.push(`linguagem fora da regra do CFM: ${cfm.achados[0]?.motivo ?? "trecho de risco"}`);
  if (!textoSemDadoPessoal(t)) problemas.push("dado pessoal (telefone, e-mail ou CPF)");
  if (t.length > MAX_CARACTERES) problemas.push(`linha com mais de ${MAX_CARACTERES} caracteres`);
  if (t.split(/(?<=[.!?])\s+/).filter(Boolean).length > MAX_FRASES) problemas.push(`mais de ${MAX_FRASES} frases na mesma linha`);
  return problemas;
}
const limpo = (t: string) => checarTextoDaLeitura(t).length === 0;

// ---------- montagem ----------
const ORDEM_TOM: Record<Fato["tom"], number> = { ruim: 0, atencao: 1, bom: 2, neutro: 3 };

function linhaDe(f: Fato): LinhaTexto | null {
  const frase = fechar(f.frase);
  if (!limpo(frase)) return null;
  const numeros = f.numeros.filter((n) => limpo(n.exibicao));
  // Cada afirmação traz ao lado o número que a sustenta: sem número, o fato não vira conclusão.
  if (!numeros.length) return null;
  // As barras da comparação só vão junto quando cada rótulo e cada valor passam no mesmo filtro (a chave nunca fica com undefined).
  const barras = f.comparacao?.barras.length && f.comparacao.barras.every((b) => limpo(b.rotulo) && limpo(b.exibicao)) ? f.comparacao.barras : undefined;
  return { fatoId: f.id, frase, numeros, tom: f.tom, ...(barras ? { barras } : {}) };
}

function passoTexto(p: PassoFato): PassoTexto | null {
  if (!(VERBOS_PROVISORIOS as readonly string[]).includes(p.verbo)) return null;
  const frase = frasePasso(p);
  if (!limpo(frase)) return null;
  const motivo = p.motivo && limpo(fechar(p.motivo)) ? fechar(p.motivo) : undefined;
  return { frase, verbo: p.verbo, quem: p.quem, rotuloQuem: ROTULO_RESPONSAVEL[p.quem], motivo };
}

const PASSO_PADRAO: PassoFato = { verbo: "conferir", texto: "a conexão das fontes", quem: "equipe_hub" };

function semLeitura(motivo: string, passo: PassoFato): Extract<TextoDaLeitura, { tipo: "sem_leitura" }> {
  return {
    tipo: "sem_leitura",
    motivo: limpo(motivo) ? motivo : "o dado desta tela não está confiável neste período",
    passo: passoTexto(passo) ?? passoTexto(PASSO_PADRAO)!,
  };
}

export function montarTexto(f: FatosDaTela): TextoDaLeitura {
  if (!f.portao.ok) return semLeitura(f.portao.motivo, f.portao.passo);

  const candidatos = f.fatos
    .map((fato) => ({ fato, linha: linhaDe(fato) }))
    .filter((c): c is { fato: Fato; linha: LinhaTexto } => c.linha != null)
    // Ressalva do dado fica depois das conclusões; entre iguais, o de maior peso e, no empate, ruim, atenção, bom.
    .sort((a, b) => Number(!!a.fato.ressalva) - Number(!!b.fato.ressalva) || b.fato.peso - a.fato.peso || ORDEM_TOM[a.fato.tom] - ORDEM_TOM[b.fato.tom]);
  const conclusoes = candidatos.filter((c) => c.fato.tom !== "neutro");
  const aconteceu = conclusoes[0];
  if (!aconteceu) return semLeitura("nenhum fato passou nas regras de leitura neste período", PASSO_PADRAO);

  // Um próximo passo só (D-05): o primeiro da lista que passa no filtro. Os outros ficam em "ver mais".
  const passos = [f.proximoPasso, ...f.outrosPassos]
    .filter((p): p is PassoFato => p != null)
    .map((p) => ({ origem: p, texto: passoTexto(p) }))
    .filter((p): p is { origem: PassoFato; texto: PassoTexto } => p.texto != null);
  const escolhido = passos[0] ?? null;

  const doPasso = escolhido?.origem.fatoId ? candidatos.find((c) => c.fato.id === escolhido.origem.fatoId) : undefined;
  const porque = doPasso && doPasso.fato.id !== aconteceu.fato.id ? doPasso : (conclusoes.find((c) => c.fato.id !== aconteceu.fato.id && !c.fato.ressalva) ?? null);

  return {
    tipo: "leitura",
    aconteceu: aconteceu.linha,
    porque: porque?.linha ?? null,
    proximoPasso: escolhido?.texto ?? null,
    semPassoMotivo: escolhido ? null : "nenhuma ação passou nas regras neste período",
    verMais: passos.slice(1).map((p) => p.texto),
  };
}

/** Todos os problemas de linguagem de uma saída de montarTexto (ou do resumo). Vazio = passa. */
export function problemasDoTexto(t: TextoDaLeitura | TextoDoResumo): string[] {
  const textos: string[] = [];
  const passo = (p: PassoTexto | null | undefined) => {
    if (!p) return;
    textos.push(p.frase);
    if (p.motivo) textos.push(p.motivo);
  };
  const linha = (l: LinhaTexto | null | undefined) => {
    if (!l) return;
    textos.push(l.frase, ...l.numeros.map((n) => n.exibicao), ...(l.barras ?? []).flatMap((b) => [b.rotulo, b.exibicao]));
  };
  if (t.tipo === "sem_leitura") {
    textos.push(t.motivo);
    passo(t.passo);
  } else if (t.tipo === "leitura") {
    linha(t.aconteceu);
    linha(t.porque);
    passo(t.proximoPasso);
    if (t.semPassoMotivo) textos.push(t.semPassoMotivo);
    t.verMais.forEach(passo);
  } else {
    linha(t.aconteceu);
    linha(t.preocupa);
    passo(t.acao);
    if (t.semAcaoMotivo) textos.push(t.semAcaoMotivo);
  }
  return textos.flatMap((x) => checarTextoDaLeitura(x));
}
