// SAP · Passo a passo da implantação no painel. Diz, para quem nunca implantou, o que fazer, em que
// ordem e por quê, e marca sozinho o que já foi feito a partir dos dados (cadastro, etapas do CRM, plano,
// Score de Execução e de Saúde, tracker). Lógica pura (teste: scripts/test-sap-implantacao.ts).

export type StatusPasso = "feito" | "fazer" | "atrasado" | "rotina" | "depois";

export interface PassoImplantacao {
  id: string;
  grupo: "Começo (D0 a D14)" | "Toda semana" | "Marcos do programa";
  titulo: string;
  porque: string; // em linguagem simples
  como: string; // o que clicar
  tela: "" | "/metas" | "/leitura" | "/execucao" | "/midia" | "/etapas" | "/cronograma" | "/onboarding";
  quando: string;
  status: StatusPasso;
  detalhe?: string;
}

export interface EstadoImplantacao {
  ativo: boolean;
  d0: string | null;
  dia: number | null;
  ticket: number | null;
  temCrm: boolean;
  temWhatsapp: boolean;
  temAnuncios: boolean;
  marcos: string[]; // marcos do SAP já marcados nas etapas do CRM
  baselineMedida: boolean;
  metasPrincipais: number; // quantos dos KPIs da garantia têm meta
  metaCustoConsulta: boolean;
  aceiteMetas?: boolean; // data e assinante do aceite registrados (03.07)
  acessosCriticos?: { feitos: number; total: number }; // checklist 02.05
  linhasCompletas: number | null; // 0 a 1
  divergencia: number | null; // 0 a 1 (null = sem leads de anúncio)
  saudeSemanaAtual: boolean;
  execucaoItens: number; // itens com status diferente de Pendente
  execucaoVencidosSemStatus: number;
}

