// SAP · Tarefas: o Cronograma Mestre (35 itens) é a ÚNICA fonte de tarefas do programa. Esta lib monta cada item
// com status (a fazer, feito automaticamente, feito manualmente, não se aplica), prazo num dia útil, papel e
// pessoa, subtarefas (acessos, testes de rastreamento, configuração, rotina) e o manual (por quê, como, onde).
// As telas Minhas tarefas, Esta semana, Cronograma, Painel e Todas as clínicas só filtram este resultado, e os
// contadores saem de uma função só (contarTarefas). Lógica pura (teste: scripts/test-sap-tarefas.ts).

import { CRONOGRAMA, FASES, dataDoDia, diaDoPrograma, diaUtilAnterior, entre, somar, type ItemCronograma, type Pausa } from "@/lib/sap-cronograma";
import { ITENS_ACESSO, type RegistroAcesso } from "@/lib/sap-acessos";
import { TESTES_RASTREIO, dispensavel, recheckCategoria, resumoTestes, type CategoriaMeta, type RegistroTeste } from "@/lib/sap-rastreamento";
import { calcularExecucao, resumoSaude, type ItemRegistro, type SemanaSaude } from "@/lib/sap-scores";
import { kpisDaGarantia, type KpiPlano } from "@/lib/sap-metas";
import { SESSOES, sessaoDoItem } from "@/lib/sap-sessoes";

// ---------------------------------------------------------------- papéis

export type PapelId = "comercial" | "coordenador" | "onboarding" | "trafego" | "editor" | "cs" | "condutor" | "clinica" | "fundador";

/** Papéis de cada clínica. "Condutor" conduz as sessões (no piloto, o Fundador; depois, a equipe). "Fundador" é só
 *  escalonamento: recebe alertas, não tarefas de execução. */
export const PAPEIS: { id: PapelId; nome: string; execucao: boolean; resumo: string }[] = [
  { id: "comercial", nome: "Comercial", execucao: true, resumo: "Vende, fecha o contrato (D0) e passa a clínica para o CS." },
  { id: "coordenador", nome: "Coordenador de Implementação", execucao: true, resumo: "Dono do programa: cronograma, prazos, pausas, registro das sessões e Score de Saúde." },
  { id: "onboarding", nome: "Analista de Onboarding", execucao: true, resumo: "Análise pré-reunião, lead oculto e coleta da baseline." },
  { id: "trafego", nome: "Gestor de Tráfego", execucao: true, resumo: "Acessos da Meta, rastreamento, campanhas e leitura semanal de mídia." },
  { id: "editor", nome: "Editor e Copy", execucao: true, resumo: "Gravação dirigida, edição e banco de criativos sem rosto." },
  { id: "cs", nome: "CS e Relacionamento", execucao: true, resumo: "Dia a dia com a clínica, treino da recepção e auditoria de conversas." },
  { id: "condutor", nome: "Condutor", execucao: true, resumo: "Conduz o kickoff, as Sessões 1, 2 e 6, a call em grupo e o D90." },
  { id: "clinica", nome: "Clínica", execucao: true, resumo: "Decisor nas sessões; recepção responde, confirma e registra no CRM." },
  { id: "fundador", nome: "Fundador (escalonamento)", execucao: false, resumo: "Recebe os alertas de risco (Score de Saúde vermelho, garantia). Não executa tarefas." },
];
export const NOME_PAPEL = Object.fromEntries(PAPEIS.map((p) => [p.id, p.nome])) as Record<PapelId, string>;

/** "Quem conduz" do 00.02 e do 02.05 → papel. */
export function papelDoDono(dono: string | null | undefined): PapelId {
  const d = (dono ?? "").toLowerCase();
  if (d.includes("condutor")) return "condutor";
  if (d.includes("fundador")) return "fundador";
  if (d.includes("comercial")) return "comercial";
  if (d.includes("onboarding")) return "onboarding";
  if (d.includes("tráfego") || d.includes("trafego")) return "trafego";
  if (d.includes("editor") || d.includes("copy")) return "editor";
  if (d.includes("cs") || d.includes("relacionamento") || d.includes("recepção")) return "cs";
  if (d.includes("clínica") || d.includes("clinica")) return "clinica";
  return "coordenador";
}

// ---------------------------------------------------------------- manual de cada item

export type Tela = "" | "/tarefas" | "/painel" | "/cronograma" | "/sessao" | "/onboarding" | "/rastreamento" | "/etapas" | "/papeis" | "/leitura" | "/execucao" | "/midia" | "/metas" | "/documentos";
export interface Onde { rotulo: string; tela?: Tela; busca?: { s: string }; hub?: "config"; doc?: string }
export interface Manual {
  porque: string;
  como: string[];
  onde: Onde;
  /** Pode marcar como feito sem link/print (ver também sap_item_sem_evidencia no banco). */
  semEvidencia?: boolean;
  /** "passo": texto vindo do antigo Passo a passo; "novo": primeira versão escrita a partir do "Pronto quando" (revisar). */
  origem: "passo" | "novo";
}

const sessao = (n: number): Onde => {
  const s = sessaoDoItem(n);
  return s ? { rotulo: `Abrir a reunião no modo sessão`, tela: "/sessao", busca: { s: s.id } } : { rotulo: "Abrir o cronograma", tela: "/cronograma" };
};

/** Itens que podem ser fechados sem evidência (espelho de sap_item_sem_evidencia no banco). */
export const SEM_EVIDENCIA = new Set([6, 30]);

