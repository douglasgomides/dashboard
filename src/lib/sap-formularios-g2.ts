// SAP · Formulários (grupo 2): 05.02, 05.08 e 05.12, fiéis aos documentos do Drive.
import { ar, dt, esc, nt, p, t, tb, type Formulario } from "./sap-formularios-base";

const SIM_NAO = ["Sim", "Não"];

// ---------------------------------------------------------------- 05.02 · Árvore de Decisão de Canais e Verba
const F_0502: Formulario = {
  codigo: "05.02", doc: "05.02", nome: "Árvore de Decisão de Canais e Verba", marco: null,
  serve: "Decidir canal principal, canal secundário, quantas campanhas cabem na verba, como dividir o dinheiro e para onde o anúncio leva (WhatsApp direto, formulário, advertorial ou quiz).",
  quem: "Gestor de Tráfego preenche antes da Sessão 3 (D-3); o Coordenador de Implementação apresenta junto no bloco 2 do 05.01 · Script da Sessão de Atração. Preenchimento no D-3 e decisão na sessão.",
  secoes: [
    {
      id: "regras", titulo: "Antes de começar",
      intro: "Princípio: verba concentrada aprende, verba picada não. A Meta indica cerca de 50 eventos de otimização em 7 dias para um conjunto de anúncios sair da fase de aprendizado. Com R$ 100 a R$ 200 por dia, isso só acontece com pouquíssimas campanhas e um evento de otimização alcançável (lead ou conversa). Na dúvida, menos campanhas.\n\nFaixas de verba e limite de campanhas: abaixo de R$ 150/dia (R$ 3.000 a R$ 4.500/mês) = máximo 2 campanhas; R$ 150 a R$ 250/dia (R$ 4.500 a R$ 7.500/mês) = máximo 3; acima de R$ 250/dia (acima de R$ 7.500/mês) = máximo 4.\n\nRegras de verba: (1) Google marca sempre que alguém pesquisa o nome da clínica ou do médico, R$ 10 a R$ 20/dia; se a busca pela marca for quase zero, entra só quando o volume aparecer. (2) Mínimo por campanha de captação na Meta: R$ 70/dia; se a conta não fecha, corta campanha, não corta verba. (3) Mínimo para Google serviço: o suficiente para cerca de 10 cliques/dia ao CPC estimado (CPC de R$ 6 = mínimo de R$ 60/dia); abaixo disso, Google serviço não entra. (4) Impulsionamento contínuo de posts do médico conta como campanha; pontual de 3 a 5 dias não conta. (5) Aprofundamento (quem já engajou): Meta é padrão a partir de 14 dias de campanha; Google é teste (5% a 10% da verba do Google, na semana 3, se a lista for elegível), com registro no 05.16. (6) Verba dos 90 dias = verba/dia x dias no ar (D28 a D90 ≈ 62 dias); o 05.10 calcula.",
      campos: [
        t("clinica_servico", "Clínica / serviço prioritário", { ajuda: "Vem do 04.05 · Documento Paciente Ideal e Proposta de Valor." }),
      ],
    },
    {
      id: "perguntas", titulo: "1. As 6 perguntas",
      campos: [
        esc("p1_intencao", "P1 · Intenção de busca: o paciente procura o serviço quando sente o problema, ou precisa ser despertado?", ["Alta", "Baixa/desejo"], {
          ajuda: "Alta: dor, função, prazo, urgência (hérnia de disco, catarata, varizes com sintoma, cálculo renal, investigação de infertilidade). Baixa/desejo: estético, preventivo, performance, longevidade (rejuvenescimento facial, transplante capilar, check-up executivo, reposição hormonal na menopausa, emagrecimento médico). Fonte: 04.02 · Matriz de Priorização de Serviços.",
        }),
        p("p1_porque", "P1 · Por quê"),
        p("p2_termos", "P2 · Termos pesquisados e volume mensal", { ajuda: "Planejador de Palavras-chave do Google: termos do serviço + cidade, raio do atendimento. Volumes são estimativas: anexar o print." }),
        esc("p2_volume", "P2 · Volume de busca local", ["Alto", "Médio", "Baixo"], { ajuda: "Alto: acima de ~500 buscas/mês somando os termos principais. Médio: 100 a 500. Baixo: abaixo de 100. Ajustar por porte da cidade." }),
        t("p2_cpc", "P2 · CPC estimado do serviço (R$)"),
        ar("p2_print", "P2 · Print do Planejador de Palavras-chave"),
        t("p3_mes", "P3 · Verba de mídia aceita (R$/mês)", { ajuda: "Mídia paga pela clínica às plataformas, fora do ticket. Mínimo do programa: R$ 3.000/mês (≈ R$ 100/dia). Fonte: 02.04 e decisão no 05.01." }),
        t("p3_dia", "P3 · Verba de mídia aceita (R$/dia)"),
        esc("p4_presenca", "P4 · Presença atual: a clínica e o médico já têm audiência e conteúdo que performou?", ["Forte", "Fraca"], {
          ajuda: "Forte: 5 mil+ seguidores reais e pelo menos 3 posts dos últimos 6 meses com alcance ou salvamentos bem acima da média do perfil. Fraca: abaixo disso ou perfil parado. Fonte: 03.01 e Instagram Insights.",
        }),
        p("p4_posts", "P4 · 3 posts candidatos a impulsionar"),
        esc("p5_resposta", "P5 · Capacidade de resposta da recepção", ["Rápida", "Lenta"], {
          ajuda: "Rápida: mediana da 1ª resposta abaixo de 15 min em horário comercial hoje, ou Quaddro/IA configurada até D28. Lenta: acima disso sem plano até D28. Fonte: baseline D0 (03.03) e 06.01.",
        }),
        t("p5_mediana", "P5 · Mediana de 1ª resposta hoje e plano até D28"),
        esc("p6_saude", "P6 · Fonte de dados restrita como saúde e bem-estar?", ["Sem restrição", "Configuração básica", "Restrição intermediária", "Restrição total"], {
          ajuda: "Conforme verificação no Gerenciador de Eventos (Configurações > Gerenciar categorias). Se a seção nem aparece, a fonte não está categorizada. Nunca presumir restrição antes de olhar. Fonte: 05.03, seção 7.",
        }),
        ar("p6_print", "P6 · Print do status saúde e bem-estar"),
      ],
    },
    {
      id: "resultado", titulo: "2. Resultado: canais, campanhas e destinos",
      intro: "Tabela de decisão (seção 3 do documento). Intenção alta + busca alta/média + resposta rápida: principal Google serviço, secundário Meta captação (se verba ≥ R$ 150/dia) ou impulsionamento, Google marca sempre. Intenção alta + busca alta/média + resposta lenta: Meta captação com formulário até a resposta ficar rápida; Google serviço entra quando a mediana cair abaixo de 15 min. Intenção alta + busca baixa: Meta captação, secundário Google marca. Baixa/desejo + resposta rápida: Meta captação; Google serviço só com busca média/alta e verba ≥ R$ 150/dia; advertorial ou quiz como destino costuma ajudar. Baixa/desejo + resposta lenta: Meta captação com formulário, nenhum secundário até a resposta melhorar. Com presença forte, somar impulsionamento dos posts que performaram ao canal principal.\n\nAjuste pela categoria saúde e bem-estar: sem restrição ou configuração básica segue a tabela; restrição intermediária: Meta com formulário instantâneo ou anúncio de mensagem, público amplo, fundo de funil no Tracker, Google ganha peso se houver intenção e busca; restrição total: preferir formulário instantâneo ou anúncio de mensagem, página externa só com UTM e Tracker, considerar subir a participação do Google.\n\nDestino: WhatsApp direto (intenção alta, recepção rápida e treinada; evitar com recepção lenta); formulário instantâneo da Meta (verba baixa, restrição de dados; evitar se a qualidade do lead já se mostrou baixa); página com formulário (Google serviço; sem tempo de fazer página boa, usar formulário instantâneo); advertorial (desejo/estético de ticket alto, decisão longa, tráfego frio; evitar em intenção alta e urgente); quiz de objetivo (serviços com vários caminhos; evitar em serviço único e simples). Modelos: 05.15.",
      campos: [
        t("canal_principal", "Canal principal"),
        t("canal_secundario", "Canal secundário"),
        t("campanhas", "Campanhas que entram (máximo pela faixa)"),
        p("divisao_verba", "Divisão de verba (R$/dia por campanha)"),
        p("destinos", "Destino de cada campanha"),
        p("fora", "O que fica fora e por quê"),
        p("ponto_coord", "Ponto para o Coordenador destacar na sessão"),
      ],
    },
  ],
};

