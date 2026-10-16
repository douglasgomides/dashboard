// SAP · Como operamos: quem faz o quê, a rotina da semana e quando usar o app ou outra ferramenta.
// Fonte: 11.02 · Operação Enxuta v2 (núcleo mínimo, rotina semanal, ritos, ferramentas). O app passa a ser o lugar
// dos números e do que vence; ClickUp guarda horas e evidências (o piloto mede horas), Drive guarda documentos.
// Dados puros (teste: scripts/test-sap-operacao.ts).

export type IdFuncao = "fundador" | "condutor" | "coordenador" | "cs" | "trafego" | "editor" | "comercial" | "clinica";

export interface Funcao {
  id: IdFuncao;
  nome: string;
  horas: string; // dedicação no piloto (3 a 5 clínicas)
  acumula: string;
  faz: string[];
  noApp: string[]; // telas que essa função mais usa
}

export const FUNCOES: Funcao[] = [
  {
    id: "fundador", nome: "Fundador (escalonamento)", horas: "2 a 4 h/semana", acumula: "Não acumula operação",
    faz: ["Recebe os alertas: duas semanas vermelhas no Score de Saúde, prévia da garantia a partir do D75", "Decide exceções: desconto, escopo, pausa acima de 30 dias", "Janela de sexta: aprovações e clínicas em risco"],
    noApp: ["Todas as clínicas (alertas para o Fundador)", "Minhas tarefas em todas as clínicas"],
  },
  {
    id: "condutor", nome: "Condutor", horas: "4 a 6 h/semana", acumula: "No piloto, é o Fundador; depois, alguém da equipe",
    faz: ["Conduz o Kickoff, as Sessões 1, 2 e 6 e o D90", "Conduz a call em grupo semanal", "Revisa o Relatório D90"],
    noApp: ["Minhas tarefas", "Reuniões", "Plano e relatório D90"],
  },
  {
    id: "coordenador", nome: "Coordenador de Implementação", horas: "25 a 35 h/semana", acumula: "Pode acumular o Analista de Onboarding; com até 3 clínicas, também o CS",
    faz: ["Dono do programa de cada clínica: cronograma, prazos e pausas", "Registro de cada sessão em até 48 h", "Liberação dos anúncios (go/no-go) no D27 a D29", "Checkpoint D60, prévia D85 e Score de Saúde na sexta"],
    noApp: ["Minhas tarefas", "Reuniões", "Cronograma", "Quem é quem", "Execução e saúde", "Rastreamento (conferência)"],
  },
  {
    id: "cs", nome: "CS e Relacionamento", horas: "15 a 20 h/semana", acumula: "Pode ser a mesma pessoa do Coordenador com até 3 clínicas",
    faz: ["Contato do dia a dia com a clínica e lembretes", "Sessões 4 e 5 e treino da recepção", "Auditoria semanal de 10 conversas por clínica", "Leads parados: avisar a recepção"],
    noApp: ["Minhas tarefas (leads em atenção)", "Leitura da semana (auditoria com IA e atendentes)", "Reuniões"],
  },
  {
    id: "trafego", nome: "Gestor de Tráfego", horas: "12 a 15 h/semana", acumula: "Interno ou parceiro com contrato e SLA",
    faz: ["Sessão 3 e rastreamento (16 testes antes de subir anúncio)", "Leitura semanal na segunda, com o Coordenador", "Otimização de campanhas na terça"],
    noApp: ["Rastreamento", "Mídia", "Leitura da semana"],
  },
  {
    id: "editor", nome: "Editor e Copy", horas: "15 a 20 h/semana", acumula: "Copy e editor da equipe atual",
    faz: ["Gravação dirigida e edição", "Banco de criativos sem rosto", "Depoimentos D60 e D90 (piloto)"],
    noApp: ["Minhas tarefas", "Cronograma"],
  },
  {
    id: "comercial", nome: "Comercial", horas: "Conforme a agenda de vendas", acumula: "Não acumula entrega",
    faz: ["Vende e fecha o contrato (D0)", "Passa a clínica para o CS com as notas da qualificação"],
    noApp: ["Todas as clínicas (cadastrar nova clínica)"],
  },
  {
    id: "clinica", nome: "Clínica (decisor e recepção)", horas: "Sessões + rotina combinada", acumula: "Decisor presente nas sessões; uma pessoa da recepção treinável",
    faz: ["Decisor nas sessões e respondendo no grupo", "Recepção: responder rápido, confirmar na véspera, fazer follow-up e registrar no CRM", "Executar as ações combinadas da semana"],
    noApp: ["Minhas tarefas", "Painel da clínica", "Números da semana", "Metas e garantia"],
  },
];

export interface Rito { quando: string; rito: string; quem: string; duracao: string; ondeNoApp: string }