export const MANUAL: Record<number, Manual> = {
  1: { origem: "passo", porque: "O D0 é o dia da assinatura. Todo o programa (marcos, quinzenas, janela da garantia) conta a partir dele.", como: ["Confirme o contrato assinado e o pagamento.", "Em Painel da clínica, \"Editar cadastro\": preencha o D0, os serviços e o ticket médio.", "Envie a mensagem de boas-vindas em até 1 h."], onde: { rotulo: "Abrir o Painel da clínica", tela: "/painel" } },
  2: { origem: "passo", porque: "Os números do SAP saem sozinhos do CRM (leads e etapas), do WhatsApp (tempo de resposta) e da Meta (investimento). Sem a fonte e sem a ficha, o número não existe.", como: ["Ligue CRM, WhatsApp e conta de anúncios em Configurar este cliente, no Hub.", "Em Etapas do funil, clique em \"Aceitar sugestões pelo nome\" e corrija o que estiver errado.", "Cadastre o ticket médio do serviço principal.", "Registre a pasta do Drive e preencha decisor e coordenador na Ficha."], onde: { rotulo: "Abrir a configuração do cliente no Hub", hub: "config" } },
  3: { origem: "novo", porque: "Primeira conversa com o decisor: alinha a ambição para o D90 e os próximos passos antes de qualquer entrega.", como: ["Marque 20 a 30 min com o decisor presente.", "Abra a reunião no modo sessão e siga o roteiro.", "Registre a ambição D90 na Ficha do Cliente e encerre a sessão no painel."], onde: sessao(3) },
  4: { origem: "novo", porque: "As respostas do formulário pré-diagnóstico preparam a análise e a Sessão 1.", como: ["Envie o link do formulário à clínica no D1.", "Cobre no grupo se não chegar até o D3.", "Confira se a resposta está completa na planilha de respostas e cole o link como evidência."], onde: { rotulo: "Abrir a Ficha e acessos", tela: "/onboarding" } },
  5: { origem: "passo", porque: "Sem Business Manager, conta de anúncios, pixel, histórico da agenda e números dos últimos 3 meses, não há Sessão 1 nem baseline confiável.", como: ["Peça os acessos à clínica no D2.", "Teste cada acesso de verdade (entre e veja os dados).", "Em Ficha e acessos, marque cada item como confirmado ou \"não se aplica\".", "Anote a categoria da fonte de dados da Meta."], onde: { rotulo: "Abrir Ficha e acessos", tela: "/onboarding" } },
  6: { origem: "novo", semEvidencia: true, porque: "A comunidade é onde a clínica recebe avisos e troca com as outras clínicas do programa.", como: ["Adicione o decisor e a recepção ao grupo da comunidade.", "Apresente a clínica no grupo."], onde: { rotulo: "Abrir o cronograma", tela: "/cronograma" } },
  7: { origem: "novo", porque: "O lead oculto mostra como a clínica atende hoje, com tempos medidos, antes da Sessão 1.", como: ["Mande mensagem como paciente pelos canais da clínica.", "Meça o tempo da primeira resposta e do follow-up.", "Preencha a análise pré-reunião com prints e cole o link."], onde: { rotulo: "Abrir a Leitura da semana", tela: "/leitura" } },
  8: { origem: "passo", porque: "É a foto de como a clínica estava antes. A garantia compara o fim do programa com ela.", como: ["Faça a reunião de coleta (60 min) com o modo sessão aberto.", "Em Metas e garantia, clique em \"Medir baseline no CRM\".", "Marque cada número como medido ou estimado."], onde: { rotulo: "Abrir Metas e garantia", tela: "/metas" } },
  9: { origem: "novo", porque: "O diagnóstico define a prioridade de ataque dos 90 dias.", como: ["Confira o portão: kickoff, formulário, baseline e acessos críticos feitos.", "Grave a sessão e siga o roteiro no modo sessão.", "Registre a prioridade de ataque e encerre a sessão."], onde: sessao(9) },
  10: { origem: "novo", porque: "O relatório transforma a Sessão 1 em plano escrito para a clínica, em até 48 h.", como: ["Monte o relatório a partir do registro da Sessão 1.", "Exporte em PDF e envie à clínica.", "Cole o link do PDF como evidência."], onde: { rotulo: "Abrir Plano e relatório D90", tela: "/documentos" } },
  11: { origem: "passo", porque: "As metas são de processo (resposta, comparecimento, conversão), nunca de faturamento. São assinadas pelo decisor na Sessão 2.", como: ["Em Metas e garantia, clique em \"Propor metas\" e ajuste com o Condutor.", "Na Sessão 2, defina o serviço prioritário e 3 a 5 KPIs.", "Registre a data do aceite e quem assinou."], onde: { rotulo: "Abrir Metas e garantia", tela: "/metas" } },
  12: { origem: "novo", porque: "O documento Paciente Ideal guia a copy e os anúncios.", como: ["Escreva o documento a partir da Sessão 2.", "Envie à clínica no D16.", "Registre a aprovação até o D18 e cole o link."], onde: { rotulo: "Abrir Plano e relatório D90", tela: "/documentos" } },
  13: { origem: "novo", porque: "Decide canal, verba e custo-meta antes de subir qualquer anúncio.", como: ["Conduza a Sessão 3 no modo sessão.", "Registre canal, verba e custo-meta.", "Encerre a sessão no painel."], onde: sessao(13) },
  14: { origem: "passo", porque: "Anúncio sem medição queima a verba e não prova nada no D90. Nenhum anúncio sobe sem os testes obrigatórios aprovados com evidência e conferidos pelo Coordenador.", como: ["Configure pixel, CAPI, tag do Google e UTMs.", "Em Rastreamento, registre a categoria da fonte na Meta.", "Marque cada teste com a evidência (print ou link).", "Peça a conferência do Coordenador."], onde: { rotulo: "Abrir Rastreamento", tela: "/rastreamento" } },
  15: { origem: "novo", porque: "Os vídeos com o médico são a matéria-prima dos anúncios.", como: ["Marque a videochamada de 60 a 90 min.", "Dirija a gravação com 3 ganchos por vídeo.", "Confirme que os arquivos brutos chegaram e cole o link da pasta."], onde: { rotulo: "Abrir o cronograma", tela: "/cronograma" } },
  16: { origem: "novo", porque: "Peças sem rosto permitem subir anúncio mesmo sem gravação nova.", como: ["Produza pelo menos 6 peças sem rosto até o D24.", "Edite os vídeos até o D26.", "Coloque tudo na pasta de aprovados e cole o link."], onde: { rotulo: "Abrir o cronograma", tela: "/cronograma" } },
  17: { origem: "novo", porque: "Define as metas de atendimento e a confirmação de consulta com a recepção.", como: ["Conduza a Sessão 4 no modo sessão.", "Defina as metas de atendimento.", "Encerre a sessão no painel."], onde: sessao(17) },
  18: { origem: "novo", porque: "A recepção é quem transforma lead em consulta; cada atendente precisa passar no critério de treino.", como: ["Treine cada atendente com o roteiro.", "Avalie pelo critério do treino da recepção.", "Registre a aprovação de cada um e cole o link."], onde: { rotulo: "Abrir a Leitura da semana", tela: "/leitura" } },
  19: { origem: "novo", porque: "A IA de atendimento e a régua de confirmação precisam estar testadas antes dos anúncios.", como: ["Configure a Quaddro (ou o caminho B).", "Rode os cenários 5 vezes; os eliminatórios precisam de 100%.", "Ative a régua de confirmação e cole o link do teste."], onde: { rotulo: "Abrir o cronograma", tela: "/cronograma" } },
  20: { origem: "novo", porque: "Sem a volta das etapas do CRM para as plataformas, a otimização não aprende quem vira consulta.", como: ["Crie um lead fictício e avance as etapas no CRM.", "Confira se ele aparece na Meta e no Google.", "Compartilhe o Tracker com a clínica e cole o print."], onde: { rotulo: "Abrir Rastreamento", tela: "/rastreamento" } },
  21: { origem: "novo", porque: "Nenhuma peça vai ao ar sem a aprovação do médico; os amarelos precisam do ciente dele.", como: ["Envie as peças com o semáforo.", "Registre a aprovação e o ciente nos amarelos.", "Cole o link da aprovação."], onde: { rotulo: "Abrir o cronograma", tela: "/cronograma" } },
  22: { origem: "novo", porque: "É o marco de lançamento: a partir daqui começam a leitura semanal e as regras de mídia.", como: ["Confirme que o rastreamento foi liberado.", "Suba as campanhas e veja se estão entregando.", "Cole o print do Gerenciador de Anúncios."], onde: { rotulo: "Abrir Mídia", tela: "/midia" } },
  23: { origem: "novo", porque: "O médico pratica a conversa de venda sem pressão antes de os leads chegarem em volume.", como: ["Conduza a Sessão 5 no modo sessão.", "Faça a simulação com o médico.", "Avalie pela rubrica e encerre a sessão."], onde: sessao(23) },
  24: { origem: "novo", porque: "Quem diz \"vou pensar\" só volta com cadência de follow-up registrada.", como: ["Ative a cadência de follow-up no CRM.", "Confira as primeiras decisões registradas.", "Cole o link ou print."], onde: { rotulo: "Abrir a Leitura da semana", tela: "/leitura" } },
  25: { origem: "novo", porque: "A segunda gravação usa os ângulos que já performaram nos anúncios.", como: ["Veja em Mídia os criativos que mais trouxeram consulta.", "Grave novos vídeos com esses ângulos.", "Cole o link dos arquivos."], onde: { rotulo: "Abrir Mídia", tela: "/midia" } },
  26: { origem: "novo", porque: "Define a régua de relacionamento e de indicação, que precisam estar ativas até o D52.", como: ["Conduza a Sessão 6 no modo sessão.", "Defina a régua de relacionamento e de indicação.", "Encerre a sessão no painel."], onde: sessao(26) },
  27: { origem: "novo", porque: "Checkpoint do meio do programa: todos os componentes precisam ter evidência de uso.", como: ["Atualize o Score de Execução com as evidências.", "Conduza o checkpoint no modo sessão.", "Salve a ata na pasta e cole o link."], onde: sessao(27) },
  28: { origem: "novo", porque: "Os check-ins quinzenais ajustam a rota na reta final.", como: ["Faça o check-in de 30 min no D66, D76 e D86.", "Anote os ajustes combinados.", "Marque a semana como feita com o link da anotação."], onde: { rotulo: "Abrir a Leitura da semana", tela: "/leitura" } },
  29: { origem: "passo", porque: "Uma ação por semana para cada lado, atacando a etapa que mais vaza. A verba se decide pelo custo por consulta realizada, não por clique.", como: ["Segunda até 12h: confira se o dado está confiável e faça a leitura da semana.", "Combine uma ação de cada lado e envie o resumo ao médico.", "Terça: aplique as regras de mídia (Pausar, Fadiga, Escalar).", "Quinta: audite 10 conversas."], onde: { rotulo: "Abrir a Leitura da semana", tela: "/leitura" } },
  30: { origem: "novo", semEvidencia: true, porque: "A call em grupo mantém o ritmo e registra os compromissos de cada clínica.", como: ["Conduza a call (60 a 90 min).", "Registre presença ou gravação.", "Lance os compromissos em Ações combinadas."], onde: { rotulo: "Abrir a Leitura da semana", tela: "/leitura" } },
  31: { origem: "passo", porque: "Mostra cedo se a conta está em risco. Duas semanas vermelhas: alerta ao Fundador.", como: ["Sexta, 15h: em Execução e saúde, preencha a semana atual (5 minutos).", "Dê status aos itens vencidos do Score de Execução.", "Salve."], onde: { rotulo: "Abrir Execução e saúde", tela: "/execucao" } },
  32: { origem: "passo", porque: "São os 20 compromissos da clínica. 80% ou mais no D90 é a condição para a garantia.", como: ["Feche o Score de Execução com as evidências.", "Monte o Relatório D90 e o Playbook.", "Peça a revisão do Condutor e cole o link."], onde: { rotulo: "Abrir Plano e relatório D90", tela: "/documentos" } },
  33: { origem: "novo", porque: "Fecha o programa: resultado contra a meta, garantia e proposta de manutenção.", como: ["Conduza a reunião no modo sessão.", "Registre resultado x meta e a avaliação da garantia.", "Registre a proposta de manutenção e encerre."], onde: sessao(33) },
  34: { origem: "novo", porque: "Sem manutenção, os acessos da clínica precisam ser devolvidos.", como: ["Remova a Doctor Creator do BM e das contas.", "Registre as datas de revogação em Ficha e acessos.", "Cole o print."], onde: { rotulo: "Abrir Ficha e acessos", tela: "/onboarding" } },
  35: { origem: "novo", porque: "A LGPD exige apagar gravações e prints quando não são mais necessários.", como: ["Apague gravações e prints das pastas da clínica.", "Registre o que foi apagado e quando.", "Cole o link do registro."], onde: { rotulo: "Abrir o cronograma", tela: "/cronograma" } },
};