// ---------------------------------------------------------------- 05.08 · Formulário de Filtro e Pontuação de Leads
const F_0508: Formulario = {
  codigo: "05.08", doc: "05.08", nome: "Formulário de Filtro e Pontuação de Leads", marco: null,
  serve: "Perguntas de pré-qualificação que separam quem está pronto para a avaliação de quem precisa ser nutrido, sem eliminar ninguém e sem perguntar condição de saúde.",
  quem: "Gestor de Tráfego monta (formulário instantâneo, página, quiz, WhatsApp); recepção/IA usa a pontuação para priorizar. Proposta no D-3 da Sessão 3, validação no bloco 5 do 05.01, configuração até D27.",
  secoes: [
    {
      id: "regras", titulo: "Antes de começar",
      intro: "Três regras: (1) ninguém é eliminado, todo lead recebe resposta; (2) nunca perguntar condição de saúde, sintoma, diagnóstico, medicamento ou tratamento atual (política da Meta e LGPD, art. 11: dado de saúde é sensível); (3) \"quero saber valores\" é lead quente, não frio.\n\nNome, telefone (WhatsApp) e e-mail são campos de contato e não contam nas perguntas. Nenhuma pergunta de texto livre. Perguntas sobre objetivo e situação, nunca sobre doença (certo: \"Melhorar a firmeza da pele do rosto\"; errado: \"Tenho flacidez\"). Não usar a expressão \"você tem\". A pergunta 4 pode ser omitida quando o médico não aceitar mostrar faixa; nesse caso use \"Você prefere pagamento à vista, parcelado ou quer entender as opções na avaliação?\" (todas valem 3). A pergunta 3 só entra se houver risco real de lead de outra cidade sem condição de ir.\n\nPontuação A/B/C (soma das perguntas 1 a 4, máximo 12; a 5 é só informação): A (quente) = 10 a 12 pontos, ou marcou \"Quero saber valores antes de decidir\", ou prazo \"Nas próximas 2 semanas\": recepção/IA chama no WhatsApp com a abertura do 06.02, até 5 min em horário comercial. B (morno) = 6 a 9: chama no mesmo dia. C (frio) = 0 a 5: mensagem de boas-vindas + 05.09 · Sequência de Nutrição de Leads. \"Está acima do que posso agora\" soma 0, mas a pessoa ainda pode ser B. Pergunta 3 = \"Prefiro algo online\" vira C com mensagem honesta. A pontuação é revisada no D45 com dado real.",
      campos: [
        t("servico", "Serviço prioritário"),
        t("oferta", "Oferta de entrada (avaliação, consulta)", { ajuda: "Definida na Sessão 2." }),
      ],
    },
    {
      id: "perguntas", titulo: "1. Ficha das perguntas (múltipla escolha, uma por tela)",
      intro: "Modelos. 1 Objetivo: \"O que você busca agora?\" — [objetivo 1 do serviço] (3), [objetivo 2] (3), [objetivo 3] (3), \"Ainda estou pesquisando opções\" (1). 2 Prazo: \"Quando você gostaria de começar?\" — \"Nas próximas 2 semanas\" (3), \"Em até 1 mês\" (3), \"Em 2 a 3 meses\" (2), \"Sem data definida\" (0). 3 Avaliação presencial: \"A primeira etapa é uma avaliação presencial com [Dr(a). nome] em [bairro/cidade]. Isso funciona para você?\" — \"Sim, fica bem para mim\" (3), \"Sim, se tiver horário [à noite/sábado]\" (2), \"Moro longe, mas posso ir\" (2), \"Prefiro algo online\" (0). 4 Faixa de investimento: \"Tratamentos como esse costumam ficar entre [R$ faixa] e [R$ faixa], com parcelamento. Como você se sente em relação a isso?\" — \"Está dentro do que planejei\" (3), \"Quero entender as opções de pagamento\" (3), \"Quero saber valores antes de decidir\" (3), \"Está acima do que posso agora\" (0). 5 (opcional) Decisão: \"Quem participa dessa decisão com você?\" — \"Decido sozinha(o)\" (2), \"Decido com meu/minha parceiro(a)\" (2), \"Ainda vou conversar com a família\" (1).",
      campos: [
        tb("ficha", "Ficha de preenchimento", [
          { id: "alternativas", rotulo: "Alternativas" },
          { id: "pontos", rotulo: "Pontos" },
          { id: "validada", rotulo: "Validada na sessão?", opcoes: SIM_NAO },
          { id: "ajuste", rotulo: "Ajuste" },
        ], { linhas: ["1. Objetivo", "2. Prazo", "3. Avaliação presencial", "4. Investimento", "5. Decisão (opcional, só informação)"] }),
        t("faixa", "Faixa de investimento mostrada (aprovada pelo médico)", { ajuda: "R$ a R$." }),
        esc("faixa_validada", "Faixa de investimento validada na sessão?", SIM_NAO),
        t("politica", "Link da política de privacidade (consentimento)"),
        esc("politica_validada", "Consentimento e link validados na sessão?", SIM_NAO),
        esc("validacao_medico", "O médico confirmou que as perguntas separam quem está pronto de quem ainda está pesquisando, sem afastar ninguém?", SIM_NAO, { ajuda: "Pergunta de validação ao médico: \"Essas perguntas separam quem está pronto de quem ainda está pesquisando, sem afastar ninguém? Alguma alternativa soa estranha para o seu paciente?\"" }),
        p("validacao_obs", "Alternativa que soou estranha / observações do médico", { opcional: true }),
      ],
    },
    {
      id: "consentimento", titulo: "2. Consentimento LGPD e evento",
      intro: "Caixa de seleção não pré-marcada antes do botão de envio: \"Autorizo a [Nome da Clínica] a usar meus dados de contato para falar comigo sobre a minha solicitação por WhatsApp, telefone ou e-mail, conforme a [Política de Privacidade]. Posso cancelar a qualquer momento respondendo SAIR.\" Segunda caixa opcional, só se houver nutrição por e-mail/WhatsApp: \"Quero receber conteúdos educativos da clínica (até 1 por semana).\" No formulário da Meta: campo de aviso de privacidade (link obrigatório) e pergunta \"Posso falar com você pelo WhatsApp?\" (Sim / Prefiro e-mail).\n\nO evento chama sempre lead_qualificado e nasce quando a pontuação é A ou B (05.03, seção 3). As respostas não vão para a Meta nem para o Google: vai só o evento, com ID e dados de correspondência com hash. No Tracker, o campo \"Pontuação do filtro\" recebe A, B ou C.",
      campos: [
        esc("caixa2", "Haverá nutrição por e-mail/WhatsApp (segunda caixa de consentimento)?", SIM_NAO),
      ],
    },
    {
      id: "versao", titulo: "3. Versões do filtro",
      intro: "Formulário instantâneo da Meta: tipo Maior intenção; introdução com 1 frase da oferta (\"Avaliação com [Dr(a). nome]: [o que inclui]. Responda 4 perguntas rápidas.\"); perguntas 1 a 5 em múltipla escolha; contato (nome completo, telefone WhatsApp, e-mail); privacidade com link da política + aviso personalizado; tela final \"Recebido. Em poucos minutos a nossa equipe fala com você pelo WhatsApp [número].\" + botão Chamar no WhatsApp com mensagem pré-preenchida e código (05.03); integração por webhook para n8n ou Quaddro; nome neutro [cod_clinica]_form_[aaaamm]_v1.\n\nPágina (landing ou advertorial): mesmas perguntas em etapas; campos ocultos utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, fbclid; Pixel + CAPI no envio com o mesmo event_id; botão alternativo \"Prefiro falar no WhatsApp\".\n\nQuiz: as perguntas 1 a 4 entram como as últimas telas do quiz (05.15); a tela de resultado pede o contato com o consentimento.\n\nWhatsApp (anúncio de mensagem ou link direto): sem formulário; a recepção ou a IA faz as perguntas na conversa, uma por mensagem, depois de acolher, e registra a letra A/B/C na Quaddro ou planilha. Consentimento na primeira resposta, com link da política.",
      campos: [
        esc("versao_usada", "Onde o filtro será usado", ["Formulário instantâneo da Meta", "Página (landing ou advertorial)", "Quiz", "WhatsApp (anúncio de mensagem ou link direto)"]),
        t("nome_form", "Nome do formulário", { opcional: true, ajuda: "Neutro: [cod_clinica]_form_[aaaamm]_v1." }),
      ],
    },
  ],
};

