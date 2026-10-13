// Checagem de linguagem segura para texto que vai ao cliente (Resolução CFM 2.336/2023).
//
// Regras simples e explicáveis, sem IA. Pega o que é claramente proibido ou
// arriscado em publicidade médica: promessa de resultado ("garantido", "100%",
// "cura", "antes e depois"), preço/promoção de serviço, nome de medicamento,
// superlativo ("o melhor", "único", "milagre"), sensacionalismo e @ de pessoa
// (identificação). Na dúvida, sinaliza: quem revisa decide.
//
// `tornarSeguro` tenta reescrever a frase (troca "o melhor" por "um bom", tira o
// nome do remédio, tira o @); quando não dá para reescrever sem mudar o sentido,
// a frase sai do texto. Toda alteração é devolvida para a tela mostrar.

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
  // reescrita: devolve o trecho substituto; sem reescrita, a frase sai.
  trocar?: (trechoOriginal: string) => string;
}

const PADROES: Padrao[] = [
  { regra: "promessa", re: /\bgarant(?:ido|ida|idos|idas|e|imos|ia|ir)\b/g, motivo: "promete resultado, o que a publicidade médica não pode fazer" },
  { regra: "promessa", re: /\b100 ?%/g, motivo: "\"100%\" soa como garantia de resultado" },
  { regra: "promessa", re: /\bcura(?:r|do|da|dos|das|m|ra|rá)?\b/g, motivo: "falar em cura promete resultado" },
  { regra: "promessa", re: /\bantes e depois\b/g, motivo: "\"antes e depois\" exibe resultado de paciente" },
  { regra: "promessa", re: /\bresultados? (?:certos?|garantidos?|imediatos?|definitivos?|rapidos?)\b/g, motivo: "promete o resultado ou o prazo" },
  { regra: "promessa", re: /\bsem (?:dor|riscos?|efeitos? colaterais|contraindicacao)\b/g, motivo: "nega risco, o que equivale a prometer resultado" },
  { regra: "promessa", re: /\b(?:solucao|tratamento) definitiv[oa]\b|\bde vez\b(?! em quando)|\bnunca mais\b/g, motivo: "promete resultado permanente" },
  { regra: "preco", re: /\b(?:preco|precos|promocao|promocoes|desconto|descontos|parcelamento|parcelad[oa]|gratis|gratuit[oa]|valor da consulta|quanto custa|cupom)\b/g, motivo: "preço e promoção de serviço médico não podem aparecer em divulgação" },
  { regra: "superlativo", re: /\b(?:o|a|os|as) melhor(?:es)?\b/g, motivo: "superlativo compara com outros médicos ou promete resultado", trocar: (t) => ({ "o melhor": "um bom", "a melhor": "uma boa", "os melhores": "bons", "as melhores": "boas" })[t.toLowerCase()] ?? t },
  { regra: "superlativo", re: /\bo mais (?:eficaz|eficiente|seguro|moderno|completo|indicado|avancado)\b|\bunic[oa]s? (?:que|capaz|no|na)\b|\binfalivel\b|\bmilagr(?:e|es|osa|oso)\b|\brevolucionari[oa]\b|\bnumero 1\b/g, motivo: "superlativo ou autopromoção" },
  { regra: "sensacionalismo", re: /\bchocante\b|\bvoce nao vai acreditar\b|\binacreditavel\b|\burgente\b|\bsegredo\b|\bbombastic[oa]\b/g, motivo: "tom sensacionalista" },
  { regra: "identificacao", re: /@[a-z0-9_.]{3,}/g, motivo: "@ de uma pessoa identifica alguém que não autorizou", trocar: () => "" },
];

// Minúsculo e sem acento, preservando o tamanho (para achar o trecho no original).
function dobrar(s: string): string {
  let out = "";
  for (const ch of s) {
    const base = ch.toLowerCase().normalize("NFD")[0] ?? ch;
    out += base.length === ch.length ? base : ch;
  }
  return out;
}

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

function achadosNaFrase(frase: string): (AchadoCFM & { ini: number; fim: number; padrao: Padrao })[] {
  const d = dobrar(frase);
  const out: (AchadoCFM & { ini: number; fim: number; padrao: Padrao })[] = [];
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
    const m = /r\$\s?[\d.,]+/.exec(d)!;
    out.push({ regra: "preco", trecho: frase.slice(m.index, m.index + m[0].length), frase: frase.trim(), motivo: "valor de serviço médico não pode aparecer em divulgação", ini: m.index, fim: m.index + m[0].length, padrao: { regra: "preco", re: /x/, motivo: "" } });
  }
  return out.sort((a, b) => a.ini - b.ini);
}

/** Aponta trechos de risco. Não muda o texto. */
export function checarLinguagemCFM(texto: string): { ok: boolean; achados: AchadoCFM[] } {
  const achados = frases(texto).flatMap((f) => achadosNaFrase(f).map(({ regra, trecho, frase, motivo }) => ({ regra, trecho, frase, motivo })));
  return { ok: achados.length === 0, achados };
}

export interface ResultadoSeguro {
  texto: string; // vazio se tudo foi removido
  alteracoes: { original: string; corrigido: string | null; motivos: string[] }[];
}

/** Reescreve o que dá para reescrever; frase que não dá, sai. */
export function tornarSeguro(texto: string): ResultadoSeguro {
  const alteracoes: ResultadoSeguro["alteracoes"] = [];
  const partes: string[] = [];
  for (const f of frases(texto)) {
    const achados = achadosNaFrase(f);
    if (achados.length === 0) {
      partes.push(f);
      continue;
    }
    const motivos = Array.from(new Set(achados.map((a) => `${ROTULO_REGRA_CFM[a.regra]} ("${a.trecho}")`)));
    if (achados.every((a) => a.padrao.trocar)) {
      let nova = "";
      let pos = 0;
      for (const a of achados) {
        if (a.ini < pos) continue; // sobreposição
        nova += f.slice(pos, a.ini) + a.padrao.trocar!(a.trecho);
        pos = a.fim;
      }
      nova += f.slice(pos);
      nova = nova.replace(/\(\s*\)/g, "").replace(/ {2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1");
      if (achadosNaFrase(nova).length === 0 && nova.trim()) {
        partes.push(nova);
        alteracoes.push({ original: f.trim(), corrigido: nova.trim(), motivos });
        continue;
      }
    }
    alteracoes.push({ original: f.trim(), corrigido: null, motivos });
  }
  return { texto: partes.join("").replace(/ {2,}/g, " ").trim(), alteracoes };
}