// ---------------------------------------------------------------- numeração por fase

/** Ordem de exibição: fases na ordem do programa; dentro da fase, em ordem cronológica (alvo, início, número).
 *  Recorrentes ficam na faixa "Contínuo" (C1, C2...). */
export const ORDEM: { n: number; codigo: string; fase: string }[] = (() => {
  const out: { n: number; codigo: string; fase: string }[] = [];
  const pontuais = CRONOGRAMA.filter((i) => i.tipo !== "Recorrente");
  FASES.forEach((f, fi) => {
    pontuais.filter((i) => i.fase === f.nome).sort((a, b) => a.alvo - b.alvo || a.ini - b.ini || a.n - b.n)
      .forEach((i, j) => out.push({ n: i.n, codigo: `${fi + 1}.${j + 1}`, fase: f.nome }));
  });
  CRONOGRAMA.filter((i) => i.tipo === "Recorrente").sort((a, b) => a.ini - b.ini || a.n - b.n)
    .forEach((i, j) => out.push({ n: i.n, codigo: `C${j + 1}`, fase: "Contínuo" }));
  return out;
})();
export const CODIGO = new Map(ORDEM.map((o) => [o.n, o.codigo]));

// ---------------------------------------------------------------- entrada (dados brutos de uma clínica)

export interface StatusRegistro {
  marco: number;
  concluido_em: string | null;
  evidencia: string | null;
  observacao: string | null;
  estado: "manual" | "nao_se_aplica" | null;
  atualizado_por: string | null;
  atualizado_em: string | null;
  detectado_em: string | null;
  desfeito_em: string | null;
  desfeito_motivo: string | null;
}
export interface RotinaRegistro { marco: number; semana: string; feito_em: string; evidencia: string | null; feito_por: string | null }
export interface AcaoBruta { id: string; texto: string; lado: "clinica" | "dc"; responsavel: string | null; prazo: string | null; semana: string; status: string; origem: string }

