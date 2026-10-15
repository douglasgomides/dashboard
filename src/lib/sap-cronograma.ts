// SAP · Cronograma Mestre D0 a D90 (00.02) e pausa de prazo (01.02 §5). Lógica pura
// (teste: scripts/test-sap-cronograma.ts).
//
// - 35 itens, com janela (D+ início a D+ fim), dia-alvo, quem conduz e critério de pronto, iguais à planilha.
// - Dias corridos. Uma pausa formal empurra só os itens que começam depois do dia em que ela começou, e o D90.
// - Dia do programa = dias corridos desde o D0 menos os dias de pausa já passados.
// - Atraso do cliente: até 5 dias úteis acumulados não pausa; acima disso, pausa o que exceder 5.
//   Pausa a pedido da clínica: uma vez, até 15 dias corridos. Pausa máxima: 30 dias corridos.

export type TipoItem = "Marco" | "Sessão" | "Tarefa" | "Recorrente";

export interface ItemCronograma {
  n: number;
  fase: string;
  tipo: TipoItem;
  nome: string;
  ini: number;
  fim: number;
  alvo: number;
  dono: string;
  pronto: string;
  clinica: boolean; // a clínica participa
}

const I = (n: number, fase: string, tipo: TipoItem, nome: string, ini: number, fim: number, alvo: number, dono: string, pronto: string, clinica: boolean): ItemCronograma =>
  ({ n, fase, tipo, nome, ini, fim, alvo, dono, pronto, clinica });

