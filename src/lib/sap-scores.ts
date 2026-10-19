// SAP · Score de Execução e Score de Saúde do cliente (11.04). Lógica pura (teste: scripts/test-sap-scores.ts).
//
// Score de Execução: se a CLÍNICA fez a parte dela. 20 itens em 4 fases, com peso e prazo (dia D).
//   Cumprido = 100% do peso; Parcial = 50%; Não cumprido = 0; Pendente = ainda não venceu (no % do D90
//   conta zero); Não se aplica = sai da conta. Cumprido/Parcial sem evidência vale Não cumprido.
//   % do D90 ≥ 80% é a condição A da garantia (01.02).
// Score de Saúde: nota semanal de 0 a 10 com 5 componentes; pesos mudam na implantação (S1–S4) e na
//   operação (S5–S13). Componente sem dado sai da conta. Verde ≥ 8, amarelo 5 a 7,9, vermelho < 5.
//   Bloqueios: sentimento do Coordenador vermelho → semana vermelha; 2+ KPIs da garantia vermelhos a
//   partir da S9 com nota verde → amarelo.

export type StatusItem = "Cumprido" | "Parcial" | "Não cumprido" | "Pendente" | "Não se aplica";
export const STATUS_ITEM: StatusItem[] = ["Pendente", "Cumprido", "Parcial", "Não cumprido", "Não se aplica"];

export interface ItemCatalogo {
  n: number;
  fase: 1 | 2 | 3 | 4;
  categoria: "Prazos" | "Presença" | "Treino" | "Gravação" | "Registro" | "Uso" | "Verba";
  item: string;
  comprovar: string;
  prazo: number; // dia D
  peso: number;
}

export const FASES = { 1: "D0 a D14", 2: "D15 a D30", 3: "D31 a D60", 4: "D61 a D90" } as const;

export const ITENS_EXECUCAO: ItemCatalogo[] = [
  { n: 1, fase: 1, categoria: "Prazos", item: "Formulário pré-diagnóstico respondido", comprovar: "Resposta registrada no formulário", prazo: 5, peso: 1 },
  { n: 2, fase: 1, categoria: "Prazos", item: "Acessos e dados do checklist entregues", comprovar: "Checklist 100% no ClickUp", prazo: 5, peso: 2 },
  { n: 3, fase: 1, categoria: "Presença", item: "Decisor no kickoff e na Sessão 1 · Diagnóstico", comprovar: "Lista de presença da gravação", prazo: 10, peso: 2 },
  { n: 4, fase: 1, categoria: "Prazos", item: "Agenda, financeiro e WhatsApp abertos na reunião de baseline", comprovar: "Raio-X com a coluna Medido preenchida", prazo: 7, peso: 1 },
  { n: 5, fase: 1, categoria: "Presença", item: "Decisor na Sessão 2 e metas D90 assinadas", comprovar: "Plano de metas assinado", prazo: 14, peso: 2 },
  { n: 6, fase: 2, categoria: "Presença", item: "Decisor na Sessão 3 · Atração e Anúncios", comprovar: "Lista de presença", prazo: 18, peso: 1 },
  { n: 7, fase: 2, categoria: "Prazos", item: "Peças aprovadas em até 2 dias úteis (todas as rodadas até o D30)", comprovar: "Datas de envio e aprovação no ClickUp", prazo: 30, peso: 2 },
  { n: 8, fase: 2, categoria: "Gravação", item: "Gravação dirigida feita na data combinada e termo de imagem assinado", comprovar: "Arquivos brutos e termo no Drive", prazo: 22, peso: 2 },
  { n: 9, fase: 2, categoria: "Treino", item: "Recepção liberada e aprovada no treino", comprovar: "Planilha de treino com aprovação", prazo: 28, peso: 3 },
  { n: 10, fase: 2, categoria: "Verba", item: "Verba de mídia carregada na data de subida dos anúncios", comprovar: "Print do saldo ou forma de pagamento ativa", prazo: 28, peso: 2 },
  { n: 11, fase: 3, categoria: "Presença", item: "Médico na Sessão 5 com simulação de consulta aprovada", comprovar: "Rubrica aprovada (6 de 7 ou mais)", prazo: 37, peso: 2 },
  { n: 12, fase: 3, categoria: "Presença", item: "Decisor na Sessão 6 · Fidelização, Indicações e Controle", comprovar: "Lista de presença", prazo: 50, peso: 1 },
  { n: 13, fase: 3, categoria: "Uso", item: "Régua de confirmação em uso", comprovar: "Auditoria semanal: confirmação em 90% ou mais dos agendados", prazo: 45, peso: 2 },
  { n: 14, fase: 3, categoria: "Registro", item: "Registro de decisão preenchido em toda primeira consulta", comprovar: "90% ou mais das consultas com registro", prazo: 60, peso: 2 },
  { n: 15, fase: 3, categoria: "Registro", item: "CRM com 90% ou mais das linhas completas (D31 a D60)", comprovar: "Linhas completas no painel", prazo: 60, peso: 2 },
  { n: 16, fase: 3, categoria: "Uso", item: "Régua de relacionamento e processo de indicação ativados", comprovar: "Primeiro lote enviado e código IND em uso", prazo: 55, peso: 1 },
  { n: 17, fase: 4, categoria: "Uso", item: "Atendimento com nota média 10 de 12 ou mais na auditoria (últimas 4 semanas)", comprovar: "Auditoria semanal de conversas", prazo: 89, peso: 2 },
  { n: 18, fase: 4, categoria: "Uso", item: "Cadências de follow-up ativas em 90% ou mais dos \"pensando\"", comprovar: "\"Pensando\" com cadência ativa", prazo: 89, peso: 2 },
  { n: 19, fase: 4, categoria: "Registro", item: "CRM com 90% ou mais das linhas completas (D61 a D89)", comprovar: "Linhas completas no painel", prazo: 89, peso: 3 },
  { n: 20, fase: 4, categoria: "Verba", item: "Verba combinada mantida do D28 ao D90", comprovar: "Gasto semanal dentro de 80% da verba combinada", prazo: 89, peso: 3 },
];