export interface EntradaTarefas {
  hoje: string;
  clinica: {
    id: string; clientId: string; nome: string;
    d0: string | null; pausas: Pausa[]; ticket: number | null; drivePasta: string | null; decisor: string | null; coordenador: string | null;
    aceiteMetasEm: string | null; aceiteMetasPor: string | null; consultaPaga: boolean;
    categoriaMeta: CategoriaMeta | null; categoriaVerificadaEm: string | null; conferidoPor: string | null; conferidoEm: string | null;
    garantiaStatus: string | null;
  };
  /** null = sem permissão ou ainda carregando: não detecta (não marca nem desmarca). */
  fontes: { crm: boolean; whatsapp: boolean; anuncios: boolean; marcos: string[] } | null;
  plano: { kpi: KpiPlano; baseline: number | null; origem: string | null; meta: number | null }[] | null;
  status: StatusRegistro[];
  rotinas: RotinaRegistro[];
  acessos: RegistroAcesso[] | null;
  testes: RegistroTeste[] | null;
  acoes: AcaoBruta[] | null;
  saude: SemanaSaude[] | null;
  auditorias: string[] | null; // segundas com auditoria registrada
  fidelizacao: string[] | null; // segundas com fidelização registrada
  execucao: ItemRegistro[] | null;
  papeis: Partial<Record<PapelId, { userId: string; nome: string }>>;
  nomes: Map<string, string>; // user_id → nome (para "feito por")
}

