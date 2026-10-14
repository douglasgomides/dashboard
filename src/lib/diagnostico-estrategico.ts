// Diagnóstico estratégico: uma leitura de topo do período, em oito respostas, montada só com o que
// o painel já calculou (Resultado, diagnóstico de anúncios, posts, planejador, problemas de dado).
// Cada resposta diz se a conclusão é limitada e por quê. Sem dado suficiente, a resposta diz isso,
// em vez de inventar.
import type { Resultado } from "@/lib/resultado";
import type { DiagnosticoAds } from "@/lib/anuncios-objetivo";
import type { Insight, Limitacao } from "@/lib/insight";

export type IdDiag = "melhorou" | "piorou" | "oportunidade" | "risco" | "proxima" | "pauta" | "campanha" | "faltante";

export interface RespostaDiag {
  id: IdDiag;
  pergunta: string;
  resposta: string | null; // null = sem base para responder
  evidencia?: string;
  limitada: boolean;
  motivoLimite?: string;
  rota?: string; // tela para aprofundar (relativa ao cliente)
}

export interface EntradaDiag {
  resultado: Resultado | null;
  diario: { date: string; reach?: number | null; total_interactions?: number | null; new_followers?: number | null; saves?: number | null }[];
  diarioAnterior?: EntradaDiag["diario"];
  ads?: DiagnosticoAds | null;
  posts?: { caption?: string | null; reach?: number | null; saved?: number | null; shares?: number | null; format?: string | null; tema?: string | null }[];
  pautaPlanejada?: { titulo: string; formato: string; dia: string | null } | null;
  problemasAltos?: { titulo: string; correcao: string }[];
}

const PERGUNTA: Record<IdDiag, string> = {
  melhorou: "O que melhorou",
  piorou: "O que piorou",
  oportunidade: "Principal oportunidade",
  risco: "Principal risco",
  proxima: "Próxima ação",
  pauta: "Pauta sugerida",
  campanha: "Campanha a revisar",
  faltante: "Dado faltante mais importante",
};

const ROTA: Partial<Record<IdDiag, string>> = { pauta: "/ideias", campanha: "/anuncios", proxima: "/proximas-acoes", faltante: "/crm-guia" };
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pctTxt = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

interface Variacao { nome: string; atual: number; anterior: number; var: number }

// Soma das métricas diárias no período e no anterior. Só compara com cobertura parecida (dias com dado).
export function variacoes(diario: EntradaDiag["diario"], anterior: EntradaDiag["diario"] | undefined): { lista: Variacao[]; limitada: boolean; motivo?: string } {
  if (!anterior?.length) return { lista: [], limitada: true, motivo: "Sem dado do período anterior para comparar." };
  const dias = (xs: EntradaDiag["diario"]) => xs.filter((d) => d.reach != null).length;
  const dA = dias(diario);
  const dB = dias(anterior);
  if (dA === 0 || dB === 0) return { lista: [], limitada: true, motivo: "Um dos períodos não tem nenhum dia com alcance." };
  // Normaliza por dia com dado: período com menos dias coletados não parece "queda".
  const soma = (xs: EntradaDiag["diario"], k: "reach" | "total_interactions" | "new_followers" | "saves") => xs.reduce((s, d) => s + Number(d[k] ?? 0), 0);
  const met: [string, "reach" | "total_interactions" | "new_followers" | "saves", number][] = [
    ["Alcance", "reach", 500],
    ["Interações", "total_interactions", 50],
    ["Novos seguidores", "new_followers", 20],
    ["Salvamentos", "saves", 20],
  ];
  const lista: Variacao[] = [];
  for (const [nome, k, minimo] of met) {
    const a = soma(diario, k) / dA;
    const b = soma(anterior, k) / dB;
    if (b * dB < minimo || b <= 0) continue; // base pequena: variação enganosa
    lista.push({ nome, atual: a * dA, anterior: b * dB, var: a / b - 1 });
  }
  const desigual = Math.min(dA, dB) / Math.max(dA, dB) < 0.8;
  return { lista, limitada: desigual, motivo: desigual ? `Dias com dado diferentes (${dA} x ${dB}); comparado pela média por dia.` : undefined };
}