export interface ItemRegistro {
  item: number;
  status: StatusItem;
  data_cumpriu: string | null;
  evidencia: string | null;
  observacao: string | null;
}

const credito = (s: StatusItem) => (s === "Cumprido" ? 1 : s === "Parcial" ? 0.5 : 0);

export interface ResultadoExecucao {
  atual: number | null; // só itens vencidos (ou já com status final)
  d90: number | null; // pendente = 0; é o número da garantia
  semEvidencia: number; // Cumprido/Parcial sem evidência (valem Não cumprido)
  habilita: string;
  porCategoria: { categoria: string; total: number; obtido: number; pct: number | null }[];
  porFase: { fase: number; rotulo: string; total: number; obtido: number; pct: number | null }[];
  vencidosSemStatus: number; // itens vencidos ainda marcados como Pendente
}

/** Status efetivo: Cumprido/Parcial sem evidência vale Não cumprido (regra 3). */
export function statusEfetivo(r: ItemRegistro | undefined): StatusItem {
  const s = r?.status ?? "Pendente";
  if ((s === "Cumprido" || s === "Parcial") && !r?.evidencia?.trim()) return "Não cumprido";
  return s;
}

export function calcularExecucao(registros: ItemRegistro[], dia: number | null): ResultadoExecucao {
  const por = new Map(registros.map((r) => [r.item, r]));
  let pesoVenc = 0, obtVenc = 0, pesoTot = 0, obtTot = 0, semEvidencia = 0, vencidosSemStatus = 0;
  const cat = new Map<string, { total: number; obtido: number }>();
  const fase = new Map<number, { total: number; obtido: number }>();
  for (const it of ITENS_EXECUCAO) {
    const reg = por.get(it.n);
    const bruto = reg?.status ?? "Pendente";
    if (bruto === "Não se aplica") continue;
    if ((bruto === "Cumprido" || bruto === "Parcial") && !reg?.evidencia?.trim()) semEvidencia++;
    const s = statusEfetivo(reg);
    const c = credito(s);
    const vencido = (dia !== null && dia >= it.prazo) || s === "Cumprido" || s === "Parcial" || s === "Não cumprido";
    if (vencido) {
      pesoVenc += it.peso;
      obtVenc += it.peso * c;
    }
    if (dia !== null && dia >= it.prazo && bruto === "Pendente") vencidosSemStatus++;
    pesoTot += it.peso;
    obtTot += it.peso * c;
    const a = cat.get(it.categoria) ?? { total: 0, obtido: 0 };
    a.total += it.peso; a.obtido += it.peso * c; cat.set(it.categoria, a);
    const f = fase.get(it.fase) ?? { total: 0, obtido: 0 };
    f.total += it.peso; f.obtido += it.peso * c; fase.set(it.fase, f);
  }
  const atual = pesoVenc > 0 ? obtVenc / pesoVenc : null;
  const d90 = pesoTot > 0 ? obtTot / pesoTot : null;
  const habilita =
    d90 === null
      ? "Sem dado"
      : dia !== null && dia >= 85
        ? d90 >= 0.8 ? "Sim: execução cumprida (80% ou mais no D90)" : "Não: execução abaixo de 80% no D90"
        : atual === null ? "Ainda sem itens vencidos ou avaliados: Score atual não disponível" : atual >= 0.8 ? "Prévia: no caminho (80% ou mais nos itens vencidos)" : "Prévia: abaixo de 80% nos itens vencidos. Avisar a clínica";
  return {
    atual,
    d90,
    semEvidencia,
    habilita,
    vencidosSemStatus,
    porCategoria: [...cat.entries()].map(([categoria, v]) => ({ categoria, ...v, pct: v.total ? v.obtido / v.total : null })),
    porFase: [...fase.entries()].sort((a, b) => a[0] - b[0]).map(([f, v]) => ({ fase: f, rotulo: `${f} · ${FASES[f as 1]}`, ...v, pct: v.total ? v.obtido / v.total : null })),
  };
}