// ---------------------------------------------------------------- saída

export type StatusTarefa = "a_fazer" | "auto" | "manual" | "nao_se_aplica";
export type Situacao = "atrasada" | "hoje" | "semana" | "depois" | "feita";

export interface Subtarefa {
  id: string;
  nome: string;
  papel: PapelId;
  feito: boolean;
  /** Feito pelo sistema (lido do dado) ou por alguém na tela de origem. */
  auto: boolean;
  prazo: string | null;
  detalhe?: string;
  tela?: Tela;
}

export interface Tarefa {
  n: number;
  codigo: string;
  fase: string;
  item: ItemCronograma;
  nome: string;
  papel: PapelId;
  pessoa: string | null;
  recorrente: boolean;
  janela: string; // "D1–D5"
  prazo: string; // dia útil (regra única)
  prazoCalendario: string; // dia do cronograma antes do ajuste
  status: StatusTarefa;
  situacao: Situacao;
  feitoEm: string | null;
  feitoPor: string | null;
  evidencia: string | null;
  observacao: string | null;
  desfeito: { em: string; motivo: string | null } | null;
  /** Item que o sistema sabe detectar (mesmo que ainda não detectado). */
  detectavel: boolean;
  subtarefas: Subtarefa[];
  /** Recorrentes: semana (segunda) a que o status se refere. */
  semana: string | null;
  manual: Manual;
}

export interface AlertaFundador { clinicaId: string; id: string; titulo: string; detalhe: string; tela: Tela }

const BRL_DIA = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
export const segundaDe = (iso: string) => somar(iso, -((BRL_DIA(iso) + 6) % 7));

/** Itens que o painel sabe detectar sozinho. */
export const DETECTAVEIS = new Set([1, 2, 5, 8, 11, 14, 29, 31]);

/** Dia útil anterior, sem sair da semana (segunda feriado: o prazo fica na própria segunda, não na sexta anterior). */
function naSemana(dia: string, segunda: string): string {
  const d = diaUtilAnterior(dia);
  return d < segunda ? dia : d;
}

function sub(id: string, nome: string, papel: PapelId, feito: boolean, extra: Partial<Subtarefa> = {}): Subtarefa {
  return { id, nome, papel, feito, auto: true, prazo: null, ...extra };
}