/** Rotina semanal da equipe (11.02, seção 3), com a tela do app onde cada rito acontece. */
export const RITOS: Rito[] = [
  { quando: "Segunda, 9h", rito: "Reunião de operação", quem: "Coordenador (conduz), CS, Tráfego, Editor", duracao: "45 min", ondeNoApp: "Minhas tarefas em todas as clínicas" },
  { quando: "Segunda, até 12h", rito: "Leitura semanal e resumo ao médico", quem: "Tráfego + Coordenador", duracao: "15 min por clínica", ondeNoApp: "Leitura da semana" },
  { quando: "Terça", rito: "Otimização de campanhas", quem: "Gestor de Tráfego", duracao: "1 a 1,5 h por clínica", ondeNoApp: "Mídia (no Gerenciador de Anúncios fora do app)" },
  { quando: "Quarta", rito: "Revisão de qualidade dos materiais", quem: "Coordenador + CS + Editor", duracao: "30 min", ondeNoApp: "Drive (materiais) + Minhas tarefas" },
  { quando: "Quarta ou quinta", rito: "Call em grupo com as clínicas", quem: "Condutor (conduz), CS (registro)", duracao: "60 a 90 min", ondeNoApp: "Ações combinadas (registro dos compromissos)" },
  { quando: "Quinta", rito: "Auditoria de 10 conversas por clínica", quem: "CS", duracao: "45 min por clínica", ondeNoApp: "Leitura da semana (sugestão da IA)" },
  { quando: "Sexta, 15h", rito: "Status e saúde", quem: "Coordenador", duracao: "30 min", ondeNoApp: "Execução e saúde + Cronograma (pausas)" },
  { quando: "Sexta", rito: "Janela do Fundador (escalonamento)", quem: "Fundador + Coordenador", duracao: "1 h", ondeNoApp: "Todas as clínicas (quem está em risco)" },
];

export interface Ferramenta { nome: string; usarPara: string; naoUsarPara: string; quem: string }

/** Quando usar cada ferramenta. Regra: o número e o que vence ficam no app; documento no Drive; hora e evidência no ClickUp. */
export const FERRAMENTAS: Ferramenta[] = [
  { nome: "App (Sistema de Aquisição)", usarPara: "Tarefas (cronograma), números da clínica, reuniões, metas, garantia, leitura semanal, leads parados e rascunhos por IA", naoUsarPara: "Guardar arquivos ou conversar com a clínica", quem: "Toda a equipe; a clínica na visão simplificada" },
  { nome: "Google Drive", usarPara: "Roteiros e modelos (fonte do método), pasta de cada clínica, atas, gravações, relatórios finais", naoUsarPara: "Acompanhar prazo ou número (isso é no app)", quem: "Coordenador (dono), toda a equipe" },
  { nome: "ClickUp", usarPara: "Lançar horas por tarefa (o piloto mede horas), anexar evidência dos 4 estados e a lista da janela do fundador", naoUsarPara: "Ver o que vence ou os números (isso é no app)", quem: "Coordenador (dono), toda a equipe lança horas" },
  { nome: "Google Meet", usarPara: "Sessões e calls, com gravação e transcrição ligadas", naoUsarPara: "Registrar decisões (isso vai no modo sessão do app)", quem: "Quem conduz a reunião" },
  { nome: "WhatsApp", usarPara: "Grupo da clínica, lembretes e envio do resumo semanal revisado", naoUsarPara: "Decisão importante sem registro: o combinado vai para Ações combinadas", quem: "CS e Coordenador" },
  { nome: "CRM da clínica (Kommo, flwchat, outro)", usarPara: "Etapa de cada lead: agendou, compareceu, fechou, motivo de perda. É de onde o app tira os números", naoUsarPara: "Nada fica só na cabeça da recepção: sem etapa no CRM, o número não existe", quem: "Recepção da clínica; CS confere" },
  { nome: "Meta Ads e Google Ads", usarPara: "Criar e otimizar campanhas, conferir a categoria da fonte de dados", naoUsarPara: "Ler resultado de negócio (isso é no app, com o CRM)", quem: "Gestor de Tráfego" },
  { nome: "n8n", usarPara: "Envios automáticos: etapas para a Meta, alertas e lembretes (ligados só com autorização)", naoUsarPara: "Processo que ainda não foi feito à mão pelo menos 3 vezes", quem: "Gestor de Tráfego ou automação" },
  { nome: "ZapSign e Tally/Forms", usarPara: "Contrato (ZapSign) e formulário pré-diagnóstico (Tally ou Forms)", naoUsarPara: "—", quem: "Comercial e Analista de Onboarding" },
  { nome: "Planilha Tracker (08.04)", usarPara: "Plano B quando a integração com o CRM falhar: mesmos campos, registro diário", naoUsarPara: "Rotina normal: o app já mostra o Tracker a partir do CRM", quem: "Recepção (só no Plano B)" },
];

export function funcao(id: IdFuncao): Funcao {
  return FUNCOES.find((f) => f.id === id)!;
}