// ---------------------------------------------------------------- Score de Saúde semanal

export interface SemanaSaude {
  semana: number; // 1 = S1
  tarefas_no_prazo: number | null; // 0 a 1
  sessoes_marcadas: number | null;
  sessoes_com_decisor: number | null;
  call_grupo: "Sim" | "Não" | "Sem call" | null;
  decisor_respondeu: "Sim" | "Parcial" | "Não" | null;
  tempo_resposta_h: number | null; // horas úteis
  kpis_verde: number | null;
  kpis_vermelho: number | null;
  sentimento: "Verde" | "Amarelo" | "Vermelho" | null;
  o_que_aconteceu: string | null;
}

export const PESOS_SAUDE = {
  implantacao: { entregas: 0.35, presenca: 0.25, engajamento: 0.2, suporte: 0.2, kpis: 0 },
  operacao: { entregas: 0.2, presenca: 0.15, engajamento: 0.15, suporte: 0.1, kpis: 0.4 },
} as const;

export type Componente = keyof (typeof PESOS_SAUDE)["operacao"];
export const ROTULO_COMPONENTE: Record<Componente, string> = {
  entregas: "Entregas da clínica no prazo",
  presenca: "Presença em sessões e check-ins",
  engajamento: "Engajamento do decisor",
  suporte: "Resposta ao suporte",
  kpis: "KPIs da garantia",
};

export type CorSaude = "Verde" | "Amarelo" | "Amarelo (2 KPIs em vermelho)" | "Vermelho" | "Vermelho (sentimento)" | "Sem dado";

export interface NotaSemana {
  semana: number;
  fase: "Implantação" | "Operação";
  componentes: Record<Componente, number | null>;
  nota: number | null;
  cor: CorSaude;
}

export function componentesDaSemana(s: SemanaSaude): Record<Componente, number | null> {
  const entregas = s.tarefas_no_prazo === null ? null : Math.min(10, s.tarefas_no_prazo * 10);
  const presenca = !s.sessoes_marcadas || s.sessoes_com_decisor === null ? null : Math.min(10, (s.sessoes_com_decisor / s.sessoes_marcadas) * 10);
  const temCall = s.call_grupo !== null && s.call_grupo !== "Sem call";
  const engajamento =
    !temCall && s.decisor_respondeu === null
      ? null
      : ((temCall ? (s.call_grupo === "Sim" ? 10 : 0) : 0) + (s.decisor_respondeu === null ? 0 : s.decisor_respondeu === "Sim" ? 10 : s.decisor_respondeu === "Parcial" ? 5 : 0)) /
        ((temCall ? 1 : 0) + (s.decisor_respondeu === null ? 0 : 1));
  const t = s.tempo_resposta_h;
  const suporte = t === null ? null : t <= 8 ? 10 : t <= 24 ? 7 : t <= 48 ? 4 : 0;
  const kpis = s.kpis_verde === null || s.kpis_vermelho === null ? null : (s.kpis_verde * 10 + Math.max(0, 3 - s.kpis_verde - s.kpis_vermelho) * 6) / 3;
  return { entregas, presenca, engajamento, suporte, kpis };
}

