// Campanhas do mês: datas especiais por especialidade + campanhas sugeridas a partir dos dados do
// cliente (reativação, ativação, retorno, conteúdo da data, anúncio), cada uma com projeção.
// O painel NÃO dispara mensagem nem cria anúncio: sugere, monta o texto e acompanha o status.
// Regras CFM: nada de preço, desconto, promoção ou garantia de resultado nas mensagens e pautas.
import { grupoEspecialidade } from "./benchmark-estrategico.js";
import { fmtFracao } from "./metricas.js";

export type Area = "Ginecologia" | "Dermatologia" | "Oftalmologia" | "Nutrologia/Endocrinologia" | "Cardiologia" | "Ortopedia" | "Pediatria" | "Psiquiatria" | "Cirurgia plástica" | "Outras";

export interface DataEspecial {
  id: string;
  mes: number; // 1..12
  dia?: number; // ausente = o mês todo
  nome: string;
  tema: string;
  areas: Area[] | "todas";
  angulo: string; // como usar a data sem cair em promoção
  cuidado?: string;
}

// Datas de saúde e comerciais mais usadas no marketing médico no Brasil (revisar a cada ano).
export const CALENDARIO: DataEspecial[] = [
  { id: "jan-branco", mes: 1, nome: "Janeiro Branco", tema: "saúde mental", areas: "todas", angulo: "Começo de ano e cuidado com a mente: como a sua especialidade se liga ao bem-estar emocional." },
  { id: "jan-roxo", mes: 1, nome: "Janeiro Roxo", tema: "hanseníase", areas: ["Dermatologia"], angulo: "Sinais de pele que merecem avaliação; diagnóstico precoce." },
  { id: "verao", mes: 1, nome: "Verão e férias", tema: "proteção solar e rotina de férias", areas: ["Dermatologia", "Oftalmologia", "Pediatria"], angulo: "Cuidados práticos de verão: sol, olhos, crianças em férias." },
  { id: "dia-obesidade", mes: 3, dia: 4, nome: "Dia Mundial da Obesidade", tema: "obesidade como doença", areas: ["Nutrologia/Endocrinologia"], angulo: "Tirar a culpa e explicar o tratamento médico." },
  { id: "dia-mulher", mes: 3, dia: 8, nome: "Dia Internacional da Mulher", tema: "saúde da mulher", areas: "todas", angulo: "Check-ups que toda mulher deveria conhecer na sua área.", cuidado: "Evitar tom de promoção ('mês da mulher com condição especial')." },
  { id: "marco-lilas", mes: 3, nome: "Março Lilás", tema: "câncer de colo do útero", areas: ["Ginecologia"], angulo: "Preventivo e HPV: quando fazer e por quê." },
  { id: "glaucoma", mes: 3, dia: 12, nome: "Dia Mundial do Glaucoma", tema: "glaucoma", areas: ["Oftalmologia"], angulo: "Doença silenciosa: quem precisa medir a pressão do olho." },
  { id: "dia-saude", mes: 4, dia: 7, nome: "Dia Mundial da Saúde", tema: "prevenção", areas: "todas", angulo: "O exame mais esquecido da sua especialidade." },
  { id: "abril-azul", mes: 4, nome: "Abril Azul", tema: "autismo", areas: ["Pediatria", "Psiquiatria"], angulo: "Sinais do desenvolvimento que merecem atenção." },
  { id: "maes", mes: 5, nome: "Dia das Mães (2º domingo)", tema: "mães", areas: "todas", angulo: "Cuidado com quem cuida: saúde da mãe na sua área.", cuidado: "Sem 'presente' ou pacote com desconto (CFM)." },
  { id: "hipertensao", mes: 5, dia: 17, nome: "Dia Mundial da Hipertensão", tema: "pressão alta", areas: ["Cardiologia", "Nutrologia/Endocrinologia", "Oftalmologia"], angulo: "Pressão alta e o que ela faz no coração, nos olhos e no metabolismo." },
  { id: "namorados", mes: 6, dia: 12, nome: "Dia dos Namorados", tema: "autoestima e casal", areas: ["Dermatologia", "Cirurgia plástica", "Ginecologia"], angulo: "Autoestima com informação segura.", cuidado: "Sem antes e depois e sem promessa de resultado (CFM)." },
  { id: "ferias-julho", mes: 7, nome: "Férias de julho", tema: "check-up das férias", areas: ["Oftalmologia", "Pediatria", "Ortopedia"], angulo: "Aproveitar as férias para a consulta que ficou para depois (ex.: visão das crianças)." },
  { id: "agosto-dourado", mes: 8, nome: "Agosto Dourado", tema: "amamentação", areas: ["Ginecologia", "Pediatria"], angulo: "Dúvidas reais sobre amamentação, respondidas pelo médico." },
  { id: "pais", mes: 8, nome: "Dia dos Pais (2º domingo)", tema: "saúde do homem", areas: "todas", angulo: "Convidar o pai a fazer o check-up que ele adia." },
  { id: "setembro-amarelo", mes: 9, nome: "Setembro Amarelo", tema: "prevenção do suicídio", areas: ["Psiquiatria", "Outras"], angulo: "Informação, acolhimento e onde buscar ajuda.", cuidado: "Tema sensível: sem detalhes de método, sempre com canal de ajuda (CVV 188)." },
  { id: "coracao", mes: 9, dia: 29, nome: "Dia Mundial do Coração", tema: "saúde do coração", areas: ["Cardiologia", "Nutrologia/Endocrinologia"], angulo: "Hábitos e exames que protegem o coração." },
  { id: "outubro-rosa", mes: 10, nome: "Outubro Rosa", tema: "câncer de mama", areas: "todas", angulo: "Rastreamento e autocuidado; a sua especialidade no cuidado da mulher." },
  { id: "visao", mes: 10, nome: "Dia Mundial da Visão (2ª quinta)", tema: "saúde ocular", areas: ["Oftalmologia"], angulo: "Quando fazer o exame de vista em cada idade." },
  { id: "criancas", mes: 10, dia: 12, nome: "Dia das Crianças", tema: "saúde infantil", areas: ["Pediatria", "Oftalmologia", "Dermatologia"], angulo: "Cuidados da infância na sua especialidade." },
  { id: "menopausa", mes: 10, dia: 18, nome: "Dia Mundial da Menopausa", tema: "menopausa", areas: ["Ginecologia", "Nutrologia/Endocrinologia", "Dermatologia"], angulo: "Sintomas que não são 'normais de aguentar' e o que dá para tratar." },
  { id: "medico", mes: 10, dia: 18, nome: "Dia do Médico", tema: "bastidores", areas: "todas", angulo: "Bastidores, formação e por que escolheu a especialidade (autoridade)." },
  { id: "novembro-azul", mes: 11, nome: "Novembro Azul", tema: "saúde do homem", areas: "todas", angulo: "Check-up masculino na sua área." },
  { id: "diabetes", mes: 11, dia: 14, nome: "Dia Mundial do Diabetes", tema: "diabetes", areas: ["Nutrologia/Endocrinologia", "Oftalmologia", "Cardiologia"], angulo: "Diabetes e as complicações que dá para prevenir (olhos, coração)." },
  { id: "black-friday", mes: 11, nome: "Black Friday", tema: "comercial", areas: "todas", angulo: "Usar a atenção do mês para conteúdo de valor, não para oferta.", cuidado: "CFM proíbe desconto e promoção de serviço médico: nada de 'Black Friday' com preço." },
  { id: "dezembro-laranja", mes: 12, nome: "Dezembro Laranja", tema: "câncer de pele", areas: ["Dermatologia"], angulo: "Pintas que merecem avaliação e proteção no verão." },
  { id: "fim-de-ano", mes: 12, nome: "Fim de ano e Natal", tema: "agenda e planejamento", areas: "todas", angulo: "Comunicar a agenda de dezembro/janeiro e convidar para a consulta de começo de ano.", cuidado: "Sem 'presente de Natal' com condição especial." },
  { id: "metas-ano", mes: 12, dia: 26, nome: "Metas de saúde para o ano novo", tema: "planejamento de saúde", areas: ["Nutrologia/Endocrinologia", "Dermatologia", "Cardiologia", "Ginecologia"], angulo: "Um plano de saúde realista para o ano, sem promessas." },
];

