// SAP · Catálogo dos prompts do programa que rodam no gerador (tela e servidor). O texto de cada prompt fica só no
// servidor (api/_lib/sap-prompts.ts); aqui vão os rótulos dos anexos, para a tela e para a validação.
export interface EntradaPrompt {
  id: string;
  /** Chave do anexo salvo por clínica (sap_anexos.slot): o mesmo documento serve a vários prompts. */
  slot: string;
  rotulo: string;
  dica: string;
  obrigatoria: boolean;
}

export interface PromptTela {
  codigo: string;
  nome: string;
  /** Resumo de uma linha do que sai. */
  saida: string;
  quando: string;
  entradas: EntradaPrompt[];
  /** Linha que o documento manda enviar junto com os anexos. */
  pedido: string;
}


// Documentos que se repetem entre prompts compartilham o slot; as transcrições são por tipo de reunião.
const SLOT: Record<string, string> = {
  proposta: "doc_04_05", template: "doc_04_03", casos: "doc_04_04", arvore: "doc_05_02", conhecimento: "conhecimento_atracao", testes: "doc_05_16", dados: "dados_criativos",
  raiox: "doc_03_03", analise: "doc_03_01", formulario: "doc_02_04", ficha: "doc_02_06",
  conversas: "conversas_reais", filtro: "doc_05_08", plano: "doc_05_10", politicas: "politicas_clinica", clinica: "dados_clinica", medico: "respostas_medico", modelos: "modelos_v2",
  precos: "tabela_precos", politica: "politica_sinal", registros: "registros_07_07", diagnostico: "doc_03_06",
  servicos: "servicos_retorno", tracker: "doc_08_04", score: "doc_11_04", historico: "historico_checkins", lista: "lista_clinicas_call", calendario: "doc_09_02",
};
const e = (id: string, rotulo: string, dica: string, obrigatoria = false, slot?: string): EntradaPrompt => ({ id, slot: slot ?? SLOT[id] ?? id, rotulo, dica, obrigatoria });

