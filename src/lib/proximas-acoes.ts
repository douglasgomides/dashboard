// Próximas ações: transforma os achados do painel em tarefas priorizadas, cada uma com severidade,
// categoria, recomendação, por que importa, impacto esperado, responsável e (fora daqui) status.
// Regras fixas e verificáveis sobre dados que o painel já tem. Nenhuma ação é executada sozinha.

import type { ProblemaDado } from "@/lib/client-data";
import type { DiagnosticoAds } from "@/lib/anuncios-objetivo";
import { resumirAtendimento, type LeituraConversaBanco, type ResumoAtendimento } from "@/lib/conversa-leitura";
import { CITACAO_HBR_RESPOSTA } from "@/lib/benchmarks";

export type Severidade = "alta" | "media" | "baixa";
export type Categoria = "dados" | "conteudo" | "anuncios" | "atendimento" | "crm";
export type Dono = "doctor_creator" | "cliente" | "trafego" | "conteudo" | "atendimento";
export type StatusAcao = "pendente" | "em_andamento" | "resolvido" | "ignorado";

export const ROTULO_SEVERIDADE: Record<Severidade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const ROTULO_CATEGORIA: Record<Categoria, string> = { dados: "Dados", conteudo: "Conteúdo", anuncios: "Anúncios", atendimento: "Atendimento", crm: "CRM" };
export const ROTULO_DONO: Record<Dono, string> = { doctor_creator: "Doctor Creator", cliente: "Cliente", trafego: "Tráfego", conteudo: "Conteúdo", atendimento: "Atendimento" };
export const ROTULO_STATUS_ACAO: Record<StatusAcao, string> = { pendente: "Pendente", em_andamento: "Em andamento", resolvido: "Resolvido", ignorado: "Ignorado" };

// O status fica na mesma tabela das Oportunidades (acoes_acompanhamento), com o prefixo "pa:" (cada tela lê o seu).
export const STATUS_PARA_BANCO: Record<StatusAcao, string> = { pendente: "nova", em_andamento: "em_execucao", resolvido: "concluida", ignorado: "dispensada" };
export function statusDoBanco(s: string | null | undefined): StatusAcao {
  if (s === "em_analise" || s === "em_execucao") return "em_andamento";
  if (s === "concluida" || s === "resultado_avaliado") return "resolvido";
  if (s === "dispensada" || s === "expirada" || s === "adiada") return "ignorado";
  return "pendente";
}

export interface ProximaAcao {
  id: string;
  severidade: Severidade;
  categoria: Categoria;
  recomendacao: string; // o que fazer, em uma frase
  porque: string; // por que isso importa
  impacto: string; // o que muda se fizer
  responsavel: Dono;
  evidencia: string; // o número que sustenta
  rota?: string; // onde ver o dado
}

export interface EntradaAcoes {
  problemas?: ProblemaDado[] | null;
  ads?: DiagnosticoAds | null;
  campanhasSemQualificado?: { campanha: string; gasto: number; leads: number }[] | null;
  posts?: { id?: string; permalink?: string | null; caption?: string | null; format?: string | null; reach?: number | null; saved?: number | null; shares?: number | null }[] | null;
  duvidas?: { rotulo: string; pessoas: number; resumo?: string; cuidadoMedico?: boolean; sugestaoPost?: { formato: string; titulo: string } | null }[] | null;
  atendimento?: ResumoAtendimento | null;
  /** Sem resposta, mas parados há mais de 7 dias (fora do "responder hoje"; caso de recuperação). */
  atendimentoParados?: number | null;
  precoPedidoSemResposta?: number | null;
  /** Perfil da clínica: esconde pendência interna de baixa severidade da equipe Doctor Creator. */
  ocultarInternasBaixas?: boolean;
}

/** Janela do "responder hoje": quem escreveu nos últimos 7 dias (a mesma do Plano da semana). */
export const DIAS_ESPERANDO = 7;

/**
 * Leitura das conversas para as ações de atendimento, dentro do período escolhido. Cards fechados na origem
 * (lead com resultado "closed") não contam. "Sem resposta" para responder hoje só vale para quem escreveu nos
 * últimos 7 dias; os mais antigos são contados à parte, como caso de recuperação.
 */