// ---------------------------------------------------------------- 05.12 · Termo de Autorização de Uso de Imagem
const F_0512: Formulario = {
  codigo: "05.12", doc: "05.12", nome: "Termo de Autorização de Uso de Imagem", marco: null,
  serve: "Autorizar o uso de imagem, voz e depoimento em criativos e anúncios. Sem termo assinado, a peça não sobe.",
  quem: "CS e Relacionamento envia; médico, equipe e paciente assinam (ZapSign); Editor e Copy só usa material com termo assinado. Antes da gravação dirigida (05.07) e antes de usar qualquer depoimento ou imagem de paciente.",
  secoes: [
    {
      id: "uso", titulo: "Como usar",
      intro: "Modelo de referência: valide com o jurídico da clínica antes do primeiro uso. A clínica é a controladora dos dados e a contratante do uso; a Doctor Creator produz e veicula em nome dela.\n\nModelo A para o médico e cada pessoa da equipe que aparecer ou tiver a voz gravada (assinar antes da gravação dirigida). Modelo B para paciente, só quando a peça usar imagem, voz ou depoimento dele; depoimento sobre a EXPERIÊNCIA (atendimento, acolhimento, segurança), conforme 00.04, estratégia 4.10; paciente menor de idade: assina o responsável legal. Enviar pelo ZapSign com a lista do material anexada. Arquivar o PDF assinado em Clínica > 05 Atração > Termos de Imagem e marcar \"Termo OK\" na peça no 05.10. Revogação recebida: tirar do ar em até 5 dias úteis (anúncios pausados no mesmo dia) e registrar no 05.10.\n\nRegras que não mudam: sem termo assinado a peça não sobe (item 6 do checklist do 00.04); paciente nunca é identificado por nome completo, documento, prontuário ou dado de saúde na peça; antes e depois de paciente em anúncio pago é amarelo, testar com plano B, só no formato jornada contada em vídeo, com Modelo B assinado, ciente do médico, público 18+ em estético e linha no 05.16 (sem autorização escrita do paciente é vermelho); a autorização é gratuita, não oferecer desconto, brinde ou procedimento em troca (Res. CFM 2.336/2023).",
      campos: [
        esc("modelo", "Modelo do termo", ["Modelo A · Médico e equipe", "Modelo B · Paciente"]),
        t("cidade", "Cidade"),
        dt("data", "Data"),
        t("clinica", "Clínica (razão social)"),
        t("clinica_cnpj", "CNPJ da clínica"),
        t("clinica_endereco", "Endereço da clínica", { opcional: true }),
        t("dc_razao", "Doctor Creator (razão social)", { opcional: true }),
        t("dc_cnpj", "CNPJ da Doctor Creator", { opcional: true }),
      ],
    },
    {
      id: "a", titulo: "Modelo A · Cedente (médico e equipe)", quando: { campo: "modelo", igual: "Modelo A · Médico e equipe" },
      intro: "Autorização de uso de imagem e voz para os materiais listados no Anexo, em anúncios pagos (Meta, Google e outras plataformas), perfis da clínica e do médico, site, páginas de destino, WhatsApp e materiais de comunicação com pacientes. A DC pode cortar, legendar, ajustar cor e som e combinar trechos, sem alterar o sentido; peças com fala do médico passam pela aprovação dele antes de ir ao ar. Autorização gratuita. Vale por 24 meses (sugestão) ou até a revogação; revogação por escrito: anúncios pausados em até 1 dia útil e retirada das demais mídias em até 5 dias úteis; desligamento: anúncios encerrados em até 15 dias. Base legal LGPD: consentimento (Art. 7º, I); clínica controladora e DC operadora; arquivos brutos apagados até 6 meses após o fim do prazo ou da revogação. Prazos entre colchetes são sugestão da DC e devem ser confirmados pelo jurídico da clínica.",
      campos: [
        t("a_nome", "Nome completo"),
        t("a_cpf", "CPF"),
        esc("a_funcao", "Função na clínica", ["Médico titular", "Recepção", "Enfermagem", "Outra"]),
        t("a_crm", "CRM e RQE (se médico)", { opcional: true }),
        t("a_contato", "E-mail e WhatsApp"),
        tb("a_anexo", "Anexo do Modelo A · Material autorizado", [
          { id: "material", rotulo: "Material" },
          { id: "gravacao", rotulo: "Data da gravação" },
          { id: "uso", rotulo: "Uso previsto" },
        ], { minLinhas: 1 }),
      ],
    },
    {
      id: "b", titulo: "Modelo B · Paciente", quando: { campo: "modelo", igual: "Modelo B · Paciente" },
      intro: "A autorização é por vontade própria, sem desconto, brinde, procedimento ou pagamento em troca; recusar ou revogar não muda o atendimento. O paciente vê a versão final antes de ir ao ar e pode desistir antes da publicação. Não será divulgado diagnóstico, tratamento realizado, prontuário, documento ou dado de saúde além do que o paciente disser e aprovar. Prazo sugerido de 12 meses ou até a revogação; revogação por escrito: anúncios pausados em até 1 dia útil, material fora das mídias controladas pela clínica em até 5 dias úteis. Base legal LGPD: consentimento específico e destacado (Art. 7º, I e Art. 11, I); material apagado até 6 meses após o fim do prazo ou da revogação.",
      campos: [
        t("b_nome", "Nome completo do paciente"),
        t("b_cpf", "CPF"),
        dt("b_nasc", "Data de nascimento"),
        t("b_resp", "Responsável legal (se menor ou incapaz): nome, CPF, parentesco", { opcional: true }),
        t("b_contato", "E-mail e WhatsApp"),
        t("b_medico", "Médico responsável (nome e CRM)"),
        {
          id: "b_autoriza", rotulo: "O que está sendo autorizado (marque)", tipo: "multipla", opcional: false,
          opcoes: [
            "Depoimento em vídeo ou áudio sobre minha experiência de atendimento",
            "Depoimento escrito (texto, mensagem ou print sem dados pessoais)",
            "Imagem minha em ambiente da clínica (recepção, consulta), sem mostrar região tratada",
            "Imagem da região tratada, para conteúdo educativo do médico no perfil orgânico, sem identificação (Res. CFM 2.336/2023, Art. 14: só orgânico)",
            "Minha jornada de tratamento contada em vídeo, com antes e depois, para perfis da clínica e anúncios pagos, sem promessa de resultado",
          ],
        },
        esc("b_nome_aparece", "Como o nome do paciente aparece", ["Só primeiro nome", "Iniciais", "Não aparece"]),
        tb("b_anexo", "Anexo do Modelo B · Material autorizado", [
          { id: "material", rotulo: "Material" },
          { id: "data", rotulo: "Data" },
          { id: "uso", rotulo: "Uso (orgânico / anúncio)" },
          { id: "aprovado", rotulo: "Aprovado pelo paciente em" },
        ], { minLinhas: 1 }),
      ],
    },
    {
      id: "assinatura", titulo: "Assinatura e checklist antes de usar o material",
      campos: [
        ar("termo_pdf", "PDF do termo assinado (ZapSign)", { ajuda: "Arquivar também em Clínica > 05 Atração > Termos de Imagem." }),
        {
          id: "checklist", rotulo: "Checklist antes de usar o material", tipo: "multipla", todas: true,
          opcoes: [
            "Termo certo (A para médico e equipe, B para paciente) assinado por todas as pessoas que aparecem",
            "Material usado está no Anexo",
            "Uso dentro do prazo e da finalidade marcada",
            "Paciente aprovou a versão final (Modelo B, item 4), quando aplicável",
            "Peça sem nome completo e sem dado de saúde; antes e depois em anúncio pago só como jornada em vídeo, com Modelo B, ciente do médico e linha no 05.16",
            "\"Termo OK\" marcado no 05.10 · Plano de Campanha",
          ],
        },
      ],
    },
  ],
};

export const FORMS_G2: Formulario[] = [F_0502, F_0508, F_0512];
