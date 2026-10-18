import { z } from "zod";
import { textoSemDadoPessoal } from "./brand-brain.js";

const text = z.string().trim().min(12).max(800);
const label = z.string().trim().min(2).max(200);
export const CAMPAIGN_METRICS = {
  leads_origem: { indicador: "Leads por origem identificada", formula: "Contagem de leads únicos com origem comprovada no período e na mesma clínica.", fonte: "CRM com vínculo de origem; sem vínculo, não atribuído." },
  tempo_primeira_resposta: { indicador: "Tempo até a primeira resposta", formula: "Data/hora da primeira resposta da clínica menos data/hora da primeira mensagem recebida; somente conversas com cobertura e ambos os eventos.", fonte: "Eventos de mensagens autorizados; sem ambos os horários, indisponível." },
  taxa_agendamento: { indicador: "Taxa de agendamento da coorte", formula: "Leads únicos da coorte com agendamento administrativo confirmado ÷ leads elegíveis da mesma coorte × 100.", fonte: "CRM com etapa explicitamente mapeada ou agenda autorizada; ganho não confirma agendamento." },
  comparecimento: { indicador: "Taxa de comparecimento", formula: "Agendamentos com comparecimento confirmado ÷ agendamentos elegíveis do mesmo período × 100.", fonte: "Agenda com status de presença; sem conector autorizado, indisponível." },
} as const;
const metricCode = z.enum(["leads_origem", "tempo_primeira_resposta", "taxa_agendamento", "comparecimento"]);
const action = z.object({
  acao: text, canal: label, publico: text, entrega: text,
  responsavel: label, quando: label, proximo_passo: text,
  rastreio: text, dependencias: z.array(text).max(6),
  mensagem: z.string().trim().min(12).max(800),
});
export const campaignStrategySchema = z.object({
  versao: z.literal(1),
  diagnostico: text, hipotese: text, objetivo: text,
  evidencias_ids: z.array(z.string().min(1).max(80)).min(1).max(8),
  lacunas: z.array(text).min(1).max(8),
  posicionamento: text, oferta: text,
  online: z.array(action).min(1).max(4),
  presencial: z.array(action).min(1).max(4),
  jornada: z.array(z.object({
    etapa: z.enum(["captacao", "atendimento", "agendamento", "consulta", "continuidade"]),
    conduta: text, responsavel: label, registro: text,
  })).length(5).refine((xs) => new Set(xs.map((x) => x.etapa)).size === 5, "Jornada incompleta"),
  fases: z.array(z.object({ fase: label, periodo: label, entrega: text, criterio_avanco: text })).min(3).max(5),
  recursos: z.array(z.object({ item: label, responsavel: label, valor_estimado: z.number().finite().nonnegative().nullable(), confirmacao: label })).min(2).max(8),
  medicao: z.array(z.object({ codigo: metricCode.optional(), indicador: label, formula: label, fonte: label, frequencia: label, regra_decisao: text })).min(3).max(6),
  riscos: z.preprocess((v) => typeof v === "string" ? [v] : v, z.array(text).min(1).max(8)),
});
export type CampaignStrategy = z.infer<typeof campaignStrategySchema>;
export type CampaignEvidence = { id: string; fonte: string; periodo: string; fatos: string[]; limitacoes: string[] };