/** Subtarefas de cada item, lidas do dado. null = sem dado para avaliar (não detecta). */
function subtarefasDe(n: number, e: EntradaTarefas, dataDia: (d: number) => string, semana: string): Subtarefa[] | null {
  const c = e.clinica;
  switch (n) {
    case 1:
      return [sub("d0", "SAP ativado com o D0 definido", "comercial", !!c.d0, { tela: "/painel" })];
    case 2: {
      if (!e.fontes) return null;
      const f = e.fontes;
      const temEtapas = f.marcos.includes("agendado") && (f.marcos.includes("compareceu") || f.marcos.includes("faltou"));
      const faltaEtapa = [!f.marcos.includes("agendado") && "agendou", !(f.marcos.includes("compareceu") || f.marcos.includes("faltou")) && "compareceu ou faltou"].filter(Boolean).join(" e ");
      return [
        sub("crm", "CRM ligado", "coordenador", f.crm, { tela: "" }),
        sub("whatsapp", "WhatsApp ligado", "coordenador", f.whatsapp, { tela: "" }),
        sub("anuncios", "Conta de anúncios ligada", "trafego", f.anuncios, { tela: "" }),
        sub("etapas", "Etapas do CRM marcadas (agendou e compareceu/faltou)", "coordenador", temEtapas, { tela: "/etapas", detalhe: temEtapas ? undefined : `Falta marcar: ${faltaEtapa}.` }),
        sub("ticket", "Ticket médio cadastrado", "coordenador", !!c.ticket, { tela: "/painel" }),
        sub("ficha", "Ficha com decisor e coordenador", "coordenador", !!c.decisor && !!c.coordenador, { tela: "/onboarding" }),
        sub("pasta", "Pasta do Drive registrada", "coordenador", !!c.drivePasta, { tela: "/sessao" }),
      ];
    }
    case 5: {
      if (!e.acessos) return null;
      const m = new Map(e.acessos.map((r) => [r.item, r]));
      return ITENS_ACESSO.map((i) => {
        const r = m.get(i.id);
        return sub(`acesso-${i.id}`, i.nome, papelDoDono(i.quem), !!r && r.status !== "pendente", {
          auto: false, prazo: c.d0 ? dataDia(i.ate) : null, tela: "/onboarding",
          detalhe: i.prazo === "C" ? "Crítico: bloqueia a Sessão 1" : i.prazo === "P" ? "Complementar" : "Até a sessão que usa",
        });
      });
    }
    case 8: {
      if (!e.plano) return null;
      const garantia = kpisDaGarantia(c.consultaPaga);
      return garantia.map((k) => {
        const p = e.plano!.find((x) => x.kpi === k);
        const ok = !!p && p.baseline !== null && !!p.origem;
        return sub(`baseline-${k}`, `Ponto de partida de ${ROTULO_KPI[k] ?? k}`, "onboarding", ok, { tela: "/metas", detalhe: ok ? (p!.origem === "estimado" ? "estimado" : "medido") : "sem número: veja o que falta no card do KPI" });
      });
    }
    case 11: {
      if (!e.plano) return null;
      const garantia = kpisDaGarantia(c.consultaPaga);
      const comMeta = e.plano.filter((p) => garantia.includes(p.kpi) && p.meta !== null).length;
      return [
        sub("metas", "Metas D90 definidas (pelo menos 2 KPIs da garantia)", "condutor", comMeta >= 2, { tela: "/metas", detalhe: `${comMeta} de ${garantia.length} com meta` }),
        sub("aceite", "Aceite registrado (data e quem assinou)", "coordenador", !!c.aceiteMetasEm && !!c.aceiteMetasPor, { tela: "/cronograma" }),
      ];
    }
    case 14: {
      if (!e.testes) return null;
      const m = new Map(e.testes.map((r) => [r.item, r]));
      const testes = TESTES_RASTREIO.map((t) => {
        const st = m.get(t.n)?.status ?? "pendente";
        const ok = st === "aprovado" || (st === "nao_se_aplica" && dispensavel(t, c.categoriaMeta));
        return sub(`teste-${t.n}`, `Teste ${t.n} · ${t.nome}`, "trafego", ok, { auto: false, tela: "/rastreamento", detalhe: t.obrigatorio === "recomendado" ? "Recomendado" : st === "reprovado" ? "Reprovado" : undefined });
      });
      return [
        sub("categoria", "Categoria da fonte de dados registrada", "trafego", !!c.categoriaMeta, { tela: "/rastreamento" }),
        ...testes,
        sub("conferencia", "Conferência do Coordenador", "coordenador", !!c.conferidoPor, { tela: "/rastreamento" }),
      ];
    }
    case 29: {
      const ini = somar(semana, 0);
      const dia = c.d0 ? diaDoPrograma(c.d0, c.pausas, e.hoje) : null;
      const out: Subtarefa[] = [];
      if (e.acoes) out.push(sub("leitura", "Leitura da semana com uma ação de cada lado e resumo ao médico", "trafego", e.acoes.some((a) => a.semana === ini && a.origem === "leitura"), { prazo: naSemana(ini, ini), tela: "/leitura" }));
      if (e.auditorias) out.push(sub("auditoria", "Auditoria de 10 conversas", "cs", e.auditorias.includes(ini), { prazo: naSemana(somar(ini, 3), ini), tela: "/leitura" }));
      if (e.fidelizacao && dia !== null && dia >= 52) out.push(sub("fidelizacao", "Retornos, reativação e indicações da semana", "cs", e.fidelizacao.includes(ini), { prazo: naSemana(somar(ini, 4), ini), tela: "/leitura" }));
      const rc = recheckCategoria(c.categoriaVerificadaEm, e.hoje);
      if (dia !== null && dia >= 18 && dia <= 90) out.push(sub("categoria", "Rever a categoria saúde e bem-estar na Meta (a cada 15 dias)", "trafego", !rc.vencido, { prazo: e.hoje, tela: "/rastreamento" }));
      return out;
    }
    case 30: {
      if (!e.acoes) return [];
      return e.acoes.filter((a) => a.status === "aberta").map((a) => sub(`acao-${a.id}`, a.texto, a.lado === "clinica" ? "clinica" : papelDoDono(a.responsavel), false, {
        auto: false, prazo: a.prazo ?? somar(a.semana < semana ? a.semana : semana, 4), tela: "/leitura", detalhe: a.responsavel ? `Ação combinada · ${a.responsavel}` : "Ação combinada",
      }));
    }
    case 31: {
      const out: Subtarefa[] = [];
      const dia = c.d0 ? diaDoPrograma(c.d0, c.pausas, e.hoje) : null;
      const nSemana = dia === null ? null : Math.floor(Math.max(0, dia) / 7) + 1;
      if (e.saude) out.push(sub("saude", "Score de Saúde da semana lançado", "coordenador", nSemana !== null && e.saude.some((s) => s.semana === nSemana), { prazo: naSemana(somar(semana, 4), semana), tela: "/execucao" }));
      if (e.execucao) {
        const v = calcularExecucao(e.execucao, dia).vencidosSemStatus;
        out.push(sub("execucao", "Itens vencidos do Score de Execução com status", "coordenador", v === 0, { prazo: naSemana(somar(semana, 4), semana), tela: "/execucao", detalhe: v ? `${v} item(ns) sem status` : undefined }));
      }
      return out;
    }
    default:
      return [];
  }
}

const ROTULO_KPI: Partial<Record<KpiPlano, string>> = {
  resposta: "tempo de resposta", agendamento: "agendamento", comparecimento: "comparecimento", conversao: "conversão", custo_consulta: "custo por consulta",
};

/** Regra de "feito automaticamente" por item, a partir das subtarefas. */
function detectado(n: number, subs: Subtarefa[] | null, e: EntradaTarefas): boolean | null {
  if (subs === null) return null;
  if (n === 5) {
    const criticos = new Set(ITENS_ACESSO.filter((i) => i.prazo === "C").map((i) => `acesso-${i.id}`));
    return subs.filter((s) => criticos.has(s.id)).every((s) => s.feito);
  }
  if (n === 14) {
    if (!e.testes) return null;
    return resumoTestes(e.testes, e.clinica.categoriaMeta, e.clinica.conferidoPor).liberado;
  }
  if (n === 29) {
    const base = subs.filter((s) => s.id !== "categoria");
    return base.length > 0 && base.every((s) => s.feito);
  }
  if (!subs.length) return null;
  return subs.every((s) => s.feito);
}