export const CRONOGRAMA: ItemCronograma[] = [
  I(1, "Fechamento", "Marco", "D0 · Contrato assinado, pagamento e boas-vindas", 0, 0, 0, "Comercial", "Contrato assinado no ZapSign, pagamento confirmado no mesmo dia e M1 enviada em até 1 h", true),
  I(2, "Onboarding", "Tarefa", "Estrutura interna e Ficha do Cliente", 0, 1, 1, "Coordenador de Implementação", "Pasta e lista criadas com a mesma numeração; D0, D60 e D90 na 02.06", false),
  I(3, "Onboarding", "Sessão", "Kickoff com o fundador (20 a 30 min)", 1, 3, 3, "Fundador", "Decisor presente; ambição D90 e próximos passos registrados na 02.06", true),
  I(4, "Onboarding", "Tarefa", "Formulário pré-diagnóstico respondido", 1, 5, 3, "Clínica", "Resposta completa na planilha de respostas", true),
  I(5, "Onboarding", "Tarefa", "Acessos críticos confirmados (Meta, categoria da fonte de dados)", 2, 7, 7, "Gestor de Tráfego", "Acessos testados; classificação da fonte de dados anotada", true),
  I(6, "Onboarding", "Tarefa", "Entrada na comunidade", 3, 5, 3, "CS e Relacionamento", "Clínica no grupo e apresentada", true),
  I(7, "Diagnóstico", "Tarefa", "Análise pré-reunião e lead oculto", 3, 6, 5, "Analista de Onboarding", "03.01 preenchido com prints e tempos medidos", false),
  I(8, "Diagnóstico", "Sessão", "Reunião de coleta da Baseline D0 (60 min)", 3, 7, 7, "Analista de Onboarding", "03.03 preenchido, cada número marcado como medido ou estimado", true),
  I(9, "Diagnóstico", "Sessão", "Sessão 1 · Diagnóstico (90 a 120 min)", 8, 10, 10, "Fundador", "Sessão gravada; prioridade de ataque definida", true),
  I(10, "Diagnóstico", "Tarefa", "Relatório de Diagnóstico entregue (até 48 h)", 11, 12, 12, "Coordenador de Implementação", "PDF enviado à clínica em até 48 h da Sessão 1", false),
  I(11, "Paciente Ideal", "Sessão", "Sessão 2 · Paciente Ideal e Proposta de Valor + metas D90 assinadas", 12, 14, 14, "Fundador", "Serviço prioritário definido; 3 a 5 KPIs com baseline e meta D90 assinados", true),
  I(12, "Paciente Ideal", "Tarefa", "Documento Paciente Ideal entregue e aprovado", 15, 18, 16, "Coordenador de Implementação", "Documento enviado no D16 e aprovado pela clínica até o D18", false),
  I(13, "Atração", "Sessão", "Sessão 3 · Atração e Anúncios (90 min)", 16, 18, 17, "Gestor de Tráfego", "Canal, verba e custo-meta decididos e registrados no 05.10", true),
  I(14, "Atração", "Tarefa", "Rastreamento configurado (pixel, CAPI, tag Google, UTMs)", 17, 22, 22, "Gestor de Tráfego", "Eventos chegando no Gerenciador de Eventos e no Google", false),
  I(15, "Atração", "Sessão", "Gravação dirigida por videochamada (60 a 90 min)", 19, 22, 21, "Editor e Copy", "Arquivos brutos recebidos com 3 ganchos por vídeo", true),
  I(16, "Atração", "Tarefa", "Banco de criativos sem rosto e vídeos editados", 18, 26, 26, "Editor e Copy", "Pelo menos 6 peças sem rosto (D24) e vídeos editados (D26) na pasta de aprovados", false),
  I(17, "Conversa", "Sessão", "Sessão 4 · Conversa e Confirmação (90 a 120 min)", 20, 22, 21, "CS e Relacionamento", "Sessão feita; metas de atendimento definidas", true),
  I(18, "Conversa", "Tarefa", "Treino da recepção concluído e aprovado", 21, 27, 27, "CS e Relacionamento", "Cada atendente aprovado pelo critério do 06.07", true),
  I(19, "Conversa", "Tarefa", "Quaddro (ou caminho B) configurada e IA testada", 24, 28, 28, "CS e Relacionamento", "Cenários rodados 5 vezes, 100% nos eliminatórios; régua de confirmação ativa", false),
  I(20, "Lançamento", "Tarefa", "Conversão offline testada e Tracker compartilhado", 24, 28, 28, "Gestor de Tráfego", "Lead fictício aparece nas plataformas; Tracker com acesso da clínica", false),
  I(21, "Lançamento", "Tarefa", "Peças aprovadas pelo médico (semáforo e ciente)", 25, 27, 27, "Coordenador de Implementação", "Aprovação registrada; amarelos com ciente do médico", true),
  I(22, "Lançamento", "Marco", "Anúncios no ar", 28, 30, 29, "Gestor de Tráfego", "Campanhas ativas e entregando", false),
  I(23, "Venda", "Sessão", "Sessão 5 · Venda sem Vender e Follow-up (90 a 120 min)", 33, 37, 35, "CS e Relacionamento", "Simulação do médico aprovada pela rubrica do 07.01", true),
  I(24, "Venda", "Tarefa", "Cadências de follow-up e Registro de Decisão em uso", 36, 40, 40, "CS e Relacionamento", "Cadência ativa e primeiras decisões registradas", true),
  I(25, "Atração", "Sessão", "Segunda sessão de gravação", 43, 47, 45, "Editor e Copy", "Gravação feita com ângulos que performaram", true),
  I(26, "Fidelização", "Sessão", "Sessão 6 · Fidelização, Indicações e Controle (90 min)", 45, 50, 48, "Fundador", "Régua de relacionamento e indicação definidas (ativas até o D52)", true),
  I(27, "Fidelização", "Marco", "D60 · Checkpoint: sistema completo rodando", 60, 60, 60, "Coordenador de Implementação", "Todos os componentes com evidência de uso; ata na pasta", true),
  I(28, "Otimização", "Recorrente", "Check-ins quinzenais 1:1 (30 min): D66, D76, D86", 61, 89, 66, "Coordenador de Implementação", "Ajustes combinados e anotados após cada check-in", true),
  I(29, "Otimização", "Recorrente", "Rotina semanal de tráfego e auditoria de conversas", 29, 89, 35, "Gestor de Tráfego", "Relatório de mídia e auditoria de 10 conversas registrados toda semana", false),
  I(30, "Contínuo", "Recorrente", "Call em grupo semanal (60 a 90 min), a partir da semana 2", 7, 90, 10, "Fundador", "Presença ou gravação registrada no 09.03", true),
  I(31, "Contínuo", "Recorrente", "Score de Saúde semanal", 7, 90, 7, "Coordenador de Implementação", "Score lançado toda semana", false),
  I(32, "Encerramento", "Tarefa", "Score de Execução, Relatório D90 e Playbook prontos", 86, 89, 88, "Coordenador de Implementação", "Relatório revisado pelo fundador", false),
  I(33, "Encerramento", "Sessão", "D90 · Reunião de encerramento", 90, 90, 90, "Fundador", "Resultado x meta, garantia avaliada e proposta de manutenção registradas", true),
  I(34, "Pós-contrato", "Tarefa", "Offboarding: revogação de acessos (se não houver manutenção)", 91, 95, 95, "Gestor de Tráfego", "Datas de revogação registradas na 02.06", false),
  I(35, "Pós-contrato", "Tarefa", "Retenção LGPD: apagar gravações e prints", 91, 120, 120, "Coordenador de Implementação", "Arquivos apagados e registro na 02.06", false),
];