export function notaDaSemana(s: SemanaSaude): NotaSemana {
  const fase = s.semana <= 4 ? "Implantação" : "Operação";
  const pesos = s.semana <= 4 ? PESOS_SAUDE.implantacao : PESOS_SAUDE.operacao;
  const comp = componentesDaSemana(s);
  let soma = 0, pesoUsado = 0;
  for (const k of Object.keys(pesos) as Componente[]) {
    const v = comp[k];
    if (v === null || pesos[k] === 0) continue;
    soma += v * pesos[k];
    pesoUsado += pesos[k];
  }
  const nota = pesoUsado > 0 ? soma / pesoUsado : null;
  let cor: CorSaude;
  if (nota === null) cor = "Sem dado";
  else if (s.sentimento === "Vermelho") cor = "Vermelho (sentimento)";
  else if (s.semana >= 9 && (s.kpis_vermelho ?? 0) >= 2 && nota >= 8) cor = "Amarelo (2 KPIs em vermelho)";
  else cor = nota >= 8 ? "Verde" : nota >= 5 ? "Amarelo" : "Vermelho";
  return { semana: s.semana, fase, componentes: comp, nota, cor };
}

export interface ResumoSaude {
  ultima: NotaSemana | null;
  media4: number | null;
  vermelhasSeguidas: number;
  amarelasSeguidas: number;
  semanas: NotaSemana[];
}

export function resumoSaude(semanas: SemanaSaude[]): ResumoSaude {
  const notas = [...semanas].sort((a, b) => a.semana - b.semana).map(notaDaSemana).filter((n) => n.nota !== null);
  const ultima = notas.at(-1) ?? null;
  const ult4 = notas.slice(-4);
  const media4 = ult4.length ? ult4.reduce((s, n) => s + (n.nota ?? 0), 0) / ult4.length : null;
  const seguidas = (pref: string) => {
    let n = 0;
    for (let i = notas.length - 1; i >= 0 && notas[i].cor.startsWith(pref); i--) n++;
    return n;
  };
  return { ultima, media4, vermelhasSeguidas: seguidas("Vermelho"), amarelasSeguidas: seguidas("Amarelo"), semanas: notas };
}

/** KPIs da garantia no semáforo: verde = na meta; vermelho = igual ou pior que a baseline; o resto, amarelo. */
export function semaforoKpis(itens: { valor: number | null; baseline: number | null; meta: number | null; menorMelhor: boolean }[]): { verde: number; vermelho: number } | null {
  const medidos = itens.filter((i) => i.valor !== null && i.baseline !== null);
  if (!medidos.length) return null;
  let verde = 0, vermelho = 0;
  for (const i of medidos) {
    const v = i.valor!, b = i.baseline!;
    const naMeta = i.meta !== null && (i.menorMelhor ? v <= i.meta : v >= i.meta);
    const pior = i.menorMelhor ? v >= b : v <= b;
    if (naMeta) verde++;
    else if (pior) vermelho++;
  }
  return { verde, vermelho };
}

// ---------------------------------------------------------------- plano de ação por cor (11.04)

export interface AcaoPorCor {
  situacao: string;
  significa: string;
  acao: string;
  dono: string;
  prazo: string;
  escala: string;
}

