// Checagem de linguagem segura para texto que vai ao cliente (Resolução CFM 2.336/2023).
//
// Regras simples e explicáveis, sem IA. Pega o que é claramente proibido ou
// arriscado em publicidade médica: promessa de resultado ("garantido", "100%",
// "cura", "antes e depois"), preço/promoção de serviço, nome de medicamento,
// superlativo ("o melhor", "único", "milagre"), sensacionalismo e @ de pessoa
// (identificação). Na dúvida, sinaliza: quem revisa decide.
//
// `tornarSeguro` NUNCA apaga conteúdo. Cada trecho de risco recebe uma reescrita
// segura sugerida (troca "o melhor" por "um bom", "cura" por "melhora", o nome do
// remédio por "medicamento", tira o @, marca preço como "[valor omitido]"). No
// texto gerado a sugestão vem aplicada por padrão, e toda troca volta listada com a
// frase original e as palavras marcadas, para a equipe clicar em "Manter original".
// No texto editado à mão, `checarLinguagemCFM` só aponta e sugere: quem decide é a equipe.

export type RegraCFM = "promessa" | "preco" | "medicamento" | "superlativo" | "sensacionalismo" | "identificacao";

export const ROTULO_REGRA_CFM: Record<RegraCFM, string> = {
  promessa: "promessa de resultado",
  preco: "preço ou promoção de serviço",
  medicamento: "nome de medicamento",
  superlativo: "superlativo",
  sensacionalismo: "sensacionalismo",
  identificacao: "identificação de pessoa",
};

export interface AchadoCFM {
  regra: RegraCFM;
  trecho: string; // como aparece no texto
  frase: string; // a frase inteira onde apareceu
  motivo: string;
}

// Lista básica: princípios ativos e marcas mais citados em perfis médicos.
// Hormônio e vitamina pelo nome genérico (estrogênio, magnésio) NÃO entram: são
// assunto de educação em saúde; marca e princípio ativo de remédio, sim.
export const MEDICAMENTOS = [
  "ozempic", "wegovy", "rybelsus", "semaglutida", "mounjaro", "tirzepatida", "saxenda", "victoza", "liraglutida",
  "sibutramina", "orlistate", "xenical", "contrave", "naltrexona", "bupropiona", "topiramato",
  "roacutan", "isotretinoina", "finasterida", "dutasterida", "minoxidil", "espironolactona",
  "botox", "dysport", "xeomin",
  "rivotril", "clonazepam", "alprazolam", "zolpidem", "fluoxetina", "sertralina", "escitalopram", "paroxetina", "venlafaxina", "desvenlafaxina", "quetiapina", "quitiapina",
  "metformina", "glifage", "tadalafila", "sildenafila", "viagra", "cialis",
  "gestrinona", "oxandrolona", "durateston", "deposteron", "nandrolona", "testogel",
  "oestrogel", "sandrena", "estreva", "lenzetto", "natifa", "angeliq", "vagifem", "utrogestan", "duphaston", "dienogeste", "allurene", "mirena", "implanon", "elmetrin",
  "ivermectina", "hidroxicloroquina", "cloroquina", "tamoxifeno", "anastrozol", "letrozol",
  "levotiroxina", "puran", "synthroid", "euthyrox", "ritalina", "venvanse", "metilfenidato", "lisdexanfetamina",
];

interface Padrao {
  regra: RegraCFM;
  re: RegExp; // aplicada ao texto "dobrado" (minúsculo, sem acento, mesmo tamanho)
  motivo: string;
  // Reescrita segura sugerida para o trecho. TODO padrão tem uma: a checagem nunca apaga
  // frase nem item; ela troca o trecho, mostra a troca e deixa a equipe manter o original.
  trocar: (trechoOriginal: string) => string;
}

// Minúsculo e sem acento, preservando o tamanho (para achar o trecho no original).
function dobrar(s: string): string {
  let out = "";
  for (const ch of s) {
    const base = ch.toLowerCase().normalize("NFD")[0] ?? ch;
    out += base.length === ch.length ? base : ch;
  }
  return out;
}