export function datasDoMes(mes: number, especialidade: string | null | undefined): DataEspecial[] {
  const area = grupoEspecialidade(especialidade) as Area;
  return CALENDARIO.filter((d) => d.mes === mes && (d.areas === "todas" || d.areas.includes(area))).sort((a, b) => (a.dia ?? 0) - (b.dia ?? 0));
}

// ---------------------------------------------------------------- campanhas

export interface BaseCampanhas {
  tem_crm: boolean;
  abertos: number;
  parados_90d: number;
  parados_30_90d: number;
  novos_parados_14d: number;
  ganhos_ha_um_ano: number;
  perdidos_180d: number;
  leads_90d: number;
  agendados_90d: number;
  ganhos_90d: number;
}

export type TipoCampanha = "reativacao" | "ativacao" | "retorno" | "conteudo" | "anuncio" | "atendimento";

export interface Projecao {
  publico: number | null; // pessoas que recebem / alcance
  resposta: { pct: number; n: number } | null;
  consultas: number | null;
  custo: number | null; // R$
  regua: string; // de onde vêm os percentuais
  estimativa: boolean;
}

export interface Campanha {
  id: string; // estável no mês
  tipo: TipoCampanha;
  titulo: string;
  porque: string; // o dado que sustenta
  passos: string[];
  mensagem?: string; // texto pronto para a equipe (sem preço/promoção)
  canal: string;
  responsavel: string;
  projecao: Projecao;
  data?: DataEspecial;
  faltaDado?: string; // quando não dá para montar com dado do cliente
  prioridade: number; // maior primeiro
}

