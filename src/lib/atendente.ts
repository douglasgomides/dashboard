// Atendente de IA (piloto). Regras puras, testadas em scripts/test-atendente.ts; o servidor fica em api/_lib/atendente.ts.
//
// Nível 1: responder a primeira mensagem do paciente em menos de 1 minuto, só com fatos aprovados no Brand Brain
// (endereço, horário, convênios, como agendar...), e passar para uma pessoa tudo o que não souber, tudo o que for
// clínico, urgente ou reclamação. Nunca diagnostica, nunca indica tratamento, nunca inventa agenda ou valor.
//
// Modos (atendente_config): desligado → sombra (escreve a resposta, NÃO envia, e compara com o que a secretária
// respondeu e quanto ela demorou). Envio real só depois da confirmação técnica do envio pelo WhatsApp da clínica e de
// nova autorização.

import { ferirCFM } from "./campanhas-ia.js";
import { textoSemDadoPessoal } from "./brand-brain.js";

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(DIACRITICOS, "").replace(/\s+/g, " ").trim();
const txt = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[ \t]+/g, " ").trim().slice(0, max) : "");
const semTravessao = (t: string) => t.replace(/\s*[—–]\s*|\s+-\s+/g, ", ");

/** Fatos operacionais que o atendente pode usar (memória "comercial", chave com prefixo atend_). */
export const FATOS_ATENDIMENTO: Record<string, string> = {
  atend_endereco: "Endereço e como chegar (referência, estacionamento)",
  atend_horario: "Dias e horários de atendimento da clínica",
  atend_convenios: "Convênios aceitos ou se é só particular (e se emite recibo para reembolso)",
  atend_pagamento: "Formas de pagamento aceitas",
  atend_valores: "Valor da consulta ou de procedimentos, exatamente como a clínica informa",
  atend_como_agendar: "Como funciona o agendamento (o que a secretária pede ao paciente)",
  atend_procedimentos: "Procedimentos e serviços que a clínica faz",
  atend_profissionais: "Quem atende (médica e equipe) e em quais dias, se houver",
  atend_preparo: "Preparo ou orientações antes da consulta ou procedimento",
  atend_retorno: "Como funciona o retorno e o envio de resultados",
  atend_cancelamento: "Regra para remarcar ou cancelar",
};
export const ehFatoAtendimento = (chave: string) => chave.startsWith("atend_");

// ---------------------------------------------------------------- o que disparou a resposta

export interface Msg { id: string; direcao: string; texto: string | null; tipo: string | null; enviada_em: string }
export interface Gatilho { mensagem_id: string; em: string; texto: string; qtd: number }

/** O "turno" do paciente que espera resposta: as mensagens de entrada depois da última saída da clínica.
 *  Sem entrada pendente (a clínica já respondeu), não há gatilho. */
export function gatilhoPendente(msgs: Msg[]): Gatilho | null {
  const xs = [...msgs].sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
  let ultSaida = -1;
  xs.forEach((m, i) => { if (m.direcao === "saida") ultSaida = i; });
  const bloco = xs.slice(ultSaida + 1).filter((m) => m.direcao === "entrada");
  if (!bloco.length) return null;
  const ult = bloco[bloco.length - 1];
  const texto = bloco.map((m) => (m.texto && m.texto.trim()) || (m.tipo && m.tipo !== "text" ? `[${m.tipo}]` : "")).filter(Boolean).join("\n").slice(0, 1200);
  if (!texto) return null;
  return { mensagem_id: ult.id, em: ult.enviada_em, texto, qtd: bloco.length };
}

/** Todos os turnos do paciente que terminaram depois de `desde` (respondidos ou não), cada um com o histórico que
 *  existia ANTES dele. Assim o modo sombra cobre todas as mensagens, não só as que ficaram sem resposta, e o rascunho
 *  nunca "vê" a resposta da secretária. */