export function validateCampaignStrategy(raw: unknown, sources: CampaignEvidence[]) {
  const parsed = campaignStrategySchema.safeParse(raw);
  if (!parsed.success) return { error: `Plano incompleto: ${parsed.error.issues.slice(0,5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  if (parsed.data.medicao.some((m) => !m.codigo) || new Set(parsed.data.medicao.map((m) => m.codigo)).size !== parsed.data.medicao.length)
    return { error: "Plano precisa selecionar indicadores distintos do catálogo de medição." };
  parsed.data.medicao = parsed.data.medicao.map((m) => ({ ...m, ...CAMPAIGN_METRICS[m.codigo!] }));
  const ids = new Set(sources.map((s) => s.id));
  if (parsed.data.evidencias_ids.some((id) => !ids.has(id))) return { error: "Plano cita fonte que não foi lida para esta clínica." };
  // O observado é composto de fatos lidos. A interpretação do modelo fica separada como hipótese.
  const observed: string[] = [];
  for (const source of [...sources].sort((a,b) => Number(b.id === "crm") - Number(a.id === "crm"))) {
    if (!parsed.data.evidencias_ids.includes(source.id)) continue;
    for (const fact of source.fatos.filter((f) => f.length < 300).slice(0,2)) {
      const line = `${source.fonte}: ${fact}`;
      if ([...observed,line].join(". ").length <= 570) observed.push(line);
    }
  }
  parsed.data.diagnostico = `${observed.join(". ")}. Ganho no CRM não confirma agendamento, comparecimento ou receita recebida. Causas e resultados da campanha exigem verificação.`;
  const strings: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(parsed.data);
  if (!strings.every(textoSemDadoPessoal)) return { error: "Plano contém possível identificador pessoal." };
  return { data: parsed.data };
}

/** Texto copiável contém o plano completo, sem substituir campos ausentes por afirmações. */
export function campaignStrategyText(p: CampaignStrategy): string {
  return [
    `Diagnóstico: ${p.diagnostico}`, `Hipótese a testar: ${p.hipotese}`, `Objetivo: ${p.objetivo}`,
    `Posicionamento: ${p.posicionamento}`, `Oferta para revisão: ${p.oferta}`,
    `Dados ausentes: ${p.lacunas.join("; ")}`,
    ...([["ONLINE", p.online], ["PRESENCIAL", p.presencial]] as const).flatMap(([label, actions]) => [label, ...actions.map((a) => `${a.acao}\nCanal: ${a.canal}\nPúblico: ${a.publico}\nEntrega: ${a.entrega}\nResponsável: ${a.responsavel}\nQuando: ${a.quando}\nMensagem para revisão: ${a.mensagem}\nPróximo passo: ${a.proximo_passo}\nRastreio: ${a.rastreio}\nDependências: ${a.dependencias.join("; ") || "Sem dependência informada"}`)]),
    "JORNADA COMERCIAL", ...p.jornada.map((j) => `${j.etapa}: ${j.conduta}\nResponsável: ${j.responsavel}\nRegistro: ${j.registro}`),
    "EXECUÇÃO", ...p.fases.map((f) => `${f.fase} · ${f.periodo}\n${f.entrega}\nAvançar quando: ${f.criterio_avanco}`),
    "RECURSOS A APROVAR", ...p.recursos.map((r) => `${r.item}: ${r.valor_estimado === null ? "valor a levantar" : r.valor_estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${r.responsavel}\n${r.confirmacao}`),
    "MEDIÇÃO", ...p.medicao.map((m) => `${m.indicador}\nFórmula: ${m.formula}\nFonte: ${m.fonte}\nFrequência: ${m.frequencia}\nDecisão: ${m.regra_decisao}`),
    `Riscos e cuidados: ${p.riscos.join("; ")}`,
  ].join("\n\n");
}

export const CAMPAIGN_STRATEGY_PROMPT = `Você planeja crescimento comercial para uma clínica médica. Entregue UM plano integrado, não uma lista de ideias. Use exclusivamente os serviços confirmados e o Brand Brain aprovado. FOCO: {FOCO}.
Ligue diagnóstico → hipótese → objetivo → oferta → aquisição online e presencial → atendimento → agendamento → consulta → continuidade. Explique por que a combinação foi escolhida para esta clínica e qual gargalo cada ação enfrenta.
Cada canal deve ter entrega executável, público, mensagem em tom da marca, papel responsável (a equipe atribuirá uma pessoa), janela de execução, dependências, próximo passo e rastreamento. Online pode combinar conteúdo, anúncios e relacionamento conforme dados. Presencial pode combinar recepção, orientação durante a consulta, materiais educativos, eventos ou parcerias locais; valide a viabilidade, sem presumir parceiros, autorizações, indicação remunerada ou acesso a uma base de pacientes. Não force um evento sem logística; o atendimento presencial da própria clínica é um canal possível.
Consulta significa comunicação e experiência administrativa; não proponha conduta clínica, exames, tratamentos ou retorno desnecessário. Interesse de saúde não deve virar segmentação sensível de anúncio. Reativação só com acesso e finalidade autorizados. Nenhum contato ou publicação será executado por este plano.
Não invente capacidade da agenda, taxas de conversão, baseline, metas aprovadas, investimento disponível ou receita recebida. Metas e valores de recursos são propostas pendentes de aprovação; use valor_estimado:null sem base de custo. Diferencie ganho no CRM de comparecimento e recebimento. Converta dados ausentes em dependências explícitas antes da execução. Use evidencias_ids somente do catálogo recebido. Não declare eficácia comprovada nem causalidade.
Defina pelo menos três fases (preparo, teste, revisão) com critério de avanço. Pelo menos três indicadores devem especificar fórmula, fonte, frequência e regra de decisão: quais evidências levam a manter, ajustar ou interromper. Dê instrução de UTM/código de origem para digital e código/QR identificado para presencial, com confirmação na origem do CRM; associação sem prova fica não atribuída.
Diagnóstico deve descrever apenas o observado; causas possíveis pertencem à hipótese. Uma coorte com poucas oportunidades ganhas não prova a causa da perda nem a conversão em consultas. Não proponha metas numéricas ou regras percentuais sem baseline verificado e aprovação. Ações de teste só iniciam depois do preparo aprovado. Não repita restrições como "sem desconto" no texto da oferta; cuidados ficam em riscos.
Campos base: tipo (${["captacao", "reativacao", "retorno", "atendimento", "parceria", "evento", "conteudo", "anuncio"].join(", ")}), titulo (8–140 caracteres), publico, oferta, canal, mensagem, porque, evidencias, brain (somente chaves aprovadas), passos (resumo), metrica, esforco (baixo/medio/alto), prazo_dias (7–60).
Campo estrategia obrigatório: {versao:1,diagnostico,hipotese,objetivo,evidencias_ids:[id],lacunas:[texto],posicionamento,oferta,online:[acao],presencial:[acao],jornada:[{etapa,conduta,responsavel,registro}],fases:[{fase,periodo,entrega,criterio_avanco}],recursos:[{item,responsavel,valor_estimado,confirmacao}],medicao:[{codigo,indicador,formula,fonte,frequencia,regra_decisao}],riscos:[texto]}.
Selecione três ou quatro indicadores distintos. Códigos e fórmulas são definidos pelo servidor: ${JSON.stringify(CAMPAIGN_METRICS)}. Não invente fórmulas ou equivalências; se a fonte está ausente, registre indisponibilidade e dependência de integração.
acao = {acao,canal,publico,entrega,responsavel,quando,proximo_passo,rastreio,dependencias:[texto],mensagem}. Descrições têm 12 a 800 caracteres; rótulos de canal, responsável, prazo, fase e indicador podem ser curtos (2 a 200 caracteres). Jornada contém exatamente as cinco etapas: captacao, atendimento, agendamento, consulta, continuidade. Uma a quatro ações online e uma a quatro presenciais; três a cinco fases; dois a oito recursos; três a seis indicadores. Seja específico e econômico, com tarefas realizáveis.
Copy pública sem promessas clínicas, garantia, pressão artificial, preço promocional, brinde ou dados pessoais. Revisão médica e publicitária pela equipe antes de usar. Sem nomes ou contatos de pacientes.
Responda SOMENTE JSON {"ideias":[{campos base...,"estrategia":{plano completo}}]}.`;
