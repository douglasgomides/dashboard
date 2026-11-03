// SAP · Formulários G4: 07.05, 07.06, 07.07 e 08.02 (ferramentas de preenchimento). 07.03 e 08.03 são [PROCESSO] (script de fala) e não viram formulário.
import { ar, dt, esc, p, sim, t, tb, type Formulario } from "./sap-formularios-base";

const COLS_SIMNAO = ["Sim", "Não"];

// ---------------------------------------------------------------- 07.05 · Banco de Objeções da Consulta
const F_0705: Formulario = {
  codigo: "07.05", doc: "07.05", nome: "Banco de Objeções da Consulta", marco: null,
  serve: "Responder às objeções de fechamento da consulta com a lógica validar, contextualizar e reconduzir, sabendo quem responde (médico ou consultora), o que nunca dizer e quando registrar \"não fechou\" e ativar o follow-up. Aqui entram as objeções reais da clínica, sempre com fonte.",
  quem: "Médico, consultora/TCO e recepção (no follow-up). Na etapa 7 e 8 do 07.02 e nos toques do 07.06. Personalizado pelo 07.08 com as objeções reais da clínica. Revisão mensal pelo Coordenador de Implementação.",
  secoes: [
    {
      id: "regras", titulo: "A lógica e as 8 objeções padrão",
      intro: "Validar (reconhecer em uma frase que a objeção é legítima), contextualizar (uma pergunta que descobre o que está por trás e a informação que faltou), reconduzir (duas opções concretas ou uma data de retorno). No máximo duas tentativas de reconduzir na consulta; depois, combinar data de retorno, registrar e deixar a cadência trabalhar. As 8 objeções padrão (vou pensar, está caro, preciso falar com marido/esposa/família, estou comparando com outro profissional, tenho medo do resultado ou de doer, já fiz antes e não gostei, vi mais barato no Instagram, não é o momento) têm resposta do médico, da consultora e linha vermelha no documento do Drive. Fonte obrigatória: toda objeção específica da clínica tem fonte (registro do 07.07 com data, Ficha de Caso 04.04, formulário 02.04, relato do médico na Sessão 5). Objeção inferida sem fonte não entra.",
      campos: [
        esc("padrao_lido", "A equipe leu e ensaiou as 8 objeções padrão e as linhas vermelhas?", sim),
      ],
    },
    {
      id: "reais", titulo: "3. Objeções reais da clínica (preenchidas pelo 07.08)",
      campos: [
        tb("reais_tab", "Objeções reais, uma por linha", [
          { id: "literal", rotulo: "Objeção literal" },
          { id: "fonte", rotulo: "Fonte (registro, data)" },
          { id: "esconde", rotulo: "O que esconde" },
          { id: "quem", rotulo: "Quem responde", opcoes: ["Médico", "Consultora", "Ambos"] },
          { id: "r_medico", rotulo: "Resposta do médico" },
          { id: "r_consultora", rotulo: "Resposta da consultora" },
          { id: "vermelha", rotulo: "Linha vermelha" },
          { id: "categoria", rotulo: "Categoria no 07.07" },
        ], { minLinhas: 1 }),
      ],
    },
    {
      id: "decisao", titulo: "4. Quando registrar \"não fechou\" e ativar o follow-up",
      intro: "Pagou ou deu sinal com data de início: Fechou (sem cadência de venda; se não marcar o início em 7 dias, Cadência D). Disse que vai decidir e combinou data de retorno: Pensando, Cadência B. Saiu sem data e sem sinal, sem motivo claro ou com \"provavelmente sim\": Não fechou, Cadência A. Recebeu o plano por WhatsApp e não respondeu em 48 h: mantém o status, Cadência C. \"Não vou fazer\" explícito: Não fechou + motivo, sem cadência (se consentiu, vai para o 08.02). Sem indicação clínica: Não fechou, motivo \"Sem indicação clínica\", sem cadência e sem contar contra a conversão no 08.04. Registro no mesmo dia; consulta sem registro conta como Não fechou.",
      campos: [
        esc("regra_registro", "A equipe combinou registrar a decisão no mesmo dia no 07.07?", sim),
        p("obs", "Observações da clínica sobre quando ativar cada cadência", { opcional: true }),
      ],
    },
    {
      id: "revisao", titulo: "5. Revisão mensal",
      intro: "Todo mês o Coordenador de Implementação lê no 07.07 os motivos mais frequentes. Objeção que aparece em 3 ou mais consultas e não está no banco entra na seção 3 com fonte. Resposta que não funciona (a objeção aparece e nenhum fecha) é revisada pelo CS com o médico na próxima conversa.",
      campos: [
        dt("revisao_data", "Data da última revisão mensal", { opcional: true }),
        p("revisao_novas", "Objeções novas que entraram nesta revisão (e a fonte)", { opcional: true }),
        p("revisao_ajustadas", "Respostas que precisaram de ajuste", { opcional: true }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- 07.06 · Cadências de Follow-up
const CAD = [
  { id: "a", rotulo: "A · Não fechou na consulta" },
  { id: "b", rotulo: "B · Pediu tempo" },
  { id: "c", rotulo: "C · Sumiu após a proposta" },
  { id: "d", rotulo: "D · Fechou e não agendou o início" },
];

const F_0706: Formulario = {
  codigo: "07.06", doc: "07.06", nome: "Cadências de Follow-up", marco: 24,
  serve: "As sequências prontas para quem saiu da consulta sem decidir ou fechou e não marcou o início, com mensagens, intervalos, quem executa, regra de parada e fim explícito. Aqui se registra como a clínica ativou e testou cada cadência.",
  quem: "Consultora ou recepção executam; médico faz o toque clínico; Quaddro ou automação do caminho B dispara. Começa no mesmo dia da consulta, acionada pelo registro no 07.07, e termina no máximo em D+60 da consulta. O CS roda o teste de cada cadência antes de liberar.",
  secoes: [
    {
      id: "regras", titulo: "Regras de todas as cadências",
      intro: "Pergunta fechada em todo toque. Objetivo do toque: descobrir a dúvida real ou resolver um obstáculo prático, nunca repetir a oferta. Uma ideia por mensagem, até 3 linhas, sem emoji, com nome. Toque do médico só clínico (nunca preço, condição, prazo de pagamento ou \"decide logo\"). Validade do orçamento só factual. Nenhum toque oferece desconto. Parada quando o paciente fecha, diz \"não\" explícito, pede para não receber mensagens ou combina outra data (cadência pausada até essa data). Nenhuma cadência passa de D+60; no último toque a clínica avisa que vai parar. Todo primeiro toque informa como parar. Pedido de parada é registrado no 07.07 na hora e respeitado em todos os canais. Horário: dias úteis das 9h às 12h e das 14h às 19h; sábado das 9h às 12h; nunca domingo, feriado ou depois das 20h (toque do médico até 20h). Cadência A: F1 no mesmo dia (2 a 4 h depois, com o PDF do 07.04), F2 D+2 médico, F3 D+5, F4 D+10, F5 D+30 (template), Fim D+60 (template). Cadência B: F1 no mesmo dia, F2 D+2 médico, F3 na data combinada (ou D+5), F4 D+10 da data combinada, F5 D+30 (template), Fim D+60. Cadência C: F1 48 h sem resposta, F2 D+4 do silêncio (médico), F3 D+8, Fim D+30 do silêncio ou D+60 da consulta. Cadência D: F1 D+2 do fechamento, F2 D+5, F3 D+10 (médico), F4 D+20 (template), encaminhamento D+30 (ligação do coordenador).",
      campos: [
        esc("regras_ok", "A consultora/recepção e o médico leram as regras e os textos de cada toque?", sim),
      ],
    },
    {
      id: "config", titulo: "7. Configuração",
      campos: [
        esc("caminho", "Caminho de disparo", ["Quaddro", "Caminho B (sem Quaddro, com n8n)"], { ajuda: "Quaddro: cadência condicional por status do 07.07; toques do médico são tarefas enviadas a ele no fim do dia, não disparos automáticos com a voz dele. Caminho B: etiquetas no WhatsApp Business por cadência e toque (ex.: A-F2); n8n lê o 07.07 e cria a lista diária; rotina de 15 min da consultora às 9h30; lista dos toques do médico às 17h. Ver 11.03." }),
        esc("api", "O WhatsApp é a API oficial (com janela de 24 h e templates)?", ["Sim (API oficial)", "Não (aplicativo WhatsApp Business, sem template)"]),
        t("consultora", "Quem executa os toques da consultora/recepção"),
        t("medico_tarefa", "Quem lembra o médico dos toques dele (tarefa no fim do dia)", { opcional: true }),
        t("validade", "Validade do orçamento usada nos toques (data ou regra) e motivo real", { opcional: true, ajuda: "Só citar a validade como informação, nunca como ameaça. Só vale se a validade for real." }),
      ],
    },
    {
      id: "templates", titulo: "6. Templates para fora da janela de 24h (API oficial)",
      intro: "Templates são submetidos pela clínica (ou pela Quaddro) no gerenciador do WhatsApp Business. Sem diagnóstico, sem nome de procedimento sensível (usar \"o plano que conversamos\"), sem preço, sem emoji, com saída clara. Lembrete de algo combinado tende a ser utilidade; convite para retomar tende a ser marketing; a Meta pode reclassificar.",
      campos: [
        tb("tpl_tab", "Status de cada template", [
          { id: "status", rotulo: "Status", opcoes: ["Não submetido", "Em análise", "Aprovado", "Reprovado", "Não se aplica"] },
          { id: "categoria", rotulo: "Categoria atribuída pela Meta", opcoes: ["Utilidade", "Marketing", "Ainda não definida"] },
          { id: "data", rotulo: "Data da aprovação" },
        ], { linhas: [
          "plano_retomada_v1 (A e B no F5)", "plano_validade_v1 (opcional, uma vez, só se a validade for real)", "plano_encerramento_v1 (fim de todas)",
          "inicio_agendamento_v1 (D no F4)", "silencio_checagem_v1 (C no F3)",
        ] }),
      ],
    },
    {
      id: "teste", titulo: "Teste antes de liberar",
      intro: "Antes de liberar, o CS roda cada cadência com um número de teste e confere horário, template, parada e registro.",
      campos: [
        tb("teste_tab", "Teste por cadência", [
          { id: "data", rotulo: "Data do teste" },
          { id: "horario", rotulo: "Horário respeitado", opcoes: COLS_SIMNAO },
          { id: "template", rotulo: "Template correto", opcoes: ["Sim", "Não", "Não se aplica"] },
          { id: "parada", rotulo: "Parada ao responder", opcoes: COLS_SIMNAO },
          { id: "registro", rotulo: "Registro no 07.07", opcoes: COLS_SIMNAO },
        ], { linhas: CAD.map((c) => c.rotulo) }),
        esc("optout", "O pedido de parada foi testado e é respeitado em todos os canais?", sim, { ajuda: "100% dos pedidos de parada respeitados é eliminatório na auditoria." }),
        ar("prints", "Prints do CRM com a cadência ativa", { ajuda: "Evidência para concluir o item 24." }),
      ],
    },
    {
      id: "metas", titulo: "8. Metas do follow-up",
      intro: "90% ou mais das consultas sem fechamento com F1 enviado até 24 h depois (meta assinada na Sessão 5). 100% dos pedidos de parada respeitados. Acompanhar no 07.07 o toque em que fechou (Consulta, F1 a F5); se nada fecha depois do F3 em 60 dias de dados, encurtar a cadência.",
      campos: [
        dt("ativacao", "Data em que as cadências foram ativadas"),
        p("primeiras", "Primeiras decisões registradas no 07.07", { opcional: true }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- 07.07 · Registro de Decisão da Consulta
const F_0707: Formulario = {
  codigo: "07.07", doc: "07.07", nome: "Registro de Decisão da Consulta", marco: null,
  serve: "Registrar a decisão de toda primeira consulta do serviço prioritário, disparar a cadência certa do 07.06 e alimentar o 08.04 · Tracker de Controle.",
  quem: "Consultora ou quem apresentou o investimento. Uma linha por primeira consulta do serviço prioritário, preenchida no mesmo dia. Consulta sem registro conta como Não fechou.",
  secoes: [
    {
      id: "periodo", titulo: "Indicadores do período",
      intro: "O limite D+60 e a conferência de F1 em até 24 h são calculados a partir das datas. Consulta sem registro conta como Não fechou.",
      campos: [
        t("periodo", "Período"),
        t("consultas", "Consultas realizadas no período (da agenda)"),
      ],
    },
    {
      id: "registro", titulo: "Registro",
      campos: [
        tb("registro_tab", "Uma linha por primeira consulta", [
          { id: "id_lead", rotulo: "ID do Lead" },
          { id: "data_consulta", rotulo: "Data da consulta" },
          { id: "data_registro", rotulo: "Data do registro" },
          { id: "canal", rotulo: "Canal" },
          { id: "utm_source", rotulo: "utm_source" },
          { id: "utm_medium", rotulo: "utm_medium" },
          { id: "utm_campaign", rotulo: "utm_campaign" },
          { id: "utm_content", rotulo: "utm_content" },
          { id: "servico", rotulo: "Serviço de interesse" },
          { id: "quem", rotulo: "Quem apresentou", opcoes: ["Médico", "Consultora", "Recepção"] },
          { id: "plano", rotulo: "Plano apresentado" },
          { id: "teachback", rotulo: "Teach-back feito", opcoes: COLS_SIMNAO },
          { id: "plano_escrito", rotulo: "Plano escrito entregue", opcoes: COLS_SIMNAO },
          { id: "consentiu", rotulo: "Consentiu receber plano por WhatsApp", opcoes: COLS_SIMNAO },
          { id: "decisao", rotulo: "Decisão", opcoes: ["Fechou", "Não fechou", "Pensando"] },
          { id: "motivo_cat", rotulo: "Motivo (categoria)", opcoes: ["Preço", "Cônjuge ou família", "Comparando com outro profissional", "Medo ou insegurança", "Tempo para decidir", "Sem indicação clínica", "Outro"] },
          { id: "motivo_lit", rotulo: "Motivo (literal, nas palavras do paciente)" },
          { id: "valor_apres", rotulo: "Valor apresentado (R$)" },
          { id: "valor_fech", rotulo: "Valor fechado (R$)" },
          { id: "inicio", rotulo: "Data de início" },
          { id: "cadencia", rotulo: "Cadência", opcoes: ["A", "B", "C", "D", "Nenhuma"] },
          { id: "data_f1", rotulo: "Data do F1" },
          { id: "toque_fechou", rotulo: "Toque do follow-up em que fechou", opcoes: ["Consulta", "F1", "F2", "F3", "F4", "F5"] },
          { id: "proxima", rotulo: "Próxima ação" },
          { id: "data_proxima", rotulo: "Data da próxima ação" },
          { id: "status", rotulo: "Status da cadência", opcoes: ["Ativa", "Pausada", "Encerrada"] },
          { id: "optout", rotulo: "Opt-out", opcoes: COLS_SIMNAO },
          { id: "obs", rotulo: "Observação" },
        ], { minLinhas: 1 }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- 08.02 · Régua de Relacionamento e Reativação
const F_0802: Formulario = {
  codigo: "08.02", doc: "08.02", nome: "Régua de Relacionamento e Reativação", marco: null,
  serve: "Manter quem já é paciente voltando, sem depender da memória da recepção. Cada contato (R1 a R8) tem texto pronto, momento, responsável, versão manual e versão automatizada.",
  quem: "Recepção e consultora executam; CS e Relacionamento configuram e acompanham; médico aprova os textos de cuidado. Montada na Sessão 6 (08.01), ativada em até 7 dias e mantida pela clínica depois do D90.",
  secoes: [
    {
      id: "regras", titulo: "Três regras que não mudam",
      intro: "(1) Nenhuma mensagem cita diagnóstico, doença ou procedimento íntimo do paciente. (2) Toda mensagem de relacionamento que não é resposta a uma conversa aberta tem saída fácil (\"se não quiser mais receber, é só responder SAIR\"). (3) Orientação clínica individual é do médico, nunca da automação. Horário de envio: dias úteis das 9h às 19h; sábado das 9h às 12h; nunca domingo e feriado, exceto resposta a quem escreveu. Fora de uma conversa aberta nas últimas 24 h, só sai mensagem por template aprovado. R1, R2, R3 e R5 entram como templates de utilidade; R6, R7 e R8 tendem a ser marketing (submeter como marketing, sem forçar categoria).",
      campos: [
        esc("regras_ok", "A equipe leu e aceitou as três regras?", sim),
        esc("sistema", "Sistema de envio", ["Quaddro (caminho A)", "Sistema atual + n8n (caminho B)", "Manual (sem automação)"], { ajuda: "Ver 11.03 · Integração Quaddro e Caminho B sem Quaddro." }),
        t("recepcao", "Nome da pessoa da recepção que assina (ou em nome de quem a automação envia)"),
        t("medico", "Nome do médico nos textos (Dr./Dra.)"),
        t("clinica", "Nome da clínica nos textos"),
        t("link_google", "Link curto da avaliação no Google (R4)"),
        t("telefone", "Telefone da coordenação (resposta a avaliação negativa)", { opcional: true }),
      ],
    },
    {
      id: "mapa", titulo: "1 e 2. Mapa da régua e manual ou automatizado",
      intro: "R1 Pós-atendimento (D+1, recepção). R2 Checagem D+7 (recepção ou consultora). R3 Cuidado pós-procedimento (conforme protocolo do médico; texto travado, aprovado pelo médico). R4 Pedido de avaliação no Google (D+10, para todos os atendidos, sem filtro). R5 Lembrete de retorno (7 dias antes da data combinada). R6 Recall por tempo sem consulta (prazo por tipo de serviço). R7 Reativação de inativos (lote mensal, 3 toques, template aprovado). R8 Datas relevantes (aniversário e 1 ano de tratamento, sem oferta).",
      campos: [
        tb("mapa_tab", "Responsável, versão e ativação de cada contato", [
          { id: "responsavel", rotulo: "Responsável (nome)" },
          { id: "versao", rotulo: "Versão", opcoes: ["Manual", "Automatizada"] },
          { id: "ativo", rotulo: "Ativo desde (data)" },
        ], { linhas: [
          "R1 · Pós-atendimento (D+1)", "R2 · Checagem D+7", "R3 · Cuidado pós-procedimento", "R4 · Pedido de avaliação no Google (D+10)",
          "R5 · Lembrete de retorno (7 dias antes)", "R6 · Recall por tempo sem consulta", "R7 · Reativação de inativos", "R8 · Datas relevantes",
        ] }),
        esc("r3_aprovado", "O médico aprovou os textos do R3 (orientação geral, igual à folha entregue na consulta)?", sim),
        p("r3_textos", "Texto do R3 por procedimento (orientação geral, igual à folha entregue)", { opcional: true }),
      ],
    },
    {
      id: "recall", titulo: "4. Prazos de recall por tipo de serviço",
      intro: "O médico define os prazos na Sessão 6. A tabela sugerida do documento é ponto de partida, não recomendação clínica: manutenção (intervalo do próprio médico), condição crônica (data do próximo controle, sempre R5), check-up preventivo (12 meses), pós-cirúrgico (revisões do protocolo, R5 por revisão), consulta pontual sem retorno (sai da régua e entra no 07.06).",
      campos: [
        tb("recall_tab", "Serviços da clínica", [
          { id: "tipo", rotulo: "Tipo", opcoes: ["Procedimento de manutenção", "Acompanhamento de condição crônica", "Check-up preventivo", "Pós-cirúrgico", "Consulta pontual sem retorno"] },
          { id: "prazo", rotulo: "Prazo de retorno/recall definido pelo médico" },
          { id: "contato", rotulo: "Contato", opcoes: ["R5 (retorno)", "R6 (recall)", "Sai da régua (07.06)"] },
        ], { minLinhas: 1 }),
      ],
    },
    {
      id: "reativacao", titulo: "5. Reativação de inativos (base antiga)",
      intro: "Segmentos: S1 fez tratamento e sumiu (última visita há 12 a 24 meses, prioridade 1); S2 fez consulta e não fechou (6 a 24 meses, prioridade 2); S3 inativo antigo (mais de 24 meses, prioridade 3). Fora (nunca enviar): pediu para não receber, reclamação aberta, óbito informado, menor de idade sem responsável cadastrado, paciente em litígio. Base: exportar nome, telefone, data da última visita, tipo de serviço (categoria ampla) e se fechou tratamento, sem diagnóstico, CID, laudo ou prontuário; limpar duplicados, inválidos e lista \"não enviar\"; lotes de até 50 pessoas por dia; guardar com acesso só da recepção e do decisor e apagar a lista de trabalho 90 dias após o último toque. Toques: T0 (só sem opt-in) ligação da recepção; T1 no dia 1; T2 no dia 4 e T3 no dia 10, só para quem não respondeu. Nunca usar desconto, \"condição especial para quem volta\" ou \"última chance\".",
      campos: [
        tb("seg_tab", "Primeiro lote por segmento", [
          { id: "tamanho", rotulo: "Pacientes na base" },
          { id: "lote", rotulo: "Pacientes no 1º lote" },
          { id: "data", rotulo: "Data do envio do T1" },
        ], { linhas: ["S1 · Fez tratamento e sumiu", "S2 · Fez consulta e não fechou", "S3 · Inativo antigo"] }),
        esc("base_limpa", "A base foi exportada sem dado clínico, limpa e separada em lotes de até 50 por dia?", sim),
        esc("jurídico", "O jurídico da clínica validou a base legal antes do primeiro lote?", sim, { ajuda: "R5 e R6 se apoiam na tutela da saúde (LGPD art. 11, II, f); R7 e R8 pedem consentimento registrado." }),
        esc("optin", "Paciente sem opt-in registrado recebe primeiro a ligação ou mensagem individual (T0), e não o lote?", sim),
        esc("consent_campo", "O campo \"Autorizo receber mensagens de lembrete e acompanhamento da clínica pelo WhatsApp\" (Sim/Não) está no cadastro e no primeiro contato?", sim),
        esc("numero", "O envio sai do número oficial da clínica (nunca número pessoal nem da Doctor Creator)?", sim),
        esc("sair", "Quem pede SAIR entra na lista \"não enviar\" no mesmo dia?", sim),
        p("t1", "Texto do T1 de cada segmento, se ajustado pela clínica", { opcional: true }),
        p("novidade_s3", "Novidade real e verificável usada no T1 do S3 (novo endereço, estrutura, horário)", { opcional: true }),
      ],
    },
    {
      id: "medir", titulo: "8. Como medir (registrar no 08.04 · Tracker de Controle)",
      intro: "Taxa de retorno no prazo (retornos realizados ÷ retornos indicados, mensal). Recall convertido (agendamentos do R6 ÷ mensagens R6 enviadas, mensal). Reativação por lote (agendamentos ÷ pacientes do lote, por segmento). Taxa de SAIR (pedidos de saída ÷ mensagens enviadas, por lote; acima de 5%, parar, revisar texto e segmentação). Avaliações novas no Google (mensal). Satisfação D+7 (positivas ÷ respostas, mensal). Metas de referência a validar no piloto: 10% a 20% de resposta no S1, 5% a 10% no S2, abaixo de 5% no S3.",
      campos: [
        dt("ativacao", "Data de ativação da régua"),
        dt("primeiro_lote", "Data do primeiro lote de reativação", { opcional: true }),
        p("obs", "Observações", { opcional: true }),
      ],
    },
  ],
};

export const FORMS_G4: Formulario[] = [F_0705, F_0706, F_0707, F_0802];
