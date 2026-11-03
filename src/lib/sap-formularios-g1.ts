// SAP · Formulários do grupo 1 (Sessões 1 e 2): 03.06, 04.02, 04.03, 04.04 e 04.05, pergunta a pergunta conforme o documento do Drive.
// Os exemplos fictícios (Clínica Aurora) e os bancos de exemplo por especialidade ficam só no Drive: aqui entram os campos a preencher.

import { ar, dt, esc, p, t, tb, type Campo, type Formulario } from "./sap-formularios-base";

const COR = ["Verde", "Amarelo", "Vermelho"];
const SN = ["Sim", "Não"];
const nota15 = ["1", "2", "3", "4", "5"];

// ---------------------------------------------------------------- 03.06 · Relatório de Diagnóstico

const F_0306: Formulario = {
  codigo: "03.06", doc: "03.06", marco: 10, nome: "Relatório de Diagnóstico",
  serve: "Entregar ao decisor, por escrito, o que a Sessão 1 mostrou e decidiu: o funil com números, onde a clínica perde pacientes, quanto isso custa, o que já funciona, a prioridade, os KPIs e o plano dos 90 dias.",
  quem: "Coordenador de Implementação redige a partir do 03.05; o Fundador revisa e assina; o decisor lê e leva para a Sessão 2. Enviado em até 48 h depois da Sessão 1 (PDF no grupo da clínica).",
  secoes: [
    {
      id: "regras", titulo: "Regras de redação",
      intro: "Todo número sai do 03.03 congelado: nada de recalcular no texto. Cada valor em reais vem com a conta e as premissas ao lado. Estimativas sempre com (E). Referências sempre como \"referência inicial Doctor Creator, a validar com os dados do piloto\"; dado de mercado só da aba Referências do 03.03, com fonte e mercado ao lado. Sem promessa de faturamento: metas são de KPI operacional e só são fechadas na Sessão 2. Tom direto, frases curtas, sem adjetivo de alarme, sem elogio vazio, sem travessão. Sem nome de paciente e sem nome de funcionário (use a função). Valores em reais só na versão do decisor; para a equipe, retire receita e margem. Gráfico: copie o \"Funil por mês\" da aba Raio-X do 03.03 como imagem na seção 2.",
      campos: [],
    },
    {
      id: "capa", titulo: "Capa",
      campos: [
        t("clinica", "Nome da clínica"),
        t("cidade", "Cidade/UF"),
        t("especialidade", "Especialidade"),
        t("decisor", "Decisor (cargo)"),
        dt("d0", "D0 (fechamento)"),
        dt("sessao1", "Data da Sessão 1"),
        t("sessao1_d", "Dia da Sessão 1 (D__)"),
        dt("entrega", "Relatório entregue em"),
        t("periodo", "Período dos dados (de a até)"),
      ],
    },
    {
      id: "s1", titulo: "1. Resumo executivo",
      intro: "Meia página, no máximo 200 palavras, em 4 parágrafos curtos.",
      campos: [
        p("s1_como", "1. Como a clínica está", { ajuda: "Volume de leads, quantos viram tratamento, ticket." }),
        p("s1_perde", "2. Onde mais perde", { ajuda: "Os 3 vazamentos em uma frase cada, com o valor por mês." }),
        p("s1_decidimos", "3. O que decidimos", { ajuda: "Prioridade de ataque e por quê." }),
        p("s1_agora", "4. O que vem agora", { ajuda: "KPIs que serão fechados na Sessão 2 (data) e o marco do dia 60." }),
      ],
    },
    {
      id: "s2", titulo: "2. Seu funil hoje",
      intro: "Cole o gráfico do funil do 03.03 (anexo) e preencha os números usados. Origem: medido, (E) ou declarado.",
      campos: [
        ar("s2_grafico", "Gráfico \"Funil por mês\" do 03.03", { maxArquivos: 2 }),
        tb("s2_tab", "Funil por mês", [
          { id: "numero", rotulo: "Número usado" },
          { id: "origem", rotulo: "Origem", opcoes: ["medido", "(E)", "declarado"] },
          { id: "taxa", rotulo: "Taxa da passagem" },
          { id: "ref", rotulo: "Referência inicial DC (a validar)" },
        ], { linhas: [
          "Investimento em mídia", "Impressões", "Leads (novos contatos)", "Leads qualificados (A+B)", "Agendamentos de 1ª consulta (referência 30% a 50%)",
          "Consultas realizadas (referência 75% a 85%)", "Tratamentos fechados (referência 30% a 50%)", "Receita de tratamentos novos (ticket)",
          "Pacientes que saíram \"pensando\" / receberam follow-up (referência: todos em cadência)", "Retornos e recompras (por 100 ativos)", "Indicações (por tratamento fechado)",
        ] }),
        t("s2_resposta", "Tempo da 1ª resposta (mediana, horário comercial, em minutos)", { ajuda: "Referência DC: abaixo de 5 min." }),
        t("s2_fora", "Tempo da 1ª resposta fora do horário (lead oculto)"),
        t("s2_dias", "Dias entre marcar e a consulta (média)"),
        p("s2_mercado", "Contexto de mercado (opcional)", { opcional: true, ajuda: "Só da aba Referências do 03.03, com dado, fonte e mercado. Nunca como meta." }),
        p("s2_declarado", "Declarado x medido", { ajuda: "Lista curta das divergências relevantes, sem julgamento: \"a clínica estimava X; o sistema mostra Y\"." }),
      ],
    },
    {
      id: "s3", titulo: "3. Os 3 maiores vazamentos e quanto custam",
      campos: [
        tb("s3_tab", "Vazamentos", [
          { id: "passagem", rotulo: "Passagem" },
          { id: "pacientes", rotulo: "Pacientes perdidos por mês" },
          { id: "tratamentos", rotulo: "Tratamentos perdidos por mês" },
          { id: "receita", rotulo: "Receita perdida por mês (R$)" },
          { id: "margem", rotulo: "Margem perdida por mês (R$)" },
        ], { linhas: ["1", "2", "3"] }),
        p("s3_como", "Como calculamos", { ajuda: "Cole a coluna \"Como foi calculado\" do 03.03 para cada vazamento." }),
        t("s3_ticket", "Premissa · ticket médio (R$)"),
        t("s3_margem", "Premissa · margem bruta (%)"),
        esc("s3_margem_origem", "A margem foi", ["Confirmada pelo decisor", "Premissa"]),
        t("s3_recup", "Premissa · recuperação no follow-up (%) (premissa DC a validar)"),
        t("s3_soma", "Soma das perdas (R$ por mês)", { ajuda: "As perdas se sobrepõem: a soma mostra a ordem de grandeza, não um valor a recuperar." }),
        p("s3_v1", "Vazamento 1: o que os números mostram + o que a clínica contou", { ajuda: "2 a 4 linhas; até uma citação literal." }),
        p("s3_v2", "Vazamento 2: o que os números mostram + o que a clínica contou"),
        p("s3_v3", "Vazamento 3: o que os números mostram + o que a clínica contou"),
      ],
    },
    {
      id: "s4", titulo: "4. O que já funciona",
      campos: [
        p("s4_itens", "3 a 5 itens com fato", { ajuda: "Ex.: \"nota 4,6 no Google com 87 avaliações\". Só o que tem evidência." }),
      ],
    },
    {
      id: "s5", titulo: "5. Paciente atual x paciente desejado",
      campos: [
        tb("s5_tab", "Paciente atual x desejado", [
          { id: "atual", rotulo: "Paciente atual (quem mais chega)" },
          { id: "desejado", rotulo: "Paciente desejado (quem queremos mais)" },
        ], { linhas: ["Quem é", "O que procura", "Como chega", "Ticket típico", "O que faz fechar"] }),
        p("s5_fora", "Fora do foco"),
        t("s5_servico", "Serviço candidato a prioritário", { ajuda: "Decisão final na Sessão 2, com a 04.02 · Matriz de Priorização de Serviços." }),
      ],
    },
    {
      id: "s6", titulo: "6. Prioridade de ataque",
      campos: [
        p("s6_prioridade", "A passagem escolhida, o critério (custo x facilidade x dependência da clínica) e o que a clínica disse", { ajuda: "Depois, a ordem das demais frentes." }),
      ],
    },
    {
      id: "s7", titulo: "7. KPIs propostos (metas fechadas e assinadas na Sessão 2)",
      campos: [
        tb("s7_tab", "KPIs", [
          { id: "definicao", rotulo: "Definição" },
          { id: "baseline", rotulo: "Baseline D0" },
          { id: "origem", rotulo: "Origem" },
          { id: "tracker", rotulo: "Onde mede no 08.04 · Tracker de Controle" },
          { id: "resp", rotulo: "Responsável" },
        ], { minLinhas: 1 }),
        t("s7_receita", "Receita atribuída: baseline (R$ por mês)", { ajuda: "Acompanhada no Tracker, não é meta." }),
        p("s7_garantia", "Garantia condicionada (2 linhas)", { ajuda: "Ver 01.02 · Política de Garantia Condicionada, Reembolso e Exclusividade." }),
      ],
    },
    {
      id: "s8", titulo: "8. Plano dos 90 dias",
      intro: "Marcos fixos do programa: Sessão 2 (D12 a D14), Sessão 3 (D16 a D18), gravação dirigida, banco de criativos sem rosto e setup de rastreamento (D18 a D22), Sessão 4 e treino da recepção (D20 a D22), Quaddro ou caminho B e testes (D24 a D28), anúncios no ar só com recepção treinada e rastreamento testado (D28 a D30), Sessão 5 (D33 a D37), Sessão 6 (D45 a D50), D60 sistema completo rodando (checkpoint formal), D61 a D89 otimização com check-in quinzenal, D90 encerramento. Preencha a data e o que muda para esta clínica.",
      campos: [
        tb("s8_tab", "Plano dos 90 dias", [
          { id: "data", rotulo: "Data" },
          { id: "muda", rotulo: "O que muda para esta clínica" },
        ], { linhas: [
          "D12 a D14 · Sessão 2 · Paciente Ideal e Proposta de Valor + metas D90 assinadas", "D16 a D18 · Sessão 3 · Atração e Anúncios",
          "D18 a D22 · Gravação dirigida, banco de criativos sem rosto, setup de rastreamento", "D20 a D22 · Sessão 4 · Conversa e Confirmação + treino da recepção",
          "D24 a D28 · Configuração Quaddro ou caminho B e testes", "D28 a D30 · Anúncios no ar", "D33 a D37 · Sessão 5 · Venda sem Vender e Follow-up",
          "D45 a D50 · Sessão 6 · Fidelização, Indicações e Controle", "D60 · Marco: sistema completo rodando (checkpoint formal)", "D61 a D89 · Otimização com dados reais, check-in quinzenal",
          "D90 · Encerramento: resultado x meta, Score de Execução, garantia",
        ] }),
        p("s8_fora", "Fora do foco nestes 90 dias", { ajuda: "Serviços, públicos e canais que não entram agora." }),
      ],
    },
    {
      id: "s9", titulo: "9. Próximos 14 dias",
      campos: [
        tb("s9_clinica", "O que precisamos da clínica", [
          { id: "acao", rotulo: "Ação" }, { id: "resp", rotulo: "Responsável (função)" }, { id: "ate", rotulo: "Até" },
        ], { minLinhas: 1 }),
        tb("s9_dc", "O que a Doctor Creator entrega", [
          { id: "entrega", rotulo: "Entrega" }, { id: "resp", rotulo: "Responsável (função)" }, { id: "ate", rotulo: "Até" },
        ], { minLinhas: 1 }),
      ],
    },
    {
      id: "fontes", titulo: "Fontes e entrega",
      campos: [
        p("fontes", "Fontes do relatório", { opcional: true, ajuda: "Só as fontes de mercado citadas, copiadas da aba Referências do 03.03. Se nenhuma foi citada, deixe em branco." }),
        ar("pdf", "Relatório em PDF enviado ao grupo da clínica", { maxArquivos: 1 }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- 04.02 · Matriz de Priorização de Serviços

const F_0402: Formulario = {
  codigo: "04.02", doc: "04.02", marco: null, nome: "Matriz de Priorização de Serviços",
  serve: "Escolher o UM serviço que concentra os 90 dias, com número e não com gosto.",
  quem: "Analista de Onboarding preenche (pré-preenchida para a Sessão 2); o Fundador conduz a escolha na Sessão 2 com o decisor.",
  secoes: [
    {
      id: "matriz", titulo: "Matriz de Priorização de Serviços",
      intro: "Até 8 serviços. Ticket e margem viram nota sozinhos; as outras 5 notas (urgência, frequência, capacidade, diferencial e facilidade de anunciar) saem da conversa, pela régua de 1 a 5. Na dúvida entre duas notas, fique com a menor e registre o motivo nas anotações. Pesos padrão: ticket 2, margem 2, diferencial 2, urgência 1,5, capacidade 1,5, frequência 1, facilidade de anunciar 1.",
      campos: [
        t("clinica", "Nome da clínica"),
        tb("servicos", "Serviços (até 8)", [
          { id: "servico", rotulo: "Serviço" },
          { id: "ticket", rotulo: "Ticket médio fechado (R$)" },
          { id: "margem", rotulo: "Margem (%)" },
          { id: "urgencia", rotulo: "Urgência (1 a 5)", opcoes: nota15 },
          { id: "frequencia", rotulo: "Frequência (1 a 5)", opcoes: nota15 },
          { id: "capacidade", rotulo: "Capacidade (1 a 5)", opcoes: nota15 },
          { id: "diferencial", rotulo: "Diferencial (1 a 5)", opcoes: nota15 },
          { id: "facilidade", rotulo: "Facilidade de anunciar (1 a 5)", opcoes: nota15 },
          { id: "anotacao", rotulo: "Anotações (motivo das notas)" },
        ], { minLinhas: 2 }),
        t("pesos", "Pesos usados", { ajuda: "Padrão, ou o ajuste e o motivo." }),
        t("escolhido", "Serviço escolhido para os 90 dias"),
        p("motivo", "Por que este", { ajuda: "2 a 3 critérios em que venceu na matriz. Se não foi o 1º do ranking, o motivo registrado." }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- 04.03 · Proposta de Valor

const gancho = (id: string, rotulo: string, ajuda: string): Campo[] => [
  p(id, rotulo, { ajuda }),
  esc(id + "_cor", `Cor · ${rotulo}`, COR),
];

const F_0403: Formulario = {
  codigo: "04.03", doc: "04.03", marco: null, nome: "Template de Proposta de Valor",
  serve: "Transformar o paciente ideal e o diferencial provado em uma frase que vende e passa no anúncio, no WhatsApp e na consulta.",
  quem: "Coordenador de Implementação projeta, Analista de Onboarding digita, Fundador conduz (Bloco 5 do 04.01); o Editor e Copy usa o banco para escrever as mensagens do 04.05. Ao vivo na Sessão 2 (D12 a D14) e no D+1.",
  secoes: [
    {
      id: "tela", titulo: "Parte A · Tela de trabalho",
      intro: "Entram: o serviço escolhido na 04.02, o perfil do paciente ideal (Bloco 4 do 04.01), a Folha de Garimpo de Voz e as provas do 04.04. A prova da clínica precisa ser real e estar registrada no 04.04: nunca copiar número de exemplo. A cor de cada peça segue o semáforo do 00.04 · Guia de Anúncio em Nicho Regulado. Oferta de entrada padrão é \"avaliação com o que inclui\" (tempo, exame, plano por escrito). Preço e consulta com condição são amarelo, decisão do médico. O banco de exemplos por especialidade (Parte B) fica no documento do Drive.",
      campos: [
        t("clinica", "Clínica"),
        dt("data", "Data"),
        t("servico", "Serviço prioritário (04.02)"),
        t("fichas", "Fichas de Caso abertas (04.04)", { opcional: true, ajuda: "Ex.: Caso 1, Caso 2." }),
      ],
    },
    {
      id: "campos", titulo: "A1. Os sete campos (preencher em ordem)",
      campos: [
        p("c1", "1. Para quem", { ajuda: "A situação ou o momento em que o paciente se reconhece (vem do \"quem é\" e do \"gatilho de busca\" do perfil). Erro comum: \"Mulheres de 35 a 55 anos\" (isso é segmentação, não mensagem)." }),
        p("c2", "2. Qual problema", { ajuda: "A dor ou o desejo nas palavras do paciente, como ele escreve na primeira mensagem ou na avaliação do Google. Erro comum: \"Flacidez cutânea grau II\" (palavra de médico)." }),
        p("c3", "3. Contra o quê", { ajuda: "O que o paciente faz hoje no lugar: outra clínica, procedimento avulso, produto, esperar, resolver sozinho. Erro comum: \"Contra a concorrência\"." }),
        p("c4", "4. Qual diferencial", { ajuda: "Uma coisa que a clínica faz neste serviço e a alternativa do campo 3 não faz, com o porquê de funcionar (o mecanismo). Erro comum: \"atendimento humanizado\", \"excelência\", \"tecnologia de ponta\"." }),
        p("c5", "5. Qual prova", { ajuda: "O fato verificável que sustenta o diferencial (tipos no 04.04). Erro comum: \"resultados incríveis\", número sem comprovante, \"garantia\"." }),
        p("c6", "6. Oferta de entrada", { ajuda: "A avaliação ou consulta com o que inclui: tempo, exame, simulação, plano por escrito, quem atende. \"Avaliação grátis\" é amarelo forte e a DC não recomenda para médico (Res. CFM, Art. 11, §4º); condição de entrada (consulta parcelada, valor abatido) é amarelo, decisão do médico." }),
        p("c7", "7. Frase final", { ajuda: "Uma frase em linguagem de paciente que junta 1 a 6. É a base de anúncio, WhatsApp e consulta. Evite frase longa com tudo e promessa de resultado ou prazo." }),
      ],
    },
    {
      id: "teste", titulo: "A2. Teste de validação (5 perguntas)",
      campos: [
        esc("q1", "1. O paciente se reconhece? Ele leria e pensaria \"é comigo\", sem a frase dizer o que ele tem?", SN, { ajuda: "Se ruim: reescrever o \"para quem\" como momento ou situação." }),
        esc("q2", "2. O diferencial tem prova registrada no 04.04?", SN, { ajuda: "Se ruim: status rascunho; a prova vira tarefa da clínica com prazo." }),
        esc("q3", "3. A alternativa do paciente (concorrente, procedimento avulso, esperar) não poderia dizer a mesma frase?", SN, { ajuda: "Se ruim: voltar ao diferencial; trocar adjetivo por fato ou por mecanismo." }),
        esc("q4", "4. Está em linguagem de paciente, sem jargão?", SN, { ajuda: "Se ruim: ler em voz alta; trocar pelo termo do garimpo." }),
        esc("q5", "5. Qual a cor no semáforo do 00.04?", COR, { ajuda: "Vermelho: reescrever agora. Amarelo: segue com \"ciente\" do médico em D+2, plano B escrito e teste aberto no 05.16." }),
        esc("status", "Status", ["Validada (4 primeiras respostas Sim e cor verde ou amarela)", "Rascunho (falta prova)"]),
        t("falta", "Se rascunho: qual prova falta, tarefa da clínica e prazo", { opcional: true, ajuda: "Até lá, só orgânico e WhatsApp." }),
      ],
    },
    {
      id: "canal", titulo: "A3. Do texto ao canal (Editor e Copy, no D+1; vai para o 04.05)",
      intro: "Anúncio: 3 ganchos para a mesma proposta, um para cada nível de consciência (momento; mecanismo ou contraste; prova ou processo), mais 1 gancho ousado (dor direta, jornada em vídeo, termo sensível ou condição de preço). Os 3 primeiros descrevem momento ou situação e aprovam fácil. O ousado sobe como teste amarelo, com um dos 3 como plano B, e vai para o 05.16. Abertura de WhatsApp: acolhe e PERGUNTA antes de apresentar; uma ideia por mensagem, até 3 linhas; nunca abrir com \"nosso diferencial é\"; a prova entra quando o paciente pergunta. Fala de consulta: frase que o médico usa ao recomendar, depois do exame e antes do investimento, ligando a recomendação ao que o paciente disse, sem promessa e sem pressa.",
      campos: [
        ...gancho("g1", "Gancho 1 · momento (quem ainda não nomeou o problema)", "Anúncio"),
        ...gancho("g2", "Gancho 2 · mecanismo ou contraste (quem sabe do problema e quer entender)", "Anúncio"),
        ...gancho("g3", "Gancho 3 · prova ou processo (quem já procura onde fazer)", "Anúncio"),
        ...gancho("g4", "Gancho 4 · ousado (teste amarelo)", "Anúncio"),
        t("planob", "Plano B do gancho ousado (qual dos 3 primeiros)"),
        ...gancho("zap", "Abertura de WhatsApp (pergunta antes de apresentar)", "Primeira mensagem para o lead do anúncio"),
        ...gancho("consulta", "Fala de consulta", "Depois do exame, antes do investimento"),
      ],
    },
  ],
};

// ---------------------------------------------------------------- 04.04 · Ficha de Caso e Prova

const fichaCaso = (n: 1 | 2): Campo[] => {
  const k = `c${n}_`;
  return [
    t(k + "codigo", "Código do caso", { ajuda: `C${n}. Use iniciais ou código, nunca nome completo, telefone ou prontuário.` }),
    t(k + "servico", "Serviço"),
    esc(k + "desfecho", "Desfecho", ["Fechou", "Não fechou", "Em follow-up"]),
    t(k + "perfil", "Perfil (sem nome)", { ajuda: "Faixa de idade, momento de vida, profissão genérica." }),
    t(k + "chegou", "Como chegou", { ajuda: "Instagram, Google, indicação de quem, anúncio, outro." }),
    t(k + "quem", "Quem preencheu (função)"),
    p(k + "b2_1", "2.1 Primeira mensagem, com as palavras dele"),
    p(k + "b2_2", "2.2 O que aconteceu na vida dele para procurar agora (gatilho)"),
    p(k + "b2_3", "2.3 O que ele já tinha tentado antes"),
    p(k + "b2_4", "2.4 Como ele chamava o problema e o tratamento (termos)"),
    t(k + "b2_5", "2.5 Quem mais participou da decisão", { ajuda: "Cônjuge, família, ninguém." }),
    p(k + "b3_1", "3.1 Objeção que ele disse"),
    p(k + "b3_2", "3.2 Objeção que você acha que ele não disse"),
    p(k + "b3_3", "3.3 O que fez fechar, ou o que faltou para fechar"),
    t(k + "b3_4", "3.4 Valor apresentado e forma de pagamento escolhida", { ajuda: "R$ valor e forma." }),
    t(k + "b3_5", "3.5 Quanto tempo entre o primeiro contato e a decisão (dias)"),
    p(k + "b4_1", "4.1 O que esse caso prova sobre a clínica (processo, cuidado, técnica)"),
    esc(k + "b4_2", "4.2 Pode virar caso narrado pelo médico sem identificar?", SN),
    esc(k + "b4_3", "4.3 Há imagem, vídeo ou depoimento?", SN),
    esc(k + "b4_4", "4.4 Termo 05.12 assinado? Para qual uso?", ["Sim: orgânico", "Sim: anúncio", "Sim: ambos", "Não"]),
    esc(k + "b4_5", "4.5 Cor no semáforo do uso pretendido", COR),
  ];
};

const F_0404: Formulario = {
  codigo: "04.04", doc: "04.04", marco: null, nome: "Ficha de Caso e Prova",
  serve: "Levantar, registrar e autorizar as provas que sustentam a proposta de valor, e transformar cada prova em mensagem de anúncio, WhatsApp e consulta.",
  quem: "A clínica preenche as Fichas de Caso (quem acompanhou o paciente: médico, consultora ou recepção; 15 minutos por ficha); o Coordenador cobra e confere; o Editor e Copy transforma em mensagem. Enviada ao fim da Sessão 1 (D8 a D10), devolvida até D-2 da Sessão 2 e atualizada sempre que surgir prova nova.",
  secoes: [
    {
      id: "regras", titulo: "Antes de preencher",
      intro: "Prova é fato que alguém pode conferir. \"Somos referência\", \"resultados incríveis\" e \"atendimento humanizado\" não são prova. Sem prova registrada aqui, a proposta de valor fica em rascunho e não vai para anúncio pago. Não entram (vermelho): número sem comprovante, garantia escrita de resultado, foto ou vídeo de paciente sem autorização, print de conversa, nome de medicamento controlado. Dado de saúde é dado sensível (LGPD, art. 11): a ficha usa iniciais ou código, nunca nome completo, telefone ou prontuário. Imagem, voz, vídeo ou relato identificável exigem o 05.12 · Termo de Autorização de Uso de Imagem assinado, com finalidade e prazo; caso narrado pelo médico sem identificar não precisa de termo (mude detalhes que permitam reconhecer); paciente menor de idade não vai para anúncio. Avaliação no Google: pedir a TODOS os pacientes atendidos, pela mesma mensagem, sem brinde e sem filtro. Descarte no encerramento do D90, salvo o que tiver termo vigente.",
      campos: [],
    },
    {
      id: "inventario", titulo: "3. Inventário de provas da clínica (preencher antes da Sessão 2)",
      intro: "Se a clínica diz que \"não tem nenhuma\", pergunte: quantas vezes fez o procedimento no último ano e desde que começou (puxar do sistema); quanto dura a consulta e a dos outros da cidade; o que faz na avaliação que poucos fazem (exame, simulação, plano escrito); quantos pacientes avaliou e disse que não era indicado; nota no Google e número de avaliações; equipamento ou estrutura que o paciente vê e comenta. Para gerar prova que falta em 2 a 5 dias: volume (relatório do sistema, D+2), processo (médico descreve em 5 linhas, D+2), estrutura e tecnologia (fotos e vídeo curto, registro Anvisa, D+5), avaliações públicas (contínuo, desde D+1), caso narrado (áudio de 2 minutos, D+3).",
      campos: [
        tb("prova", "Provas", [
          { id: "prova", rotulo: "Prova" },
          { id: "tipo", rotulo: "Tipo", opcoes: ["Formação e título", "Volume de procedimentos", "Tecnologia e protocolo", "Tempo dedicado", "Estrutura", "Processo", "Avaliações públicas", "Caso narrado pelo médico", "Depoimento em vídeo", "Jornada do paciente", "Recusa honesta"] },
          { id: "fato", rotulo: "Número ou fato" },
          { id: "comprovante", rotulo: "Comprovante (onde está)" },
          { id: "cor", rotulo: "Cor", opcoes: COR },
          { id: "anuncio", rotulo: "Pode ir para anúncio?", opcoes: SN },
        ], { minLinhas: 1 }),
        t("escolhida", "Prova escolhida para o campo 5 do 04.03", { opcional: true }),
      ],
    },
    {
      id: "caso1", titulo: "4. Ficha de Caso C1 (um caso que fechou e foi bem)",
      intro: "Bloco 1 · Identificação (sem dado pessoal). Bloco 2 · A voz do paciente. Bloco 3 · A decisão. Bloco 4 · A prova que esse caso gera.",
      campos: fichaCaso(1),
    },
    {
      id: "caso2", titulo: "4. Ficha de Caso C2 (um caso que não fechou)",
      intro: "Mesmos blocos da ficha C1.",
      campos: fichaCaso(2),
    },
  ],
};

// ---------------------------------------------------------------- 04.05 · Documento Paciente Ideal e Proposta de Valor

const F_0405: Formulario = {
  codigo: "04.05", doc: "04.05", marco: 12, nome: "Documento Paciente Ideal e Proposta de Valor",
  serve: "Registrar, para a clínica, para quem o sistema vai ser montado nos 90 dias, o que vamos dizer a essa pessoa e quais mensagens estão aprovadas para anúncio, WhatsApp e consulta.",
  quem: "Coordenador de Implementação redige no D+1 da Sessão 2; o Fundador revisa; o Editor e Copy escreve o banco de mensagens; o decisor da clínica aprova em D+2. Base do 05.04, do 06.02 · Script Doctor e do 07.02 · Roteiro de Consulta Consultiva. Entram: 04.02 fechada, perfil do paciente (Bloco 4 do 04.01), 04.04 e 04.03 testado.",
  secoes: [
    {
      id: "capa", titulo: "Capa",
      campos: [
        t("clinica", "Nome da clínica"),
        t("servico", "Serviço prioritário dos 90 dias"),
        dt("sessao2", "Sessão 2 realizada em (D12 a D14)"),
        dt("entrega", "Documento entregue em (D+1)"),
        dt("aprovacao", "Aprovação até (D+2)"),
        dt("d0", "D0 (fechamento)"),
      ],
    },
    {
      id: "s1", titulo: "1. O serviço que concentra os 90 dias",
      campos: [
        t("s1_servico", "Serviço prioritário"),
        p("s1_porque", "Por que este", { ajuda: "2 a 3 critérios em que venceu na matriz. Se não foi o 1º do ranking, o motivo registrado." }),
        tb("s1_matriz", "Matriz de priorização (da 04.02)", [
          { id: "servico", rotulo: "Serviço" },
          { id: "ticket", rotulo: "Ticket médio fechado (R$)" },
          { id: "margem", rotulo: "Margem (%)" },
          { id: "urgencia", rotulo: "Urgência" },
          { id: "frequencia", rotulo: "Frequência" },
          { id: "capacidade", rotulo: "Capacidade" },
          { id: "diferencial", rotulo: "Diferencial" },
          { id: "facilidade", rotulo: "Facilidade de anunciar" },
          { id: "total", rotulo: "Total ponderado" },
          { id: "ranking", rotulo: "Ranking" },
        ], { minLinhas: 1, ajuda: "A margem pode ser omitida desta tabela se o decisor pedir (protocolo de sala)." }),
        t("s1_pesos", "Pesos usados", { ajuda: "Padrão, ou o ajuste e o motivo." }),
      ],
    },
    {
      id: "s2", titulo: "2. Para quem o sistema vai ser montado",
      campos: [
        p("s2_quem", "Quem é", { ajuda: "Situação de vida, momento, faixa de idade, região." }),
        p("s2_dor", "Dor e desejo", { ajuda: "Dor: nas palavras dele. Desejo: o que quer de verdade." }),
        p("s2_gatilho", "Gatilho de busca", { ajuda: "O que acontece na semana em que procura." }),
        p("s2_hoje", "O que faz hoje no lugar", { ajuda: "Alternativa que o paciente usa se a clínica não existisse." }),
        p("s2_decide", "Quem decide junto", { ajuda: "Quem e o que essa pessoa precisa ouvir." }),
        p("s2_onde", "Onde está", { ajuda: "Canais, hábito de pesquisa, quem indica." }),
        p("s2_tempo", "Tempo de decisão", { ajuda: "Dias ou semanas; o que acelera." }),
        p("s2_paga", "Como costuma pagar", { ajuda: "Forma e parcelamento." }),
        p("s2_retrato", "O retrato em 4 frases", { ajuda: "O nosso paciente é... Ele quer... Antes de decidir, ele pergunta... A gente não quer..." }),
      ],
    },
    {
      id: "s3", titulo: "3. Quem NÃO é o paciente ideal (e por quê)",
      campos: [
        tb("s3_tab", "Fora do perfil", [
          { id: "perfil", rotulo: "Perfil" },
          { id: "porque", rotulo: "Por que fica fora" },
          { id: "filtro", rotulo: "Como o sistema filtra (anúncio, formulário 05.08, pergunta no WhatsApp)" },
        ], { minLinhas: 1 }),
      ],
    },
    {
      id: "s4", titulo: "4. Termos que o paciente usa",
      campos: [
        tb("s4_tab", "Termos", [
          { id: "diz", rotulo: "O paciente diz" },
          { id: "fonte", rotulo: "Fonte (garimpo)", opcoes: ["Google", "Instagram", "WhatsApp", "Ficha de Caso"] },
          { id: "clinica", rotulo: "A clínica dizia (termo técnico a evitar)" },
          { id: "usar", rotulo: "Usar em", opcoes: ["Anúncio", "WhatsApp", "Consulta"] },
        ], { minLinhas: 1 }),
      ],
    },
    {
      id: "s5", titulo: "5. Objeções e respostas",
      intro: "Respostas completas de consulta e follow-up ficam no 07.05 · Banco de Objeções da Consulta.",
      campos: [
        tb("s5_tab", "Objeções", [
          { id: "objecao", rotulo: "Objeção" },
          { id: "por_tras", rotulo: "O que está por trás" },
          { id: "resposta", rotulo: "Resposta (quem responde: recepção, médico, consultora)" },
          { id: "onde", rotulo: "Onde entra (WhatsApp, consulta, follow-up)" },
        ], { minLinhas: 1 }),
      ],
    },
    {
      id: "s6", titulo: "6. Proposta de valor",
      campos: [
        p("s6_frase", "A frase"),
        p("s6_quem", "Para quem"),
        p("s6_problema", "Problema"),
        p("s6_contra", "Contra o quê", { ajuda: "O que o paciente faz hoje no lugar." }),
        p("s6_dif", "Diferencial"),
        p("s6_prova", "Prova", { ajuda: "Com o comprovante registrado no 04.04." }),
        p("s6_oferta", "Oferta de entrada", { ajuda: "Avaliação com o que inclui: tempo, exame, plano por escrito." }),
        esc("s6_reconhece", "Teste de validação · reconhece", SN),
        esc("s6_prova_ok", "Teste de validação · prova", SN),
        esc("s6_alternativa", "Teste de validação · a alternativa não diria", SN),
        esc("s6_linguagem", "Teste de validação · linguagem de paciente", SN),
        esc("s6_cor", "Teste de validação · cor", COR),
        esc("s6_status", "Status", ["Validada, vai para anúncio", "Rascunho"]),
        t("s6_falta", "Se rascunho: o que falta, tarefa da clínica e prazo", { opcional: true, ajuda: "Até lá, só conteúdo e WhatsApp." }),
      ],
    },
    {
      id: "s7", titulo: "7. Banco de mensagens aprovado",
      intro: "Verde: sobe após o checklist. Amarelo: o mercado usa e costuma aprovar; sobe com \"ciente\" do médico, plano B pronto e teste registrado no 05.16 · Registro de Testes de Aprovação. Vermelho (informação falsa, promessa de cura de doença grave, garantia escrita de resultado, paciente exposto sem autorização, medicamento controlado por nome, burla): a Doctor Creator não sobe, nem com \"ciente\" (00.04 · Guia de Anúncio em Nicho Regulado). Os ganchos viram anúncios completos no 05.04 e no 05.07 · Roteiro da Gravação Dirigida; a abertura vira o início do 06.02; a fala vira parte do 07.02.",
      campos: [
        p("m1", "1. Anúncio · gancho de momento (quem ainda não nomeou o problema)"),
        esc("m1_cor", "Cor · mensagem 1", COR),
        t("m1_ciente", "Ciente do médico · mensagem 1", { opcional: true }),
        p("m2", "2. Anúncio · gancho de mecanismo ou contraste (quem quer entender)"),
        esc("m2_cor", "Cor · mensagem 2", COR),
        t("m2_ciente", "Ciente do médico · mensagem 2", { opcional: true }),
        p("m3", "3. Anúncio · gancho de prova ou processo (quem procura onde fazer)"),
        esc("m3_cor", "Cor · mensagem 3", COR),
        t("m3_ciente", "Ciente do médico · mensagem 3", { opcional: true }),
        p("m4", "4. Abertura de WhatsApp (pergunta antes de apresentar)"),
        esc("m4_cor", "Cor · mensagem 4", COR),
        t("m4_ciente", "Ciente do médico · mensagem 4", { opcional: true }),
        p("m5", "5. Fala de consulta (depois do exame, antes do investimento)"),
        esc("m5_cor", "Cor · mensagem 5", COR),
        t("m5_ciente", "Ciente do médico · mensagem 5", { opcional: true }),
        p("m6", "6. Anúncio · teste ousado (jornada em vídeo, gancho direto de dor, preço ou condição), com plano B"),
        esc("m6_cor", "Cor · mensagem 6", COR),
        t("m6_ciente", "Ciente do médico · mensagem 6", { opcional: true }),
      ],
    },
    {
      id: "s8", titulo: "8. O que fica fora do foco nos 90 dias",
      campos: [
        tb("s8_tab", "Fora do foco", [
          { id: "fora", rotulo: "Fora do foco (serviço, público ou canal)" },
          { id: "porque", rotulo: "Por quê" },
          { id: "quando", rotulo: "Quando pode entrar (D61 a D90 se..., ou na manutenção)" },
        ], { minLinhas: 1 }),
      ],
    },
    {
      id: "s9", titulo: "9. Metas D90 confirmadas",
      intro: "Metas assinadas no 03.07 · Plano de Ação e Metas dos 90 Dias, via ZapSign.",
      campos: [
        dt("s9_data", "Data da assinatura das metas"),
        tb("s9_tab", "Metas", [
          { id: "baseline", rotulo: "Baseline D0" },
          { id: "meta", rotulo: "Meta D90" },
          { id: "onde", rotulo: "Onde mede" },
        ], { minLinhas: 1 }),
      ],
    },
    {
      id: "s10", titulo: "10. Próximos passos",
      intro: "Passos fixos: aprovar este documento e responder \"ciente\" nas mensagens amarelas (decisor da clínica, D+2); separar fotos e vídeos existentes do serviço; Sessão 3 · Atração e Anúncios (Gestor de Tráfego + Coordenador de Implementação, D16 a D18). Acrescente a prova que faltou.",
      campos: [
        tb("s10_tab", "Próximos passos", [
          { id: "quem", rotulo: "Quem" },
          { id: "ate", rotulo: "Até quando" },
        ], { linhas: [
          "Aprovar este documento e responder \"ciente\" nas mensagens amarelas",
          "Prova que faltou",
          "Separar fotos e vídeos existentes do serviço",
          "Sessão 3 · Atração e Anúncios",
        ] }),
      ],
    },
    {
      id: "s11", titulo: "11. Aceite",
      campos: [
        t("s11_por", "Documento aprovado por (nome e função do decisor)"),
        dt("s11_data", "Data da aprovação"),
        esc("s11_canal", "Canal da aprovação", ["WhatsApp", "ZapSign"]),
        t("s11_ciente", "\"Ciente\" nas mensagens amarelas (números)", { opcional: true }),
        p("s11_ajustes", "Ajustes pedidos", { opcional: true }),
        ar("s11_arquivo", "Documento aprovado (arquivo)", { maxArquivos: 2 }),
      ],
    },
  ],
};

export const FORMS_G1: Formulario[] = [F_0306, F_0402, F_0403, F_0404, F_0405];
