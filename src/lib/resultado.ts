// Tela Resultado: monta, em ordem, as respostas de quem abre o painel.
//   1. O que aconteceu?      → resumoExecutivo + métricas
//   2. É bom ou ruim?        → status de cada métrica (mercado quando há fonte sólida; senão o próprio histórico)
//   3. Por que aconteceu?    → insights (diagnóstico + evidência)
//   4. O que fazer agora?    → proximaAcao + semana (ordenado por prioridade)
//   5. O que está incompleto → cobertura + limitações
//
// Lógica pura. Junta as regras da leitura do período (leitura-periodo.ts),
// o cruzamento leads x engajamento (cruzamento.ts) e os benchmarks.
import { lerPeriodo, type Achado } from "@/lib/leitura-periodo";
import { cruzar, type EntradaCruzamento } from "@/lib/cruzamento";
import { insightsDeAnuncios, limitacoesDeAnuncios, type DiagnosticoAds } from "@/lib/anuncios-objetivo";
import { BENCHMARKS, avaliar, type Faixa } from "@/lib/benchmarks";
import { ordenarPorScore } from "@/lib/oportunidades";
import { confiancaPorAmostra, type Insight, type Limitacao, type Responsavel, type Area, type Tom } from "@/lib/insight";

export interface EntradaResultado {
  start: string;
  end: string;
  hoje: string;
  diario: { date: string; reach?: number | null; new_followers?: number | null; unfollowers?: number | null; total_interactions?: number | null; followers_count?: number | null; saves?: number | null }[];
  diarioAnterior?: EntradaResultado["diario"];
  posts: any[];
  periodoIg?: { alcance_unico?: number | null; interacoes?: number | null; salvamentos?: number | null; de: string; ate: string; recortado?: boolean } | null;
  adsDiag?: DiagnosticoAds | null;
  adsPorDia?: { dia: string; gasto: number | null; conversas?: number | null }[];
  wts?: { atendimentos?: number | null; espera_mediana_seg?: number | null; sem_roteamento?: number | null } | null;
  crm?: { novos: number; ganhos: number } | null;
  leadsPorDia?: { dia: string; total: number }[];
  fontes?: { tem_instagram?: boolean; tem_anuncios?: boolean; tem_crm?: boolean; tem_atendimento?: boolean } | null;
  problemasDados?: Insight[]; // dado com erro (qualidade_dados); ids começam com "dado-"
}

export interface Metrica {
  id: string;
  rotulo: string;
  valor: string;
  explicacao: string; // "O que é isso?" em uma frase
  status: Tom | null; // null = sem régua confiável, não pinta
  statusTexto?: string; // ex.: "acima do mercado (≥ 5%)"
  selo?: string; // texto do selo; padrão: Bom/Atenção/Ruim
  comparacao?: string; // ex.: "+32% vs. 30 dias anteriores"
  fonte?: string;
  rota?: string;
  botao?: string;
}

export interface Cobertura {
  diasPeriodo: number;
  diasComDado: number;
  diasAbertos: number; // hoje/ontem: a Meta ainda está fechando
  primeiroDado: string | null;
  ultimoDado: string | null;
  alertas: { tom: Tom; texto: string }[];
}

export interface Resultado {
  veredito: { tom: Tom | "neutro"; titulo: string };
  resumo: string[]; // o que aconteceu, 3–5 frases simples
  metricas: Metrica[];
  insights: Insight[]; // já ordenados por prioridade
  proximaAcao: Insight | null;
  semana: Insight[]; // até 3 ações para esta semana (inclui a próxima)
  cobertura: Cobertura;
  limitacoes: Limitacao[];
}

