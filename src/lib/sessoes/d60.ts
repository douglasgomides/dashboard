import type { DefSessao } from "@/lib/sap-sessoes";

const doc = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const planilha = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

// D60 · Checkpoint. Fonte: 08.10 · Script do Checkpoint D60 [ROTEIRO] (Drive, pasta 08).
export const SESSAO_D60: DefSessao = {
  id: "D60",
  cronoN: 27,
  titulo: "D60 · Checkpoint",
  quando: "D60",
  duracao: "Agendar 60 min; o roteiro cabe em 45 a 60 min (proposta, validar)",
  quem: [
    { papel: "Coordenador de Implementação", faz: "Conduz, mostra o checklist de evidência e o Tracker, controla o tempo (00.02; 11.02)." },
    { papel: "Fundador", faz: "Apoio (00.02). Entra na conversa se o Score de Execução estiver abaixo de 80% e ele decidir participar (08.05, seção 4)." },
    { papel: "Decisor da clínica", faz: "Confirma o status de cada componente, aprova os ajustes do D61 ao D90 e recebe o Playbook." },
    { papel: "Quem lê os números na clínica", faz: "Do início ao fim: assume a leitura de segunda e confirma a rotina até o D90 (proposta, validar)." },
    { papel: "Recepção líder", faz: "Blocos 1 e 2: confirma a evidência de uso do atendimento, da confirmação e do registro (proposta, validar)." },
    { papel: "CS e Relacionamento ou Analista de Onboarding", faz: "Registra ao vivo; não conduz (proposta, validar)." },
  ],
  principio: "Só conta como implementado o que está em uso. Material enviado não é material implementado: cada componente passa por personalizado, configurado, treinado e em uso, e \"em uso\" pede prova real (11.02, seção 5). Os números do D60 são leitura para decidir os ajustes, não o resultado final: o resultado oficial é medido do D62 ao D89 e apresentado no D90 (01.02). Antes do D62, a prévia da garantia não aparece para a clínica (08.08).",
  entra: [
    "Sessões 1 a 6 feitas (pré-requisito do 00.02)",
    "08.04 Tracker de Controle com a semana fechada (90% ou mais das linhas completas)",
    "11.04 Score de Saúde e Score de Execução atualizado, com evidência por item",
    "Evidências dos 4 estados (personalizado, configurado, treinado, em uso) no ClickUp",
    "08.08 rodado no momento D60 (Bloco 4: Playbook)",
    "03.07 Plano de Ação e Metas dos 90 Dias com KPIs assinados",
  ],
  sai: [
    "Lista de componentes com status e evidência de uso de cada um (11.02, seção 5)",
    "Leitura dos KPIs do período contra a baseline D0 e a meta D90, combinada com a clínica",
    "Score de Execução do D60 registrado e, se abaixo de 80%, escalado ao Condutor (08.05, seção 4)",
    "Ajustes do D61 ao D90: no máximo 3, com lado, dono (função) e prazo em data",
    "08.06 Playbook de Continuidade entregue (ou com data até o check-in seguinte)",
    "Check-ins D66, D76 e D86 e encerramento D90 na agenda; ata na pasta (critério de pronto do 00.02)",
  ],
  docs: [
    { codigo: "08.10", nome: "Script do Checkpoint D60", url: doc("1ADVgA6xce9IKOroXWMKgGCElSvF1mxwS5eb77Arc3zM") },
    { codigo: "11.02", nome: "Operação Enxuta v2 (checkpoint D60 e regra \"só conta se está em uso\")", url: doc("1FK-TymBxlVKJ4b77W95jTnnyB0076yYUaIKGbF2bINo") },
    { codigo: "08.04", nome: "Tracker de Controle", url: planilha("1A9uc20D3nW2nL8O_79kOjUfQg57pOOYlsP7vvoCMrTI") },
    { codigo: "11.04", nome: "Score de Saúde e Score de Execução do Cliente", url: planilha("1bZq_wUSWKFmawLQtBQv7h9xpaB5uh9L-lLGFfmTYliQ") },
    { codigo: "08.05", nome: "Rotina de Leitura Semanal e Plano por Vazamento", url: doc("1CHJdAxfj9Zg5IBpLX95HpqIuQfRhT3BBDY3s4c5ZjEw") },
    { codigo: "08.06", nome: "Playbook de Continuidade", url: doc("1dZ2MyzCPtetyovGtLB6Xt1QS77rsge3C7zO0DTamzfU") },
    { codigo: "08.08", nome: "Prompt de Personalização da Fidelização e do Encerramento", url: doc("19cZO5wn7GRiV9j2tEx8Lib1QDeqBubGJSNnZtjGT2To") },
    { codigo: "08.07", nome: "Relatório de Encerramento D90", url: doc("1wxxiZv2Ptf0xIeMNJNjUQbFREjtjFgyQuuUKRVQxL6A") },
    { codigo: "08.01", nome: "Script da Sessão de Fidelização e Controle", url: doc("1dSH-N4cfey7N9fwZ50T-FxFlRbwJAowDBjMUX-ag9t0") },
    { codigo: "03.07", nome: "Plano de Ação e Metas dos 90 Dias", url: doc("1hUNQ7O91eiln6jCfTUIDaMYNthM4Nn8iKT8FvwbHMoY") },
    { codigo: "01.02", nome: "Política de Garantia Condicionada, Reembolso e Exclusividade", url: doc("1QHGBF6wwx4DX2HDOWxTJo3OeRy0ZuuUtxGFDQWK1-Gs") },
    { codigo: "00.02", nome: "Cronograma Mestre D0 a D90", url: planilha("1eEsjnsQNo8OyqtNMZN3-5c-eANxFnNc5EfwqUAyEijc") },
  ],
  preparo: [
    { chave: "prep-confirmar", quando: "D-3", oque: "Confirmar data e participantes: decisor obrigatório; quem lê os números até o fim; recepção líder no bloco 2 (proposta, validar)", quem: "CS e Relacionamento", horas: -72 },
    { chave: "prep-tracker", quando: "D-3", oque: "Fechar a semana no 08.04 e conferir \"Linhas completas\" (90% ou mais). Abaixo disso, a leitura do bloco 3 começa pelo V15 (08.05, seção 2.1)", quem: "Coordenador de Implementação", horas: -72, doc: "08.04" },
    { chave: "prep-checklist", quando: "D-3", oque: "Montar o checklist de evidência por componente a partir do ClickUp e da aba Score de Execução do 11.04: status dos 4 estados e link ou print da evidência de uso (11.02, seção 5)", quem: "Coordenador de Implementação", horas: -72, doc: "11.02" },
    { chave: "prep-leitura", quando: "D-2", oque: "Leitura da DC na ordem da 08.05, seção 2.2, e vazamento principal das últimas 4 semanas com a ação padrão do mapa (V1 a V20)", quem: "Coordenador + Gestor de Tráfego", horas: -48, doc: "08.05" },
    { chave: "prep-playbook", quando: "D-2", oque: "Rodar o 08.08 no momento D60 (Bloco 4: Playbook; Bloco 3 atualizado se o Tracker for posterior à Sessão 6). \"Em uso\" só com item Cumprido e evidência no 11.04; nos demais, \"[Coordenador confirma no checkpoint D60]\"", quem: "Coordenador de Implementação", horas: -48, doc: "08.08" },
    { chave: "prep-score", quando: "D-2", oque: "Conferir o Score de Execução no 11.04. Abaixo de 80%: escalar ao Fundador no mesmo dia (3 linhas: o que aconteceu, por que, o que propõe). O Fundador decide como apresentar à clínica e se entra na reunião (08.05, seção 4)", quem: "Coordenador → Fundador", horas: -48, doc: "11.04" },
    { chave: "prep-resumo", quando: "D-1", oque: "Resumo de 1 página para o Condutor: KPIs baseline x atual x meta, vazamento principal, Score de Execução, componentes sem evidência, pontos sensíveis (proposta, validar)", quem: "Coordenador de Implementação", horas: -24 },
    { chave: "prep-vespera", quando: "D-1", oque: "Mensagem de véspera à clínica e combinado de sala sobre valores em R$ (protocolo do 08.01)", quem: "CS e Relacionamento", horas: -24, doc: "08.01" },
    { chave: "prep-tela", quando: "15 min antes", oque: "Abrir checklist de evidência, aba Painel do 08.04 (visão \"Operação\" se combinado) e rascunho do 08.06. Não abrir a aba Garantia na tela compartilhada. Gravação ligada", quem: "Coordenador de Implementação", horas: -0.25 },
  ],
  regraPreparo: "Antes do D62 a aba Garantia do 08.04 é só PRÉVIA: no D60 o resultado da prévia não entra em nenhum texto para a clínica (tela, ata, mensagem ou Playbook); vai só para a lista de conferência do Coordenador, com a amostra de cada KPI (08.08).",
  blocos: [
    {
      n: 1, titulo: "Abertura e combinado", min: 5, publico: "Todos (recepção presente)",
      passos: [
        "Coordenador abre com o objetivo: componentes com prova de uso, leitura dos números, Score de Execução, ajustes até o D90 e Playbook.",
        "Pergunta de abertura (anotar literal): \"Desde a Sessão 6, o que mudou na rotina de vocês e o que ainda depende de alguém lembrar de fazer?\"",
      ],
      frases: [
        "\"Hoje é o dia 60. O combinado desde o início era o sistema completo rodando até hoje. Vamos olhar parte por parte, com a prova de que está em uso. 'Foi enviado' não conta.\"",
        "\"Os números de hoje são leitura de tendência para decidir os ajustes. O resultado oficial é medido do dia 62 ao 89 e apresentado no dia 90.\"",
      ],
      registrar: [
        { chave: "mudancas_desde_s6", rotulo: "O que mudou desde a Sessão 6 e o que ainda depende de alguém lembrar (literal)", linhas: 3 },
      ],
    },
    {
      n: 2, titulo: "Evidência de uso por componente", min: 20, publico: "Decisor, quem lê os números e recepção líder",
      passos: [
        "Para cada componente: mostrar a evidência, perguntar se a clínica confirma, registrar o status (Em uso, Referência ou Pendente).",
        "Rastreamento (Sessão 3): lead de teste na plataforma e no Tracker com UTM; conversão offline enviada ao menos uma vez.",
        "Anúncios e rotina semanal de tráfego (Sessão 3): campanha com entrega há 7 dias e leads registrados; ajustes semanais registrados no 05.10.",
        "Filtro (Sessão 3): leads chegando com pontuação A, B ou C.",
        "Atendimento (Sessão 4): 8 de 10 conversas auditadas seguem a estrutura (06.09); IA, se houver, aprovada nos cenários e com transferência funcionando.",
        "Confirmação (Sessão 4): mensagens disparadas e comparecimento registrado.",
        "Registro de decisão (Sessão 5): 07.07 preenchido em 90% das consultas. Cadência de follow-up (Sessão 5): cadências ativas com status no Tracker.",
        "Fidelização e indicação (Sessão 6): primeira mensagem de pós-atendimento e primeiro pedido de indicação enviados.",
        "Tracker (Sessão 6): atualizado pela clínica em pelo menos 5 dos últimos 7 dias; leitura de segunda com resposta ao Coordenador (proposta, validar).",
      ],
      frases: [
        "\"Esse material foi entregue, mas ainda não achamos prova de uso. Ele entra como pendente, com dono e data. Não é crítica, é o que falta para fechar o sistema.\"",
        "\"Me mostra a última vez que isso aconteceu. Se aconteceu, a gente anota onde está a prova.\"",
      ],
      alerta: "Componente sem evidência de uso não é marcado \"Em uso\" por suposição, nem no checklist nem no Playbook (11.02, seção 5; 08.08).",
      registrar: [
        { chave: "evidencia_componentes", rotulo: "Evidência por componente: status (Em uso, Referência, Pendente) e onde está a prova", dica: "Um componente por linha: rastreamento, anúncios e tráfego, filtro, atendimento, confirmação, registro de decisão, follow-up, fidelização e indicação, Tracker", linhas: 9 },
        { chave: "componentes_pendentes", rotulo: "Componentes pendentes: o que falta, dono (função) e prazo", linhas: 4 },
      ],
    },
    {
      n: 3, titulo: "Leitura do Tracker e dos KPIs contra a baseline", min: 15, publico: "Decisor e quem lê os números",
      passos: [
        "0 a 2 min: qualidade do dado (\"Linhas completas\" e \"Divergência plataforma x Tracker\").",
        "2 a 8 min: KPIs assinados no 03.07 com baseline D0, últimas 4 semanas, meta D90 e semáforo. Cada número com a conta dita em voz alta.",
        "8 a 12 min: funil acumulado e etapa que mais vaza, com a referência inicial Doctor Creator, a validar. Deixar a clínica responder antes de mostrar.",
        "12 a 15 min: vazamento principal das últimas 4 semanas e código do mapa (V1 a V20) da 08.05.",
        "Amostra pequena: com menos de 10 casos no denominador, ler só tendência (08.05, seção 2.2). Receita atribuída é indicador acompanhado, não meta nem garantia.",
      ],
      mostrar: "kpis",
      frases: [
        "\"Comparecimento: [compareceram] de [agendados] nas últimas 4 semanas, ou seja, [x]%. No ponto de partida eram [y]%. A meta que vocês assinaram é [z]%.\"",
        "\"Com [n] consultas, cada paciente muda a taxa em cerca de [100 ÷ n] pontos. A gente lê tendência, não sentença.\"",
        "\"A conta da garantia é feita na janela do dia 62 ao 89, com a regra que vocês assinaram, e apresentada no dia 90. Hoje a gente olha tendência para decidir os ajustes.\"",
      ],
      alerta: "Leitura, não garantia: a aba Garantia do 08.04 não aparece na tela nem na conversa antes do D62. Nunca prometer resultado, faturamento ou número de pacientes.",
      registrar: [
        { chave: "leitura_kpis", rotulo: "Leitura dos KPIs: baseline D0, últimas 4 semanas, meta D90 e a conta de cada um", linhas: 5 },
        { chave: "vazamento_principal", rotulo: "Vazamento principal acordado (código V e número com origem no Painel)", linhas: 2 },
      ],
    },
    {
      n: 4, titulo: "Score de Execução", min: 5, publico: "Decisor (Condutor se escalado)",
      passos: [
        "Mostrar o Score de Execução do D60 (11.04) e o resumo por item: Presença, Prazos, Treino, Gravação, Registro, Uso, Verba, com a evidência de cada um.",
        "Para cada item Parcial ou Não cumprido: o que falta, quem faz, até quando. Vira ajuste do bloco 5 ou pendência do Playbook.",
        "Abaixo de 80%: a escalada ao Condutor já foi feita na preparação; seguir a forma de apresentar que ele decidiu. Lembrar só a regra assinada: a garantia pede Score de 80% ou mais no D90 (01.02, seção 1.1).",
      ],
      registrar: [
        { chave: "score_execucao", rotulo: "Score de Execução no D60 (11.04) e itens Parcial ou Não cumprido" },
        { chave: "escala_fundador", rotulo: "Escalado ao Condutor? (Sim/Não, data e decisão)" },
      ],
    },
    {
      n: 5, titulo: "Ajustes do D61 ao D90 e ações da clínica", min: 10, publico: "Decisor e quem lê os números",
      passos: [
        "No máximo 3 ajustes, cada um com lado (clínica ou DC), dono (função), prazo em data e KPI que deve mexer.",
        "Ordem de escolha (08.05, seção 3.6): dado ruim (V1, V15); 1ª resposta vermelha (V4) antes de anúncio; maior \"Perda estimada\"; empate vai para a ação da clínica.",
        "Componente pendente do bloco 2 que dependa da clínica entra aqui.",
        "Pergunta de compromisso (anotar literal): \"Quem, com nome de função, faz a primeira ação até quando?\"",
      ],
      frases: [
        "\"Esses ajustes entram no ClickUp hoje. No check-in do dia 66 a gente olha se foram feitos e se o número mexeu.\"",
      ],
      registrar: [
        { chave: "ajustes_d61_d90", rotulo: "Ajustes do D61 ao D90 (até 3): vazamento ou pendência, ajuste, lado, dono, prazo, KPI", linhas: 3 },
        { chave: "acoes_clinica", rotulo: "Ações da clínica (uma por linha, com dono e prazo)", linhas: 3 },
        { chave: "acoes_dc", rotulo: "Ações da Doctor Creator (uma por linha)", linhas: 3 },
      ],
    },
    {
      n: 6, titulo: "Playbook, datas e encerramento", min: 5, publico: "Decisor e quem lê os números",
      passos: [
        "Mostrar as seções 1, 3 e 8 do 08.06 Playbook de Continuidade. Entregar se pronto; se não, combinar a entrega até o check-in seguinte.",
        "Linha do tempo: D61 a D89 otimização com dado real; check-ins de 30 min no D66, D76 e D86; prévia interna no D85; encerramento no D90 com o 08.07.",
      ],
      frases: [
        "\"O sistema está montado. Daqui até o dia 90 o trabalho é manter a rotina e mexer em uma coisa por vez. Quem segura o resultado depois do programa é a leitura de segunda.\"",
      ],
      registrar: [
        { chave: "playbook_entrega", rotulo: "08.06 Playbook entregue? (data ou quando será entregue)" },
        { chave: "datas_checkins", rotulo: "Datas dos check-ins D66, D76, D86 e do encerramento D90" },
      ],
    },
  ],
  situacoes: [
    { titulo: "Componente entregue, mas sem evidência de uso", como: ["Não conta como implementado (11.02, seção 5).", "Status \"Pendente\" com dono e prazo na seção 8 do Playbook.", "Se for do lado da clínica e travar um KPI da garantia, vira o ajuste 1 do bloco 5."] },
    { titulo: "Score de Execução abaixo de 80%", como: ["Escalar ao Fundador no mesmo dia (08.05, seção 4).", "O Fundador decide como apresentar à clínica que a garantia está em risco por execução.", "Na sala, falar de itens e evidência, não de culpa."] },
    { titulo: "KPIs muito abaixo da baseline", como: ["Não defender a DC: separar o que é anúncio (DC) do que é conversa e consulta (clínica).", "Montar os ajustes em cima do vazamento principal e registrar o risco no 11.04.", "2 ou mais KPIs da garantia vermelhos por 2 semanas seguidas desde a S9: regra de escalada do 08.05."] },
    { titulo: "Clínica pede o resultado da garantia", como: ["Não mostrar a aba Garantia nem dizer \"aplica\" ou \"não aplica\" antes do D62 (08.08).", "Usar a frase do bloco 3: a conta é feita do D62 ao D89 e apresentada no D90."] },
    { titulo: "Tracker com dado incompleto", como: ["Bloco 3 vira 5 min de leitura do que existe e 10 min para combinar a rotina de preenchimento.", "Primeiro ajuste: V15 (08.05). Registrar no Score de Execução."] },
    { titulo: "Decisor ausente", como: ["Sem decisor não há confirmação de status nem ajustes.", "Remarcar em até 5 dias úteis (proposta, validar). Desmarcação com menos de 24 h conta como atraso do cliente (01.02, seção 5)."] },
    { titulo: "Pedido de novo serviço, desconto ou mudança de escopo", como: ["Anotar para a conversa do D90; não abrir escopo agora.", "Desconto, exceção de garantia ou escopo: só o Fundador decide (01.02, seção 10)."] },
  ],
  regras: [
    "Número com conta explicada. Sem conta, parece invenção.",
    "Referência sempre como \"referência inicial Doctor Creator, a validar\".",
    "Nada de prometer faturamento, resultado ou número de pacientes.",
    "Nenhum preço, desconto ou condição comercial na reunião.",
    "Prévia da garantia fora de tudo o que a clínica vê antes do D62: tela, ata, mensagem e Playbook.",
    "Só conta como implementado o que está em uso, com evidência. Nunca marcar \"Em uso\" por suposição.",
    "Nenhum nome, telefone ou dado de saúde de paciente. Funções, não nomes de pessoa da equipe.",
    "No máximo 3 ajustes: mexer em tudo ao mesmo tempo impede saber o que funcionou (08.05).",
  ],
  pos: [
    { chave: "pos-ata-grupo", quando: "Mesmo dia", oque: "Ata curta no grupo da clínica: status dos componentes, ajustes com dono e prazo, datas D66, D76, D86 e D90. Sem prévia da garantia (proposta, validar)", quem: "Coordenador (redige), CS (envia)", horas: 4, doc: "08.01" },
    { chave: "pos-clickup", quando: "Até 24 h", oque: "Ajustes do D61 ao D90 no ClickUp com dono, prazo e critério de conclusão", quem: "Coordenador de Implementação", horas: 24 },
    { chave: "pos-ata-pasta", quando: "Até 48 h", oque: "Ata e gravação na pasta do cliente (critério de pronto do 00.02); 11.04 atualizado com status e evidência de cada item", quem: "Coordenador de Implementação", horas: 48, doc: "00.02" },
    { chave: "pos-depoimento", quando: "Até 48 h (só piloto)", oque: "Clínica do piloto: agendar o depoimento 1 em vídeo, contrapartida do D60 (11.02, seção 7)", quem: "Coordenador agenda; Editor e Copy grava", horas: 48, doc: "11.02" },
    { chave: "pos-playbook", quando: "Até o D66", oque: "Entregar o 08.06 Playbook em PDF e Google Doc na pasta 08, sem colchetes no texto final, se não foi entregue na reunião", quem: "Coordenador de Implementação", horas: 144, doc: "08.06" },
    { chave: "pos-checkin-d66", quando: "D66", oque: "Check-in de 30 min: KPIs da garantia, ações feitas, vazamento principal, Score de Execução; prévia da garantia só a partir do D62 (08.05, seção 5.2)", quem: "Coordenador de Implementação", horas: 144, doc: "08.05" },
    { chave: "pos-checkin-d76", quando: "D76", oque: "Check-in de 30 min, mesma pauta", quem: "Coordenador de Implementação", horas: 384, doc: "08.05" },
    { chave: "pos-previa-d85", quando: "D85", oque: "Prévia do Score de Execução e dos KPIs para o encerramento (01.02, seção 1.5); 08.08 roda entre D85 e D88 para o 08.07", quem: "Coordenador de Implementação", horas: 600, doc: "08.07" },
    { chave: "pos-checkin-d86", quando: "D86", oque: "Check-in de 30 min, mesma pauta", quem: "Coordenador de Implementação", horas: 624, doc: "08.05" },
  ],
  acoesDe: { chave: "acoes_clinica", lado: "clinica" },
};
