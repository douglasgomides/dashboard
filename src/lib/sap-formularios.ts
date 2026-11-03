// SAP · Formulários: os documentos do programa que antes ficavam no Drive (com "cole o link") agora são preenchidos
// dentro do Hub. Cada formulário é um conjunto de seções e campos; as respostas ficam em sap_documento_resposta e a
// conclusão do formulário fecha a tarefa do cronograma (evidência "doc:<código>"). Lógica pura (teste: scripts/test-sap-formularios.ts).
//
// 03.01, 02.04, 09.03 e 01.05 seguem o documento do Drive pergunta a pergunta. Os "registros da entrega" (reg-*) são
// formulários curtos montados a partir do "Como fazer" de cada item do cronograma: guardam datas, resultado e o arquivo
// da entrega dentro do SAP, em vez de um link solto.

export type TipoCampo = "texto" | "paragrafo" | "numero" | "data" | "link" | "escolha" | "multipla" | "nota" | "arquivo" | "tabela";

export interface Coluna { id: string; rotulo: string; opcoes?: string[] }

export interface Campo {
  id: string;
  rotulo: string;
  ajuda?: string;
  tipo: TipoCampo;
  opcoes?: string[];
  /** Padrão: obrigatório. */
  opcional?: boolean;
  /** nota: pesos do scorecard (nota x peso). Sem peso, conta 1. */
  peso?: number;
  /** multipla: todas as opções precisam estar marcadas (consentimentos). */
  todas?: boolean;
  /** tabela: colunas; linhas fixas (rótulo de cada linha) ou livres (adiciona e remove). */
  colunas?: Coluna[];
  linhas?: string[];
  minLinhas?: number;
  /** arquivo: quantos no máximo (padrão 6). */
  maxArquivos?: number;
}

export interface Secao {
  id: string;
  titulo: string;
  intro?: string;
  campos: Campo[];
  /** A seção só é exigida (e só aparece) quando outro campo tem este valor. */
  quando?: { campo: string; igual: string };
  /** Soma das notas da seção, mostrada no fim (ex.: 0 a 12). */
  total?: "notas" | "scorecard";
}

export interface Formulario {
  codigo: string; // "03.01" ou "reg-10"
  nome: string;
  /** Item do cronograma que este formulário conclui. */
  marco: number | null;
  /** "semana": uma resposta por semana (rotinas); "interessado": pré-venda, sem clínica; padrão: uma por clínica. */
  ref?: "semana" | "interessado";
  serve: string;
  /** Quem preenche e quando (texto do documento). */
  quem?: string;
  secoes: Secao[];
  /** Código do documento no dicionário (para o link do Drive de consulta). */
  doc?: string;
}

export type Valor = string | string[] | Record<string, string>[];
export type Dados = Record<string, Valor>;

const sim = ["Sim", "Não"];
const nota012 = ["0", "1", "2"];
const t = (id: string, rotulo: string, extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "texto", ...extra });
const p = (id: string, rotulo: string, extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "paragrafo", ...extra });
const esc = (id: string, rotulo: string, opcoes: string[], extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "escolha", opcoes, ...extra });
const nt = (id: string, rotulo: string, ajuda: string, extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "nota", opcoes: nota012, ajuda, ...extra });
const ar = (id: string, rotulo: string, extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "arquivo", ...extra });
const dt = (id: string, rotulo: string, extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "data", ...extra });
const tb = (id: string, rotulo: string, colunas: Coluna[], extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "tabela", colunas, ...extra });

// ---------------------------------------------------------------- 03.01 · Análise Pré-Reunião e Lead Oculto

const SEMAFORO = ["Verde", "Amarelo", "Vermelho"];
const CONC = [{ id: "a", rotulo: "Concorrente A" }, { id: "b", rotulo: "Concorrente B" }, { id: "c", rotulo: "Concorrente C" }];
const COM_ACORDO = { campo: "acordo", igual: "Sim" };