const DAY = 86400000;
const ms = (d: string) => new Date(d.slice(0, 10) + "T12:00:00Z").getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number, c = 0) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: c })}%`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const faixaParaTom = (f: Faixa | null): Tom | null => (f == null ? null : f === "bom" ? "bom" : f === "ok" ? "atencao" : "ruim");
const SELO_FAIXA: Record<Faixa, string> = { bom: "Bom", ok: "Na média", fraco: "Abaixo" };
const TEXTO_FAIXA: Record<Faixa, string> = { bom: "Acima da média do mercado", ok: "Na média do mercado", fraco: "Abaixo da média do mercado" };
function dur(seg: number): string {
  const s = Math.max(0, Math.trunc(seg));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// ---------- 5. cobertura ----------
export function medirCobertura(e: EntradaResultado): Cobertura {
  const fim = e.end > e.hoje ? e.hoje : e.end;
  const diasPeriodo = Math.max(1, Math.round((ms(fim) - ms(e.start)) / DAY) + 1);
  const comDado = e.diario.filter((d) => d.reach != null && d.date >= e.start && d.date <= fim).map((d) => d.date).sort();
  const ultimoFechado = iso(ms(e.hoje) - 2 * DAY);
  const diasAbertos = Math.max(0, Math.round((ms(fim) - ms(ultimoFechado)) / DAY));
  const alertas: Cobertura["alertas"] = [];
  const faltam = diasPeriodo - comDado.length;
  if (e.fontes?.tem_instagram !== false) {
    if (comDado.length === 0) alertas.push({ tom: "ruim", texto: "Nenhum dia com dado do Instagram neste período. Os números de conteúdo abaixo ficam vazios." });
    else if (faltam >= 3)
      alertas.push({
        tom: faltam / diasPeriodo > 0.4 ? "ruim" : "atencao",
        texto: `Período incompleto: ${comDado.length} de ${diasPeriodo} dias têm dado do Instagram (${dm(comDado[0])} a ${dm(comDado[comDado.length - 1])}). Totais e comparações valem só para esses dias.${comDado[0] > e.start ? ` O histórico diário guardado deste perfil começa em ${dm(comDado[0])}.` : ""}`,
      });
  }
  if (diasAbertos > 0 && fim >= ultimoFechado)
    alertas.push({ tom: "atencao", texto: `Os números de ${diasAbertos === 1 ? "ontem" : "hoje e ontem"} ainda estão fechando na Meta e podem subir nas próximas horas.` });
  const naoConectadas = [
    e.fontes?.tem_anuncios === false && "anúncios",
    e.fontes?.tem_crm === false && "CRM",
    e.fontes?.tem_atendimento === false && "WhatsApp",
  ].filter(Boolean) as string[];
  if (naoConectadas.length)
    alertas.push({ tom: "atencao", texto: `Sem ${naoConectadas.join(", ")} conectado: o painel não consegue dizer o que acontece depois que a pessoa vê o post.` });
  return { diasPeriodo, diasComDado: comDado.length, diasAbertos, primeiroDado: comDado[0] ?? null, ultimoDado: comDado[comDado.length - 1] ?? null, alertas };
}

// ---------- adaptação dos achados antigos para o contrato de Insight ----------
const REGRA_ACHADO: Record<string, string> = {
  ritmo: "Compara o alcance diário típico (mediana) do período com o período anterior do mesmo tamanho, quando ele tem dado em 80% ou mais dos dias; sem isso, compara a 1ª com a 2ª metade do período. Precisa de 10 dias com dado. Menos de 10% de diferença = estável; 10% a 25% = leve; 25% ou mais = relevante.",
  concentracao: "Um único post responde por 40% ou mais do alcance somado dos posts do período (mínimo de 5 posts com alcance).",
  formato: "Só formatos com 3 ou mais posts. Compara o alcance típico (mediana) e a parte de quem viu que salvou. Diferença de salvamento só é afirmada com folga de 30%.",
  seguir: "Seguidores ganhos pelo post ÷ pessoas alcançadas pelo post, em posts com 200+ de alcance (mínimo de 5). O Instagram não informa esse dado para Reels.",
  constancia: "Maior intervalo entre dois posts seguidos do período igual ou maior que 7 dias.",
  atendimento: "Espera típica (mediana) até a 1ª resposta no WhatsApp: até 5 min = bom; 30 min ou mais = ruim (HBR 2011; Opinion Box/Mobile Time).",
  roteamento: "30% ou mais das conversas do período sem departamento/equipe.",
};
const FONTE_AREA: Record<string, string> = {
  conteudo: "Instagram (Meta Graph API / Windsor): métricas diárias da conta e por post",
  anuncios: "Meta Ads: gasto, impressões, cliques no link, conversas e leads por campanha e dia",
  comercial: "WhatsApp (WTS Chat) e CRM da clínica",
  resumo: "Instagram, Meta Ads, CRM e WhatsApp",
  ideias: "Comentários do Instagram",
};

const META_ACHADO: Record<string, { area: Area; responsavel: Responsavel; rota?: string; botao?: string }> = {
  ritmo: { area: "conteudo", responsavel: "social_media", rota: "/$clientId/posts", botao: "Ver posts do período" },
  concentracao: { area: "conteudo", responsavel: "social_media", rota: "/$clientId/ideias", botao: "Ver ideias de série" },
  formato: { area: "conteudo", responsavel: "social_media", rota: "/$clientId/conteudo", botao: "Ver comparação de formatos" },
  seguir: { area: "conteudo", responsavel: "social_media", rota: "/$clientId/posts", botao: "Ver o post que trouxe seguidores" },
  constancia: { area: "conteudo", responsavel: "social_media", rota: "/$clientId/ideias", botao: "Ver ideias prontas" },
  anuncios: { area: "anuncios", responsavel: "gestor_trafego", rota: "/$clientId/anuncios", botao: "Ver campanhas para cortar e escalar" },
  "anuncios-objetivo": { area: "anuncios", responsavel: "gestor_trafego", rota: "/$clientId/anuncios", botao: "Comparar objetivos de campanha" },
  atendimento: { area: "comercial", responsavel: "atendimento", rota: "/$clientId/atendimento", botao: "Ver tempo de resposta por atendente" },
  roteamento: { area: "comercial", responsavel: "atendimento", rota: "/$clientId/atendimento", botao: "Ver conversas sem responsável" },
};

function paraInsight(a: Achado, e: EntradaResultado, cob: Cobertura): Insight {
  const m = META_ACHADO[a.id] ?? { area: "resumo" as Area, responsavel: "equipe_hub" as Responsavel };
  const cobertura = cob.diasComDado / Math.max(1, cob.diasPeriodo);
  const deConteudo = m.area === "conteudo";
  const nPosts = (e.posts ?? []).length;
  const confianca = deConteudo
    ? a.id === "ritmo"
      ? confiancaPorAmostra(cob.diasComDado, 10, cobertura)
      : confiancaPorAmostra(nPosts, 8, cobertura)
    : m.area === "anuncios"
      ? confiancaPorAmostra(e.adsDiag?.campanhas.length ?? 0, 3)
      : "alta";
  const riscos: string[] = [];
  if (deConteudo && cobertura < 0.9 && cob.diasComDado > 0) riscos.push(`O período tem ${cob.diasComDado} de ${cob.diasPeriodo} dias com dado.`);
  if (a.id === "seguir") riscos.push("O Instagram não informa quantos seguidores cada Reels trouxe: a comparação considera só fotos e carrosséis.");
  if (a.id === "ritmo" && !e.diarioAnterior?.length) riscos.push("Sem dado do período anterior: a comparação é entre a 1ª e a 2ª metade deste período.");
  if (m.area === "anuncios") riscos.push("Cada campanha é comparada só com campanhas do mesmo objetivo. Lead feito no site não chega aqui.");
  return {
    id: a.id,
    area: m.area,
    tom: a.tom,
    titulo: a.titulo,
    diagnostico: a.porque,
    evidencia: a.base,
    confianca,
    motivoConfianca: deConteudo ? `${nPosts} posts e ${cob.diasComDado} dias com dado` : undefined,
    impacto: a.peso >= 3 ? "alto" : a.peso === 2 ? "medio" : "baixo",
    acao: a.acao ? { texto: a.acao.texto, rota: m.rota, botao: m.botao } : undefined,
    responsavel: m.responsavel,
    risco: riscos.join(" ") || undefined,
    regra: REGRA_ACHADO[a.id],
    fonte: FONTE_AREA[m.area],
  };
}

// ---------- 1 e 2. métricas com status ----------
function variacaoTexto(atual: number, antes: number | null): string | undefined {
  if (antes == null || antes <= 0) return undefined;
  const v = (atual - antes) / antes;
  return `${v >= 0 ? "▲" : "▼"} ${pct(Math.abs(v))} vs. período anterior`;
}

function montarMetricas(e: EntradaResultado, cob: Cobertura): Metrica[] {
  const out: Metrica[] = [];
  const dias = e.diario.filter((d) => d.date >= e.start && d.date <= e.end);
  const ant = e.diarioAnterior ?? [];
  const comReach = dias.filter((d) => d.reach != null);
  const antReach = ant.filter((d) => d.reach != null);
  const comparavel = comReach.length >= 7 && antReach.length >= comReach.length * 0.8;
  const soma = (rs: typeof dias, k: keyof (typeof dias)[number]) => rs.reduce((s, r) => s + n(r[k]), 0);

  if (comReach.length > 0) {
    const unico = e.periodoIg?.alcance_unico;
    const reachSoma = soma(comReach, "reach");
    out.push({
      id: "alcance",
      rotulo: unico != null ? `Alcance (contas únicas)${e.periodoIg?.recortado ? ", últimos 30 dias" : ""}` : "Alcance (soma dos dias)",
      valor: int(unico ?? reachSoma),
      explicacao: unico != null
        ? `Quantas pessoas diferentes viram pelo menos um post ou story${e.periodoIg?.recortado ? " nos últimos 30 dias do período (a Meta não calcula contas únicas para mais de 30 dias)" : ""}. É o mesmo número de “contas alcançadas” do Instagram. A soma do alcance de cada dia foi ${int(reachSoma)}.`
        : "Soma de quantas pessoas viram o perfil em cada dia. A mesma pessoa conta de novo se voltou em outro dia, por isso é maior que o número do Instagram.",
      status: null,
      // Variação só sobre a soma dos dias (como na tela original); com alcance único não há comparação equivalente.
      comparacao: comparavel && unico == null ? variacaoTexto(reachSoma, soma(antReach, "reach")) : undefined,
      rota: "/$clientId/posts",
      botao: "Ver posts do período",
    });

    // Interação: interações ÷ alcance (fórmula do benchmark mLabs/Socialinsider).
    // Mesma regra da taxa de engajamento original: alcance único só quando as
    // interações também vêm da Meta para o período; senão, soma ÷ soma.
    const usaUnico = e.periodoIg?.alcance_unico != null && e.periodoIg?.interacoes != null;
    const inter = usaUnico ? e.periodoIg!.interacoes! : soma(comReach, "total_interactions");
    const base = usaUnico ? e.periodoIg!.alcance_unico! : reachSoma;
    if (base > 0 && inter > 0) {
      const taxa = inter / base;
      const f = avaliar(BENCHMARKS.engajamentoPorAlcance, taxa);
      out.push({
        id: "interacao",
        rotulo: "Interação",
        valor: `${(taxa * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} em cada 100`,
        explicacao: `De cada 100 pessoas que viram o perfil, quantas curtiram, comentaram, salvaram ou compartilharam. Mostra se o conteúdo prende ou só passa. Referência: ${BENCHMARKS.engajamentoPorAlcance.referencia}.`,
        status: faixaParaTom(f),
        selo: f ? SELO_FAIXA[f] : undefined,
        statusTexto: f ? TEXTO_FAIXA[f] : undefined,
        fonte: BENCHMARKS.engajamentoPorAlcance.fonte,
      });
    }

    // Seguidores: líquido no período, normalizado para 30 dias contra a base.
    // Cobertura própria: só dias em que o Instagram trouxe novos seguidores (ele só fornece os últimos
    // 30 dias). Antes dividia pelos dias com alcance, o que subestimava o ritmo mensal.
    const comNovos = dias.filter((d) => d.new_followers != null);
    const antNovos = ant.filter((d) => d.new_followers != null);
    const novos = soma(comNovos, "new_followers");
    const seguidores = [...dias].reverse().find((d) => d.followers_count != null)?.followers_count ?? null;
    if (comNovos.length > 0 && (novos > 0 || seguidores)) {
      const diasMedidos = comNovos.length;
      const mensal = seguidores ? (novos / seguidores) * (30 / diasMedidos) : null;
      const f = mensal != null ? avaliar(BENCHMARKS.crescimentoMensal, mensal, { seguidores: seguidores ?? 0 }) : null;
      out.push({
        id: "seguidores",
        rotulo: "Novos seguidores",
        valor: `+${int(novos)}`,
        explicacao: `Quantas pessoas começaram a seguir em ${diasMedidos} dias com esse dado (sem descontar quem saiu; o Instagram só informa os últimos 30 dias). ${mensal != null ? `Equivale a ${pct(mensal, 1)} do perfil por mês.` : ""} Referência: ${BENCHMARKS.crescimentoMensal.referencia}.`,
        status: faixaParaTom(f),
        selo: f ? SELO_FAIXA[f] : undefined,
        statusTexto: f ? TEXTO_FAIXA[f] : undefined,
        comparacao: comNovos.length >= 7 && antNovos.length >= comNovos.length * 0.8 ? variacaoTexto(novos, soma(antNovos, "new_followers")) : undefined,
        fonte: BENCHMARKS.crescimentoMensal.fonte,
      });
    }
  }

  // Frequência de posts.
  const posts = (e.posts ?? []).filter((p) => p.posted_at && p.format !== "stories");
  if (posts.length > 0) {
    const semanas = Math.max(1, cob.diasPeriodo / 7);
    const porSemana = posts.length / semanas;
    const f = avaliar(BENCHMARKS.frequenciaSemanal, porSemana);
    out.push({
      id: "frequencia",
      rotulo: "Posts por semana",
      valor: porSemana.toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
      explicacao: `Quantos posts no feed saíram por semana, em média (${posts.length} no período). Perfil de saúde costuma render bem a partir de 2 por semana; constância pesa mais que volume.`,
      status: faixaParaTom(f),
      selo: f ? (f === "fraco" ? "Pouco" : f === "ok" ? "No mínimo" : "Bom") : undefined,
      statusTexto: f ? (f === "fraco" ? "Abaixo do recomendado" : f === "ok" ? "No mínimo recomendado" : "Boa frequência") : undefined,
      fonte: BENCHMARKS.frequenciaSemanal.fonte,
      rota: "/$clientId/posts",
      botao: "Ver os posts",
    });
  }

  // Anúncios: só conversa de campanha de mensagem; status pela fatia de verba que não entrega.
  const d = e.adsDiag;
  if (d && d.gasto > 0 && d.rastreio?.suspeito) {
    out.push({
      id: "verba",
      rotulo: "Rastreio das conversas",
      valor: "Suspeito",
      explicacao: d.rastreio.mensagem ?? "",
      status: "atencao",
      statusTexto: "Sem custo por conversa até corrigir",
      rota: "/$clientId/anuncios",
      botao: "Ver campanhas e objetivos",
    });
  } else if (d && d.gasto > 0) {
    const fatia = d.desperdicio / d.gasto;
    out.push({
      id: "verba",
      rotulo: "Verba que não entregou",
      valor: pct(fatia),
      explicacao: `Parte do investimento (${brl(d.gasto)}) que foi para campanhas que custam o dobro das outras do mesmo tipo ou não entregaram o que o objetivo promete. Cada campanha é comparada só com campanhas do mesmo objetivo.`,
      status: fatia >= 0.2 ? "ruim" : fatia >= 0.1 ? "atencao" : "bom",
      statusTexto: fatia >= 0.2 ? "Dinheiro vazando" : fatia >= 0.1 ? "Pode melhorar" : "Verba bem usada",
      rota: "/$clientId/anuncios",
      botao: "Ver onde a verba vaza",
    });
    if (d.conversasMensagem > 0 && d.custoPorConversaMensagem != null)
      out.push({
        id: "custo-conversa",
        rotulo: "Custo por conversa (campanhas de mensagem)",
        valor: brl(d.custoPorConversaMensagem),
        comparacao: d.conversas > 0 ? `Conta toda: ${brl(d.gasto / d.conversas)} (${brl(d.gasto)} ÷ ${int(d.conversas)} conversas de todas as campanhas)` : undefined,
        explicacao: `Gasto das campanhas de mensagem (${brl(d.gastoMensagem)}) ÷ conversas que elas iniciaram (${int(d.conversasMensagem)}). Não é o custo da conta toda: campanhas de outros objetivos gastam sem gerar conversa. Não há referência de mercado confiável: compare com o mês anterior. ${BENCHMARKS.custoPorConversa.referencia}.`,
        status: null,
        rota: "/$clientId/anuncios",
        botao: "Ver custo por campanha",
      });
  }

  // CRM.
  if (e.crm && e.crm.novos > 0)
    out.push({
      id: "leads",
      rotulo: "Novos contatos no CRM",
      valor: int(e.crm.novos),
      explicacao: `Pessoas que entraram no CRM da clínica no período${e.crm.ganhos ? `; ${int(e.crm.ganhos)} foram marcadas como ganhas (viraram paciente/venda)` : ""}. Depende de a equipe registrar no CRM.`,
      status: null,
      rota: "/$clientId/crm-painel",
      botao: "Ver onde o funil perde gente",
    });

  // WhatsApp.
  const espera = n(e.wts?.espera_mediana_seg);
  if (n(e.wts?.atendimentos) > 0 && espera > 0) {
    const f = avaliar(BENCHMARKS.primeiraResposta, espera);
    out.push({
      id: "resposta",
      rotulo: "Tempo até responder",
      valor: dur(espera),
      explicacao: `Quanto tempo o paciente típico esperou pela primeira resposta no WhatsApp (${int(n(e.wts?.atendimentos))} atendimentos). 63% dos brasileiros esperam resposta em até 5 minutos; quem responde em até 1 hora tem ~7x mais chance de converter.`,
      status: faixaParaTom(f),
      selo: f ? (f === "bom" ? "Rápido" : f === "ok" ? "Aceitável" : "Lento") : undefined,
      statusTexto: f ? (f === "bom" ? "Rápido" : f === "ok" ? "Aceitável" : "Lento: paciente esfria") : undefined,
      fonte: BENCHMARKS.primeiraResposta.fonte,
      rota: "/$clientId/atendimento",
      botao: "Ver espera por atendente",
    });
  }
  return out;
}

// ---------- montagem ----------
export function montarResultado(e: EntradaResultado): Resultado {
  const cobertura = medirCobertura(e);
  const leitura = lerPeriodo({ diario: e.diario, diarioAnterior: e.diarioAnterior, posts: e.posts ?? [], adsDiag: e.adsDiag, wts: e.wts });
  // Anúncios: o plano de verba da tela Anúncios (ações com valores) substitui a
  // leitura genérica de anúncio, para as duas telas dizerem a mesma coisa.
  const adsInsights = insightsDeAnuncios(e.adsDiag);
  const insights: Insight[] = leitura.achados
    .filter((a) => !(adsInsights.length && a.id.startsWith("anuncios")))
    .map((a) => paraInsight(a, e, cobertura));
  insights.push(...adsInsights);
  const limitacoes: Limitacao[] = leitura.semLeitura.map((t, i) => ({ id: `leitura-${i}`, area: "conteudo", texto: t, resolve: "equipe_hub" }));
  limitacoes.push(...limitacoesDeAnuncios(e.adsDiag));

  if (e.leadsPorDia) {
    const c = cruzar({ start: e.start, end: e.end > e.hoje ? e.hoje : e.end, leadsPorDia: e.leadsPorDia, diario: e.diario, adsPorDia: e.adsPorDia, posts: e.posts ?? [] } as EntradaCruzamento);
    insights.push(...c.insights);
    limitacoes.push(...c.limitacoes);
  }

  // Fonte desconectada é a ação que destrava todas as outras leituras.
  const faltaFonte = [e.fontes?.tem_crm === false && "CRM", e.fontes?.tem_atendimento === false && "WhatsApp"].filter(Boolean) as string[];
  if (faltaFonte.length)
    insights.push({
      id: "conectar-fontes",
      area: "resumo",
      tom: "atencao",
      titulo: `Sem ${faltaFonte.join(" e ")} ${faltaFonte.length > 1 ? "conectados" : "conectado"}, o painel não vê se o Instagram está trazendo paciente.`,
      diagnostico: "Hoje dá para ver alcance e engajamento, mas não quantas pessoas chamaram, agendaram ou viraram paciente. Sem isso, não dá para saber qual post ou campanha gera consulta.",
      evidencia: `Fontes ligadas: Instagram${e.fontes?.tem_anuncios ? ", anúncios" : ""}${e.fontes?.tem_crm ? ", CRM" : ""}${e.fontes?.tem_atendimento ? ", WhatsApp" : ""}.`,
      confianca: "alta",
      impacto: "alto",
      acao: { texto: `Conectar o ${faltaFonte.join(" e o ")} da clínica ao painel.`, rota: "/$clientId/crm-painel", botao: `Ver como conectar o ${faltaFonte[0]}` },
      responsavel: "equipe_hub",
    });

  // Dado com erro na origem (CRM parado, sem origem, fonte sem atualizar...): entra
  // como ação operacional, mas não pesa no veredito do período (não é resultado).
  insights.push(...(e.problemasDados ?? []));

  // Regra e fonte para os insights que vêm de outros módulos (anúncios, cruzamento).
  for (const i of insights) {
    i.fonte ??= FONTE_AREA[i.area];
    if (!i.regra && i.area === "anuncios")
      i.regra = "Cada campanha é medida pelo resultado do próprio objetivo e comparada com a campanha típica (mediana) do mesmo objetivo: até 0,6x o custo típico = Escalar; 2x ou mais = Cortar (mesma régua de fadiga da Meta). Mínimo de 3 campanhas com volume no objetivo.";
    if (!i.regra && i.id.startsWith("cruz-"))
      i.regra = "Leads do CRM por dia comparados com o engajamento e o gasto em anúncio dos 3 dias anteriores, sem o efeito do dia da semana (correlação de Spearman; 0,3 ou mais = relação real). Mínimo de 21 dias com dado e 20 leads. Mostra que as séries andam juntas, não que uma causa a outra.";
    if (i.id.startsWith("cruz-")) i.fonte = "CRM da clínica + Instagram + Meta Ads";
  }

  // Prioridade: score 0–100 (impacto 30%, urgência 25%, confiança 20%, facilidade 15%, alinhamento 10%).
  const ordenados = ordenarPorScore(insights);
  const comAcao = ordenados.filter((i) => i.acao);
  // A próxima ação é a mais prioritária que corrige algo; se tudo vai bem, a que repete o que funciona.
  const proximaAcao = comAcao.find((i) => i.tom !== "bom") ?? comAcao[0] ?? null;
  const semana = comAcao.slice(0, 3);
  if (proximaAcao && !semana.includes(proximaAcao)) semana.unshift(proximaAcao), semana.splice(3);

  const metricas = montarMetricas(e, cobertura);

  // Veredito: pelo saldo dos insights com confiança não baixa.
  const pesos = { alto: 3, medio: 2, baixo: 1 } as const;
  const confiaveis = ordenados.filter((i) => i.confianca !== "baixa" && !i.id.startsWith("dado-"));
  // As métricas com referência de mercado também contam (1 ponto cada), para o
  // veredito bater com as cores que a pessoa vê nos cards.
  const bom = confiaveis.filter((i) => i.tom === "bom").reduce((s, i) => s + pesos[i.impacto], 0) + metricas.filter((m) => m.status === "bom").length;
  const ruim =
    confiaveis.filter((i) => i.tom === "ruim").reduce((s, i) => s + pesos[i.impacto], 0) +
    confiaveis.filter((i) => i.tom === "atencao").reduce((s, i) => s + pesos[i.impacto] * 0.5, 0) +
    metricas.filter((m) => m.status === "ruim").length;
  let veredito: Resultado["veredito"];
  if (confiaveis.length === 0 && metricas.every((m) => m.status == null)) veredito = { tom: "neutro", titulo: "Ainda não há dado suficiente para dizer se o período foi bom ou ruim." };
  else if (bom >= ruim * 1.5) veredito = { tom: "bom", titulo: ruim > 0 ? "Período bom, com um ponto para corrigir." : "Período bom." };
  else if (ruim >= bom * 1.5 && ruim >= 3) veredito = { tom: "ruim", titulo: "Período fraco: tem coisa travando o resultado." };
  else if (ruim >= bom * 1.5) veredito = { tom: "atencao", titulo: "Período estável: nada piorou de forma importante, mas pouca coisa se destacou." };
  else veredito = { tom: "atencao", titulo: "Período misto: uma parte funcionou, outra precisa de ajuste." };

  // Resumo: o que aconteceu, em frases simples com número.
  const resumo: string[] = [];
  const mt = (id: string) => metricas.find((m) => m.id === id);
  const alc = mt("alcance");
  const seg = mt("seguidores");
  const posts = (e.posts ?? []).length;
  if (alc) resumo.push(`${alc.rotulo}: ${alc.valor}${seg ? `; ${seg.valor.replace("+", "")} começaram a seguir` : ""}${posts ? `; ${int(posts)} publicações` : ""}.`);
  if (e.adsDiag && e.adsDiag.gasto > 0)
    resumo.push(`${brl(e.adsDiag.gasto)} investidos em anúncio${e.adsDiag.conversasMensagem ? `; os anúncios de mensagem trouxeram ${int(e.adsDiag.conversasMensagem)} conversas` : ""}.`);
  if (e.crm && e.crm.novos > 0) resumo.push(`${int(e.crm.novos)} novos contatos entraram no CRM${e.crm.ganhos ? ` e ${int(e.crm.ganhos)} viraram paciente/venda` : ""}.`);
  if (n(e.wts?.atendimentos) > 0) resumo.push(`${int(n(e.wts?.atendimentos))} atendimentos no WhatsApp${n(e.wts?.espera_mediana_seg) > 0 ? `, com ${dur(n(e.wts?.espera_mediana_seg))} de espera típica pela primeira resposta` : ""}.`);
  const melhor = confiaveis.find((i) => i.tom === "bom");
  const pior = confiaveis.find((i) => i.tom !== "bom");
  if (melhor) resumo.push(`Destaque: ${melhor.titulo}`);
  if (pior) resumo.push(`Ponto de atenção: ${pior.titulo}`);

  return { veredito, resumo, metricas, insights: ordenados, proximaAcao, semana, cobertura, limitacoes };
}
