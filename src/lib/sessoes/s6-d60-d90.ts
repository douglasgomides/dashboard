import type { DefSessao } from "@/lib/sap-sessoes";

const doc = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const planilha = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

// Fontes no Drive (pasta "Sistema de Aquisição v2"):
// 08.01 Script da Sessão 6; 08.02; 08.03; 08.04; 08.05; 08.06; 08.07 (Parte C = roteiro do D90); 08.08;
// 11.02 Operação Enxuta v2 (checkpoint D60); 11.04; 00.02 Cronograma Mestre (linhas 26, 27 e 33); 00.03.

export const SESSAO_S6: DefSessao = {
  id: "S6",
  cronoN: 26,
  titulo: "Sessão 6 · Fidelização, Indicações e Controle (90 min)",
  quando: "D45 a D50",
  duracao: "90 min, por videochamada gravada",
  quem: [
    { papel: "Fundador", faz: "Conduz a sessão e interpreta os números em voz alta." },
    { papel: "Coordenador de Implementação", faz: "Coconduz, mostra o Tracker na tela e anota os compromissos." },
    { papel: "Analista de Onboarding", faz: "Registra ao vivo. Não conduz a conversa." },
    { papel: "Decisor da clínica (médico ou sócio)", faz: "Obrigatório. Aprova régua, indicação e plano de otimização." },
    { papel: "Recepção ou secretária-chefe", faz: "Obrigatória nos blocos 2, 3 e 6. Vai executar a régua e a indicação no dia a dia." },
    { papel: "Quem vai ler o Tracker na clínica", faz: "Obrigatório nos blocos 4, 5 e 6. Assume a rotina semanal a partir do D60." },
    { papel: "Consultora ou TCO (se existir)", faz: "Recomendada no bloco 3. Pede indicação em momentos de alta satisfação." },
  ],
  principio: "O Tracker aparece na tela com números reais, mesmo que estejam ruins. Número ruim mostrado cedo é plano de ação. Número escondido até o D90 vira desconfiança e pedido de garantia.",
  entra: [
    "08.04 Tracker de Controle com pelo menos 2 semanas de anúncio no ar (anúncios sobem no D28 a D30)",
    "Leitura prévia da semana feita pelo Coordenador com a 08.05",
    "03.07 Plano de Ação e Metas dos 90 Dias com KPIs assinados",
    "Lista de serviços da clínica com prazo de retorno de cada um (pedida no convite)",
    "Score de Saúde e Score de Execução atualizados no 11.04",
  ],
  sai: [
    "08.02 Régua de Relacionamento e Reativação personalizada, com responsável por contato e data de ativação",
    "08.03 Processo de Indicação personalizado, com meta mensal e mecanismo de rastreio escolhido",
    "Plano de otimização com 3 ações priorizadas, dono e prazo",
    "Rotina semanal da clínica combinada: quem lê o Tracker, quando e o que faz",
    "Datas do checkpoint D60 e do encerramento D90 marcadas na agenda",
  ],
  docs: [
    { codigo: "08.01", nome: "Script da Sessão de Fidelização e Controle", url: doc("1dSH-N4cfey7N9fwZ50T-FxFlRbwJAowDBjMUX-ag9t0") },
    { codigo: "08.02", nome: "Régua de Relacionamento e Reativação", url: doc("1Xkun2hKUpsubZJLrviWm5RgNtqj76InBHQU3kByUqys") },
    { codigo: "08.03", nome: "Processo de Indicação", url: doc("1rw_C_6YvtT9spkq66n57i-zwSSh6ORWBPDHwWTInSEE") },
    { codigo: "08.04", nome: "Tracker de Controle", url: planilha("1A9uc20D3nW2nL8O_79kOjUfQg57pOOYlsP7vvoCMrTI") },
    { codigo: "08.05", nome: "Rotina de Leitura Semanal e Plano por Vazamento", url: doc("1CHJdAxfj9Zg5IBpLX95HpqIuQfRhT3BBDY3s4c5ZjEw") },
    { codigo: "08.08", nome: "Prompt de Personalização da Fidelização e do Encerramento", url: doc("19cZO5wn7GRiV9j2tEx8Lib1QDeqBubGJSNnZtjGT2To") },
    { codigo: "03.07", nome: "Plano de Ação e Metas dos 90 Dias", url: doc("1hUNQ7O91eiln6jCfTUIDaMYNthM4Nn8iKT8FvwbHMoY") },
    { codigo: "11.04", nome: "Score de Saúde e Score de Execução do Cliente", url: planilha("1bZq_wUSWKFmawLQtBQv7h9xpaB5uh9L-lLGFfmTYliQ") },
    { codigo: "11.03", nome: "Integração Quaddro e Caminho B sem Quaddro", url: doc("150AfCpj9HXWc1BYl5kl2ethGok3G-lyUWKb9l-xMvhc") },
  ],
  preparo: [
    { chave: "prep-confirmar", quando: "D-3", oque: "Confirmar data e participantes; pedir a lista de serviços com prazo de retorno e se a clínica tem base de pacientes exportável (sistema de agenda ou planilha)", quem: "CS e Relacionamento", horas: -72 },
    { chave: "prep-tracker", quando: "D-3", oque: "Atualizar o Tracker com a semana fechada; conferir se Agendou, Compareceu e Decisão estão preenchidos em pelo menos 90% das linhas", quem: "Coordenador de Implementação", horas: -72, doc: "08.04" },
    { chave: "prep-leitura", quando: "D-2", oque: "Rodar a leitura da 08.05: identificar o maior vazamento e trazer 3 hipóteses de ação", quem: "Coordenador + Gestor de Tráfego", horas: -48, doc: "08.05" },
    { chave: "prep-preencher", quando: "D-2", oque: "Pré-preencher o 08.02 com os serviços e prazos de recall sugeridos; pré-preencher o 08.03 com o momento de pico de satisfação provável do serviço prioritário", quem: "Coordenador de Implementação", horas: -48, doc: "08.02" },
    { chave: "prep-resumo", quando: "D-1", oque: "Resumo de 1 página para o Fundador: KPIs baseline x atual x meta, maior vazamento, Score de Execução, pontos sensíveis da conta (atrasos, insatisfação, equipe resistente)", quem: "Coordenador de Implementação", horas: -24, doc: "11.04" },
    { chave: "prep-vespera", quando: "D-1", oque: "Mensagem de véspera (WhatsApp): última sessão individual; recepção na primeira meia hora; quem lê os números até o fim. Combinar o protocolo de sala se o decisor não quiser a equipe vendo receita", quem: "CS e Relacionamento", horas: -24 },
  ],
  regraPreparo: "Protocolo de sala: se o decisor não quiser a equipe vendo receita, o Tracker aparece na visão \"Operação\" (volumes e taxas, sem R$) nos blocos com equipe, e a visão completa só com o decisor nos últimos 5 minutos do bloco 4. Combinar por mensagem na véspera.",
  blocos: [
    {
      n: 1, titulo: "Retomada do funil", min: 10, publico: "Decisor, recepção e quem lê o Tracker",
      passos: [
        "Fundador: \"Hoje é a última sessão individual e ela tem dois objetivos. O primeiro é fazer quem já é paciente voltar e trazer outros. O segundo é deixar vocês lendo os próprios números, porque a partir do dia 60 quem toca a rotina é a clínica, com a gente do lado até o dia 90.\"",
        "Mostrar na tela o funil com cada etapa e o material que está rodando: Atração (05.10), Filtro (05.08), Conversa (06.02 e 06.03), Comparecimento (06.06), Consulta (07.02 e 07.07), Follow-up (07.06), Fidelização e indicação (hoje: 08.02 e 08.03), Controle (08.04 e 08.05).",
        "Pergunta de checagem (anotar literal): \"Das etapas que estão rodando, qual vocês sentem que ainda depende de alguém lembrar de fazer?\"",
        "Se a resposta for operacional, vira o primeiro item do plano de otimização.",
      ],
      mostrar: "funil",
      registrar: [{ chave: "depende_memoria", rotulo: "Etapa que ainda depende de alguém lembrar (resposta literal)", linhas: 2 }],
    },
    {
      n: 2, titulo: "Régua de relacionamento", min: 20, publico: "Fundador + recepção, com o decisor",
      passos: [
        "Fundador: \"Paciente que já confiou na clínica custa muito menos para voltar do que um paciente novo vindo de anúncio. Hoje esse retorno depende da memória da recepção. A régua tira isso da memória.\"",
        "Pós-atendimento (5 min): mostrar D+1 e D+7. \"Hoje alguém manda mensagem no dia seguinte? Quem?\" Definir responsável e se vai manual ou automatizado (Quaddro ou caminho B, 11.03).",
        "Cuidado pós-procedimento (3 min): confirmar com o médico que as mensagens são orientação geral já entregue por escrito. Nenhuma orientação clínica individual por mensagem automática. Médico aprova o texto ali ou em até 48 h.",
        "Lembrete de retorno e recall (5 min): preencher na tela o prazo por serviço. O médico define o prazo, não a DC.",
        "Reativação de inativos (5 min): \"Vocês conseguem exportar a lista de quem não vem há mais de 12 meses?\" Se sim, combinar segmentação e data do primeiro lote. Ler em voz alta a regra de LGPD do 08.02.",
        "Avaliação no Google (2 min): definir quem pede (R4, D+10). O pedido vai para todos os atendidos, não só para quem elogiou. A clínica responde a todas as avaliações.",
        "Pergunta de compromisso: \"Qual desses contatos começa a rodar esta semana?\"",
      ],
      frases: [
        "Dado de apoio, se perguntarem: estudo da Bain com hospitais privados no Brasil mostrou que pacientes promotores voltam cerca de 3 vezes mais que detratores, e que 60% escolheram o hospital por recomendação.",
        "Se a recepção disser que não tem tempo: \"Por isso a gente automatiza o que é igual para todo mundo e deixa com vocês só a resposta. Se a resposta passar de 15 minutos por dia, a gente revisa no check-in.\"",
      ],
      alerta: "LGPD: lembrete de retorno se apoia na tutela da saúde; reativação com cara de divulgação pede consentimento. Sem opt-in, ligação antes de qualquer disparo. Opt-out em toda mensagem. Nada de diagnóstico no texto. Mínimo: D+1 e pedido de avaliação ativos em até 7 dias.",
      registrar: [
        { chave: "regua_responsaveis", rotulo: "Responsável, canal, manual ou automatizado e data de ativação por contato", linhas: 4 },
        { chave: "prazos_retorno", rotulo: "Prazo de retorno/recall por serviço (definido pelo médico)", linhas: 3 },
        { chave: "reativacao", rotulo: "Base exportável? Segmentação e data do primeiro lote", linhas: 2 },
        { chave: "regua_esta_semana", rotulo: "Contatos que começam a rodar esta semana" },
      ],
    },
    {
      n: 3, titulo: "Processo de indicação", min: 15, publico: "Fundador com o médico, recepção e consultora",
      passos: [
        "Fundador: \"Indicação não é favor que se pede, é consequência de uma experiência boa. O que muda agora é que a gente escolhe o momento em que o paciente está mais satisfeito e deixa fácil para ele indicar. E a gente mede.\"",
        "Momento de pico (4 min): \"Em que momento do tratamento o paciente costuma te agradecer ou elogiar?\" Esse é o momento de pedir.",
        "Quem pede e como (4 min): mostrar as falas do 08.03. O médico só planta a semente com uma frase; o convite com link vem da recepção ou da consultora. Ensaiar uma vez a fala do médico.",
        "Ética (3 min): ler em voz alta a regra de não oferecer vantagem a quem indica ou é indicado. Registrar o ciente do médico.",
        "Rastreio (2 min): escolher link com código único por paciente (Quaddro ou caminho B) ou pergunta obrigatória \"Quem te indicou?\" no primeiro contato. Canal = Indicação no Tracker.",
        "Meta (2 min): definir a meta mensal a partir da base de pacientes ativos (cálculo no 08.03). Anotar no 03.07 como indicador acompanhado.",
      ],
      frases: [
        "\"Não oferecemos desconto, brinde, sessão grátis, sorteio nem qualquer vantagem para quem indica ou para quem é indicado. Isso fere o Código de Ética Médica (art. 59) e a Resolução CFM 2.336/2023. O agradecimento é pessoal e sem valor financeiro.\"",
      ],
      registrar: [
        { chave: "momento_pico", rotulo: "Momento de pico de satisfação (palavras do médico)", linhas: 2 },
        { chave: "quem_pede", rotulo: "Quem pede e como (médico planta, quem convida)", linhas: 2 },
        { chave: "ciente_etico", rotulo: "Ciente ético do médico registrado?" },
        { chave: "rastreio", rotulo: "Mecanismo de rastreio escolhido" },
        { chave: "meta_indicacao", rotulo: "Meta mensal de indicações" },
      ],
    },
    {
      n: 4, titulo: "Revisão do Tracker com números reais", min: 25, publico: "Decisor e quem lê o Tracker (visão completa com R$ só com o decisor nos últimos 5 min)",
      passos: [
        "Coordenador: \"Vou mostrar os números exatamente como estão. Alguns estão bons, outros não. A gente olha juntos e decide onde mexer. Número ruim agora é o melhor aviso que a gente pode ter.\"",
        "Sequência fixa de leitura, sempre nesta ordem (ver perguntas por etapa). Deixar a clínica responder antes de mostrar.",
        "Amostra pequena: \"Com [n] consultas, cada paciente muda a taxa em [x] pontos. A gente lê tendência, não sentença.\"",
        "KPI melhor que a meta: \"Ótimo. Agora o risco é relaxar. O que fez isso funcionar precisa estar na rotina.\"",
        "KPI pior que a baseline: \"Isso é o mais importante da sessão. Vamos achar a causa antes de mexer em qualquer outra coisa.\"",
        "Dado incompleto: \"Sem esse dado a gente não consegue provar o resultado, nem para vocês, nem para a garantia. Esse é o primeiro ajuste.\"",
      ],
      mostrar: "kpis",
      perguntas: [
        { etapa: "KPIs assinados", min: 5, mostrar: "Baseline D0, semana atual, meta D90", perguntas: "Olhando só esses números, o que surpreende vocês?" },
        { etapa: "Funil completo", min: 7, mostrar: "Semana e acumulado: leads, qualificados, agendamentos, consultas, fechamentos, receita atribuída, retornos, indicações", perguntas: "Em qual etapa vocês acham que mais gente fica pelo caminho?" },
        { etapa: "Maior vazamento", min: 5, mostrar: "Maior vazamento destacado pelo Tracker e comparação com a referência inicial DC", perguntas: "Isso bate com o que vocês sentem no dia a dia?" },
        { etapa: "Motivos e 1ª resposta", min: 5, mostrar: "Motivos de não fechamento (categoria e literal) e tempo de 1ª resposta", perguntas: "Qual desses motivos vocês já tinham ouvido antes do programa?" },
        { etapa: "Qualidade do dado", min: 3, mostrar: "% de linhas completas, campos vazios", perguntas: "Quem vai garantir que essa coluna esteja preenchida toda sexta?" },
      ],
      alerta: "Dado de saúde não aparece no Tracker. Se alguma linha tiver diagnóstico, nome completo ou telefone fora do campo permitido, o Coordenador corrige depois da sessão e registra no 11.04.",
      registrar: [
        { chave: "maior_vazamento", rotulo: "Maior vazamento acordado com a clínica", linhas: 2 },
        { chave: "leitura_clinica", rotulo: "O que a clínica disse sobre os números (respostas às perguntas)", linhas: 3 },
        { chave: "dono_preenchimento", rotulo: "Quem garante o preenchimento toda sexta" },
      ],
    },
    {
      n: 5, titulo: "Plano de otimização", min: 10, publico: "Decisor e quem lê o Tracker",
      passos: [
        "3 ações, não 10. Cada uma com vazamento, dono (função), prazo, KPI que deve mexer e como saber se funcionou.",
        "Regra de escolha: primeiro o maior vazamento (08.05), depois o que depende de dado, depois o resto.",
        "Ação da clínica e ação da DC separadas.",
        "Fechamento: \"Essas três ações entram no ClickUp hoje e o Coordenador cobra na segunda-feira. No check-in quinzenal a gente olha se mexeram o número.\"",
      ],
      registrar: [
        { chave: "acoes_clinica", rotulo: "Ações da clínica (uma por linha: vazamento, ação, dono, prazo, KPI, como saber se funcionou)", linhas: 3 },
        { chave: "acoes_dc", rotulo: "Ações da Doctor Creator (uma por linha, com dono e prazo)", linhas: 3 },
      ],
    },
    {
      n: 6, titulo: "Do D50 ao D90 e rotina semanal que a clínica assume", min: 10, publico: "Decisor, recepção e quem lê o Tracker",
      passos: [
        "Fundador: \"Até o dia 60 a gente termina de ajustar tudo e faz um checkpoint formal: sistema completo rodando. Do dia 61 ao 90 é otimização com dado real. No dia 90 a gente senta, compara com a meta que vocês assinaram e decide junto o próximo passo.\"",
        "Mostrar a linha do tempo: D50 a D60 régua e indicação ativadas, plano em execução; D60 checkpoint formal; D61 a D89 check-in quinzenal (30 min), anúncios ajustados toda semana, auditoria de conversas, call em grupo; D60 a D90 entrega do 08.06; D90 encerramento com o 08.07.",
        "Combinar a rotina com função e horário: diário (preencher Agendou, Compareceu e Decisão, 10 min); sexta (conferir semana completa, 15 min); segunda (ler o Tracker na sequência da 08.05 e escolher 1 ajuste, 20 min); mensal (reativação, indicações, avaliações, 45 min).",
        "Pergunta de compromisso final (anotar literal): \"Quem, com nome de função, vai abrir o Tracker na segunda-feira às [hora]?\"",
        "Encerramento: \"O que separa a clínica que mantém resultado da que volta ao normal é essa leitura de segunda-feira. O resto o sistema faz. A gente se vê na call em grupo desta semana.\"",
      ],
      frases: [
        "Por que insistir na leitura de segunda: meta-análise de 138 experimentos (Harkin e col., 2016) mostrou que acompanhar o progresso aumenta a chance de atingir a meta, com efeito maior quando o progresso é registrado por escrito e reportado a alguém.",
      ],
      registrar: [
        { chave: "rotina_semanal", rotulo: "Rotina semanal combinada (quando, o que, função, tempo)", linhas: 4 },
        { chave: "leitor_segunda", rotulo: "Função que abre o Tracker na segunda e horário (literal)" },
        { chave: "data_d60", rotulo: "Data do checkpoint D60" },
        { chave: "data_d90", rotulo: "Data do encerramento D90" },
      ],
    },
  ],
  situacoes: [
    { titulo: "Números muito abaixo da baseline", como: ["Não defender a DC. Mostrar o dado e separar o que é anúncio (DC) do que é conversa e consulta (clínica).", "Montar o plano de otimização em cima do maior vazamento.", "Coordenador registra o risco no 11.04; o Fundador decide se antecipa um check-in."] },
    { titulo: "Tracker com dado incompleto", como: ["Inverter a ordem: bloco 4 vira 15 min de leitura do que existe e 10 min para combinar a rotina de preenchimento.", "Registrar no Score de Execução."] },
    { titulo: "Médico quer oferecer desconto por indicação", como: ["Explicar o art. 59 do Código de Ética Médica e o risco de denúncia por concorrência.", "Oferecer o agradecimento pessoal do 08.03.", "Se insistir, registrar a orientação dada na ata e não configurar o mecanismo."] },
    { titulo: "Clínica sem base exportável", como: ["Reativação começa pela agenda dos últimos 12 meses, exportada manualmente em blocos de 50 pacientes.", "O resto da régua roda normalmente."] },
    { titulo: "Recepção resistente (\"mais trabalho\")", como: ["Mostrar o tempo real por dia (até 15 min).", "Começar só com D+1 e avaliação; o resto entra em 2 semanas."] },
    { titulo: "Decisor ausente", como: ["Sessão não acontece sem decisor. Remarcar em até 5 dias úteis.", "Na segunda ausência, contar como atraso do cliente (01.02)."] },
    { titulo: "Pedido de novo serviço prioritário", como: ["Anotar para a conversa do D90 (manutenção ou nova instalação). Não abrir escopo agora."] },
  ],
  regras: [
    "O Tracker aparece na tela com números reais, mesmo ruins.",
    "Nenhuma vantagem para quem indica ou é indicado (CEM art. 59, Resolução CFM 2.336/2023). Agradecimento pessoal e sem valor financeiro.",
    "Pedido de avaliação no Google para todos os atendidos, nunca só para quem elogiou, e sem incentivo.",
    "Nenhuma orientação clínica individual por mensagem automática. Prazo de retorno é definido pelo médico, não pela DC.",
    "Dado de saúde não aparece no Tracker.",
    "Plano de otimização com 3 ações, não 10; ação da clínica separada da ação da DC.",
    "Critério de sessão aprovada: régua com responsável e data em cada contato; indicação com momento, fala, rastreio, meta e ciente ético; Tracker lido e maior vazamento acordado; 3 ações com dono, prazo e KPI; leitor de segunda definido; datas D60 e D90 na agenda; gravação e ata na pasta 08.",
  ],
  pos: [
    { chave: "pos-ata", quando: "Mesmo dia", oque: "Ata curta no grupo individual da clínica: 3 ações do plano de otimização, rotina semanal com funções e horários, datas D60 e D90", quem: "Coordenador (redige), CS (envia)", horas: 4, doc: "08.01" },
    { chave: "pos-clickup", quando: "Até 24 h", oque: "Tarefas no ClickUp com dono, prazo e critério de conclusão (listas de fidelização e de Tracker, 02.08)", quem: "Coordenador de Implementação", horas: 24 },
    { chave: "pos-prompt", quando: "Até 24 h", oque: "Rodar o 08.08 no momento Sessão 6 (Blocos 1 a 3: régua, indicação e plano de otimização) e conferir pela lista \"Para conferência do Coordenador\"", quem: "Coordenador de Implementação", horas: 24, doc: "08.08" },
    { chave: "pos-docs-finais", quando: "Até 48 h", oque: "08.02 e 08.03 finais na pasta 08 do cliente, com textos aprovados pelo médico", quem: "Coordenador de Implementação", horas: 48, doc: "08.02" },
    { chave: "pos-ativar", quando: "Até 7 dias", oque: "Pós-atendimento D+1 e pedido de avaliação ativos; mecanismo de indicação configurado", quem: "CS + clínica", horas: 168, doc: "08.03" },
    { chave: "pos-reativacao", quando: "Até 7 dias", oque: "Primeiro lote de reativação enviado (se houver base)", quem: "Recepção, com apoio do CS", horas: 168, doc: "08.02" },
    { chave: "pos-cobranca", quando: "Segunda seguinte", oque: "Cobrança dos compromissos junto com o registro da call (09.03)", quem: "Coordenador de Implementação", horas: 96 },
    { chave: "pos-checkpoint", quando: "D60", oque: "Checkpoint formal: sistema completo rodando", quem: "Coordenador de Implementação", horas: 288, doc: "08.04" },
  ],
  acoesDe: { chave: "acoes_clinica", lado: "clinica" },
};