export function atendimentoParaAcoes(ls: LeituraConversaBanco[], de: string, ate: string, agora = Date.now()): { resumo: ResumoAtendimento; parados: number } | null {
  const ini = Date.parse(`${de.slice(0, 10)}T00:00:00-03:00`), fim = Date.parse(`${ate.slice(0, 10)}T23:59:59.999-03:00`);
  const doPeriodo = ls.filter((l) => {
    if (l.lead_resultado === "closed" || !l.ultima_msg_em) return false;
    const t = Date.parse(l.ultima_msg_em);
    return t >= ini && t <= fim;
  });
  if (!doPeriodo.length) return null;
  const recente = (l: LeituraConversaBanco) => Date.parse(l.ultima_msg_em!) >= agora - DIAS_ESPERANDO * 86_400_000;
  const geral = resumirAtendimento(doPeriodo);
  const recentes = resumirAtendimento(doPeriodo.filter(recente));
  const antigos = resumirAtendimento(doPeriodo.filter((l) => !recente(l)));
  return { resumo: { ...geral, semResposta: recentes.semResposta, soRobo: recentes.soRobo }, parados: antigos.semResposta };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

const DONO_DO_PROBLEMA: Record<string, Dono> = { equipe_hub: "doctor_creator", gestor_trafego: "trafego", social_media: "conteudo", atendimento: "atendimento", comercial: "cliente", medico: "cliente" };
const CATEGORIA_DO_PROBLEMA = (fonte: string): Categoria => (fonte === "crm" ? "crm" : fonte === "atendimento" ? "atendimento" : fonte === "anuncios" ? "anuncios" : "dados");
const ROTA_DA_FONTE: Record<string, string> = { crm: "/$clientId/crm-guia", anuncios: "/$clientId/anuncios", atendimento: "/$clientId/atendimento" };

export function montarProximasAcoes(e: EntradaAcoes): ProximaAcao[] {
  const out: ProximaAcao[] = [];

  // 1. Fontes paradas e lacunas de dado (qualidade_dados): sem isso, o resto do painel lê errado.
  for (const p of e.problemas ?? []) {
    // Pendência de configuração da equipe, de baixa severidade, não é tarefa da clínica.
    if (e.ocultarInternasBaixas && p.severidade === "baixa" && p.responsavel === "equipe_hub") continue;
    out.push({
      id: `dado-${p.id}`,
      severidade: p.severidade === "alta" ? "alta" : p.severidade === "baixa" ? "baixa" : "media",
      categoria: CATEGORIA_DO_PROBLEMA(p.fonte),
      recomendacao: p.correcao,
      porque: p.causa,
      impacto: `Corrige a leitura de: ${p.afeta}`,
      responsavel: DONO_DO_PROBLEMA[p.responsavel] ?? "doctor_creator",
      evidencia: p.evidencia?.trim() ? p.evidencia : p.titulo,
      rota: ROTA_DA_FONTE[p.fonte],
    });
  }

  // 2. Campanhas caras: o veredito oficial "Cortar" e "Atrai mas não converte", com o gasto do período.
  for (const c of e.ads?.campanhas ?? []) {
    if (c.vereditoOficial === "Cortar")
      out.push({
        id: `ads-cortar-${c.campaign_id}`,
        severidade: c.gasto >= 300 ? "alta" : "media",
        categoria: "anuncios",
        recomendacao: `Pausar ou refazer a campanha “${c.campanha}”.`,
        porque: c.motivo,
        impacto: `Libera até ${brl(c.gasto)} por período para campanhas que trazem resultado mais barato.`,
        responsavel: "trafego",
        evidencia: c.comparacao?.trim() ? c.comparacao : `${brl(c.gasto)} investidos no período`,
        rota: "/$clientId/anuncios",
      });
    else if (c.vereditoOficial === "Atrai mas não converte")
      out.push({
        id: `ads-converte-${c.campaign_id}`,
        severidade: "media",
        categoria: "anuncios",
        recomendacao: `Revisar a oferta, o público ou o destino da campanha “${c.campanha}” (a arte funciona).`,
        porque: c.motivo,
        impacto: "Transforma cliques que já estão pagos em conversas ou cadastros.",
        responsavel: "trafego",
        evidencia: c.comparacao?.trim() ? c.comparacao : `${brl(c.gasto)} investidos no período`,
        rota: "/$clientId/anuncios",
      });
  }

  // 3. Campanha que traz lead mas nenhum avança no CRM (qualidade_leads_campanha).
  for (const c of e.campanhasSemQualificado ?? []) {
    if (c.leads < 5) continue;
    out.push({
      id: `ads-qualidade-${c.campanha}`,
      severidade: c.gasto >= 300 ? "alta" : "media",
      categoria: "anuncios",
      recomendacao: `Rever o público ou o formulário da campanha “${c.campanha}”: ela traz lead, mas nenhum avança.`,
      porque: `${int(c.leads)} leads e nenhum chegou a qualificação, agendamento ou venda no CRM.`,
      impacto: `Evita gastar ${brl(c.gasto)} por período com contato que não vira paciente.`,
      responsavel: "trafego",
      evidencia: `${int(c.leads)} leads · ${brl(c.gasto)} investidos`,
      rota: "/$clientId/anuncios",
    });
  }

  // 4. Posts vencedores: o post que mais fez salvar em relação a quem viu, entre os de alcance típico ou maior.
  const posts = (e.posts ?? []).filter((p) => Number(p.reach) > 0);
  if (posts.length >= 5) {
    const med = mediana(posts.map((p) => Number(p.reach)));
    const taxa = (p: (typeof posts)[number]) => (Number(p.saved ?? 0) + Number(p.shares ?? 0)) / Number(p.reach);
    const candidatos = posts.filter((p) => Number(p.reach) >= med);
    const medTaxa = mediana(posts.map(taxa));
    const melhor = candidatos.sort((a, b) => taxa(b) - taxa(a))[0];
    if (melhor && taxa(melhor) > 0 && taxa(melhor) >= medTaxa * 1.5) {
      const tema = (melhor.caption ?? "").replace(/\s+/g, " ").slice(0, 70);
      out.push({
        id: `conteudo-vencedor-${melhor.id ?? tema}`,
        severidade: "baixa",
        categoria: "conteudo",
        recomendacao: `Fazer uma continuação do post “${tema}${tema.length === 70 ? "…" : ""}” no mesmo formato.`,
        porque: `Foi visto por mais gente que o post típico e fez ${(taxa(melhor) / Math.max(medTaxa, 1e-9)).toFixed(1).replace(".", ",")}x mais pessoas salvarem ou compartilharem.`,
        impacto: "Repetir o que já funcionou é a forma mais barata de ganhar alcance e seguidor qualificado.",
        responsavel: "conteudo",
        evidencia: `${int(Number(melhor.reach))} pessoas alcançadas · ${int(Number(melhor.saved ?? 0))} salvamentos · ${int(Number(melhor.shares ?? 0))} compartilhamentos`,
        rota: melhor.permalink ?? "/$clientId/posts",
      });
    }
  }

  // 5. Dúvidas recorrentes dos pacientes (2+ pessoas, sem pedido de dose): viram post.
  for (const d of (e.duvidas ?? []).filter((x) => x.pessoas >= 2 && !x.cuidadoMedico).slice(0, 3)) {
    out.push({
      id: `duvida-${d.rotulo}`,
      severidade: d.pessoas >= 5 ? "media" : "baixa",
      categoria: "conteudo",
      recomendacao: d.sugestaoPost ? `Responder em post (${d.sugestaoPost.formato}): “${d.sugestaoPost.titulo}”.` : `Responder em post a dúvida “${d.rotulo}”.`,
      porque: `${int(d.pessoas)} pessoas diferentes perguntaram isso nos comentários.`,
      impacto: "Conteúdo que responde a dúvida real tende a gerar salvamento e conversa no WhatsApp.",
      responsavel: "conteudo",
      evidencia: d.resumo ?? `${int(d.pessoas)} pessoas`,
      rota: "/$clientId/duvidas",
    });
  }

  // 6. WhatsApp: paciente sem resposta, demora e preço pedido sem resposta.
  const at = e.atendimento;
  if (at && at.comPaciente > 0) {
    if (at.semResposta > 0)
      out.push({
        id: "atend-sem-resposta",
        severidade: at.semResposta >= 5 ? "alta" : "media",
        categoria: "atendimento",
        recomendacao: `Responder hoje os ${int(at.semResposta)} pacientes que escreveram nos últimos ${DIAS_ESPERANDO} dias e ficaram sem resposta.`,
        porque: `A última mensagem dessas conversas é do paciente${at.soRobo ? ` (${int(at.soRobo)} só receberam mensagem automática)` : ""}.`,
        impacto: "É o lead mais barato que existe: já pediu contato e só falta resposta.",
        responsavel: "atendimento",
        evidencia: `${int(at.semResposta)} conversas dos últimos ${DIAS_ESPERANDO} dias esperando a clínica${(e.atendimentoParados ?? 0) === 1 ? ". Outra conversa está parada há mais tempo (ver Recuperação)" : (e.atendimentoParados ?? 0) > 1 ? `. Outras ${int(e.atendimentoParados ?? 0)} estão paradas há mais tempo (ver Recuperação)` : ""}`,
        rota: "/$clientId/conversas",
      });
    if (!at.semResposta && (e.atendimentoParados ?? 0) >= 3)
      out.push({
        id: "atend-parados",
        severidade: "baixa",
        categoria: "atendimento",
        recomendacao: `Retomar os ${int(e.atendimentoParados ?? 0)} pacientes que ficaram sem resposta há mais de ${DIAS_ESPERANDO} dias.`,
        porque: "A última mensagem é do paciente, mas faz tempo: vale uma mensagem de retomada, não uma resposta de rotina.",
        impacto: "Parte desses pacientes ainda pode agendar se for chamada de novo.",
        responsavel: "atendimento",
        evidencia: `${int(e.atendimentoParados ?? 0)} conversas do período paradas há mais de ${DIAS_ESPERANDO} dias`,
        rota: "/$clientId/agentes",
      });
    if ((at.medianaPrimeiraResposta ?? 0) > 3600)
      out.push({
        id: "atend-demora",
        severidade: "media",
        categoria: "atendimento",
        recomendacao: "Responder a primeira mensagem em até 1 hora no horário comercial.",
        porque: `Hoje a primeira resposta de uma pessoa leva ${Math.round((at.medianaPrimeiraResposta ?? 0) / 60)} min (mediana).`,
        impacto: CITACAO_HBR_RESPOSTA,
        responsavel: "atendimento",
        evidencia: `Mediana da 1ª resposta humana: ${Math.round((at.medianaPrimeiraResposta ?? 0) / 60)} min`,
        rota: "/$clientId/conversas",
      });
  }
  if ((e.precoPedidoSemResposta ?? 0) >= 3)
    out.push({
      id: "atend-preco",
      severidade: "alta",
      categoria: "atendimento",
      recomendacao: "Responder o valor quando o paciente perguntar, junto com o que está incluso e duas opções de horário.",
      porque: `${int(e.precoPedidoSemResposta ?? 0)} pacientes pediram preço e não receberam.`,
      impacto: "É o ponto em que a conversa mais esfria; responder o valor mantém o paciente no funil.",
      responsavel: "atendimento",
      evidencia: `${int(e.precoPedidoSemResposta ?? 0)} conversas em que o preço foi pedido e não foi dado (leitura das conversas)`,
      rota: "/$clientId/conversas",
    });

  // Ordem: severidade, depois categoria de dado antes (sem dado certo, o resto engana).
  const pesoSev: Record<Severidade, number> = { alta: 0, media: 1, baixa: 2 };
  const pesoCat: Record<Categoria, number> = { dados: 0, crm: 1, atendimento: 2, anuncios: 3, conteudo: 4 };
  const vistos = new Set<string>();
  return out
    .filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true)))
    .sort((a, b) => pesoSev[a.severidade] - pesoSev[b.severidade] || pesoCat[a.categoria] - pesoCat[b.categoria]);
}