function primeiro(xs: Insight[], f: (i: Insight) => boolean): Insight | undefined {
  return xs.find((i) => !i.id.startsWith("dado-") && f(i));
}

export function montarDiagnostico(e: EntradaDiag): RespostaDiag[] {
  const r = e.resultado;
  const out: RespostaDiag[] = [];
  const add = (id: IdDiag, x: Omit<RespostaDiag, "id" | "pergunta" | "rota"> & { rota?: string }) => out.push({ id, pergunta: PERGUNTA[id], rota: x.rota ?? ROTA[id], ...x });

  // 1–2. Melhorou / piorou
  const v = variacoes(e.diario, e.diarioAnterior);
  const sobe = v.lista.filter((x) => x.var >= 0.1).sort((a, b) => b.var - a.var)[0];
  const desce = v.lista.filter((x) => x.var <= -0.1).sort((a, b) => a.var - b.var)[0];
  if (!v.lista.length) {
    add("melhorou", { resposta: null, limitada: true, motivoLimite: v.motivo ?? "Base pequena demais para comparar." });
    add("piorou", { resposta: null, limitada: true, motivoLimite: v.motivo ?? "Base pequena demais para comparar." });
  } else {
    add("melhorou", sobe ? { resposta: `${sobe.nome} subiu ${pctTxt(sobe.var)} em relação ao período anterior.`, evidencia: `${int(sobe.atual)} contra ${int(sobe.anterior)}`, limitada: v.limitada, motivoLimite: v.motivo } : { resposta: "Nenhuma métrica do Instagram subiu 10% ou mais.", limitada: v.limitada, motivoLimite: v.motivo });
    add("piorou", desce ? { resposta: `${desce.nome} caiu ${pctTxt(desce.var)} em relação ao período anterior.`, evidencia: `${int(desce.atual)} contra ${int(desce.anterior)}`, limitada: v.limitada, motivoLimite: v.motivo } : { resposta: "Nenhuma métrica do Instagram caiu 10% ou mais.", limitada: v.limitada, motivoLimite: v.motivo });
  }

  // 3–5. Oportunidade, risco, próxima ação (das recomendações que passaram na checagem)
  const ins = r?.insights ?? [];
  const op = primeiro(ins, (i) => i.tom === "bom");
  const ri = primeiro(ins, (i) => i.tom === "ruim") ?? primeiro(ins, (i) => i.tom === "atencao");
  const baixa = (i: Insight) => i.confianca === "baixa";
  add("oportunidade", op ? { resposta: op.titulo, evidencia: op.evidencia, limitada: baixa(op), motivoLimite: baixa(op) ? op.motivoConfianca ?? "Confiança baixa." : undefined, rota: op.acao?.rota } : { resposta: null, limitada: true, motivoLimite: "Nenhum sinal positivo com evidência e amostra mínima no período." });
  add("risco", ri ? { resposta: ri.titulo, evidencia: ri.evidencia, limitada: baixa(ri), motivoLimite: baixa(ri) ? ri.motivoConfianca ?? "Confiança baixa." : ri.risco, rota: ri.acao?.rota } : { resposta: "Nenhum risco com evidência no período.", limitada: !ins.length, motivoLimite: !ins.length ? "Poucas recomendações calculadas: pode ser falta de dado, não ausência de risco." : undefined });
  const px = r?.proximaAcao;
  add("proxima", px ? { resposta: px.acao?.texto ?? px.titulo, evidencia: px.titulo, limitada: baixa(px), motivoLimite: baixa(px) ? px.motivoConfianca ?? "Confiança baixa." : undefined } : { resposta: null, limitada: true, motivoLimite: "Nenhuma ação com evidência suficiente. Veja Próximas ações para o que depende de dado." });

  // 6. Pauta sugerida: a já planejada; senão, repetir o tema do post mais salvo em outro formato.
  if (e.pautaPlanejada) {
    add("pauta", { resposta: `${e.pautaPlanejada.titulo} (${e.pautaPlanejada.formato}${e.pautaPlanejada.dia ? `, ${e.pautaPlanejada.dia.slice(8, 10)}/${e.pautaPlanejada.dia.slice(5, 7)}` : ""})`, evidencia: "Já está no planejador de Ideias.", limitada: false });
  } else {
    const comAlcance = (e.posts ?? []).filter((p) => Number(p.reach) > 0);
    const top = [...comAlcance].sort((a, b) => Number(b.saved ?? 0) / Number(b.reach) - Number(a.saved ?? 0) / Number(a.reach))[0];
    if (top && comAlcance.length >= 5 && Number(top.saved) > 0) {
      const tema = (top.tema || (top.caption ?? "").split(/[.!?\n]/)[0] || "o post mais salvo").slice(0, 80);
      const outro = top.format === "reels" ? "carrossel" : "Reels";
      add("pauta", { resposta: `Voltar ao tema “${tema}” em ${outro}.`, evidencia: `Post com a maior taxa de salvamento do período: ${int(Number(top.saved))} salvamentos em ${int(Number(top.reach))} de alcance.`, limitada: comAlcance.length < 10, motivoLimite: comAlcance.length < 10 ? `Só ${comAlcance.length} posts no período.` : undefined });
    } else {
      add("pauta", { resposta: null, limitada: true, motivoLimite: "Menos de 5 posts com alcance no período para apontar um tema." });
    }
  }

  // 7. Campanha a revisar: maior gasto entre as que a régua mandou cortar ou que atraem e não convertem.
  const camp = (e.ads?.campanhas ?? []).filter((c) => c.vereditoOficial === "Cortar" || c.vereditoOficial === "Atrai mas não converte").sort((a, b) => b.gasto - a.gasto)[0];
  if (!e.ads || !e.ads.campanhas.length) add("campanha", { resposta: null, limitada: true, motivoLimite: "Sem anúncio com gasto no período." });
  else if (camp) add("campanha", { resposta: `${camp.campanha}: ${camp.vereditoOficial.toLowerCase()}.`, evidencia: `${brl(camp.gasto)} no período. ${camp.comparacao || camp.motivo}`.trim(), limitada: camp.confianca === "baixa", motivoLimite: camp.confianca === "baixa" ? camp.motivoConfianca : undefined });
  else add("campanha", { resposta: "Nenhuma campanha com sinal de corte no período.", limitada: e.ads.campanhas.every((c) => c.vereditoOficial === "Volume insuficiente"), motivoLimite: "Campanhas com pouco volume para julgar." });

  // 8. Dado faltante mais importante: problema de dado de gravidade alta > limitação do Resultado.
  const prob = e.problemasAltos?.[0];
  const lim: Limitacao | undefined = r?.limitacoes?.[0];
  if (prob) add("faltante", { resposta: prob.titulo, evidencia: `Como corrigir: ${prob.correcao}`, limitada: false });
  else if (lim) add("faltante", { resposta: lim.texto, evidencia: lim.comoResolver ? `Como resolver: ${lim.comoResolver}` : undefined, limitada: false });
  else add("faltante", { resposta: "Nenhum dado crítico faltando no período.", limitada: false });

  return out;
}

/** Quantas respostas saem limitadas ou sem base: a tela usa para avisar o tamanho da cautela. */
export function grauDeCautela(rs: RespostaDiag[]): { limitadas: number; semBase: number } {
  return { limitadas: rs.filter((x) => x.limitada && x.resposta).length, semBase: rs.filter((x) => !x.resposta).length };
}