/** Data mais confiável da detecção: a do próprio dado, quando existe; senão, a primeira vez que o painel viu. */
function dataDetectada(n: number, e: EntradaTarefas, reg: StatusRegistro | undefined): string {
  const c = e.clinica;
  if (n === 1 && c.d0) return c.d0;
  if (n === 11 && c.aceiteMetasEm) return c.aceiteMetasEm;
  if (n === 14 && c.conferidoEm) return c.conferidoEm;
  if (n === 5 && e.acessos) {
    const d = e.acessos.map((a) => a.confirmado_em).filter((x): x is string => !!x).sort().pop();
    if (d) return d;
  }
  return reg?.detectado_em ?? e.hoje;
}

/** Monta as 35 tarefas de uma clínica. Sem D0, devolve vazio (o cronograma conta a partir dele). */
export function montarTarefas(e: EntradaTarefas): Tarefa[] {
  const { hoje, clinica: c } = e;
  if (!c.d0) return [];
  const d0 = c.d0;
  const dataDia = (d: number) => dataDoDia(d0, c.pausas, d, hoje);
  const seg = segundaDe(hoje);
  const limite = somar(hoje, 7);
  const regs = new Map(e.status.map((s) => [s.marco, s]));
  const posicao = new Map(ORDEM.map((o, i) => [o.n, i]));

  return [...CRONOGRAMA].sort((a, b) => posicao.get(a.n)! - posicao.get(b.n)!).map((it) => {
    const reg = regs.get(it.n);
    const recorrente = it.tipo === "Recorrente";
    const papel = papelDoDono(it.dono);
    const dataIni = dataDia(it.ini);
    const dataFim = dataDia(it.fim);
    const subs = subtarefasDe(it.n, e, dataDia, seg);
    const det = DETECTAVEIS.has(it.n) ? detectado(it.n, subs, e) : null;
    const pessoa = e.papeis[papel]?.nome ?? null;
    const base = { n: it.n, codigo: CODIGO.get(it.n)!, fase: recorrente ? "Contínuo" : ORDEM.find((o) => o.n === it.n)!.fase, item: it, nome: it.nome, papel, pessoa, recorrente,
      janela: it.ini === it.fim ? `D${it.ini}` : `D${it.ini}–D${it.fim}`, detectavel: DETECTAVEIS.has(it.n), subtarefas: subs ?? [], manual: MANUAL[it.n],
      desfeito: reg?.desfeito_em ? { em: reg.desfeito_em.slice(0, 10), motivo: reg.desfeito_motivo } : null };

    if (recorrente) {
      // Semana atual: ativa se a janela cobre a semana; prazo no dia do rito.
      const ativa = dataIni <= somar(seg, 6) && dataFim >= seg;
      const diaRito = it.n === 30 ? 3 : it.n === 28 ? -1 : 4; // quinta para a call, sexta para o resto
      let prazoCal = somar(seg, Math.max(0, diaRito));
      let ativaSemana = ativa;
      if (it.n === 28) {
        const checkins = [66, 76, 86].map(dataDia).filter((d) => d >= seg && d <= somar(seg, 6));
        ativaSemana = checkins.length > 0;
        prazoCal = checkins[0] ?? prazoCal;
      }
      const rot = e.rotinas.find((r) => r.marco === it.n && r.semana === seg);
      // Subtarefas da rotina só contam com a janela aberta; a call (30) carrega as ações combinadas, que valem desde o kickoff.
      const pendSubs = ativaSemana || it.n === 30 ? (subs ?? []).filter((s) => !s.feito && s.prazo && s.prazo <= limite) : [];
      const feitoAuto = det === true;
      const status: StatusTarefa = rot ? "manual" : feitoAuto && ativaSemana ? "auto" : "a_fazer";
      const prazo = diaUtilAnterior(prazoCal);
      const encerrada = hoje > dataFim;
      const situacao: Situacao = encerrada ? "feita"
        : status !== "a_fazer" ? "feita"
          : !ativaSemana && pendSubs.length === 0 ? "depois"
            : hoje > prazo || pendSubs.some((s) => s.prazo! < hoje) ? "atrasada"
              : prazo === hoje || pendSubs.some((s) => s.prazo === hoje) ? "hoje" : "semana";
      return { ...base, prazo, prazoCalendario: prazoCal, status, situacao, semana: seg,
        feitoEm: rot?.feito_em ?? (feitoAuto ? hoje : null), feitoPor: rot?.feito_por ? e.nomes.get(rot.feito_por) ?? null : null, evidencia: rot?.evidencia ?? null, observacao: null };
    }

    const prazoCal = dataDia(it.alvo);
    const prazo = diaUtilAnterior(prazoCal);
    let status: StatusTarefa = "a_fazer";
    let feitoEm: string | null = null;
    let feitoPor: string | null = null;
    if (reg?.estado === "nao_se_aplica") { status = "nao_se_aplica"; feitoEm = reg.concluido_em; }
    else if (reg?.concluido_em) { status = "manual"; feitoEm = reg.concluido_em; }
    else if (det === true) { status = "auto"; feitoEm = dataDetectada(it.n, e, reg); }
    if (status === "manual" || status === "nao_se_aplica") feitoPor = reg?.atualizado_por ? e.nomes.get(reg.atualizado_por) ?? null : null;
    const situacao: Situacao = status !== "a_fazer" ? "feita" : hoje > prazo ? "atrasada" : hoje === prazo ? "hoje" : prazo <= limite ? "semana" : "depois";
    return { ...base, prazo, prazoCalendario: prazoCal, status, situacao, semana: null, feitoEm, feitoPor,
      evidencia: status === "auto" ? null : reg?.evidencia ?? null, observacao: reg?.observacao ?? null };
  });
}

