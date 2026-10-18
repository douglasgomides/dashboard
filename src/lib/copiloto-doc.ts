// Copiloto dos documentos do SAP (Plano de ação e Relatório D90): em vez de a equipe escrever cada seção do zero, a IA
// lê tudo o que o sistema sabe da clínica (ficha, Brand Brain, conversas, CRM, Instagram, sessões, lições aprendidas),
// escreve o rascunho e PERGUNTA só o que os dados não respondem, como num chat. Cada resposta da equipe vira fato
// proposto no Brand Brain: a próxima seção, o próximo documento e todos os agentes já sabem.
// Servidor: api/_lib/copiloto.ts. Testes: scripts/test-copiloto-doc.ts.

import { MEMORIAS, chaveValida, textoSemDadoPessoal, type Memoria } from "./brand-brain.js";

export interface Turno { papel: "ia" | "equipe"; texto: string }
export interface Pergunta { pergunta: string; por_que: string; opcoes: string[] }
export interface FatoAprendido { memoria: Memoria; chave: string; valor: string }
export interface RespostaCopiloto { rascunho: string; perguntas: Pergunta[]; fontes: string[]; aprendidos: FatoAprendido[]; confianca: "alta" | "media" | "baixa" }

const txt = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "");
const semTravessao = (t: string) => t.replace(/\s*[—–]\s*|\s+-\s+(?=\S)/g, ", ");

export function sistemaCopiloto(titulo: string, dica: string): string {
  return `Você é o estrategista sênior da Doctor Creator escrevendo, junto com a equipe, a seção "${titulo}" de um documento oficial para uma clínica médica.
O que a seção deve ter: ${dica}
Como trabalhar (como um bom consultor num chat):
1. Use TUDO o que está no contexto da clínica: ficha, Brand Brain, conversas do WhatsApp, CRM, Instagram, sessões e lições aprendidas. Cite números reais quando existirem e diga de onde vieram em "fontes".
2. Escreva o melhor rascunho possível JÁ, mesmo com lacunas. Onde faltar algo essencial, deixe [entre colchetes] o que precisa ser confirmado.
3. Faça no máximo 3 perguntas, só sobre o que os dados NÃO respondem e que muda o texto (ex.: ticket desejado, serviço que a médica quer priorizar). Para cada uma, diga em 1 frase por que importa e ofereça de 2 a 4 opções prováveis tiradas dos dados (a equipe clica ou escreve). Nunca pergunte o que já está no contexto ou já foi respondido na conversa.
4. Quando a equipe responder, reescreva o rascunho incorporando a resposta e registre em "aprendidos" cada fato novo e durável sobre a clínica (memoria: identidade, audiencia, comercial, criativa ou decisao; chave em snake_case curta; valor em 1 frase). Não registre o que já está no Brain.
5. Se não restar dúvida relevante, devolva "perguntas": [] e "confianca": "alta".
Regras: português do Brasil, direto, frases curtas, sem travessão, sem jargão. Nunca invente número, resultado ou depoimento. Nada de dado de paciente (nome, telefone, caso clínico). Sem promessa de resultado nem preço promocional (CFM). Antes e depois só como história (a jornada do paciente, com contexto educativo), com autorização por escrito do paciente e sem promessa de resultado (CFM 2.336/2023).
Responda SOMENTE JSON: {"rascunho":"texto da seção","perguntas":[{"pergunta":"...","por_que":"...","opcoes":["..."]}],"fontes":["conversas do WhatsApp (n = 212)"],"aprendidos":[{"memoria":"comercial","chave":"ticket_desejado","valor":"..."}],"confianca":"media"}`;
}

export function validarCopiloto(bruto: unknown, chavesBrain: Set<string>): RespostaCopiloto | null {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const rascunho = semTravessao(txt(b.rascunho, 3500));
  if (rascunho.length < 20 || !textoSemDadoPessoal(rascunho)) return null;
  const perguntas = (Array.isArray(b.perguntas) ? b.perguntas : []).slice(0, 3).map((p) => {
    const x = (p ?? {}) as Record<string, unknown>;
    return { pergunta: txt(x.pergunta, 220), por_que: txt(x.por_que, 220), opcoes: (Array.isArray(x.opcoes) ? x.opcoes : []).map((o) => txt(o, 120)).filter((o) => o.length >= 1).slice(0, 4) };
  }).filter((p) => p.pergunta.length >= 8);
  const memorias = new Set(MEMORIAS.map((m) => m.id));
  const aprendidos: FatoAprendido[] = [];
  for (const a of Array.isArray(b.aprendidos) ? b.aprendidos : []) {
    const x = (a ?? {}) as Record<string, unknown>;
    const memoria = String(x.memoria ?? "") as Memoria, chave = String(x.chave ?? ""), valor = semTravessao(txt(x.valor, 400));
    if (!memorias.has(memoria) || !chaveValida(chave) || valor.length < 5 || !textoSemDadoPessoal(valor) || chavesBrain.has(`${memoria}.${chave}`)) continue;
    if (aprendidos.some((y) => y.memoria === memoria && y.chave === chave)) continue;
    aprendidos.push({ memoria, chave, valor });
    if (aprendidos.length >= 6) break;
  }
  const fontes = (Array.isArray(b.fontes) ? b.fontes : []).map((f) => txt(f, 120)).filter(Boolean).slice(0, 8);
  const confianca = b.confianca === "alta" || b.confianca === "baixa" ? b.confianca : "media";
  return { rascunho, perguntas, fontes, aprendidos, confianca };
}

/** A conversa vira texto para a IA (última resposta da equipe por último). */
export function conversaParaTexto(turnos: Turno[]): string {
  return turnos.slice(-12).map((t) => `${t.papel === "ia" ? "IA" : "Equipe"}: ${txt(t.texto, 1500)}`).join("\n\n");
}