export function gatilhosRecentes(msgs: Msg[], desde: string): (Gatilho & { antes: Msg[] })[] {
  const xs = [...msgs].sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
  const out: (Gatilho & { antes: Msg[] })[] = [];
  let i = 0;
  while (i < xs.length) {
    if (xs[i].direcao !== "entrada") { i++; continue; }
    let j = i;
    while (j + 1 < xs.length && xs[j + 1].direcao !== "saida") j++;
    const g = gatilhoPendente(xs.slice(0, j + 1));
    if (g && g.em >= desde) out.push({ ...g, antes: xs.slice(0, j + 1) });
    i = j + 1;
  }
  return out;
}

/** Primeira resposta humana depois do gatilho (para comparar com o rascunho). */
export function respostaHumana(msgs: Msg[], depoisDe: string): { texto: string; em: string; segundos: number } | null {
  const xs = [...msgs].filter((m) => m.direcao === "saida" && m.enviada_em > depoisDe && m.tipo !== "kommo_robo").sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
  const m = xs[0];
  if (!m) return null;
  return { texto: (m.texto ?? (m.tipo ? `[${m.tipo}]` : "")).slice(0, 800), em: m.enviada_em, segundos: Math.max(0, Math.round((Date.parse(m.enviada_em) - Date.parse(depoisDe)) / 1000)) };
}

// ---------------------------------------------------------------- risco: sempre para uma pessoa

const URGENCIA = /\b(falta de ar|sem ar|desmai|convuls|sangr(amento|ando|ou)|hemorrag|dor (muito )?(forte|insuportavel|intensa)|febre (alta|de 39|de 40)|incha(c|ç)o (grande|forte|no rosto|na boca|na garganta)|reacao alergica|alergia (forte|grave)|nao consigo respirar|infarto|avc|perdi a visao|visao turva de repente|necrose|ficou roxo|pus\b|infeccionou|emergencia|urgente|urgencia|pronto[- ]socorro|suicid|me matar)\b/;
const CLINICO = /\b(posso tomar|devo tomar|qual remedio|que remedio|dose|dosagem|mg\b|e normal (ficar|estar|sentir|ter)|isso e grave|e grave\b|o que (eu )?tenho|sera que (eu )?tenho|resultado do (meu )?exame|meu exame deu|diagnostic|parar (de tomar|o remedio)|efeito colateral|reacao depois|apos o procedimento|depois do procedimento|depois da aplicacao)\b/;
const RECLAMACAO = /\b(reclama|absurdo|pessimo|horrivel|descaso|procon|reclame aqui|advogado|processo|denunciar|cancelar (tudo|meu)|quero (meu )?dinheiro de volta|estorno|reembolso)\b/;

export type Risco = "urgencia" | "clinico" | "reclamacao" | null;
export function riscoDaMensagem(t: string): Risco {
  const n = norm(t);
  if (URGENCIA.test(n)) return "urgencia";
  if (RECLAMACAO.test(n)) return "reclamacao";
  if (CLINICO.test(n)) return "clinico";
  return null;
}
export const MENSAGEM_URGENCIA = "Se for uma urgência, procure agora o pronto-socorro mais próximo ou ligue 192 (SAMU). Já avisei a equipe da clínica para falar com você o quanto antes.";

// ---------------------------------------------------------------- validação do rascunho

export interface Rascunho { acao: "responder" | "passar_humano"; mensagem: string; motivo: string; fatos: string[]; faltou: string[] }

// Data, dia da semana ou horário: só valem se estiverem escritos nos fatos aprovados (ex.: o horário da clínica).
const AGENDA = /\b\d{1,2}\s+de\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}(:\d{2}|h\d{0,2})\b|\b(segunda|ter[çc]a|quarta|quinta|sexta)(-feira)?\b|\bs[áa]bado\b|\bdomingo\b|\bamanh[ãa]\b|\bhoje [àa]s?\b/gi;
const VALOR = /r\$\s?\d+(?:[.,]\d+)*/gi;
const DIAGNOSTICO = /\b(voc[êe] (tem|est[áa] com)|parece (ser|que [ée])|provavelmente [ée]|recomendo (usar|tomar|aplicar|fazer)|tome\b|use (um|uma|o|a)\b|pode tomar|aplique)\b/i;
const ESTADO_AGENDA = /\b(est[áa]|segue|fica|ficou|j[áa] est[áa])\s+(confirmad|agendad|marcad|remarcad|cancelad)|\b(confirmei|agendei|marquei|remarquei|cancelei)\b|\btemos (vaga|hor[áa]rio)\b|\bh[áa] (vaga|hor[áa]rio)\b/i;