/** Itens detectados agora e itens avaliados (para guardar a primeira data da detecção no banco). */
export function deteccoes(tarefas: Tarefa[], e: EntradaTarefas): { detectados: number[]; avaliados: number[] } {
  const avaliados = tarefas.filter((t) => t.detectavel && !t.recorrente && detectadoAvaliavel(t.n, e)).map((t) => t.n);
  return { detectados: tarefas.filter((t) => avaliados.includes(t.n) && t.status === "auto").map((t) => t.n), avaliados };
}
function detectadoAvaliavel(n: number, e: EntradaTarefas): boolean {
  if (n === 2) return !!e.fontes;
  if (n === 5) return !!e.acessos;
  if (n === 8 || n === 11) return !!e.plano;
  if (n === 14) return !!e.testes;
  return true;
}

// ---------------------------------------------------------------- contadores (um lugar só)

export interface Contadores {
  /** Itens pontuais (sem as 4 rotinas), menos os que não se aplicam. */
  total: number;
  feitos: number;
  auto: number;
  manual: number;
  naoSeAplica: number;
  atrasadas: number;
  hoje: number;
  semana: number;
  depois: number;
  rotinas: { feitas: number; ativas: number };
}

export function contarTarefas(t: Tarefa[]): Contadores {
  const pont = t.filter((x) => !x.recorrente);
  const rot = t.filter((x) => x.recorrente);
  const conta = (s: Situacao) => t.filter((x) => x.situacao === s).length;
  return {
    total: pont.filter((x) => x.status !== "nao_se_aplica").length,
    feitos: pont.filter((x) => x.status === "auto" || x.status === "manual").length,
    auto: pont.filter((x) => x.status === "auto").length,
    manual: pont.filter((x) => x.status === "manual").length,
    naoSeAplica: pont.filter((x) => x.status === "nao_se_aplica").length,
    atrasadas: conta("atrasada"),
    hoje: conta("hoje"),
    semana: conta("semana"),
    depois: conta("depois"),
    rotinas: { feitas: rot.filter((x) => x.status !== "a_fazer" && x.situacao === "feita" && x.semana).length, ativas: rot.filter((x) => x.situacao !== "depois" && !(x.situacao === "feita" && x.status === "a_fazer")).length },
  };
}

/** Esta semana = atrasadas + hoje + vencendo nos próximos 7 dias (inclui as rotinas da semana). */
export const daSemana = (t: Tarefa[]) => t.filter((x) => x.situacao === "atrasada" || x.situacao === "hoje" || x.situacao === "semana");

/** O item é do papel? Também conta quando alguma subtarefa aberta é do papel. */
export function ehDoPapel(t: Tarefa, papel: PapelId): boolean {
  return t.papel === papel || t.subtarefas.some((s) => !s.feito && s.papel === papel);
}

/** Papéis de execução sem pessoa atribuída (alerta de "Quem é quem"). */
export function papeisSemPessoa(papeis: EntradaTarefas["papeis"]): PapelId[] {
  return PAPEIS.filter((p) => !papeis[p.id]).map((p) => p.id);
}

const ORDEM_SITUACAO: Record<Situacao, number> = { atrasada: 0, hoje: 1, semana: 2, depois: 3, feita: 4 };
/** Ordena por urgência: situação, depois prazo. */
export function porUrgencia<T extends Pick<Tarefa, "situacao" | "prazo" | "codigo">>(a: T, b: T): number {
  return ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] || a.prazo.localeCompare(b.prazo) || a.codigo.localeCompare(b.codigo);
}

/** "vence em 2 dias", "vence hoje", "atrasada há 3 dias". */
export function rotuloPrazo(prazo: string, hoje: string): string {
  const d = entre(hoje, prazo);
  if (d < 0) return `atrasada há ${-d} dia${d === -1 ? "" : "s"}`;
  if (d === 0) return "vence hoje";
  return `vence em ${d} dia${d === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------- alertas ao Fundador (escalonamento, não tarefa)

export function alertasFundador(e: EntradaTarefas): AlertaFundador[] {
  const out: AlertaFundador[] = [];
  const c = e.clinica;
  if (e.saude && e.saude.length) {
    const r = resumoSaude(e.saude);
    if (r.vermelhasSeguidas >= 2) out.push({ clinicaId: c.id, id: "saude", titulo: "Duas semanas vermelhas no Score de Saúde", detalhe: `${r.vermelhasSeguidas} semanas seguidas em vermelho. Conversar com o Coordenador e decidir o plano.`, tela: "/execucao" });
  }
  const dia = c.d0 ? diaDoPrograma(c.d0, c.pausas, e.hoje) : null;
  if (dia !== null && dia >= 75 && dia <= 90 && (!c.garantiaStatus || c.garantiaStatus === "nao_avaliada")) {
    out.push({ clinicaId: c.id, id: "garantia", titulo: "Prévia da garantia a partir do D75", detalhe: "Conferir em Metas e garantia se a garantia tende a se aplicar e preparar o D90.", tela: "/metas" });
  }
  return out;
}

// Referência para quem lê o código: SESSOES liga cada sessão ao item do cronograma (cronoN).
export const SESSOES_DO_CRONOGRAMA = SESSOES.map((s) => s.cronoN);
