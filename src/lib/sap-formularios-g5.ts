// SAP · Formulários G5: 08.10 · Script do Checkpoint D60 (partes preenchíveis do roteiro: evidência por componente,
// leitura dos KPIs, Score de Execução, ajustes do D61 ao D90, Playbook e datas). 02.07, 02.08, 08.06, 11.01 e 09.01
// não entram: são processo, planilha, entregável (tela em /documentos) ou guia sem campos de resposta.

import { ar, dt, esc, nt, p, sim, t, tb, type Formulario } from "./sap-formularios-base";

const STATUS = ["Em uso", "Referência", "Pendente"];
const COMPONENTES: [string, string][] = [
  ["rastreamento", "Rastreamento (Sessão 3)"],
  ["anuncios", "Anúncios e rotina semanal de tráfego (Sessão 3)"],
  ["filtro", "Filtro (Sessão 3)"],
  ["atendimento", "Atendimento: script e secretária de IA, se houver (Sessão 4)"],
  ["confirmacao", "Confirmação (Sessão 4)"],
  ["decisao", "Registro de decisão da consulta (Sessão 5)"],
  ["followup", "Cadência de follow-up (Sessão 5)"],
  ["fidelizacao", "Fidelização e indicação (Sessão 6)"],
  ["tracker", "Tracker e leitura de segunda (Sessão 6)"],
];