export const PLANO_POR_COR: AcaoPorCor[] = [
  { situacao: "Verde", significa: "Clínica executando e números andando", acao: "Manter a rotina. Reconhecer em público na call em grupo quando houver número para mostrar. Avaliar caso para depoimento no D60.", dono: "Coordenador de Implementação", prazo: "Rotina", escala: "Ninguém" },
  { situacao: "Amarelo (1 semana)", significa: "Algo escorregou", acao: "Mensagem curta ao decisor com o ponto fraco e uma pergunta (\"o que travou?\"). Ajustar a tarefa no ClickUp. Sem tom de cobrança.", dono: "Coordenador de Implementação", prazo: "Até segunda", escala: "Ninguém" },
  { situacao: "Amarelo (2 semanas seguidas)", significa: "Risco crescendo", acao: "Check-in extra de 20 min com o decisor. Plano com no máximo 2 ações.", dono: "Coordenador de Implementação", prazo: "Em até 3 dias úteis", escala: "Fundador fica informado no status de sexta" },
  { situacao: "Amarelo (2 KPIs em vermelho)", significa: "Clínica faz a parte dela e o número não sai", acao: "Leitura completa da semana com o Gestor de Tráfego e o CS. Escolher o vazamento principal e uma ação por semana. Prévia da garantia.", dono: "Coordenador + Gestor de Tráfego", prazo: "Na leitura de segunda", escala: "Fundador se seguir assim por 2 semanas" },
  { situacao: "Vermelho", significa: "Conta em risco de resultado ou de relacionamento", acao: "Ligação do Coordenador com o decisor em 24 h. Diagnóstico da causa (execução, resultado, expectativa). Plano escrito de 2 semanas com metas semanais.", dono: "Coordenador de Implementação", prazo: "24 h", escala: "Fundador no mesmo dia (3 linhas: o que, por que, o que proponho)" },
  { situacao: "Vermelho (2 semanas seguidas)", significa: "Risco de cancelamento ou de garantia", acao: "Conversa do Fundador com o decisor (20 a 30 min). Revisar se cabe pausa do prazo ou mudança de serviço prioritário.", dono: "Fundador", prazo: "Em até 2 dias úteis", escala: "Decisão do Fundador registrada" },
  { situacao: "Vermelho (sentimento)", significa: "O Coordenador sente risco mesmo com números bons", acao: "Registrar o motivo em 1 linha. Mesmo fluxo do vermelho. O sentimento só volta a verde com uma conversa que resolva o motivo.", dono: "Coordenador de Implementação", prazo: "24 h", escala: "Fundador" },
];

export const ACAO_COMPONENTE: Record<Componente, { causa: string; acao: string; dono: string; prazo: string }> = {
  entregas: { causa: "Decisor centraliza aprovação ou equipe sem tempo", acao: "Combinar um aprovador substituto e um horário fixo por semana para aprovações.", dono: "Coordenador de Implementação", prazo: "Na semana" },
  presenca: { causa: "Agenda do médico cheia", acao: "Fixar sessões e check-ins na agenda da clínica até o D90. Reagendar sempre com 24 h de aviso.", dono: "Coordenador de Implementação", prazo: "Na semana" },
  engajamento: { causa: "Decisor sem ver valor ou sem tempo", acao: "Mostrar um número da clínica que melhorou. Convidar para a call com um tema que ataca o vazamento dele.", dono: "CS e Relacionamento", prazo: "Até a próxima call" },
  suporte: { causa: "Ninguém da clínica dono da relação com a DC", acao: "Definir um ponto focal na clínica com substituto. Grupo de WhatsApp só com essas pessoas.", dono: "CS e Relacionamento", prazo: "Em 2 dias úteis" },
  kpis: { causa: "Vazamento não tratado ou registro incompleto", acao: "Rodar a leitura da semana. Conferir antes se o CRM tem 90% das linhas completas.", dono: "Coordenador + Gestor de Tráfego", prazo: "Na leitura de segunda" },
};

/** Ação para a situação atual (cor da última semana + sequência). */
export function acaoDaSituacao(r: ResumoSaude): AcaoPorCor | null {
  const c = r.ultima?.cor;
  if (!c || c === "Sem dado") return null;
  const achar = (s: string) => PLANO_POR_COR.find((p) => p.situacao === s)!;
  if (c === "Vermelho (sentimento)") return achar("Vermelho (sentimento)");
  if (c === "Vermelho") return r.vermelhasSeguidas >= 2 ? achar("Vermelho (2 semanas seguidas)") : achar("Vermelho");
  if (c === "Amarelo (2 KPIs em vermelho)") return achar("Amarelo (2 KPIs em vermelho)");
  if (c === "Amarelo") return r.amarelasSeguidas >= 2 ? achar("Amarelo (2 semanas seguidas)") : achar("Amarelo (1 semana)");
  return achar("Verde");
}