/** O rascunho passa se: ação válida, texto curto, sem travessão, sem dado pessoal, sem diagnóstico ou indicação, sem
 *  afirmar agenda (vaga, confirmado), e com data/hora/valor apenas se estiverem nos fatos aprovados. */
export function validarRascunho(bruto: unknown, fatosAprovados: Record<string, string>): { ok: Rascunho | null; erro: string | null } {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const acao = b.acao === "responder" || b.acao === "passar_humano" ? b.acao : null;
  if (!acao) return { ok: null, erro: "ação inválida" };
  const mensagem = semTravessao(txt(b.mensagem, 700));
  if (mensagem.length < 10) return { ok: null, erro: "mensagem vazia ou curta" };
  const base = norm(Object.values(fatosAprovados).join(" \n "));
  const foraDosFatos = (re: RegExp) => (mensagem.match(re) ?? []).filter((m) => !base.includes(norm(m)));
  const agenda = foraDosFatos(AGENDA);
  if (agenda.length) return { ok: null, erro: `data ou horário fora dos fatos aprovados (${agenda[0]})` };
  const valores = foraDosFatos(VALOR);
  if (valores.length) return { ok: null, erro: `valor fora dos fatos aprovados (${valores[0]})` };
  const cfm = ferirCFM(mensagem.replace(VALOR, ""));
  if (cfm) return { ok: null, erro: `fere o CFM (${cfm})` };
  if (DIAGNOSTICO.test(mensagem)) return { ok: null, erro: "parece diagnóstico ou indicação de tratamento" };
  if (ESTADO_AGENDA.test(mensagem)) return { ok: null, erro: "afirma agenda ou vaga, que o atendente não conhece" };
  if (!textoSemDadoPessoal(mensagem.replace(/\b192\b/, ""))) return { ok: null, erro: "dado pessoal" };
  const chaves = new Set(Object.keys(fatosAprovados));
  const fatos = (Array.isArray(b.fatos) ? b.fatos : []).map(String).filter((k) => chaves.has(k)).slice(0, 8);
  const faltou = (Array.isArray(b.faltou) ? b.faltou : []).map((x) => txt(x, 120)).filter((x) => x.length >= 3).slice(0, 5);
  return { ok: { acao, mensagem, motivo: semTravessao(txt(b.motivo, 240)), fatos, faltou }, erro: null };
}

// ---------------------------------------------------------------- prompt

export function sistemaAtendente(nomeClinica: string): string {
  return `Você é o atendente de WhatsApp da clínica ${nomeClinica || "médica"}, no primeiro contato com o paciente. Uma pessoa da equipe continua a conversa depois.
Objetivo: responder rápido, com acolhimento, e deixar o paciente pronto para a secretária agendar.
REGRAS (inegociáveis):
- Use SOMENTE os fatos aprovados da clínica listados. Se a resposta depende de algo que não está lá, diga que vai confirmar com a equipe e registre em "faltou" o que faltou saber.
- Nunca invente data, horário livre, vaga, valor, convênio ou nome de profissional. Nunca diga que algo está agendado, confirmado ou cancelado.
- Nada clínico: não diagnostique, não diga se algo é normal ou grave, não indique remédio, dose ou tratamento. Nesse caso, "passar_humano".
- Urgência, reclamação, pedido de reembolso, resultado de exame ou pós-procedimento: "passar_humano".
- Sem preço promocional, desconto, brinde ou promessa de resultado (CFM). Valor só se estiver nos fatos, exatamente igual.
- Português do Brasil, natural, como uma boa secretária escreve no WhatsApp: 1 a 4 frases curtas, sem travessão, no máximo 1 emoji se combinar com o tom da clínica. Comece cumprimentando pelo nome só se o paciente disse o nome; senão, sem nome.
- Para agendar: diga como funciona (pelo fato "atend_como_agendar", se existir) e pergunte o que a secretária precisa (preferência de período, se é primeira consulta, convênio ou particular).
- Termine com uma pergunta simples que faça a conversa andar.
Responda SOMENTE JSON: {"acao":"responder|passar_humano","mensagem":"texto para o paciente (se passar_humano, uma frase acolhedora dizendo que a equipe já vai responder)","motivo":"por que, em 1 frase","fatos":["chaves usadas"],"faltou":["informação que faltou nos fatos, se houver"]}`;
}