// Mantém a maiúscula inicial do trecho original na troca.
function comCaixa(original: string, novo: string): string {
  if (!novo) return novo;
  const c = original.charAt(0);
  return c && c !== c.toLowerCase() ? novo.charAt(0).toUpperCase() + novo.slice(1) : novo;
}
const chave = (t: string) => dobrar(t).replace(/\s+/g, " ").trim();
// Troca por dicionário (chave dobrada); sem entrada, usa o padrão.
const porMapa =
  (mapa: Record<string, string>, padrao?: (t: string) => string) =>
  (t: string): string =>
    comCaixa(t, mapa[chave(t)] ?? (padrao ? padrao(t) : t));

const VALOR_OMITIDO = "[valor omitido]";
const OFERTA_OMITIDA = "[oferta omitida]";

const PADROES: Padrao[] = [
  {
    regra: "promessa",
    re: /\bgarant(?:ido|ida|idos|idas|e|imos|ia|ir)\b/g,
    motivo: "promete resultado, o que a publicidade médica não pode fazer",
    trocar: porMapa({ garantido: "possível", garantida: "possível", garantidos: "possíveis", garantidas: "possíveis", garante: "favorece", garantimos: "buscamos", garantia: "orientação", garantir: "buscar" }),
  },
  { regra: "promessa", re: /\b100 ?%/g, motivo: "\"100%\" soa como garantia de resultado", trocar: () => "" },
  {
    regra: "promessa",
    re: /\bcura(?:r|do|da|dos|das|m|ra|rá)?\b/g,
    motivo: "falar em cura promete resultado",
    trocar: porMapa(
      { cura: "melhora", curar: "melhorar", curado: "melhorado", curada: "melhorada", curados: "melhorados", curadas: "melhoradas", curam: "melhoram", curara: "melhorará" },
      () => "melhora",
    ),
  },
  { regra: "promessa", re: /\bantes e depois\b/g, motivo: "\"antes e depois\" exibe resultado de paciente", trocar: (t) => comCaixa(t, "acompanhamento") },
  {
    regra: "promessa",
    re: /\bresultados? (?:certos?|garantidos?|imediatos?|definitivos?|rapidos?)\b/g,
    motivo: "promete o resultado ou o prazo",
    // "resultado garantido" → "resultado possível"
    trocar: (t) => {
      const r = t.split(/\s+/)[0];
      return `${r} ${/s$/i.test(r) ? "possíveis" : "possível"}`;
    },
  },
  {
    regra: "promessa",
    re: /\bsem (?:dor|riscos?|efeitos? colaterais|contraindicacao)\b/g,
    motivo: "nega risco, o que equivale a prometer resultado",
    trocar: porMapa(
      { "sem dor": "com conforto", "sem risco": "com riscos avaliados", "sem riscos": "com riscos avaliados", "sem efeito colaterais": "com acompanhamento", "sem efeitos colaterais": "com acompanhamento" },
      () => "com avaliação médica",
    ),
  },
  {
    regra: "promessa",
    re: /\b(?:solucao|tratamento) definitiv[oa]\b|\bde vez\b(?! em quando)|\bnunca mais\b/g,
    motivo: "promete resultado permanente",
    trocar: porMapa({ "de vez": "", "nunca mais": "menos" }, (t) => t.split(/\s+/)[0]),
  },
  {
    regra: "preco",
    re: /\b(?:preco|precos|promocao|promocoes|desconto|descontos|parcelamento|parcelad[oa]|gratis|gratuit[oa]|valor da consulta|quanto custa|cupom)\b/g,
    motivo: "preço e promoção de serviço médico não podem aparecer em divulgação",
    trocar: (t) => (/^(?:promoc|descont|gratis|gratuit|cupom)/.test(chave(t)) ? OFERTA_OMITIDA : VALOR_OMITIDO),
  },
  {
    regra: "superlativo",
    re: /\b(?:o|a|os|as) melhor(?:es)?\b/g,
    motivo: "superlativo compara com outros médicos ou promete resultado",
    trocar: porMapa({ "o melhor": "um bom", "a melhor": "uma boa", "os melhores": "bons", "as melhores": "boas" }),
  },
  {
    regra: "superlativo",
    re: /\bo mais (?:eficaz|eficiente|seguro|moderno|completo|indicado|avancado)\b|\bunic[oa]s? (?:que|capaz|no|na)\b|\binfalivel\b|\bmilagr(?:e|es|osa|oso)\b|\brevolucionari[oa]\b|\bnumero 1\b/g,
    motivo: "superlativo ou autopromoção",
    trocar: porMapa(
      { infalivel: "confiável", milagre: "novidade", milagres: "novidades", milagrosa: "promissora", milagroso: "promissor", revolucionario: "moderno", revolucionaria: "moderna", "numero 1": "de referência" },
      // "o mais eficaz" → "eficaz"; "único que" → "que"
      (t) => t.split(/\s+/).slice(chave(t).startsWith("o mais") ? 2 : 1).join(" "),
    ),
  },
  {
    regra: "sensacionalismo",
    re: /\bchocante\b|\bvoce nao vai acreditar\b|\binacreditavel\b|\burgente\b|\bsegredo\b|\bbombastic[oa]\b/g,
    motivo: "tom sensacionalista",
    trocar: porMapa({ chocante: "importante", "voce nao vai acreditar": "veja", inacreditavel: "relevante", urgente: "importante", segredo: "detalhe", bombastico: "importante", bombastica: "importante" }),
  },
  { regra: "identificacao", re: /@[a-z0-9_.]{3,}/g, motivo: "@ de uma pessoa identifica alguém que não autorizou", trocar: () => "" },
];