export interface EntradaCampanhas {
  mes: number;
  ano: number;
  especialidade: string | null;
  nomeMedico: string;
  base: BaseCampanhas | null;
  semResposta?: number; // conversas com paciente sem resposta (leitura_conversas)
  temaForte?: { tema: string; formato: string; alcanceMediano: number; salvamentoMediano: number } | null;
  ads?: { custoPorConversa: number | null; gastoDiaMedio: number | null; melhorCampanha: string | null } | null;
}

// Réguas conservadoras quando o cliente não tem histórico (sempre marcadas como estimativa).
export const REGUA = {
  respostaReativacao: 0.06, // 5–8% em base fria por WhatsApp; usamos o meio-baixo
  respostaAtivacao: 0.2,
  respostaRetorno: 0.25,
  agendaPorResposta: 0.25,
  agendaPorConversaAnuncio: 0.15,
} as const;

const n = (x: number) => Math.round(x).toLocaleString("pt-BR");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const primeiroNome = (nome: string) => nome.replace(/^(dr\.?|dra\.?)\s+/i, "").split(/\s+/)[0] ?? nome;

/** Taxa de agendamento do próprio cliente (90 dias) quando há base; senão a régua. */
export function taxaAgenda(b: BaseCampanhas | null): { taxa: number; propria: boolean } {
  if (b && b.leads_90d >= 30 && b.agendados_90d > 0) return { taxa: Math.min(0.6, b.agendados_90d / b.leads_90d), propria: true };
  return { taxa: REGUA.agendaPorResposta, propria: false };
}