export const SISTEMA_FATOS = `Você lê respostas que a secretária de uma clínica médica mandou para pacientes no WhatsApp e extrai os FATOS OPERACIONAIS da clínica que se repetem: endereço, horário, convênios, formas de pagamento, valores informados, como agendar, procedimentos, profissionais, preparo, retorno e regra de remarcação.
Regras: só o que aparece de forma consistente em mais de uma resposta (diga em "vezes" quantas); copie valores e horários exatamente; nunca inclua nome, telefone ou dado de paciente; se houver informações conflitantes, use a mais recente e diga em "observacao". Não invente.
Chaves permitidas: ${Object.keys(FATOS_ATENDIMENTO).join(", ")}.
Responda SOMENTE JSON: {"fatos":[{"chave":"atend_horario","valor":"texto curto e completo","vezes":5,"observacao":"opcional"}]}`;

/** Fatos extraídos das respostas da secretária, prontos para propor no Brain (sem dado pessoal, chave permitida,
 *  visto pelo menos 2 vezes). */
export function validarFatos(bruto: unknown): { chave: string; valor: string; vezes: number }[] {
  const xs = Array.isArray((bruto as { fatos?: unknown })?.fatos) ? ((bruto as { fatos: unknown[] }).fatos as Record<string, unknown>[]) : [];
  const vistos = new Set<string>();
  const out: { chave: string; valor: string; vezes: number }[] = [];
  for (const f of xs) {
    const chave = String(f?.chave ?? "");
    const valor = semTravessao(txt(f?.valor, 400));
    const vezes = Number(f?.vezes ?? 0);
    if (!(chave in FATOS_ATENDIMENTO) || vistos.has(chave) || valor.length < 5 || !(vezes >= 2) || !textoSemDadoPessoal(valor)) continue;
    vistos.add(chave);
    out.push({ chave, valor, vezes });
  }
  return out;
}

// ---------------------------------------------------------------- painel

export interface LinhaRascunho { acao: string; tempo_humano_s: number | null; resposta_humana: string | null; faltou: string[]; avaliacao: string | null; risco: string | null }

/** Números do piloto: quanto o atendente teria respondido sozinho e quanto a clínica demora hoje. */
export function resumoPiloto(xs: LinhaRascunho[]) {
  const total = xs.length;
  const responderia = xs.filter((x) => x.acao === "responder").length;
  const tempos = xs.map((x) => x.tempo_humano_s).filter((t): t is number => t != null).sort((a, b) => a - b);
  const med = tempos.length ? tempos[Math.floor(tempos.length / 2)] : null;
  const demorou = tempos.filter((t) => t > 15 * 60).length;
  const semResposta = xs.filter((x) => x.resposta_humana == null).length;
  const faltou = new Map<string, number>();
  for (const x of xs) for (const f of x.faltou ?? []) { const k = norm(f).slice(0, 60); faltou.set(k, (faltou.get(k) ?? 0) + 1); }
  const avaliadas = xs.filter((x) => x.avaliacao);
  return {
    total, responderia, passaria: total - responderia, medianaHumanoS: med, demorou15: demorou, comTempo: tempos.length, semResposta,
    boas: avaliadas.filter((x) => x.avaliacao === "boa").length, ruins: avaliadas.filter((x) => x.avaliacao === "ruim").length,
    riscos: xs.filter((x) => x.risco).length,
    faltou: [...faltou.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
}

export function duracao(s: number | null): string {
  if (s == null) return "sem resposta";
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86_400) return `${(s / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return `${Math.round(s / 86_400)} dia${Math.round(s / 86_400) === 1 ? "" : "s"}`;
}