// Divide em frases sem quebrar "Dra.", "R$ 1.234,56" ou "13/10".
export function frases(texto: string): string[] {
  const out: string[] = [];
  let atual = "";
  for (let i = 0; i < texto.length; i++) {
    atual += texto[i];
    const c = texto[i];
    if ((c === "." || c === "!" || c === "?" || c === "\n") && (i + 1 >= texto.length || /\s/.test(texto[i + 1]))) {
      if (c === "." && /\b(?:dr|dra|sr|sra|ex|obs|aprox|p\.ex)\.$/i.test(atual)) continue;
      out.push(atual);
      atual = "";
    }
  }
  if (atual) out.push(atual);
  return out;
}

type AchadoInterno = AchadoCFM & { ini: number; fim: number; padrao: Padrao };

function achadosNaFrase(frase: string): AchadoInterno[] {
  const d = dobrar(frase);
  const out: AchadoInterno[] = [];
  for (const p of PADROES) {
    p.re.lastIndex = 0;
    for (const m of d.matchAll(p.re)) {
      const ini = m.index ?? 0;
      out.push({ regra: p.regra, trecho: frase.slice(ini, ini + m[0].length), frase: frase.trim(), motivo: p.motivo, ini, fim: ini + m[0].length, padrao: p });
    }
  }
  // Remédio pela lista
  for (const nome of MEDICAMENTOS) {
    const re = new RegExp(`\\b${nome}\\b`, "g");
    for (const m of d.matchAll(re)) {
      const ini = m.index ?? 0;
      out.push({
        regra: "medicamento",
        trecho: frase.slice(ini, ini + nome.length),
        frase: frase.trim(),
        motivo: "nome de medicamento não pode aparecer em divulgação",
        ini,
        fim: ini + nome.length,
        padrao: { regra: "medicamento", re, motivo: "", trocar: () => "medicamento" },
      });
    }
  }
  // Valor em reais junto de serviço médico (investimento em anúncio é relatório, não preço).
  if (/r\$\s?\d/.test(d) && /\b(?:consulta|procedimento|sessao|cirurgia|pacote|avaliacao|retorno|exame)\b/.test(d) && !/\b(?:anuncio|campanha|investi|verba|gasto|conversa)\b/.test(d)) {
    const m = /r\$\s?[\d.,]*\d/.exec(d)!;
    out.push({
      regra: "preco",
      trecho: frase.slice(m.index, m.index + m[0].length),
      frase: frase.trim(),
      motivo: "valor de serviço médico não pode aparecer em divulgação",
      ini: m.index,
      fim: m.index + m[0].length,
      padrao: { regra: "preco", re: /x/, motivo: "", trocar: () => VALOR_OMITIDO },
    });
  }
  return out.sort((a, b) => a.ini - b.ini || b.fim - a.fim);
}