export function passosDaImplantacao(e: EstadoImplantacao): PassoImplantacao[] {
  const dia = e.dia;
  const ate = (limite: number, feito: boolean): StatusPasso => (feito ? "feito" : dia !== null && dia > limite ? "atrasado" : "fazer");
  const temEtapas = e.marcos.includes("agendado") && (e.marcos.includes("compareceu") || e.marcos.includes("faltou"));
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return [
    {
      id: "ativar",
      grupo: "Começo (D0 a D14)",
      titulo: "Ativar o Sistema de Aquisição e definir o D0",
      porque: "O D0 é o dia da assinatura. Todo o programa (marcos, quinzenas, janela da garantia) conta a partir dele.",
      como: "Em Programa, clique em \"Ativar o SAP\" e preencha o D0, os serviços e o ticket médio.",
      tela: "",
      quando: "No dia da assinatura",
      status: e.ativo && e.d0 ? "feito" : "fazer",
      detalhe: e.ativo && !e.d0 ? "O SAP está ativo, mas sem D0." : undefined,
    },
    {
      id: "fontes",
      grupo: "Começo (D0 a D14)",
      titulo: "Conferir se CRM, WhatsApp e anúncios estão ligados",
      porque: "Os números do SAP saem sozinhos do CRM (leads e etapas), do WhatsApp (tempo de resposta) e da Meta (investimento). Sem a fonte, o número não existe.",
      como: "Abra \"Ir para o Doctor Creator Hub\" > Equipe > Configurar este cliente e ligue o que faltar.",
      tela: "",
      quando: "Até o D5 (acessos da clínica)",
      status: ate(5, e.temCrm && e.temWhatsapp && e.temAnuncios),
      detalhe: [!e.temCrm && "falta o CRM", !e.temWhatsapp && "falta o WhatsApp", !e.temAnuncios && "falta a conta de anúncios"].filter(Boolean).join(", ") || undefined,
    },
    ...(e.acessosCriticos
      ? [
          {
            id: "acessos",
            grupo: "Começo (D0 a D14)" as const,
            titulo: "Confirmar os acessos críticos (02.05)",
            porque: "Sem Business Manager, conta de anúncios, pixel, histórico da agenda e números dos últimos 3 meses, não há Sessão 1 nem baseline confiável.",
            como: "Em Ficha e acessos, marque cada item como confirmado (ou \"não se aplica\") depois de testar o acesso de verdade.",
            tela: "/onboarding" as const,
            quando: "Críticos até o D7; complementares até o D14",
            status: ate(7, e.acessosCriticos.feitos >= e.acessosCriticos.total),
            detalhe: e.acessosCriticos.feitos < e.acessosCriticos.total ? `${e.acessosCriticos.feitos} de ${e.acessosCriticos.total} críticos confirmados.` : undefined,
          },
        ]
      : []),
    {
      id: "etapas",
      grupo: "Começo (D0 a D14)",
      titulo: "Dizer o que cada etapa do CRM significa",
      porque: "O painel precisa saber qual etapa é \"agendou\", \"compareceu\", \"faltou\" e \"fechou\" para calcular comparecimento, conversão e custo por consulta.",
      como: "Em Etapas no funil, clique em \"Aceitar sugestões pelo nome\" e corrija o que estiver errado.",
      tela: "/etapas",
      quando: "Até o D7, antes de medir a baseline",
      status: ate(7, temEtapas),
      detalhe: temEtapas
        ? undefined
        : e.marcos.length
          ? `Marcadas: ${e.marcos.join(", ")}. Falta marcar: ${[!e.marcos.includes("agendado") && "agendado", !(e.marcos.includes("compareceu") || e.marcos.includes("faltou")) && "compareceu ou faltou"].filter(Boolean).join(" e ")}.`
          : "Nenhuma etapa marcada ainda.",
    },
    {
      id: "baseline",
      grupo: "Começo (D0 a D14)",
      titulo: "Medir a baseline do D0",
      porque: "É a foto de como a clínica estava antes. A garantia compara o fim do programa com ela.",
      como: "Em Metas e garantia, clique em \"Definir baseline e metas\" e depois em \"Medir baseline no CRM\".",
      tela: "/metas",
      quando: "Até o D10 (antes da Sessão 1)",
      status: ate(10, e.baselineMedida),
    },
    {
      id: "metas",
      grupo: "Começo (D0 a D14)",
      titulo: "Propor e assinar as metas D90",
      porque: "As metas são de processo (resposta, comparecimento, conversão), nunca de faturamento. São assinadas pelo decisor na Sessão 2.",
      como: "Em Metas e garantia, clique em \"Propor metas (regra do 03.07)\", ajuste com o Fundador e salve. Depois, em Cronograma e prazos, registre a data do aceite e quem assinou.",
      tela: "/metas",
      quando: "Sessão 2 (D12 a D14)",
      status: ate(14, e.metasPrincipais >= 2 && e.aceiteMetas !== false),
      detalhe:
        e.metasPrincipais && e.metasPrincipais < 2
          ? `${e.metasPrincipais} dos KPIs da garantia com meta.`
          : e.metasPrincipais >= 2 && e.aceiteMetas === false
            ? "Metas definidas, mas o aceite (data e assinante) não foi registrado."
            : undefined,
    },
    {
      id: "ticket",
      grupo: "Começo (D0 a D14)",
      titulo: "Cadastrar o ticket médio do serviço principal",
      porque: "Sem o ticket, a leitura da semana não consegue dizer quanto a clínica perde em R$ em cada etapa.",
      como: "Em Programa, \"Editar cadastro\" e preencha o ticket médio.",
      tela: "",
      quando: "Na Sessão 2",
      status: ate(14, !!e.ticket),
    },
    {
      id: "dado",
      grupo: "Toda semana",
      titulo: "Conferir se o dado está confiável",
      porque: "Com menos de 90% das linhas completas no CRM ou mais de 20% de diferença entre Meta e CRM, número ruim pode ser só falta de registro.",
      como: "Em Programa, veja \"Qualidade do dado\". Se estiver vermelho, a ação da semana é completar o CRM (V15) ou a origem dos leads (V1).",
      tela: "",
      quando: "Sexta, antes da leitura",
      status: e.linhasCompletas === null ? "rotina" : e.linhasCompletas >= 0.9 && (e.divergencia === null || e.divergencia <= 0.2) ? "feito" : "fazer",
      detalhe:
        e.linhasCompletas === null
          ? undefined
          : `Linhas completas ${pct(e.linhasCompletas)}${e.divergencia !== null ? ` · diferença Meta × CRM ${pct(e.divergencia)}` : ""}`,
    },
    {
      id: "saude",
      grupo: "Toda semana",
      titulo: "Preencher o Score de Saúde da semana",
      porque: "Mostra cedo se a conta está em risco (entregas, presença, engajamento, suporte e KPIs). Duas semanas vermelhas: escalar ao Fundador.",
      como: "Em Execução e saúde, preencha a semana atual (5 minutos) e salve.",
      tela: "/execucao",
      quando: "Toda sexta, 15h",
      status: dia === null || dia < 0 ? "depois" : e.saudeSemanaAtual ? "feito" : "fazer",
    },
    {
      id: "leitura",
      grupo: "Toda semana",
      titulo: "Fazer a leitura da semana e mandar a mensagem para a clínica",
      porque: "Uma ação por semana para cada lado, atacando a etapa que mais vaza. A mensagem já vem pronta.",
      como: "Em Leitura da semana, confira o vazamento principal e clique em \"Enviar pelo WhatsApp\".",
      tela: "/leitura",
      quando: "Toda segunda, até 12h (a partir dos anúncios no ar, D28)",
      status: dia !== null && dia >= 28 ? "rotina" : "depois",
    },
    {
      id: "midia",
      grupo: "Toda semana",
      titulo: "Aplicar as regras de mídia",
      porque: "A verba se decide pelo custo por consulta realizada, não por clique. Fadiga troca criativo; custo acima de 2x a meta pausa.",
      como: "Em Mídia, siga o que estiver marcado como Pausar, Fadiga ou Escalar.",
      tela: "/midia",
      quando: "Toda segunda, com o Gestor de Tráfego",
      status: dia !== null && dia >= 28 ? "rotina" : "depois",
    },
    {
      id: "execucao",
      grupo: "Toda semana",
      titulo: "Atualizar o Score de Execução da clínica",
      porque: "São os 20 compromissos da clínica. 80% ou mais no D90 é a condição para a garantia. A clínica vê a cada quinzena.",
      como: "Em Execução e saúde, \"Atualizar itens\": marque o status e cole o link da evidência.",
      tela: "/execucao",
      quando: "A cada quinzena; obrigatório no D60, D85 e D90",
      status: dia === null || dia < 5 ? "depois" : e.execucaoVencidosSemStatus > 0 ? "fazer" : e.execucaoItens > 0 ? "feito" : "fazer",
      detalhe: e.execucaoVencidosSemStatus > 0 ? `${e.execucaoVencidosSemStatus} item(ns) já vencidos sem status.` : undefined,
    },
    {
      id: "custo",
      grupo: "Marcos do programa",
      titulo: "Definir a meta de custo por consulta",
      porque: "Só depois de 2 semanas de anúncio com rastreamento dá para saber quanto uma consulta custa. É ela que decide a verba.",
      como: "Em Metas e garantia, edite e preencha a meta de \"Custo por consulta realizada\".",
      tela: "/metas",
      quando: "D45",
      status: dia === null || dia < 40 ? "depois" : e.metaCustoConsulta ? "feito" : dia > 45 ? "atrasado" : "fazer",
    },
    {
      id: "garantia",
      grupo: "Marcos do programa",
      titulo: "Acompanhar a prévia da garantia e preparar o D90",
      porque: "De D62 a D89 é a janela que vale. No D85 calcula-se a execução; no D90, a reunião de encerramento.",
      como: "Em Metas e garantia, veja o card \"Garantia\". A partir do D75, se indicar que se aplica, escalar ao Fundador.",
      tela: "/metas",
      quando: "D62 a D90",
      status: dia === null || dia < 62 ? "depois" : dia > 90 ? "feito" : "rotina",
    },
  ];
}

export function resumoImplantacao(p: PassoImplantacao[]) {
  const comeco = p.filter((x) => x.grupo === "Começo (D0 a D14)");
  const feitosComeco = comeco.filter((x) => x.status === "feito").length;
  const proximo = p.find((x) => x.status === "atrasado") ?? p.find((x) => x.status === "fazer") ?? null;
  return { feitosComeco, totalComeco: comeco.length, atrasados: p.filter((x) => x.status === "atrasado").length, proximo };
}