// ---------------------------------------------------------------- datas

const MS = 86_400_000;
export const somar = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * MS).toISOString().slice(0, 10);
export const entre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / MS);

export interface Pausa {
  id?: string;
  tipo: "atraso_cliente" | "pedido_clinica";
  inicio: string;
  fim: string | null; // aberta
  motivo?: string | null;
}

/** Dias de uma pausa até `hoje` (pausa aberta conta até hoje). Inclui o dia de início, não o de fim. */
export function diasDaPausa(p: Pausa, hoje: string): number {
  const ate = p.fim ?? hoje;
  return Math.max(0, entre(p.inicio, ate < p.inicio ? p.inicio : ate));
}

/** Dia do programa num dia qualquer: dias corridos desde o D0 menos os dias de pausa já passados. */
export function diaDoPrograma(d0: string, pausas: Pausa[], hoje: string): number {
  const corridos = entre(d0, hoje);
  const pausados = pausas.filter((p) => p.inicio <= hoje).reduce((a, p) => a + diasDaPausa(p, hoje), 0);
  return corridos - pausados;
}

/** Data real de um dia do programa: uma pausa que começou no dia P do programa empurra os dias depois de P (00.02). */
export function dataDoDia(d0: string, pausas: Pausa[], dia: number, hoje: string): string {
  const ord = [...pausas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  let empurra = 0;
  ord.forEach((p, i) => {
    const P = diaDoPrograma(d0, ord.slice(0, i), p.inicio);
    if (dia > P) empurra += diasDaPausa(p, hoje);
  });
  return somar(d0, dia + empurra);
}

export type StatusItem = "feito" | "atrasado" | "agora" | "proximo" | "futuro";

export interface ItemComData extends ItemCronograma {
  dataIni: string;
  dataFim: string;
  dataAlvo: string;
  dataUtil: string; // data útil sugerida (só para marcar reunião)
  status: StatusItem;
  concluidoEm: string | null;
  evidencia: string | null;
}

/** Sábado/domingo: o alvo vai para o próximo dia útil; se o alvo é o último dia da janela, para o dia útil anterior. */
export function dataUtilSugerida(alvo: string, ehFimDaJanela: boolean): string {
  const dow = new Date(`${alvo}T12:00:00Z`).getUTCDay();
  if (dow !== 0 && dow !== 6) return alvo;
  if (ehFimDaJanela) return somar(alvo, dow === 6 ? -1 : -2);
  return somar(alvo, dow === 6 ? 2 : 1);
}

export function cronogramaComDatas(
  d0: string,
  pausas: Pausa[],
  hoje: string,
  concluidos: Map<number, { concluidoEm: string | null; evidencia: string | null }> = new Map(),
): ItemComData[] {
  return CRONOGRAMA.map((it) => {
    const dataIni = dataDoDia(d0, pausas, it.ini, hoje);
    const dataFim = dataDoDia(d0, pausas, it.fim, hoje);
    const dataAlvo = dataDoDia(d0, pausas, it.alvo, hoje);
    const c = concluidos.get(it.n);
    const feito = !!c?.concluidoEm;
    const status: StatusItem = feito
      ? "feito"
      : it.tipo !== "Recorrente" && hoje > dataFim
        ? "atrasado"
        : hoje >= dataIni && hoje <= dataFim
          ? "agora"
          : hoje < dataIni && entre(hoje, dataIni) <= 7
            ? "proximo"
            : "futuro";
    return { ...it, dataIni, dataFim, dataAlvo, dataUtil: dataUtilSugerida(dataAlvo, it.alvo === it.fim), status, concluidoEm: c?.concluidoEm ?? null, evidencia: c?.evidencia ?? null };
  });
}

// ---------------------------------------------------------------- regras de pausa (01.02 §5)

export interface Atraso { data: string; dias_uteis: number; categoria: string; descricao?: string | null }

export interface ResumoPausas {
  diasPausados: number; // total corrido até hoje
  diasAtraso: number; // dias úteis de atraso do cliente acumulados
  pausaDevida: number; // dias úteis que excedem 5 e ainda não viraram pausa (aprox.)
  pedidoUsado: boolean;
  avisos: string[];
  d90: string;
  d60: string;
  janelaGarantia: { de: string; ate: string };
}

export function resumoPausas(d0: string, pausas: Pausa[], atrasos: Atraso[], hoje: string): ResumoPausas {
  const diasPausados = pausas.reduce((a, p) => a + diasDaPausa(p, hoje), 0);
  const diasAtraso = atrasos.reduce((a, x) => a + x.dias_uteis, 0);
  const pausadoPorAtraso = pausas.filter((p) => p.tipo === "atraso_cliente").reduce((a, p) => a + diasDaPausa(p, hoje), 0);
  const pedidos = pausas.filter((p) => p.tipo === "pedido_clinica");
  const avisos: string[] = [];
  const excedente = Math.max(0, diasAtraso - 5);
  // Comparação aproximada: dias úteis excedentes contra dias corridos já pausados por atraso (5 úteis ≈ 7 corridos).
  const pausaDevida = Math.max(0, excedente - Math.round((pausadoPorAtraso * 5) / 7));
  if (pausaDevida > 0) avisos.push(`Atrasos do cliente somam ${diasAtraso} dias úteis: ${excedente} acima da folga de 5. Registre a pausa e avise a clínica por escrito.`);
  if (pedidos.length > 1) avisos.push("A clínica só pode pedir pausa uma vez por contrato.");
  for (const p of pedidos) if (diasDaPausa(p, hoje) > 15) avisos.push("Pausa a pedido da clínica passou de 15 dias corridos.");
  if (diasPausados > 30) avisos.push(`Pausas somam ${diasPausados} dias: acima do máximo de 30. O Fundador decide entre encerrar ou retomar.`);
  const aberta = pausas.find((p) => !p.fim);
  if (aberta) avisos.push(`Prazo pausado desde ${aberta.inicio.split("-").reverse().join("/")}.`);
  return {
    diasPausados,
    diasAtraso,
    pausaDevida,
    pedidoUsado: pedidos.length > 0,
    avisos,
    d90: dataDoDia(d0, pausas, 90, hoje),
    d60: dataDoDia(d0, pausas, 60, hoje),
    janelaGarantia: { de: dataDoDia(d0, pausas, 62, hoje), ate: dataDoDia(d0, pausas, 89, hoje) },
  };
}

/** Itens que viram marcos na linha do tempo (sessões e marcos com dia-alvo), para o resumo e o portfólio. */
export const MARCOS_PRINCIPAIS = CRONOGRAMA.filter((i) => i.tipo === "Marco" || i.tipo === "Sessão").map((i) => ({ dia: i.alvo, nome: i.nome, n: i.n }));