// D60: NÃO existe roteiro próprio no Drive. Objeto montado só com o que os documentos dizem:
// 00.02 (linha 27), 11.02 (ritos por cliente e seção 5), 08.01 (linha do tempo), 08.05 (seções 4 e 5.2),
// 08.06 (entrega recomendada no D60), 08.08 (momento D60 = Bloco 4) e 00.03. Duração não documentada.
export const SESSAO_D90: DefSessao = {
  id: "D90",
  cronoN: 33,
  titulo: "D90 · Reunião de encerramento",
  quando: "D90",
  duracao: "60 min",
  quem: [
    { papel: "Fundador", faz: "Conduz: abertura, KPIs e funil, status da garantia, recomendação e proposta de manutenção." },
    { papel: "Coordenador de Implementação", faz: "Apresenta o que funcionou e o que não funcionou e o Score de Execução. Redigiu o relatório." },
    { papel: "CS e Relacionamento", faz: "Apoia na proposta de manutenção e faz o pedido de depoimento e case no fim." },
    { papel: "Decisor da clínica", faz: "Recebe e assina o relatório; decide entre manutenção e seguir com o playbook." },
  ],
  principio: "Número ruim aparece com o mesmo destaque do número bom. Receita atribuída é indicador acompanhado, nunca resultado prometido. O que não funcionou tem causa e dono, sem culpar a clínica nem a DC.",
  entra: [
    "08.07 Relatório de Encerramento D90 pronto e revisado pelo Fundador, enviado 24 h antes",
    "08.04 Tracker fechado até D88, com mais de 90% das linhas completas",
    "03.07 Plano de Ação e Metas (KPIs, baseline D0 e meta D90 assinados)",
    "11.04 Score de Execução atualizado",
    "01.02 Política de Garantia Condicionada",
    "08.06 Playbook de Continuidade",
  ],
  sai: [
    "Resultado x meta, garantia avaliada e proposta de manutenção registradas (critério do 00.02)",
    "Relatório final em PDF e Google Doc na pasta 08 do cliente",
    "Decisão registrada: manutenção, seguir sozinho ou +30 dias da garantia",
    "Recomendação dos próximos 90 dias",
    "Pedido de depoimento e case com autorização por escrito",
  ],
  docs: [
    { codigo: "08.07", nome: "Relatório de Encerramento D90 (Parte C: roteiro da reunião)", url: doc("1wxxiZv2Ptf0xIeMNJNjUQbFREjtjFgyQuuUKRVQxL6A") },
    { codigo: "01.02", nome: "Política de Garantia Condicionada, Reembolso e Exclusividade", url: doc("1QHGBF6wwx4DX2HDOWxTJo3OeRy0ZuuUtxGFDQWK1-Gs") },
    { codigo: "08.04", nome: "Tracker de Controle", url: planilha("1A9uc20D3nW2nL8O_79kOjUfQg57pOOYlsP7vvoCMrTI") },
    { codigo: "11.04", nome: "Score de Saúde e Score de Execução do Cliente", url: planilha("1bZq_wUSWKFmawLQtBQv7h9xpaB5uh9L-lLGFfmTYliQ") },
    { codigo: "03.07", nome: "Plano de Ação e Metas dos 90 Dias", url: doc("1hUNQ7O91eiln6jCfTUIDaMYNthM4Nn8iKT8FvwbHMoY") },
    { codigo: "08.06", nome: "Playbook de Continuidade", url: doc("1dZ2MyzCPtetyovGtLB6Xt1QS77rsge3C7zO0DTamzfU") },
    { codigo: "08.08", nome: "Prompt de Personalização da Fidelização e do Encerramento", url: doc("19cZO5wn7GRiV9j2tEx8Lib1QDeqBubGJSNnZtjGT2To") },
    { codigo: "08.05", nome: "Rotina de Leitura Semanal e Plano por Vazamento", url: doc("1CHJdAxfj9Zg5IBpLX95HpqIuQfRhT3BBDY3s4c5ZjEw") },
  ],
  preparo: [
    { chave: "prep-previa", quando: "D85", oque: "Prévia: calcular Score de Execução e KPIs para o encerramento", quem: "Coordenador de Implementação", horas: -120, doc: "11.04" },
    { chave: "prep-prompt", quando: "D85 a D88", oque: "Rodar o 08.08 no momento D90 (Bloco 5 e Bloco 4 revisado). Números só do 08.04 e do 11.04, com origem; garantia copiada da aba Garantia, nunca recalculada", quem: "Coordenador de Implementação", horas: -96, doc: "08.08" },
    { chave: "prep-redigir", quando: "D85 a D88", oque: "Redigir o 08.07 seção por seção (KPIs, funil, gráficos G1 a G5, o que funcionou e não funcionou, Score, garantia, aprendizados, recomendação, manutenção, depoimento); resumo executivo por último", quem: "Coordenador de Implementação", horas: -72, doc: "08.07" },
    { chave: "prep-revisao", quando: "Até D89", oque: "Revisar o relatório: resumo executivo, aprendizados, status da garantia e recomendação (Bloco 5 do 08.08). Score de Execução, Relatório D90 e Playbook prontos", quem: "Fundador", horas: -36, doc: "08.07" },
    { chave: "prep-envio", quando: "24 h antes", oque: "Enviar o relatório ao decisor 24 h antes da reunião de encerramento", quem: "Coordenador / CS e Relacionamento", horas: -24, doc: "08.07" },
  ],
  regraPreparo: "Relatório só vai para a clínica depois da conferência do Coordenador (lista do 08.08) e da revisão do Fundador. Status de cada KPI pela mesma regra em todo relatório: meta atingida; melhorou, abaixo da meta; não melhorou.",
  blocos: [
    {
      n: 1, titulo: "Abertura: o que a clínica tinha no D0 e o que tem hoje", min: 5, publico: "Decisor",
      passos: ["Fundador abre comparando o ponto de partida (D0) com o sistema que roda hoje."],
      mostrar: "funil",
    },
    {
      n: 2, titulo: "KPIs e funil, com gráficos", min: 15, publico: "Decisor",
      passos: [
        "Mostrar KPIs baseline D0 x meta D90 x resultado D90 (média das últimas 4 semanas), com a variação e o status de cada um.",
        "Indicadores acompanhados (não são meta contratual): receita atribuída, verba de mídia, retornos, reativados, indicações, avaliações no Google.",
        "Funil completo do período e gráficos G1 a G5 copiados do 08.04 (funil D0 x D90, evolução dos 3 KPIs da garantia, leads e custo por consulta, motivos de não fechamento, origem das consultas).",
        "Para tempo de 1ª resposta e custo por consulta, \"melhor\" é menor.",
      ],
      mostrar: "kpis",
      registrar: [{ chave: "resultado_kpis", rotulo: "Resultado x meta por KPI (baseline, meta, resultado, status)", linhas: 5 }],
    },
    {
      n: 3, titulo: "O que funcionou e o que não funcionou; Score de Execução", min: 10, publico: "Decisor",
      passos: [
        "Coordenador apresenta o que funcionou (por quê e evidência) e o que não funcionou (causa provável, o que foi feito, dono a partir de agora).",
        "Score de Execução do 11.04 por item: presença, prazos, treino, gravação, registro, uso, verba.",
      ],
      registrar: [
        { chave: "funcionou", rotulo: "O que funcionou (com evidência)", linhas: 3 },
        { chave: "nao_funcionou", rotulo: "O que não funcionou (causa e dono)", linhas: 3 },
        { chave: "score_execucao", rotulo: "Score de Execução no D90 (11.04)" },
      ],
    },
    {
      n: 4, titulo: "Status da garantia", min: 5, publico: "Decisor",
      passos: [
        "Ler a regra do 01.02: Score de Execução de pelo menos 80% no D90 e pelo menos 2 dos 3 KPIs principais sem melhora em relação à baseline D0 dão +30 dias de acompanhamento sem custo.",
        "Mostrar o quadro: Score ≥ 80%? Cada KPI da garantia melhorou? Quantos não melhoraram? Status.",
        "Garantia acionada: informar data de início e fim dos +30 dias, plano de acompanhamento e KPI-alvo.",
      ],
      alerta: "A garantia não é devolução de dinheiro, não cobre verba de mídia e não promete faturamento. O resultado é copiado da aba Garantia do 08.04, nunca recalculado na reunião.",
      registrar: [{ chave: "garantia", rotulo: "Status da garantia (acionada ou não; se acionada, datas, plano e KPI-alvo)", linhas: 3 }],
    },
    {
      n: 5, titulo: "Recomendação para os próximos 90 dias", min: 10, publico: "Decisor",
      passos: [
        "Prioridade 1 = vazamento principal das últimas 4 semanas, com a ação padrão do mapa do 08.05.",
        "Para cada prioridade: ação, KPI-alvo, meta sugerida D180 (definida pelo Fundador) e dono.",
      ],
      registrar: [
        { chave: "acoes_clinica", rotulo: "Ações da clínica para os próximos 90 dias (uma por linha: ação, KPI-alvo, dono)", linhas: 5 },
        { chave: "aprendizados", rotulo: "Aprendizados destacados pelo Fundador", linhas: 3 },
      ],
    },
    {
      n: 6, titulo: "Proposta de manutenção e decisão", min: 10, publico: "Decisor",
      passos: [
        "Apresentar a proposta de manutenção do 08.06 (seção 7): o que inclui e o que não inclui. Mês a mês, sem fidelidade, executada pela equipe com roteiro fixo baseado no Tracker.",
        "Mostrar o que muda sem a Doctor Creator (08.06, seção 6): anúncios, criativos, rastreamento, IA e automações, Tracker, calls e comunidade.",
        "Registrar a decisão da clínica: contratar manutenção ou seguir com o playbook.",
      ],
      registrar: [
        { chave: "decisao_manutencao", rotulo: "Decisão: contratar manutenção, seguir com o playbook ou +30 dias da garantia (e data)", linhas: 2 },
      ],
    },
    {
      n: 7, titulo: "Pedido de depoimento e case; próximos passos", min: 5, publico: "Decisor",
      passos: [
        "CS faz o pedido de depoimento, sem compromisso.",
        "Mostrar o quadro de autorização: depoimento com nome e especialidade; case com nome da clínica; case anônimo; prazo de uso (12 meses, 24 meses ou indeterminado, revogável por escrito).",
        "O case fala do sistema da clínica, nunca de pacientes, resultado de tratamento ou antes e depois.",
        "Combinar próximos passos (devolução de acessos ou início da manutenção).",
      ],
      frases: [
        "\"Antes de encerrar, uma pergunta sem compromisso: você toparia gravar um depoimento curto sobre como foi o programa para a clínica? A gente só usa com a sua autorização por escrito e você escolhe o que pode ou não aparecer.\"",
      ],
      registrar: [{ chave: "depoimento", rotulo: "Autorizações de depoimento e case (o que autorizou e prazo de uso)", linhas: 2 }],
    },
  ],
  situacoes: [
    { titulo: "Garantia acionada", como: ["O quadro da garantia traz a data de início e fim dos +30 dias, o plano de acompanhamento e o KPI-alvo.", "O Fundador define o início da manutenção, porque a garantia aplica de D91 a D120 (08.08)."] },
    { titulo: "KPI verde no Painel, mas \"Não melhorou\" na aba Garantia", como: ["Status do KPI vira \"Amostra abaixo do mínimo do 01.02 (n = X de Y)\".", "O relatório nunca diz \"Meta atingida\" num lugar e \"Não melhorou\" em outro para o mesmo KPI."] },
    { titulo: "Pedido de novo serviço prioritário", como: ["Não entra na manutenção: é nova instalação ou módulo à parte (08.06, 00.03)."] },
  ],
  regras: [
    "Número ruim com o mesmo destaque do número bom.",
    "Receita atribuída é indicador acompanhado, nunca meta nem resultado prometido.",
    "Nenhum dado de paciente identificável no relatório nem no case.",
    "O que não funcionou tem causa e dono, sem culpar a clínica nem a DC.",
    "Garantia lida na aba Garantia do 08.04, nunca calculada na hora.",
    "Depoimento só com autorização por escrito; é opcional e não muda nada no que foi entregue.",
  ],
  pos: [
    { chave: "pos-relatorio", quando: "Logo após", oque: "Relatório final em PDF e Google Doc na pasta 08 do cliente, com a decisão e as assinaturas", quem: "Coordenador de Implementação", horas: 24, doc: "08.07" },
    { chave: "pos-manutencao", quando: "Até D90 + 7", oque: "Prazo para a clínica responder sobre a manutenção; se contratar, começa no D91 sem interrupção e a DC mantém os acessos", quem: "Coordenador de Implementação", horas: 168, doc: "08.06" },
    { chave: "pos-acessos", quando: "D91 a D95", oque: "Offboarding sem manutenção: revogar os acessos da DC (Business Manager, Google Ads, Gerenciador de Eventos, Quaddro, pastas) e enviar a lista de remoção por escrito; datas na 02.06", quem: "Gestor de Tráfego + Coordenador", horas: 120, doc: "08.06" },
    { chave: "pos-lgpd", quando: "D91 a D120", oque: "Retenção LGPD: apagar gravações e prints e registrar na 02.06", quem: "Coordenador de Implementação", horas: 720 },
  ],
  acoesDe: { chave: "acoes_clinica", lado: "clinica" },
};