const F_0810: Formulario = {
  codigo: "08.10", doc: "08.10", nome: "Script do Checkpoint D60", marco: 27,
  serve: "Registrar o checkpoint do D60, o marco \"sistema completo rodando\": status e evidência de uso de cada componente, leitura dos KPIs contra a baseline D0, Score de Execução, ajustes do D61 ao D90 e entrega do Playbook de Continuidade.",
  quem: "Coordenador de Implementação conduz e preenche; Fundador apoia; decisor da clínica presente. D60. Agendar 60 min (o roteiro cabe em 45 a 60).",
  secoes: [
    {
      id: "prep", titulo: "Preparação (D-3 a D-1)",
      intro: "Só conta como implementado o que está em uso. Material enviado não é material implementado. Os números do D60 são leitura de tendência para decidir os ajustes; o resultado oficial é medido nas últimas 4 semanas (D62 a D89) e apresentado no D90. Antes do D62 a prévia da garantia (aba Garantia do 08.04) não entra em nenhum texto para a clínica (tela, ata, Playbook) e não é aberta na tela compartilhada. Nenhum nome, telefone ou dado de saúde de paciente na tela, na ata ou no Playbook.",
      campos: [
        dt("data", "Data do checkpoint"),
        t("participantes", "Quem esteve na sala (funções)", { ajuda: "Decisor obrigatório; quem lê os números na clínica até o fim; recepção líder nos blocos 1 e 2." }),
        esc("decisor", "O decisor estava presente?", sim, { ajuda: "Sem decisor não há confirmação de status nem ajustes: remarcar em até 5 dias úteis." }),
        t("linhas_completas", "Linhas completas no 08.04 (meta: 90% ou mais)", { ajuda: "Abaixo disso, a leitura do bloco 3 começa pelo V15 (08.05, seção 2.1)." }),
        esc("sala_visao", "Tracker mostrado na visão", ["Completa", "Operação (sem R$)"], { ajuda: "Se o decisor não quer a equipe vendo receita, usar a visão Operação enquanto a recepção estiver na sala." }),
        esc("prompt_0808", "08.08 rodado no momento D60 (Bloco 4: Playbook)?", sim),
        esc("resumo_fundador", "Resumo de 1 página enviado ao Fundador (D-1)?", sim, { ajuda: "KPIs baseline x atual x meta, vazamento principal, Score de Execução, componentes sem evidência." }),
        esc("vespera", "Mensagem de véspera enviada à clínica?", sim),
        esc("gravacao", "Gravação ligada?", sim),
      ],
    },
    {
      id: "b1", titulo: "Bloco 1 · Abertura e combinado (5 min)",
      intro: "Dizer em voz alta: o combinado era o sistema completo rodando até hoje; conta o que está acontecendo no dia a dia; os números são leitura de tendência; no fim saem o Playbook, até 3 ajustes e as datas dos check-ins.",
      campos: [
        p("b1_abertura", "Resposta à pergunta de abertura (anotar literal): \"Desde a Sessão 6, o que mudou na rotina de vocês e o que ainda depende de alguém lembrar de fazer?\""),
      ],
    },
    {
      id: "b2", titulo: "Bloco 2 · Evidência de uso por componente (20 min)",
      intro: "Para cada linha: mostrar a evidência, perguntar à clínica se confirma, registrar o status. Sem evidência, o status é Pendente, com dono e prazo, mesmo que o material tenha sido entregue. \"Em uso\" = personalizado, configurado, treinado e com evidência de uso. \"Referência\" = material de consulta. \"Pendente\" = falta um dos 4 estados; vai para a seção 8 do Playbook. Nunca marcar \"Em uso\" por suposição.",
      campos: COMPONENTES.flatMap(([id, rotulo]) => [
        esc(`c_${id}_status`, `${rotulo} · status`, STATUS),
        t(`c_${id}_evid`, `${rotulo} · evidência (link ou descrição)`, { opcional: true }),
        t(`c_${id}_pend`, `${rotulo} · se Pendente: dono (função) e prazo`, { opcional: true }),
      ]),
    },
    {
      id: "b3", titulo: "Bloco 3 · Leitura do Tracker e dos KPIs contra a baseline (15 min)",
      intro: "Painel do 08.04 e 08.05. Cada número com a conta explicada (ex.: compareceram de agendados nas últimas 4 semanas, ou seja x%; no ponto de partida eram y%; a meta é z%). Taxa com menos de 10 casos no denominador só serve para tendência. Referência sempre como \"referência inicial Doctor Creator, a validar\". Receita atribuída é indicador acompanhado, não meta nem garantia. Se a clínica perguntar da garantia: a conta é feita na janela do dia 62 ao 89 e apresentada no dia 90.",
      campos: [
        tb("kpis", "KPIs assinados no 03.07", [
          { id: "baseline", rotulo: "Baseline D0" }, { id: "quatro_sem", rotulo: "Últimas 4 semanas" },
          { id: "meta", rotulo: "Meta D90" }, { id: "semaforo", rotulo: "Semáforo", opcoes: ["Verde", "Amarelo", "Vermelho"] },
        ], { minLinhas: 1 }),
        p("b3_surpresa", "O que surpreende a clínica olhando só esses números (anotar literal)", { opcional: true }),
        t("b3_etapa_clinica", "Em qual etapa a clínica acha que mais gente fica pelo caminho (antes de mostrar)", { opcional: true }),
        t("b3_vazamento", "Vazamento principal das últimas 4 semanas e código do mapa (V1 a V20)", { ajuda: "Com o número e a origem." }),
        esc("b3_bate", "Bate com o que a clínica sente no dia a dia?", ["Sim", "Em parte", "Não"]),
        p("b3_obs", "Observações da leitura (dado incompleto, KPI pior que a baseline, causa levantada)", { opcional: true }),
      ],
    },
    {
      id: "b4", titulo: "Bloco 4 · Score de Execução (5 min)",
      intro: "Mostrar o Score do D60 (11.04) e o resumo por item: Presença, Prazos, Treino, Gravação, Registro, Uso, Verba, com a evidência de cada um. A garantia pede Score de Execução de 80% ou mais no dia 90 (01.02, seção 1.1). Abaixo de 80%: escalar ao Fundador no mesmo dia, por mensagem de 3 linhas (08.05, seção 4). Falar de itens e evidência, não de culpa.",
      campos: [
        t("score", "Score de Execução do D60 (%)"),
        esc("score_escalado", "Score abaixo de 80% e escalado ao Fundador?", ["Não se aplica (80% ou mais)", "Sim, escalado", "Abaixo de 80% e ainda não escalado"]),
        p("score_itens", "Itens Parciais ou Não cumpridos: o que falta, quem faz, até quando", { opcional: true }),
      ],
    },
    {
      id: "b5", titulo: "Bloco 5 · Ajustes do D61 ao D90 e ações da clínica (10 min)",
      intro: "No máximo 3 ajustes, não 10. Ordem de escolha (08.05, seção 3.6): dado ruim (V1, V15) primeiro; tempo de 1ª resposta vermelho (V4) antes de qualquer ajuste de anúncio; depois a etapa com maior perda estimada; empate vai para a ação da clínica. Componente pendente do bloco 2 que depende da clínica entra aqui. Os ajustes entram no ClickUp no mesmo dia.",
      campos: [
        tb("ajustes", "Ajustes", [
          { id: "vazamento", rotulo: "Vazamento ou pendência (código e número com origem)" },
          { id: "ajuste", rotulo: "Ajuste" },
          { id: "lado", rotulo: "Lado", opcoes: ["Clínica", "DC"] },
          { id: "dono", rotulo: "Dono (função)" },
          { id: "prazo", rotulo: "Prazo (data)" },
          { id: "kpi", rotulo: "KPI que deve mexer" },
        ], { minLinhas: 1 }),
        p("b5_compromisso", "Resposta à pergunta de compromisso (anotar literal): \"Quem, com nome de função, faz a primeira ação até quando?\"", { opcional: true }),
      ],
    },
    {
      id: "b6", titulo: "Bloco 6 · Playbook, datas e encerramento (5 min)",
      intro: "Mostrar as seções 1, 3 e 8 do 08.06. Se estiver pronto, entregar; se não, combinar a entrega até o check-in seguinte (até o D66, sem colchetes no texto final). Nenhum preço, desconto ou condição comercial na reunião; pedido de novo serviço, desconto ou mudança de escopo é anotado para o D90 e vai ao Fundador.",
      campos: [
        esc("playbook", "08.06 · Playbook de Continuidade", ["Entregue na reunião", "Entrega combinada até o D66"]),
        dt("playbook_data", "Data de entrega do Playbook (se não entregue na reunião)", { opcional: true }),
        dt("d66", "Check-in D66"),
        dt("d76", "Check-in D76"),
        dt("d86", "Check-in D86"),
        dt("d90", "Reunião de encerramento D90"),
        esc("agenda", "D66, D76, D86 e D90 confirmados na agenda?", sim),
        p("pedidos", "Pedidos anotados para o D90 (novo serviço, desconto, mudança de escopo)", { opcional: true }),
      ],
    },
    {
      id: "pos", titulo: "Pós-sessão e critério de checkpoint concluído",
      intro: "Mesmo dia: ata curta no grupo da clínica (status dos componentes, ajustes com dono e prazo, datas D66, D76, D86 e D90), sem prévia da garantia. Até 24 h: ajustes no ClickUp com dono, prazo e critério de conclusão. Até 48 h: ata e gravação na pasta do cliente; 11.04 atualizado. Até 48 h, só clínica do piloto: agendar o depoimento 1 em vídeo (11.02, seção 7).",
      campos: [
        esc("pos_ata", "Ata enviada no grupo da clínica?", sim),
        esc("pos_clickup", "Ajustes do D61 ao D90 criados no ClickUp?", sim),
        esc("pos_1104", "11.04 atualizado com o status de cada item e a evidência?", sim),
        esc("pos_sem_previa", "Nenhuma prévia da garantia em material da clínica?", sim),
        esc("pos_depoimento", "Depoimento 1 agendado (só clínica do piloto)?", ["Sim", "Não", "Não se aplica"]),
        ar("pos_ata_arquivo", "Ata e gravação (arquivos ou links na pasta do cliente)", { opcional: true }),
      ],
    },
  ],
};

export const FORMS_G5: Formulario[] = [F_0810];