const F_0301: Formulario = {
  codigo: "03.01", nome: "Análise Pré-Reunião e Lead Oculto", marco: 7, doc: "03.01",
  serve: "Olhar o caminho do dinheiro da clínica por fora (anúncio, busca, primeiro contato, conversa, agendamento, follow-up), como um paciente e como um concorrente, antes de qualquer reunião.",
  quem: "Analista de Onboarding preenche; o Coordenador confere. Entre D3 e D7, antes da reunião de baseline. 60 a 90 min, mais a espera das respostas.",
  secoes: [
    {
      id: "regras", titulo: "Antes de começar",
      intro: "Tudo é público ou feito como paciente. O lead oculto só acontece com o \"de acordo\" do decisor (kickoff, registrado na Ficha do Cliente). Sem o de acordo, faça só a parte pública (blocos 5 a 11). Cada achado leva evidência: print ou link. Escreva o que viu, curto e concreto (\"respondeu em 47 min, deu o preço sem perguntar nada\"). Concorrente nunca recebe lead oculto e aparece como Concorrente A, B, C. Nunca envie dado de saúde real e nunca deixe horário bloqueado na clínica.",
      campos: [
        esc("acordo", "O de acordo do decisor para o lead oculto está registrado na Ficha do Cliente?", ["Sim", "Não"], { ajuda: "Se \"Não\", os blocos 1 a 4 não são exigidos." }),
        t("chip", "Número do chip de teste usado", { opcional: true, ajuda: "O chip da Doctor Creator só para isso, nunca o WhatsApp comercial." }),
        t("servico", "Serviço prioritário usado nos testes", { ajuda: "O serviço que a clínica quer crescer (Ficha do Cliente)." }),
      ],
    },
    {
      id: "b1", titulo: "Bloco 1 · Lead oculto dentro do horário comercial", quando: COM_ACORDO, total: "notas",
      intro: "Em dia útil, entre 10h e 16h. Persona: paciente particular, decidida a se informar, sem urgência. Roteiro: abertura sobre a avaliação do serviço; responda curto; pergunte \"Quanto custa?\"; objeção leve (\"vou ver com meu marido e te falo\"); pare de responder (o bloco 3 mede o depois).",
      campos: [
        t("b1_envio", "Dia e hora do envio"),
        t("b1_tempo", "Tempo da 1ª resposta (minutos, do envio até a 1ª resposta de humano ou IA)"),
        nt("b1_n_tempo", "Nota · tempo da 1ª resposta", "2 = até 5 min · 1 = até 30 min · 0 = mais de 30 min"),
        esc("b1_quem", "Quem respondeu", ["Humano", "IA", "Mensagem automática genérica", "Ninguém respondeu"]),
        nt("b1_n_qualif", "Nota · qualificação (objetivo, prazo, se já fez algo antes, como conheceu)", "2 = 2 perguntas ou mais · 1 = uma · 0 = nenhuma"),
        nt("b1_n_preco", "Nota · resposta ao preço", "2 = valor da consulta com o que ela inclui e convite · 1 = só valor · 0 = não respondeu ou \"só presencial\" sem mais nada"),
        nt("b1_n_conducao", "Nota · condução (ofereceu dia e horário concretos, duas opções?)", "2 = sim, com opções · 1 = \"quando você pode?\" · 0 = não ofereceu"),
        esc("b1_marcou", "Marcou ou tentou marcar?", sim),
        nt("b1_n_objecao", "Nota · resposta à objeção \"vou ver com meu marido\"", "2 = combinou quando volta a falar · 1 = \"fico à disposição\" · 0 = nada"),
        nt("b1_n_tom", "Nota · tom e clareza (mensagens curtas, uma ideia por mensagem, sem erro grosseiro)", "2 / 1 / 0"),
        p("b1_obs", "O que você viu (curto e concreto)", { opcional: true }),
        ar("b1_prints", "Prints da conversa (sem nome de quem atendeu)"),
      ],
    },
    {
      id: "b2", titulo: "Bloco 2 · Lead oculto fora do horário", quando: COM_ACORDO,
      intro: "Outro dia, entre 19h e 22h ou no sábado à tarde, com outro serviço ou persona. Obrigatório: na Doctoralia, 33% dos agendamentos online no Brasil acontecem fora do horário comercial.",
      campos: [
        t("b2_envio", "Horário do envio"),
        p("b2_auto", "Houve resposta automática? O que dizia? Prometia retorno em quanto tempo?"),
        t("b2_humana", "Horário da 1ª resposta humana"),
        t("b2_total", "Tempo total até a 1ª resposta (horas e minutos)"),
        p("b2_retomou", "A resposta humana retomou a conversa com proposta de horário ou só \"bom dia, em que posso ajudar\"?"),
        ar("b2_prints", "Prints", { opcional: true }),
      ],
    },
    {
      id: "b3", titulo: "Bloco 3 · Lead oculto: follow-up (72 horas)", quando: COM_ACORDO,
      intro: "Depois que a persona do bloco 1 \"some\", acompanhe por 72 horas sem responder. Se nada chegou, registre \"sem follow-up\".",
      campos: [
        esc("b3_recebeu", "Recebeu alguma mensagem depois?", ["Sim", "Não (sem follow-up)"]),
        t("b3_quando", "Quando (horas após o último contato)", { opcional: true }),
        t("b3_qtd", "Quantas mensagens em 72 h", { opcional: true }),
        p("b3_conteudo", "O que dizia? Trouxe algo útil ou só \"e aí, conseguiu ver?\"", { opcional: true }),
        ar("b3_prints", "Prints", { opcional: true }),
      ],
    },
    {
      id: "b4", titulo: "Bloco 4 · Direct do Instagram ou formulário", quando: COM_ACORDO,
      intro: "Se a clínica tem formulário (site ou anúncio), preencha com dados da persona de teste. Se não tem, mande Direct com a mesma abertura do bloco 1.",
      campos: [
        esc("b4_canal", "Canal testado", ["Direct do Instagram", "Formulário do site", "Formulário de anúncio"]),
        t("b4_tempo", "Tempo até a 1ª resposta"),
        t("b4_whats", "A resposta levou para o WhatsApp? Quem tomou a iniciativa?"),
        esc("b4_saude", "O formulário pede dado de saúde?", ["Sim (risco LGPD e Meta)", "Não", "Não há formulário"]),
        ar("b4_prints", "Prints", { opcional: true }),
      ],
    },
    {
      id: "b5", titulo: "Bloco 5 · Biblioteca de Anúncios da Meta: a clínica",
      intro: "facebook.com/ads/library, país Brasil, \"Todos os anúncios\"; busque a página da clínica e o perfil do médico. Se não há anúncio ativo, escreva \"nenhum anúncio ativo em [data]\" e siga.",
      campos: [
        t("b5_ativos", "Tem anúncios ativos? Quantos? Desde quando (início do mais antigo ativo)"),
        esc("b5_tipo", "São anúncios de campanha ou impulsionamentos de post?", ["Campanha", "Impulsionamento de post", "Os dois", "Nenhum anúncio ativo"]),
        t("b5_formato", "Formato (vídeo com o médico, vídeo sem rosto, estático, carrossel)"),
        t("b5_destino", "Para onde levam (WhatsApp, perfil, site, formulário)"),
        t("b5_oferta", "Oferta ou chamada (avaliação, consulta, conteúdo, sem chamada)"),
        esc("b5_variacao", "Variação de criativos", ["3 ou mais versões do mesmo assunto", "Peça única", "Nenhum anúncio ativo"]),
        esc("b5_paginas", "Página do médico e página da clínica anunciam coisas diferentes?", ["Sim", "Não", "Só há uma página com anúncio"]),
        ar("b5_prints", "Prints ou links da Biblioteca", { opcional: true }),
      ],
    },
    {
      id: "b6", titulo: "Bloco 6 · Biblioteca de Anúncios: 3 concorrentes",
      intro: "Escolha 3 concorrentes da mesma cidade e especialidade (os que o médico citou no formulário; se não citou, os 3 primeiros do Google Maps com anúncio ativo). Google: Central de Transparência (adstransparency.google.com). Não copiamos peça: registramos o padrão (formato, ângulo, oferta, destino). Peça vermelha entra só como \"o que não fazemos\".",
      campos: [
        tb("b6_tab", "Comparativo", CONC, { linhas: [
          "Anúncios ativos (quantidade)", "Há quanto tempo o mais antigo está no ar", "Formato que mais se repete", "Ângulo do gancho (dor, mecanismo, bastidor, autoridade, preço)",
          "Oferta e destino", "Semáforo (verde, amarelo, vermelho)", "O que funciona para eles e a DC pode usar",
        ] }),
        t("b6_google", "Algum deles (ou a clínica) anuncia no Google? Quem?", { opcional: true }),
      ],
    },
    {
      id: "b7", titulo: "Bloco 7 · Google: busca com intenção de marcar",
      intro: "Em janela anônima, com a localização da cidade da clínica, faça as buscas e anote o que aparece (anúncio, Maps, site, Doctoralia, reportagem).",
      campos: [
        tb("b7_tab", "Buscas", [{ id: "primeiro", rotulo: "O que aparece primeiro" }, { id: "posicao", rotulo: "A clínica aparece? Em que posição?" }], { linhas: [
          "[serviço prioritário] em [cidade]", "[especialidade] em [cidade]", "[nome do médico]", "[nome da clínica] avaliações", "[nome da clínica] preço",
        ] }),
        esc("b7_terceiro", "Há concorrente anunciando no Google com o nome da clínica?", ["Sim", "Não"]),
      ],
    },
    {
      id: "b8", titulo: "Bloco 8 · Google Meu Negócio e avaliações",
      campos: [
        t("b8_nota", "Nota e número de avaliações", { ajuda: "Referência: 72% só escolhem profissional com nota 4 ou mais (Reputation e YouGov, EUA, 2022)." }),
        t("b8_90d", "Avaliações nos últimos 90 dias (quantas)"),
        t("b8_resp", "A clínica responde? Data da última resposta"),
        t("b8_recl", "Reclamação recorrente (tema, sem copiar nome de paciente)"),
        t("b8_dados", "Horário, telefone, WhatsApp e endereço corretos?"),
        t("b8_botao", "Botão de agendamento ou de mensagem ativo?"),
        t("b8_servicos", "Serviços cadastrados batem com o serviço prioritário?"),
        ar("b8_prints", "Prints", { opcional: true }),
      ],
    },
    {
      id: "b9", titulo: "Bloco 9 · Site ou página de destino",
      intro: "Se não existe, escreva \"não existe\" nos campos e siga. Teste no celular.",
      campos: [
        t("b9_vel", "Carrega em até 3 segundos no 4G? Nota mobile no pagespeed.web.dev"),
        t("b9_tela", "Na primeira tela: especialidade, cidade e botão de WhatsApp aparecem sem rolar?"),
        t("b9_botao", "O botão abre o WhatsApp com mensagem pronta? Qual?"),
        t("b9_pagina", "Tem página específica do serviço prioritário?"),
        t("b9_pixel", "Pixel da Meta e tag do Google instalados? (Meta Pixel Helper e Tag Assistant)"),
        t("b9_form", "Formulário pede dado de saúde? Tem consentimento LGPD?"),
        ar("b9_prints", "Prints", { opcional: true }),
      ],
    },
    {
      id: "b10", titulo: "Bloco 10 · Caminho do perfil do Instagram até o contato",
      intro: "Olhe como um paciente que viu um anúncio e foi ao perfil.",
      campos: [
        t("b10_bio", "A bio diz o que o médico faz, para quem e onde, em 2 linhas?"),
        t("b10_link", "O link da bio leva direto ao WhatsApp, a uma página com vários botões ou a lugar nenhum?"),
        t("b10_destaques", "Os destaques respondem as 3 dúvidas que travam a marcação (como é a avaliação, onde fica, quanto tempo leva)?"),
        t("b10_toques", "Quantos toques do perfil até a primeira mensagem?"),
      ],
    },
    {
      id: "b11", titulo: "Bloco 11 · Leitura rápida de risco das peças atuais",
      intro: "Olhe os 3 anúncios ou impulsionamentos ativos mais recentes e os 6 últimos posts e classifique pelo semáforo do Guia de Anúncio em Nicho Regulado (CFM, Conselhos, Meta e LGPD). Vermelho rodando em anúncio pago vira ponto da Sessão 1 e pendência do Gestor de Tráfego. Se não há peça, escreva uma linha \"nenhuma peça ativa\".",
      campos: [
        tb("b11_tab", "Peças", [{ id: "peca", rotulo: "Peça (link ou descrição)" }, { id: "semaforo", rotulo: "Semáforo", opcoes: SEMAFORO }, { id: "porque", rotulo: "Por quê" }, { id: "acao", rotulo: "Ação sugerida" }], { minLinhas: 1 }),
      ],
    },
    {
      id: "b12", titulo: "Bloco 12 · Síntese de 5 linhas",
      intro: "Cada linha com um número ou um fato. Vai para a preparação da Sessão 1 e para o relatório de diagnóstico, marcada como \"análise externa, a validar\".",
      campos: [
        p("s1", "1. Primeiro contato", { ajuda: "Tempo de resposta dentro e fora do horário, nota do lead oculto (0 a 12)." }),
        p("s2", "2. Condução e follow-up", { ajuda: "Se marcou, como tratou preço, o que aconteceu em 72 h." }),
        p("s3", "3. Anúncios", { ajuda: "O que a clínica roda hoje e o padrão que funciona para os concorrentes." }),
        p("s4", "4. Busca e reputação", { ajuda: "Posição no Google, nota e volume de avaliações, problema do site ou do Meu Negócio." }),
        p("s5", "5. Risco", { ajuda: "Peça vermelha ou amarela relevante rodando, ou \"nenhum risco relevante encontrado\"." }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- 02.04 · Formulário Pré-Diagnóstico

const FAIXA = ["Até 20%", "20 a 40%", "40 a 60%", "Acima de 60%", "Não sei"];
const CANAIS_FAIXA = ["0%", "Até 20%", "20 a 50%", "Mais de 50%"];

const F_0204: Formulario = {
  codigo: "02.04", nome: "Formulário Pré-Diagnóstico", marco: 4, doc: "02.04",
  serve: "Coletar o retrato da clínica antes de qualquer reunião. Tudo aqui é DECLARADO (o que a clínica acha); o número oficial é o MEDIDO na reunião de baseline. Quando divergem, vale o medido.",
  quem: "Enviado no D1, resposta até o D3. 20 a 25 minutos. Não inclua nome, telefone ou qualquer dado de paciente.",
  secoes: [
    { id: "s1", titulo: "1 · A clínica", campos: [
      t("q1_1", "1.1 Nome da clínica (como aparece para o paciente)"),
      t("q1_2", "1.2 Cidade e estado"),
      t("q1_3", "1.3 Seu nome e sua função na clínica"),
      t("q1_4", "1.4 Diretor técnico-médico: nome, CRM com UF e RQE (se houver). Se a clínica é pessoa jurídica, também o registro da clínica no CRM", { ajuda: "A Resolução CFM 2.336/2023 exige esses dados nos anúncios." }),
      t("q1_5", "1.5 Especialidade principal e áreas de atuação"),
      t("q1_6", "1.6 Quantos profissionais atendem pacientes e quantas pessoas trabalham na recepção/atendimento?", { ajuda: "Ex.: \"3 médicos, 2 na recepção\"" }),
    ] },
    { id: "s2", titulo: "2 · Serviços e dinheiro", intro: "Responda só o que souber. Esta seção pode ser encaminhada a quem cuida do financeiro.", campos: [
      p("q2_1", "2.1 Liste até 5 serviços principais com o valor médio de cada um", { ajuda: "Um por linha: serviço, valor." }),
      tb("q2_2", "2.2 Margem aproximada de cada um desses serviços", [{ id: "margem", rotulo: "Faixa de margem", opcoes: FAIXA }], { linhas: ["Serviço 1", "Serviço 2", "Serviço 3", "Serviço 4", "Serviço 5"] }),
      p("q2_3", "2.3 Qual serviço você mais quer ver crescer nos próximos 90 dias, e por quê?"),
      { id: "q2_4", rotulo: "2.4 Quantos horários livres por semana você teria para esse serviço, se a procura aumentasse?", tipo: "numero" },
      esc("q2_5", "2.5 Faturamento médio mensal da clínica", ["Até R$ 50 mil", "R$ 50 a 100 mil", "R$ 100 a 200 mil", "R$ 200 a 500 mil", "Acima de R$ 500 mil", "Prefiro informar na reunião"]),
      p("q2_6", "2.6 A procura muda ao longo do ano? Quais meses são mais fortes e mais fracos?"),
      esc("q2_7", "2.7 Atende convênio?", ["Só particular", "Particular e convênio", "Maioria convênio"]),
    ] },
    { id: "s3", titulo: "3 · O paciente", campos: [
      p("q3_1", "3.1 Descreva o paciente que você mais gosta de atender: faixa de idade, momento de vida, o que ele busca"),
      p("q3_2", "3.2 O que costuma levar esse paciente a procurar a clínica naquele momento?"),
      esc("q3_3", "3.3 Quanto tempo ele leva entre o primeiro contato e decidir fazer o tratamento?", ["Decide na consulta", "Até 1 semana", "2 a 4 semanas", "Mais de 1 mês"]),
      { id: "q3_4", rotulo: "3.4 Quem costuma participar da decisão?", tipo: "multipla", opcoes: ["O próprio paciente", "Cônjuge", "Pais ou filhos", "Outro"] },
      p("q3_5", "3.5 Que tipo de paciente você NÃO quer atrair, e por quê?"),
    ] },
    { id: "s4", titulo: "4 · Como os pacientes chegam hoje", campos: [
      tb("q4_1", "4.1 De onde vêm os pacientes novos hoje? Estime a proporção de cada canal", [{ id: "faixa", rotulo: "Proporção", opcoes: CANAIS_FAIXA }], { linhas: ["Indicação", "Instagram orgânico", "Google e site", "Anúncios pagos", "Convênio", "Outro"] }),
      esc("q4_2", "4.2 A clínica investe em anúncios pagos hoje?", sim),
      t("q4_2a", "4.2a Se sim: plataformas, valor mensal e quem gerencia", { opcional: true, ajuda: "Ex.: \"Meta, R$ 2 mil/mês, agência X\". Só se respondeu Sim na 4.2." }),
      esc("q4_3", "4.3 Quanto a clínica aceita investir por mês em mídia (pago direto à Meta/Google) durante o programa?", ["R$ 3 a 4 mil", "R$ 4 a 6 mil", "Acima de R$ 6 mil", "Abaixo de R$ 3 mil (precisamos conversar)"], { ajuda: "\"Abaixo de R$ 3 mil\": o Coordenador avisa o Comercial e o fundador no mesmo dia." }),
      t("q4_4", "4.4 Quem precisa aprovar um anúncio antes de ele ir ao ar?", { ajuda: "Ex.: \"o próprio médico\", \"sócio\"" }),
      p("q4_5", "4.5 Cite até 3 concorrentes locais que disputam o mesmo paciente (nome ou @)"),
      t("q4_6", "4.6 @ do Instagram da clínica e do médico, e site (se houver)"),
    ] },
    { id: "s5", titulo: "5 · Atendimento, agenda e consulta", campos: [
      { id: "q5_1", rotulo: "5.1 Por onde o paciente faz o primeiro contato?", tipo: "multipla", opcoes: ["WhatsApp", "Telefone", "Direct do Instagram", "Formulário do site", "Presencial"] },
      { id: "q5_2", rotulo: "5.2 Quantos contatos novos a clínica recebe por mês, em média?", tipo: "numero" },
      esc("q5_3", "5.3 Em quanto tempo o paciente costuma receber a primeira resposta em horário comercial?", ["Até 5 min", "Até 1 hora", "No mesmo dia", "No dia seguinte ou mais"]),
      p("q5_4", "5.4 Quando o paciente pergunta o preço logo de início, o que a recepção responde?"),
      { id: "q5_5", rotulo: "5.5 Quantas primeiras consultas são agendadas por mês?", tipo: "numero" },
      { id: "q5_6", rotulo: "5.6 De cada 10 pacientes agendados, quantos faltam? (0 a 10)", tipo: "numero" },
      { id: "q5_7", rotulo: "5.7 De cada 10 pacientes que fazem a primeira consulta, quantos fecham o tratamento indicado? (0 a 10)", tipo: "numero" },
      p("q5_8", "5.8 O que acontece hoje com quem consulta e diz que vai pensar?"),
    ] },
    { id: "s6", titulo: "6 · Equipe, tecnologia e gravação", campos: [
      esc("q6_1", "6.1 Qual sistema a clínica usa para agenda e gestão?", ["Quaddro", "Feegow", "iClinic", "Clinicorp", "Google Agenda", "Planilha", "Papel", "Outro"]),
      t("q6_1o", "6.1 Se \"Outro\": qual?", { opcional: true }),
      esc("q6_2", "6.2 A clínica usa CRM?", sim),
      t("q6_2a", "6.2a Se sim: qual?", { opcional: true }),
      esc("q6_3", "6.3 O WhatsApp da clínica é", ["WhatsApp Business no celular", "API oficial (por plataforma)", "WhatsApp pessoal", "Não sei"]),
      esc("q6_4", "6.4 O médico topa gravar vídeos curtos no celular, com a nossa equipe dirigindo ao vivo?", ["Sim, já gravo", "Sim, mas tenho receio", "Prefiro que outra pessoa da equipe grave", "Prefiro não gravar"]),
      esc("q6_5", "6.5 Quantas horas por semana a recepção pode ser liberada para treino nas semanas 3 e 4?", ["Até 1h", "1 a 2h", "2 a 3h", "Mais de 3h"]),
    ] },
    { id: "s7", titulo: "7 · Objetivo", campos: [
      p("q7_1", "7.1 Qual a sua principal frustração hoje com a chegada de pacientes, e o que você já tentou que não funcionou?"),
    ] },
    { id: "s8", titulo: "8 · Consentimento LGPD", intro: "Redação a validar com o jurídico antes do primeiro cliente.", campos: [
      { id: "q8_1", rotulo: "8.1 Consentimento (as duas caixas são obrigatórias)", tipo: "multipla", todas: true, opcoes: [
        "Autorizo a Doctor Creator a usar as informações deste formulário para elaborar o diagnóstico e o plano de implementação da clínica. Sei que não devo incluir dado de paciente e que posso pedir a exclusão destas respostas ao fim do contrato.",
        "Autorizo a gravação e a transcrição das reuniões e sessões do programa para registro, geração de relatórios e acompanhamento, com acesso restrito à equipe do projeto.",
      ] },
    ] },
  ],
};

// ---------------------------------------------------------------- 09.03 · Registro da Call

const F_0903: Formulario = {
  codigo: "09.03", nome: "Registro da Call em grupo", marco: 30, ref: "semana", doc: "09.03",
  serve: "Transformar cada call em grupo em um registro curto, igual toda semana: temas, decisões, compromissos por clínica e dúvidas a responder. É o que a equipe usa na segunda-feira para cobrar a execução.",
  quem: "Coordenador anota ao vivo e redige; o CS publica no mesmo dia; o Fundador responde as dúvidas abertas. O registro público não leva número de clínica, receita nem dado de paciente.",
  secoes: [
    { id: "cab", titulo: "Cabeçalho", campos: [
      t("semana_n", "Semana (nº do calendário temático)"),
      dt("data", "Data da call"),
      t("tema", "Tema da semana"),
      t("conduziu", "Quem conduziu", { ajuda: "Ex.: Fundador" }),
      t("convidado", "Convidado (nome e área) ou \"sem convidado\""),
      { id: "presentes", rotulo: "Clínicas presentes", tipo: "numero" },
      { id: "total", rotulo: "Total de clínicas ativas", tipo: "numero" },
      { id: "gravacao", rotulo: "Link da gravação (área de membros)", tipo: "link", opcional: true },
    ] },
    { id: "vimos", titulo: "1 · O que vimos", campos: [
      p("vimos", "Pontos principais da aula (um por linha, até 3)"),
      t("material", "Material de apoio (código e nome)", { opcional: true, ajuda: "Ex.: 06.06 · Régua de Confirmação, Remarcação e Faltosos" }),
    ] },
    { id: "decisoes", titulo: "2 · Decisões e recomendações da semana", campos: [
      p("decisoes", "Decisões (uma por linha)", { ajuda: "Ex.: \"Confirmação D-1 passa a pedir que o paciente escreva o dia e o horário. Vale para todas as clínicas.\"" }),
    ] },
    { id: "caso", titulo: "3 · Caso ou trava da semana", campos: [
      esc("caso_formato", "Formato", ["Estudo de caso", "Rodada de travas"]),
      p("caso_texto", "O que foi apresentado, sem identificar a clínica sem autorização"),
      p("caso_reco", "Recomendação final do fundador"),
    ] },
    { id: "comp", titulo: "4 · Compromissos da semana", intro: "Os compromissos não vão para a comunidade (podem revelar onde a clínica está fraca): vão no grupo individual e no ClickUp.", campos: [
      tb("compromissos", "Compromissos por clínica", [
        { id: "clinica", rotulo: "Clínica" }, { id: "compromisso", rotulo: "Compromisso (palavras da clínica)" }, { id: "quem", rotulo: "Quem (função)" }, { id: "ate", rotulo: "Até" }, { id: "kpi", rotulo: "KPI que deve mexer" },
      ], { minLinhas: 1 }),
    ] },
    { id: "duv", titulo: "5 · Dúvidas para responder na comunidade", campos: [
      tb("duvidas", "Dúvidas (sem identificar a clínica)", [{ id: "duvida", rotulo: "Dúvida" }, { id: "responde", rotulo: "Responde", opcoes: ["Fundador", "Coordenador", "Gestor de Tráfego", "CS"] }, { id: "ate", rotulo: "Até (1 dia útil)" }], { opcional: true }),
    ] },
    { id: "prox", titulo: "6 · Próxima call", campos: [
      t("prox_quando", "Data e hora"),
      t("prox_tema", "Tema da próxima semana"),
      t("prox_preparar", "Para preparar (tarefa curta)", { ajuda: "Ex.: \"trazer o comparecimento das últimas 2 semanas\"" }),
    ] },
  ],
};

// ---------------------------------------------------------------- 01.05 · Diagnóstico Gratuito de Venda (pré-venda)

const F_0105: Formulario = {
  codigo: "01.05", nome: "Diagnóstico Gratuito de Venda (lead oculto)", marco: null, ref: "interessado", doc: "01.05",
  serve: "Olhar a clínica por fora, como um interessado de verdade, em 30 a 40 minutos ativos, e transformar isso num relatório de 1 página que abre a conversa de venda. É a versão curta de pré-venda do 03.01.",
  quem: "Comercial (com apoio do Analista de Onboarding nas partes públicas). Só para leads qualificados. No máximo 8 por semana por Comercial. Sem marcar consulta, sem gravar, sem nome de funcionário no relatório.",
  secoes: [
    { id: "lead", titulo: "O interessado", campos: [
      t("clinica", "Nome da clínica"), t("cidade", "Cidade"), t("especialidade", "Especialidade"), t("servico", "Serviço que quer crescer"), t("instagram", "@ do Instagram"), t("site", "Site", { opcional: true }),
      esc("area", "Mensagem usada (área)", ["Estética", "Cirurgia", "Odontologia", "Fisioterapia"]),
    ] },
    { id: "whats", titulo: "WhatsApp (10h30 ou 14h30 em dia útil)", campos: [
      t("w_envio", "Hora exata do envio"), t("w_resp", "Hora da 1ª resposta e quem respondeu (humano, IA ou automática)"),
      t("w_perguntou", "Perguntou seu nome? O que você busca? Como conheceu?"), t("w_preco", "Como trataram o preço (valor seco, com o que inclui, só presencial, não responderam)"),
      t("w_horario", "Ofereceu dia e horário concretos?"), t("w_reacao", "Reação ao encerramento sem marcar (combinou retorno, \"fico à disposição\", nada)"),
      t("w_24h", "Retomada às 24 h (quem, quando, o que dizia)"), t("w_48h", "Retomada às 48 h"),
      ar("w_prints", "Prints (nome de funcionário coberto)"),
    ] },
    { id: "tel", titulo: "Telefone (opcional)", campos: [
      t("t_atendeu", "Atendeu? Em quantos toques? Caiu em URA ou caixa postal?", { opcional: true }), t("t_horario", "Ofereceu horário ou mandou chamar no WhatsApp?", { opcional: true }),
    ] },
    { id: "ig", titulo: "Instagram, Google e anúncios", campos: [
      t("i_bio", "Bio, link e destaque de como agendar"), t("i_dm", "Direct: hora da 1ª resposta e se levaram para o WhatsApp"),
      t("g_perfil", "Perfil da Empresa no Google (dados corretos, nota e avaliações, respostas, 90 dias)"), t("g_site", "Site e botão de agendar na primeira tela do celular"), t("g_posicao", "Posição na busca para [serviço] em [cidade]"),
      t("a_meta", "Anúncios ativos na Meta (quantidade, início do mais antigo, formatos, variação, destino)"), t("a_google", "Anuncia no Google? Algum concorrente com o nome da clínica?"),
      tb("concorrentes", "Concorrentes próximos (só o que é público)", CONC, { linhas: ["Nota e número de avaliações no Google", "Anúncios ativos na Meta (quantidade e há quanto tempo)", "Anuncia no Google?", "Link da bio leva direto ao WhatsApp?"], opcional: true }),
      ar("i_prints", "Prints", { opcional: true }),
    ] },
    {
      id: "score", titulo: "Scorecard e nota de aquisição", total: "scorecard",
      intro: "Cada item recebe 0, 1 ou 2, multiplicado pelo peso. A nota de aquisição é a soma (0 a 100). O item de follow-up fecha em 48 h.",
      campos: [
        nt("n1", "1 · Tempo da 1ª resposta no WhatsApp (peso 8)", "2 = até 5 min · 1 = até 30 min · 0 = mais de 30 min ou sem resposta", { peso: 8 }),
        nt("n2", "2 · Qualificação: perguntou nome e o que a pessoa busca (peso 4)", "2 = os dois · 1 = um · 0 = nenhum", { peso: 4 }),
        nt("n3", "3 · Ofereceu horário concreto (peso 6)", "2 = dia e hora, com opções · 1 = \"quando você pode?\" · 0 = não ofereceu", { peso: 6 }),
        nt("n4", "4 · Como tratou o preço (peso 4)", "2 = valor com o que a consulta inclui e convite · 1 = só o valor · 0 = não respondeu ou \"só presencial\"", { peso: 4 }),
        nt("n5", "5 · Follow-up depois que o interessado não marcou (peso 6)", "2 = retomou em até 24 h com algo útil · 1 = até 48 h ou só \"conseguiu ver?\" · 0 = nada em 48 h", { peso: 6 }),
        nt("n6", "6 · Resposta automática ou atendimento fora do horário (peso 3)", "2 = responde ou automação leva ao agendamento · 1 = automática genérica · 0 = nada", { peso: 3 }),
        nt("n7", "7 · Instagram: bio, link e destaque de como agendar (peso 3)", "2 = os três claros · 1 = um ou dois · 0 = nenhum", { peso: 3 }),
        nt("n8", "8 · Instagram: tempo de resposta no Direct (peso 3)", "2 = até 30 min · 1 = até 4 h · 0 = mais de 4 h ou sem resposta", { peso: 3 }),
        nt("n9", "9 · Google: nota e volume de avaliações (peso 4)", "2 = nota 4,5+ com 50+ avaliações · 1 = nota 4,0+ ou menos de 50 · 0 = abaixo de 4,0 ou sem perfil", { peso: 4 }),
        nt("n10", "10 · Google: responde avaliações e dados corretos (peso 3)", "2 = responde e dados certos · 1 = um dos dois · 0 = nenhum", { peso: 3 }),
        nt("n11", "11 · Site e botão de agendar ou WhatsApp (peso 3)", "2 = botão na 1ª tela, funcionando · 1 = existe, mas escondido ou quebrado · 0 = não existe", { peso: 3 }),
        nt("n12", "12 · Anúncios ativos, Meta ou Google (peso 3)", "2 = ativos há mais de 30 dias com 3+ variações · 1 = peça única ou impulsionamento · 0 = nenhum", { peso: 3 }),
      ],
    },
    { id: "rel", titulo: "Relatório de 1 página", intro: "Os achados são sobre o processo, nunca sobre uma pessoa. Nada de nome de funcionário nem de concorrente.", campos: [
      p("ach1", "Achado 1 (o mais caro, com número)"), p("ach2", "Achado 2 (com fato)"), p("ach3", "Achado 3 (presença ou anúncio)"),
      p("passo1", "Próximo passo 1 (ligado ao achado 1)"), p("passo2", "Próximo passo 2"), p("passo3", "Próximo passo 3"),
      esc("envio", "Situação do envio", ["Diagnóstico em andamento", "Diagnóstico pronto", "Diagnóstico enviado", "Reunião agendada", "Diagnóstico sem resposta", "Diagnóstico como reconhecimento (nota 85+)", "Diagnóstico não enviado"]),
      t("envio_motivo", "Se não enviado: motivo em uma linha", { opcional: true }),
    ] },
  ],
};

// ---------------------------------------------------------------- registros da entrega (itens sem formulário próprio)

const reg = (codigo: string, marco: number, nome: string, serve: string, campos: Campo[], extra: Partial<Formulario> = {}): Formulario => ({
  codigo, marco, nome, serve, secoes: [{ id: "reg", titulo: "Registro da entrega", campos }], ...extra,
});

const F_REG: Formulario[] = [
  reg("reg-10", 10, "Entrega do relatório de diagnóstico", "Registra o relatório pós-Sessão 1 que foi enviado à clínica (prazo de 48 h).", [
    dt("enviado_em", "Data do envio à clínica"), esc("canal", "Canal do envio", ["WhatsApp", "E-mail", "Reunião"]),
    ar("pdf", "Relatório em PDF", { maxArquivos: 2 }), p("obs", "Observações", { opcional: true }),
  ]),
  reg("reg-12", 12, "Documento Paciente Ideal", "Registra o documento Paciente Ideal: enviado à clínica no D16 e aprovado até o D18.", [
    dt("enviado_em", "Data do envio à clínica"), dt("aprovado_em", "Data da aprovação"), t("aprovado_por", "Quem aprovou"),
    ar("arquivo", "Documento (PDF ou print)", { maxArquivos: 2 }), p("obs", "Ajustes pedidos pela clínica", { opcional: true }),
  ]),
  reg("reg-15", 15, "Gravação dirigida", "Registra a 1ª gravação com o médico, que é a matéria-prima dos anúncios.", [
    dt("data", "Data da gravação"), esc("formato", "Formato", ["Videochamada", "Presencial"]), { id: "videos", rotulo: "Quantidade de vídeos gravados", tipo: "numero" },
    esc("ganchos", "Foram gravados 3 ganchos por vídeo?", sim), esc("brutos", "Os arquivos brutos chegaram?", sim), t("pasta", "Link da pasta com os arquivos", { opcional: true }),
  ]),
  reg("reg-18", 18, "Treino da recepção", "Registra a aprovação de cada atendente no critério do treino da recepção.", [
    tb("atendentes", "Atendentes treinados", [{ id: "nome", rotulo: "Atendente (função)" }, { id: "data", rotulo: "Data do treino" }, { id: "resultado", rotulo: "Resultado", opcoes: ["Aprovada(o)", "Precisa refazer"] }, { id: "obs", rotulo: "Observação" }], { minLinhas: 1 }),
    ar("prints", "Evidências (print, ata)", { opcional: true }),
  ]),
  reg("reg-19", 19, "Teste da IA de atendimento e da régua", "Registra o teste da IA de atendimento (Quaddro ou caminho B) e da régua de confirmação antes dos anúncios.", [
    esc("ferramenta", "Ferramenta", ["Quaddro", "Caminho B (sem IA)"]), { id: "rodadas", rotulo: "Quantas vezes os cenários foram rodados (mínimo 5)", tipo: "numero" },
    esc("eliminatorios", "Os cenários eliminatórios passaram 100%?", sim), esc("regua", "A régua de confirmação está ativa?", sim),
    ar("prints", "Prints do teste"), p("obs", "O que falhou e foi corrigido", { opcional: true }),
  ]),
  reg("reg-20", 20, "Devolução das etapas para Meta e Google", "Registra o teste do lead fictício que volta as etapas do CRM para as plataformas.", [
    esc("lead_fake", "Criei um lead fictício e avancei as etapas no CRM?", sim), esc("meta", "As etapas apareceram na Meta?", ["Sim", "Não", "Não se aplica"]),
    esc("google", "As etapas apareceram no Google?", ["Sim", "Não", "Não se aplica"]), esc("tracker", "O Tracker foi compartilhado com a clínica?", sim), ar("prints", "Prints"),
  ]),
  reg("reg-22", 22, "Campanhas no ar", "Registra o marco de lançamento: campanhas subidas e entregando.", [
    dt("data", "Data em que subiram"), { id: "plataformas", rotulo: "Plataformas", tipo: "multipla", opcoes: ["Meta", "Google"] },
    esc("entregando", "Estão entregando?", sim), t("verba", "Verba diária"), ar("prints", "Print do Gerenciador de Anúncios"),
  ]),
  reg("reg-24", 24, "Cadência de follow-up", "Registra a cadência para quem diz \"vou pensar\" ativa no CRM.", [
    dt("data", "Data da ativação"), p("cadencia", "Cadência (mensagens e prazos)"), p("decisoes", "Primeiras decisões registradas", { opcional: true }), ar("prints", "Print do CRM"),
  ]),
  reg("reg-25", 25, "2ª gravação dirigida", "Registra a segunda gravação, com os ângulos que já performaram nos anúncios.", [
    dt("data", "Data da gravação"), p("angulos", "Ângulos usados (os que mais trouxeram consulta)"), { id: "videos", rotulo: "Quantidade de vídeos gravados", tipo: "numero" }, t("pasta", "Link da pasta", { opcional: true }),
  ]),
  reg("reg-27", 27, "Checkpoint D60", "Registra a ata do checkpoint do meio do programa.", [
    dt("data", "Data do checkpoint"), p("ata", "Ata (o que foi visto)"), p("decisoes", "Decisões e ajustes"), t("score", "Score de Execução no dia", { opcional: true }), ar("arquivo", "Arquivo da ata", { opcional: true }),
  ]),
  reg("reg-28", 28, "Check-in quinzenal", "Registra o check-in de 30 min (D66, D76, D86).", [
    dt("data", "Data do check-in"), p("ajustes", "Ajustes combinados"), p("proximo", "O que acontece até o próximo check-in", { opcional: true }),
  ], { ref: "semana" }),
  reg("reg-34", 34, "Devolução dos acessos", "Registra a revogação dos acessos da Doctor Creator quando não há manutenção.", [
    tb("acessos", "Acessos revogados", [{ id: "acesso", rotulo: "Acesso (BM, conta de anúncios, pixel, Google…)" }, { id: "data", rotulo: "Data da revogação" }, { id: "quem", rotulo: "Quem revogou" }], { minLinhas: 1 }), ar("prints", "Prints"),
  ]),
  reg("reg-35", 35, "Apagamento de gravações e prints", "Registra o que foi apagado das pastas da clínica (LGPD).", [
    tb("apagados", "O que foi apagado", [{ id: "o_que", rotulo: "O que (gravações, prints, planilhas…)" }, { id: "onde", rotulo: "Onde estava" }, { id: "data", rotulo: "Data" }], { minLinhas: 1 }), t("responsavel", "Quem apagou"),
  ]),
];

export const FORMULARIOS: Record<string, Formulario> = Object.fromEntries([F_0301, F_0204, F_0903, F_0105, ...F_REG].map((f) => [f.codigo, f]));

/** Formulário que conclui o item do cronograma (n), se houver. */
export const FORMULARIO_DO_ITEM: Record<number, string> = Object.fromEntries(Object.values(FORMULARIOS).filter((f) => f.marco !== null).map((f) => [f.marco as number, f.codigo]));
export const formularioDoItem = (n: number): Formulario | null => FORMULARIOS[FORMULARIO_DO_ITEM[n]] ?? null;
export const EVIDENCIA_DOC = (codigo: string) => `doc:${codigo}`;
export const codigoDaEvidencia = (ev: string | null | undefined): string | null => (ev && ev.startsWith("doc:") ? ev.slice(4) : null);

// ---------------------------------------------------------------- cálculo: respostas, exigências, progresso

const vazio = (v: Valor | undefined): boolean => {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  return v.length === 0;
};

/** Seções que valem agora (uma seção com `quando` só vale se o campo de controle tem o valor pedido). */
export function secoesAtivas(f: Formulario, d: Dados): Secao[] {
  return f.secoes.filter((s) => !s.quando || d[s.quando.campo] === s.quando.igual);
}

/** Uma tabela está completa quando tem as linhas exigidas e nenhuma célula vazia nelas. Linhas fixas: todas preenchidas. */
function tabelaCompleta(c: Campo, v: Valor | undefined): boolean {
  const linhas = Array.isArray(v) ? (v as Record<string, string>[]) : [];
  const cols = c.colunas ?? [];
  if (c.linhas) {
    if (linhas.length < c.linhas.length) return false;
    return c.linhas.every((_, i) => cols.every((col) => !!(linhas[i]?.[col.id] ?? "").trim()));
  }
  const preenchidas = linhas.filter((l) => cols.some((col) => !!(l[col.id] ?? "").trim()));
  if (preenchidas.length < (c.minLinhas ?? 0)) return false;
  return preenchidas.every((l) => cols.every((col) => !!(l[col.id] ?? "").trim()));
}

export function campoCompleto(c: Campo, d: Dados): boolean {
  const v = d[c.id];
  if (c.tipo === "tabela") return tabelaCompleta(c, v);
  if (c.tipo === "multipla" && c.todas) return Array.isArray(v) && (c.opcoes ?? []).every((o) => (v as string[]).includes(o));
  return !vazio(v);
}

export interface Progresso { obrigatorios: number; preenchidos: number; faltam: { secao: string; campo: string; id: string }[]; completo: boolean }

export function progresso(f: Formulario, d: Dados): Progresso {
  const faltam: Progresso["faltam"] = [];
  let obrigatorios = 0;
  for (const s of secoesAtivas(f, d)) for (const c of s.campos) {
    if (c.opcional) continue;
    obrigatorios += 1;
    if (!campoCompleto(c, d)) faltam.push({ secao: s.titulo, campo: c.rotulo, id: c.id });
  }
  return { obrigatorios, preenchidos: obrigatorios - faltam.length, faltam, completo: faltam.length === 0 };
}

/** Soma das notas de uma seção: "notas" soma 0/1/2; "scorecard" soma nota x peso (0 a 100 no 01.05). Notas em branco contam 0. */
export function totalSecao(s: Secao, d: Dados): { valor: number; maximo: number } {
  let valor = 0;
  let maximo = 0;
  for (const c of s.campos) {
    if (c.tipo !== "nota") continue;
    const peso = s.total === "scorecard" ? c.peso ?? 1 : 1;
    maximo += 2 * peso;
    const n = Number(d[c.id]);
    if (Number.isFinite(n)) valor += n * peso;
  }
  return { valor, maximo };
}

/** Faixa de leitura da nota de aquisição do 01.05. */
export function leituraNotaAquisicao(nota: number): string {
  if (nota < 40) return "Vazamento crítico: o paciente se perde no primeiro contato. Enviar o relatório; o achado 1 é o tempo de resposta ou a falta de horário.";
  if (nota < 70) return "Vazamento relevante: a base existe, o caminho tem buracos. Enviar o relatório; focar em follow-up e condução.";
  if (nota < 85) return "Boa base: o ganho está em escala e rastreamento. Enviar o relatório com tom de \"próximo nível\".";
  return "Clínica bem estruturada. Não enviar como diagnóstico de problema: usar como reconhecimento.";
}

/** Tira de `dados` o que não pertence ao formulário (campos removidos numa revisão do documento). */
export function limparDados(f: Formulario, d: Dados): Dados {
  const ids = new Set(f.secoes.flatMap((s) => s.campos.map((c) => c.id)));
  return Object.fromEntries(Object.entries(d).filter(([k]) => ids.has(k)));
}