export function sugerirCampanhas(e: EntradaCampanhas): Campanha[] {
  const out: Campanha[] = [];
  const b = e.base;
  const doc = primeiroNome(e.nomeMedico);
  const agenda = taxaAgenda(b);
  const reguaAgenda = agenda.propria ? `agendamento de ${fmtFracao(agenda.taxa)} (dos leads deste cliente nos últimos 90 dias)` : `agendamento de ${fmtFracao(agenda.taxa)} (referência; o CRM não tem histórico suficiente)`;
  const proj = (publico: number, resp: number, reguaResp: string): Projecao => {
    const r = Math.round(publico * resp);
    return { publico, resposta: { pct: resp, n: r }, consultas: Math.round(r * agenda.taxa), custo: null, regua: `Resposta de ${fmtFracao(resp)} (${reguaResp}) e ${reguaAgenda}.`, estimativa: true };
  };

  // 1. Reativação: leads em aberto parados há 90+ dias.
  if (!b?.tem_crm) {
    out.push({ id: "reativacao", tipo: "reativacao", titulo: "Reativação de leads antigos", porque: "Sem CRM ligado, não dá para saber quantos leads esfriaram.", passos: [], canal: "WhatsApp", responsavel: "Atendimento", projecao: { publico: null, resposta: null, consultas: null, custo: null, regua: "", estimativa: true }, faltaDado: "Ligar o CRM do cliente (Admin > cliente > CRM).", prioridade: 1 });
  } else if (b.parados_90d >= 20) {
    const lote = Math.min(b.parados_90d, 300); // lote por mês: não dispara para a base inteira de uma vez
    out.push({
      id: "reativacao",
      tipo: "reativacao",
      titulo: `Reativar ${n(lote)} leads parados há mais de 90 dias`,
      porque: `${n(b.parados_90d)} leads em aberto no CRM não se movem há mais de 90 dias. São pessoas que já demonstraram interesse.${b.parados_90d > lote ? ` Sugerimos um lote de ${n(lote)} por mês, começando pelos mais recentes.` : ""}`,
      passos: ["Filtrar no CRM os leads em aberto sem movimento há 90+ dias (mais recentes primeiro).", "Enviar a mensagem abaixo pelo WhatsApp da clínica, de forma individual.", "Quem responder: atender em até 1 hora e oferecer horário.", "Quem não responder em 7 dias: mover para perdido com motivo 'sem retorno', para limpar a base."],
      mensagem: `Olá, [nome]! Aqui é da equipe ${e.nomeMedico}. Você conversou com a gente há um tempo sobre [assunto]. Ficou alguma dúvida? Se quiser, vejo um horário para você com ${doc}.`,
      canal: "WhatsApp (envio individual pela equipe)",
      responsavel: "Atendimento/secretária",
      projecao: proj(lote, REGUA.respostaReativacao, "referência de base fria"),
      prioridade: 9,
    });
  }

  // 2. Ativação: leads novos que esfriaram nas primeiras semanas.
  if (b?.tem_crm && b.novos_parados_14d >= 5) {
    out.push({
      id: "ativacao",
      tipo: "ativacao",
      titulo: `Ativar ${n(b.novos_parados_14d)} leads novos que pararam`,
      porque: `${n(b.novos_parados_14d)} leads que entraram nos últimos 45 dias estão sem movimento há 14+ dias. Lead novo esfria rápido: é a campanha de maior retorno por mensagem.`,
      passos: ["Listar no CRM os leads criados no último mês e parados há 2 semanas.", "Mandar uma mensagem curta retomando a dúvida que a pessoa trouxe.", "Oferecer 2 horários concretos.", "Marcar no CRM a etapa certa depois do contato."],
      mensagem: `Oi, [nome]! Vi que você falou com a gente sobre [assunto] e a conversa ficou parada. Posso te ajudar com alguma dúvida? Tenho horário com ${doc} [dia] ou [dia].`,
      canal: "WhatsApp",
      responsavel: "Atendimento/secretária",
      projecao: proj(b.novos_parados_14d, REGUA.respostaAtivacao, "referência para lead recente"),
      prioridade: 10,
    });
  }

  // 3. Conversas sem resposta: antes de qualquer campanha, responder quem já chamou.
  if ((e.semResposta ?? 0) >= 3) {
    out.push({
      id: "sem-resposta",
      tipo: "atendimento",
      titulo: `Responder ${n(e.semResposta!)} pacientes que ficaram sem resposta`,
      porque: `${n(e.semResposta!)} conversas do WhatsApp terminam com mensagem do paciente sem resposta da equipe. Antes de buscar gente nova, recuperar quem já chamou.`,
      passos: ["Abrir Comercial > Conversas e filtrar 'sem resposta'.", "Responder da mais recente para a mais antiga, pedindo desculpa pela demora.", "Combinar com a equipe um tempo máximo de resposta (ideal: 1 hora no horário comercial)."],
      mensagem: "Olá, [nome]! Desculpe a demora em responder. Ainda posso te ajudar com [assunto]?",
      canal: "WhatsApp",
      responsavel: "Atendimento/secretária",
      projecao: proj(e.semResposta!, 0.3, "referência para quem já iniciou a conversa"),
      prioridade: 11,
    });
  }

  // 4. Retorno anual: ganhos de 11 a 13 meses atrás.
  if (b?.tem_crm && b.ganhos_ha_um_ano >= 5) {
    out.push({
      id: "retorno",
      tipo: "retorno",
      titulo: `Lembrete de retorno anual para ${n(b.ganhos_ha_um_ano)} pacientes`,
      porque: `${n(b.ganhos_ha_um_ano)} pacientes fecharam há cerca de um ano. Lembrar do acompanhamento é cuidado, e costuma ter a maior taxa de resposta.`,
      passos: ["Filtrar no CRM os ganhos de 11 a 13 meses atrás.", "Enviar o lembrete de acompanhamento (sem oferta).", "Agendar quem responder e registrar no CRM."],
      mensagem: `Olá, [nome]! Faz cerca de um ano da sua consulta com ${doc}. Para o seu acompanhamento, é um bom momento para a revisão. Quer que eu veja um horário?`,
      canal: "WhatsApp",
      responsavel: "Atendimento/secretária",
      projecao: proj(b.ganhos_ha_um_ano, REGUA.respostaRetorno, "referência para paciente que já consultou"),
      prioridade: 8,
    });
  }

  // 5. Conteúdo das datas do mês, com o tema que o público mais salva.
  for (const d of datasDoMes(e.mes, e.especialidade).slice(0, 3)) {
    const forte = e.temaForte;
    out.push({
      id: `data-${d.id}`,
      tipo: "conteudo",
      titulo: `${d.nome}: série de conteúdo sobre ${d.tema}`,
      porque: `${d.nome}${d.dia ? ` (${String(d.dia).padStart(2, "0")}/${String(d.mes).padStart(2, "0")})` : " (o mês todo)"} combina com a especialidade.${forte ? ` O formato que mais é salvo neste perfil é ${forte.formato}; o tema "${forte.tema}" é o que o público mais guarda.` : ""}`,
      passos: [d.angulo, `Publicar 2 a 3 posts na semana da data${forte ? `, priorizando ${forte.formato}` : ""}.`, "Fechar com chamada para tirar dúvidas no WhatsApp (sem oferta)."],
      canal: "Instagram (orgânico)",
      responsavel: "Social media",
      projecao: forte
        ? { publico: Math.round(forte.alcanceMediano * 3), resposta: null, consultas: null, custo: null, regua: `3 posts × alcance típico de ${n(forte.alcanceMediano)} por post neste perfil (${forte.formato}).`, estimativa: true }
        : { publico: null, resposta: null, consultas: null, custo: null, regua: "Sem posts suficientes para projetar alcance.", estimativa: true },
      data: d,
      prioridade: 5,
    });
  }

  // 6. Anúncio de apoio à data/campanha principal.
  const a = e.ads;
  if (a?.custoPorConversa && a.custoPorConversa > 0) {
    const orcamento = Math.max(300, Math.round(((a.gastoDiaMedio ?? 10) * 30) / 50) * 50);
    const conversas = Math.round(orcamento / a.custoPorConversa);
    out.push({
      id: "anuncio",
      tipo: "anuncio",
      titulo: "Anúncio de mensagem para o tema do mês",
      porque: `Hoje cada conversa pelo anúncio custa ${brl(a.custoPorConversa)}.${a.melhorCampanha ? ` A campanha que melhor converte é "${a.melhorCampanha}": usar como base.` : ""}`,
      passos: ["Duplicar a campanha que melhor converte e trocar o criativo pelo tema do mês.", "Orçamento sugerido abaixo; revisar em 7 dias pelo custo por conversa.", "Atendimento preparado para responder em até 1 hora."],
      canal: "Meta Ads (mensagem no WhatsApp)",
      responsavel: "Gestor de tráfego",
      projecao: { publico: null, resposta: { pct: 1, n: conversas }, consultas: Math.round(conversas * REGUA.agendaPorConversaAnuncio), custo: orcamento, regua: `Orçamento de ${brl(orcamento)} no mês ÷ custo atual por conversa (${brl(a.custoPorConversa)}); 15% das conversas viram agendamento (referência).`, estimativa: true },
      prioridade: 6,
    });
  }

  return out.sort((x, y) => y.prioridade - x.prioridade);
}

/** Soma das projeções (só o que é número): o "potencial do mês". */
export function potencial(cs: Campanha[]): { respostas: number; consultas: number; custo: number } {
  return cs.reduce(
    (s, c) => ({ respostas: s.respostas + (c.projecao.resposta?.n ?? 0), consultas: s.consultas + (c.projecao.consultas ?? 0), custo: s.custo + (c.projecao.custo ?? 0) }),
    { respostas: 0, consultas: 0, custo: 0 },
  );
}

export const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
