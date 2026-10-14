// Tom do relatório (direto, consultivo, premium), blocos de pendências do cliente e da semana seguinte,
// e tradução de jargão. O conteúdo é o mesmo conferido em relatorio-envio; aqui só muda como é dito.
import { montarExecutiva, montarWhatsapp, saudacao, LIMITE_WHATSAPP, type ConteudoEnvio, type EnvioInput, type EstiloTexto } from "@/lib/relatorio-envio";

export type Tom = "direto" | "consultivo" | "premium";

export const ROTULO_TOM: Record<Tom, { nome: string; descricao: string }> = {
  direto: { nome: "Direto", descricao: "Curto, só os fatos e o que fazer." },
  consultivo: { nome: "Consultivo", descricao: "Explica o porquê de cada ponto e o impacto no consultório." },
  premium: { nome: "Premium", descricao: "Mais cuidadoso e institucional, para médico que prefere formalidade." },
};

export interface Extras {
  pendencias: string[]; // o que depende do cliente (acesso, CRM, pagamento)
  proximaSemana: string[]; // pautas e ações já planejadas
}

function estilo(nome: string, periodo: string, tom: Tom, x: Extras): EstiloTexto {
  const extras: EstiloTexto["extras"] = [];
  if (tom === "direto") {
    if (x.proximaSemana.length) extras.push({ titulo: "Próxima semana", itens: x.proximaSemana });
    if (x.pendencias.length) extras.push({ titulo: "Precisamos de você", itens: x.pendencias });
    return {
      abertura: `${saudacao(nome)}, resumo de ${periodo}:`,
      cab: { resumo: "*Números*", vitorias: "*✅ Deu certo*", atencao: "*⚠️ Atenção*", acoes: "*Fazer agora*", testes: "*Testar*", limitacoes: "*Dado incompleto*" },
      fechamento: "PDF completo em anexo.",
      extras,
    };
  }
  if (tom === "premium") {
    if (x.proximaSemana.length) extras.push({ titulo: "Planejamento da próxima semana", itens: x.proximaSemana });
    if (x.pendencias.length) extras.push({ titulo: "Pontos que dependem da sua equipe", itens: x.pendencias });
    return {
      abertura: `Olá, ${saudacao(nome)}. Compartilho a leitura do seu posicionamento digital em ${periodo}, com o que avançou e as decisões para as próximas semanas.`,
      cab: { resumo: "*Panorama do período*", vitorias: "*Destaques*", atencao: "*Pontos de atenção*", acoes: "*Recomendações*", testes: "*Próximos testes*", limitacoes: "*Sobre os dados*" },
      fechamento: "O relatório detalhado segue em PDF. Fico à disposição para conversarmos sobre os próximos passos.",
      extras,
    };
  }
  if (x.proximaSemana.length) extras.push({ titulo: "Para a próxima semana", itens: x.proximaSemana });
  if (x.pendencias.length) extras.push({ titulo: "O que precisamos de você (e por quê)", itens: x.pendencias });
  return {
    abertura: `Olá, ${saudacao(nome)}! Segue o resumo de ${periodo}, com o que cada número significa para o consultório.`,
    cab: { resumo: "*Resumo do período*", vitorias: "*✅ O que está trazendo resultado*", atencao: "*⚠️ O que pode estar custando pacientes*", acoes: "*O que recomendamos*", testes: "*O que vamos testar*", limitacoes: "*O que ainda não dá para medir*" },
    fechamento: "No PDF está o detalhe de cada ponto. Se quiser, marcamos 15 minutos para decidir as prioridades juntos.",
    extras,
  };
}

// Termo técnico → explicação curta. Só a 1ª ocorrência ganha a explicação, para o texto não ficar pesado.
const JARGAO: [RegExp, (m: string) => string][] = [
  [/\bCTR\b/, (m) => `${m} (de cada 100 pessoas que viram o anúncio, quantas clicaram)`],
  [/\bCPM\b/, (m) => `${m} (custo para o anúncio aparecer mil vezes)`],
  [/\bCPC\b/, (m) => `${m} (custo de cada clique)`],
  [/\bCPL\b/, (m) => `${m} (custo de cada contato)`],
  [/\bcusto por lead\b/i, () => "custo por contato"],
  [/\bleads?\b/i, (m) => `${m} (contatos interessados)`],
  [/\btaxa de engajamento\b/i, (m) => `${m} (curtidas, comentários, salvamentos e compartilhamentos sobre quem viu)`],
  [/\bfrequência\b/i, (m) => `${m} (quantas vezes a mesma pessoa viu o anúncio)`],
  [/\bROAS\b/, (m) => `${m} (quanto voltou em venda para cada real investido)`],
];

/** Explica o jargão na primeira vez que aparece. Não mexe em texto já explicado. */
export function semJargao(texto: string): string {
  let t = texto;
  for (const [re, fn] of JARGAO) {
    const m = t.match(re);
    if (!m || m.index == null) continue;
    const depois = t.slice(m.index + m[0].length, m.index + m[0].length + 3);
    if (depois.startsWith(" (")) continue; // já explicado
    t = t.slice(0, m.index) + fn(m[0]) + t.slice(m.index + m[0].length);
  }
  return t;
}

export function textosComTom(
  inp: Pick<EnvioInput, "clientName" | "periodLabel">,
  conteudo: ConteudoEnvio,
  tom: Tom,
  extras: Extras,
  opcoes: { explicarTermos?: boolean } = {},
): { whatsapp: string; executiva: string } {
  const e = estilo(inp.clientName, inp.periodLabel, tom, extras);
  const limite = tom === "direto" ? Math.round(LIMITE_WHATSAPP * 0.8) : LIMITE_WHATSAPP;
  let whatsapp = montarWhatsapp(inp, conteudo, limite, e);
  let executiva = montarExecutiva(inp, conteudo, { extras: e.extras, fechamento: tom === "premium" ? e.fechamento : undefined });
  if (opcoes.explicarTermos) {
    whatsapp = semJargao(whatsapp);
    executiva = semJargao(executiva);
  }
  return { whatsapp, executiva };
}

/** Pendências do cliente a partir dos problemas de dado (qualidade_dados) e do motivo das fontes paradas. */
export function pendenciasDoCliente(
  problemas: { responsavel: string; titulo: string; correcao: string; afeta?: string }[],
  motivosFontes: { dono: string; texto: string }[] = [],
): string[] {
  const out: string[] = [];
  for (const m of motivosFontes) if (m.dono === "cliente") out.push(m.texto);
  for (const p of problemas) {
    if (p.responsavel === "equipe_hub") continue; // é nosso, não pendência do cliente
    const afeta = p.afeta ? ` Até resolver, fica distorcido: ${p.afeta.charAt(0).toLowerCase()}${p.afeta.slice(1).replace(/\.$/, "")}.` : "";
    out.push(`${p.correcao.replace(/\.$/, "")}.${afeta}`);
  }
  return [...new Set(out)].slice(0, 5);
}