// Troca cada trecho marcado pela reescrita do seu padrão. Repete se a troca criar outro achado;
// na 3ª volta o que sobrar vira "[…]". Nunca devolve frase vazia quando a original tinha texto.
function reescreverFrase(f: string): string {
  let atual = f;
  for (let volta = 0; volta < 3; volta++) {
    const achados = achadosNaFrase(atual);
    if (achados.length === 0) break;
    let nova = "";
    let pos = 0;
    for (const a of achados) {
      if (a.ini < pos) continue; // sobreposição
      const troca = volta < 2 ? a.padrao.trocar(a.trecho) : "[…]";
      let antes = atual.slice(pos, a.ini);
      // Trecho que some ("de vez", "100%", @): leva junto o espaço de antes.
      if (!troca) antes = antes.replace(/ $/, "");
      nova += antes + troca;
      pos = a.fim;
    }
    nova += atual.slice(pos);
    atual = nova
      .replace(/\(\s*\)/g, "")
      .replace(/ {2,}/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
      .replace(/^(\s*)([,;:])\s*/, "$1");
  }
  // Mantém o espaço/quebra de linha do fim da frase original (é o que separa as frases).
  const fim = f.match(/\s*$/)?.[0] ?? "";
  let corpo = atual.replace(/\s*$/, "").replace(/^\s*[,;:]\s*/, "");
  if (!corpo.trim()) corpo = "[trecho omitido]";
  // A frase começava com maiúscula: continua começando.
  if (/^\s*[A-ZÀ-Ý]/.test(f)) corpo = corpo.replace(/^(\s*)([a-zà-ý])/, (_m, s: string, c: string) => s + c.toUpperCase());
  return corpo + fim;
}

/** Reescrita segura sugerida para um trecho (mesma regra do `tornarSeguro`). */
export function sugerirReescrita(texto: string): string {
  return frases(texto)
    .map((f) => (achadosNaFrase(f).length ? reescreverFrase(f) : f))
    .join("")
    .replace(/ {2,}/g, " ");
}

/** Aponta trechos de risco. Não muda o texto. Cada achado traz a reescrita sugerida da frase. */
export function checarLinguagemCFM(texto: string): { ok: boolean; achados: (AchadoCFM & { sugestao: string })[] } {
  const achados = frases(texto).flatMap((f) => {
    const lista = achadosNaFrase(f);
    if (lista.length === 0) return [];
    const sugestao = reescreverFrase(f).trim();
    return lista.map(({ regra, trecho, frase, motivo }) => ({ regra, trecho, frase, motivo, sugestao }));
  });
  return { ok: achados.length === 0, achados };
}

export interface AlteracaoCFM {
  original: string; // a frase como foi gerada
  corrigido: string; // reescrita segura sugerida (nunca vazia: nada é apagado)
  motivos: string[];
  trechos: string[]; // palavras marcadas na frase original
  mantido: boolean; // true = a equipe escolheu manter o original
}

export interface ResultadoSeguro {
  texto: string; // o texto com as reescritas aplicadas (ou o original, nas frases mantidas)
  alteracoes: AlteracaoCFM[];
}

/**
 * Sinaliza e reescreve, sem nunca apagar frase nem item. O que fere a regra recebe uma reescrita
 * segura (aplicada por padrão) e fica listado com a frase original e as palavras marcadas. As frases
 * cuja forma original está em `manter` continuam como foram geradas (a equipe escolheu manter).
 */
export function tornarSeguro(texto: string, opcoes: { manter?: Iterable<string> } = {}): ResultadoSeguro {
  const manter = new Set(Array.from(opcoes.manter ?? [], (s) => s.trim()));
  const alteracoes: AlteracaoCFM[] = [];
  const partes: string[] = [];
  for (const f of frases(texto)) {
    const achados = achadosNaFrase(f);
    if (achados.length === 0) {
      partes.push(f);
      continue;
    }
    const motivos = Array.from(new Set(achados.map((a) => `${ROTULO_REGRA_CFM[a.regra]} ("${a.trecho}")`)));
    const trechos = Array.from(new Set(achados.map((a) => a.trecho)));
    const corrigido = reescreverFrase(f);
    const mantido = manter.has(f.trim());
    partes.push(mantido ? f : corrigido);
    alteracoes.push({ original: f.trim(), corrigido: corrigido.trim(), motivos, trechos, mantido });
  }
  return { texto: partes.join("").replace(/ {2,}/g, " ").trim(), alteracoes };
}