export const PROMPTS_TELA: PromptTela[] = [
  {
    codigo: "05.13",
    nome: "Atração: anúncios e criativos da clínica",
    saida: "Anúncios Meta com 3 ganchos, Google Ads responsivo, pauta da gravação, banco sem rosto e lista de conferência.",
    quando: "D+1 da Sessão 2 (04.05 em rascunho), no máximo até o D-1 da Sessão 3; de novo a cada reposição.",
    entradas: [
      e("proposta", "04.05 · Paciente Ideal e Proposta de Valor", "Cole o texto do documento da clínica.", true),
      e("template", "04.03 · Proposta de valor preenchida", "Opcional. Sem ele, a IA usa as seções 6 e 7 do 04.05."),
      e("casos", "04.04 · Fichas de caso e prova", "Cole todas as fichas, com a autorização de cada caso."),
      e("arvore", "05.02 · Árvore de canais e verba preenchida", "Canais, campanhas, verba e destino de cada uma.", true),
      e("conhecimento", "05.04 a 05.07 e 00.04 · Conhecimento", "Cole os modelos M01 a M19 e P01 a P10 do 05.04 e as regras do 00.04. Sem isso, a IA não tem os modelos."),
      e("testes", "05.16 · Registro de testes de aprovação", "Opcional: o que a conta já aprovou e reprovou."),
      e("dados", "Dados dos criativos (só na reposição)", "Gancho, gasto, custo por conversa e por lead qualificado."),
    ],
    pedido: "Gere a atração de [clínica] com os anexos.",
  },
  {
    codigo: "03.05",
    nome: "Relatório de Diagnóstico (rascunho)",
    saida: "Rascunho do 03.06 no formato da Parte A, mais a lista para conferência do Coordenador.",
    quando: "Até 4 horas depois da Sessão 1.",
    entradas: [
      e("raiox", "03.03 · Raio-X e Baseline D0", "Abas Baseline D0, Raio-X e Referências exportadas, já congeladas.", true),
      e("transcricao", "Transcrição da Sessão 1", "Texto da gravação. Troque nome de paciente por [paciente].", true, "transcricao_s1"),
      e("analise", "03.01 · Análise externa e lead oculto", "Síntese e blocos."),
      e("formulario", "02.04 · Respostas do formulário pré-diagnóstico", "A linha de respostas da clínica."),
      e("ficha", "02.06 · Ficha do Cliente", "Nome, cidade, especialidade, decisor e datas."),
    ],
    pedido: "Gere o rascunho do Relatório de Diagnóstico de [clínica]. Sessão 1 em [data], D0 em [data], relatório entregue em [data].",
  },
  {
    codigo: "06.10",
    nome: "Conversa: Script Doctor, mapa, intenções e régua da clínica",
    saida: "06.02, 06.03, 06.04 e 06.06 personalizados, 10 cenários de teste, autoauditoria e lista para o CS.",
    quando: "D-3 da Sessão 4; de novo quando mudar serviço, preço ou política.",
    entradas: [
      e("conversas", "Conversas reais (15 a 20)", "Texto das conversas, sem nome, telefone nem foto do paciente."),
      e("proposta", "04.05 · Paciente Ideal e Proposta de Valor", "Texto do documento da clínica.", true),
      e("filtro", "05.08 · Formulário de filtro e pontuação", "Perguntas, alternativas e pontuação A/B/C."),
      e("plano", "05.10 · Plano de campanha", "Oferta de entrada, valor da avaliação, sinal e canais."),
      e("politicas", "Políticas da clínica", "Sinal, remarcação, convênio, pagamento, horário, quem responde, se há IA.", true),
      e("clinica", "Dados da clínica", "Endereço, estacionamento, profissionais, CRM/RQE, duração da consulta."),
      e("medico", "Respostas aprovadas pelo médico", "Para isso dói, risco, recuperação, gestante, menor de idade."),
      e("modelos", "Modelos 06.02 a 06.06", "Cole os modelos v2. Sem eles, a IA segue só a descrição do prompt."),
    ],
    pedido: "Personalize a conversa da [clínica].",
  },
  {
    codigo: "07.08",
    nome: "Venda: consulta, investimento, objeções e cadências",
    saida: "Roteiro de consulta, material de investimento, banco de objeções, cadências e listas do 07.07, com auditoria por frase.",
    quando: "D-4 da Sessão 5.",
    entradas: [
      e("proposta", "04.05 · Paciente Ideal e Proposta de Valor", "Texto do documento da clínica.", true),
      e("casos", "04.04 · Fichas de caso", "Objeção, o que fez fechar, valor e forma de pagamento."),
      e("precos", "Tabela de preços e formas de pagamento", "Peça à clínica antes de rodar.", true),
      e("politica", "Política de sinal, cancelamento e reembolso", "Inclui a validade do orçamento."),
      e("registros", "Registros do 07.07", "Linhas com o motivo literal de não fechamento."),
      e("formulario", "02.04 · Respostas sobre consulta e follow-up", "O que a clínica declarou."),
      e("diagnostico", "03.06 · Relatório de Diagnóstico (opcional)", "Seção 3 e falas sobre o vou pensar."),
      e("modelos", "Modelos 07.02 a 07.07", "Cole os modelos v2."),
    ],
    pedido: "Personalize a venda para [clínica]. Serviço prioritário: [serviço]. Quem apresenta o investimento: [médico / consultora / recepção].",
  },
  {
    codigo: "08.08",
    nome: "Fidelização, Playbook e Encerramento D90",
    saida: "Régua, indicação, plano de otimização, Playbook de Continuidade e, no D90, o Relatório de Encerramento.",
    quando: "Até 24 h depois da Sessão 6 (blocos 1 a 3), no D60 (bloco 4) e entre D85 e D88 (bloco 5).",
    entradas: [
      e("transcricao", "Transcrição da Sessão 6", "Troque nome de paciente por [paciente].", true, "transcricao_s6"),
      e("proposta", "04.05 · Paciente Ideal e Proposta de Valor", "Texto do documento da clínica."),
      e("servicos", "Lista de serviços com prazo de retorno", "Prazo definido pelo médico para cada serviço."),
      e("tracker", "08.04 · Tracker de Controle (export)", "Abas Painel, Semanas e Garantia, mais Baseline e Metas e Indicações e retornos.", true),
      e("score", "11.04 · Score de Execução (aba)", "Itens, status, evidência e score."),
      e("ficha", "02.06 · Ficha do Cliente", "Médico, funções, caminho de tecnologia e datas D0, D60 e D90."),
      e("historico", "Atas de check-in e registros do 09.03 (só no D90)", "Compromissos da clínica."),
      e("modelos", "Modelos 08.02, 08.03, 08.05, 08.06 e 08.07", "Cole os modelos v2."),
    ],
    pedido: "Momento: [Sessão 6 / D60 / D90]. Personalize para [clínica].",
  },
  {
    codigo: "09.04",
    nome: "Registro e resumo da call em grupo",
    saida: "Registro no formato do 09.03, mensagem da comunidade, mensagens dos grupos individuais e lista de cobrança de segunda.",
    quando: "Logo depois de cada call em grupo.",
    entradas: [
      e("transcricao", "Transcrição da call", "Com marcação de tempo, se a ferramenta gerar.", true, "transcricao_call"),
      e("lista", "Clínicas presentes e ausentes", "Com semana do programa, KPI foco e autorização de nome e de número.", true),
      e("calendario", "09.02 · Tema previsto da semana", "Tema e material de apoio."),
      e("modelos", "Modelos 09.01 e 09.03", "Cole os modelos v2."),
    ],
    pedido: "Registro da call de [data]. Semana [nº do calendário].",
  },
];
