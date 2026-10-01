// Monta o texto do relatório para WhatsApp. Determinístico, sem IA.
// Seção sem fonte é omitida do texto e listada em `omitidos`.
import { analyzeFollowers, buildIdeias, type Ideia } from "@/lib/hub-conteudo";
import { fmtFormatKey } from "@/lib/report-metrics";

export interface RelatorioInput {
  clientName: string;
  periodLabel: string;
  start: string;
  end: string;
  fontes: { tem_instagram: boolean; tem_anuncios: boolean; tem_atendimento: boolean } | null;
  metrics: any[];
  posts: any[];
  perguntas: any[];
  ads: any | null;
  wts: any | null;
}

export interface RelatorioResult {
  texto: string;
  omitidos: string[];
}

const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");
const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Sem travessão e sem emoji no texto final (regra de estilo do Hub).
export function limparTexto(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/[\p{Extended_Pictographic}️‍]/gu, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ");
}

function duracao(seg: number): string {
  if (seg < 90) return `${Math.round(seg)} segundos`;
  if (seg < 5400) return `${Math.round(seg / 60)} minutos`;
  return `${(seg / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} horas`;
}

function primeiroNome(nome: string) {
  return nome.replace(/^(dra?\.|dr\.)\s*/i, "").trim();
}

export function buildRelatorio(inp: RelatorioInput): RelatorioResult {
  const omitidos: string[] = [];
  const blocos: string[] = [];
  const temIg = inp.fontes?.tem_instagram ?? true;

  // Alcance
  const comAlcance = inp.metrics.filter((m) => m.reach != null);
  if (!temIg) {
    omitidos.push("alcance, seguidores e post destaque (Instagram não conectado)");
  } else if (comAlcance.length === 0) {
    omitidos.push("alcance (nenhum dia com alcance coletado no período)");
  } else {
    const total = comAlcance.reduce((a, m) => a + num(m.reach), 0);
    blocos.push(`Alcance: seu conteúdo chegou a ${fmtN(total)} contas no período (soma dos alcances diários, em ${comAlcance.length} dias com coleta).`);
  }

  // Seguidores
  if (temIg) {
    const f = analyzeFollowers(inp.metrics, inp.start, inp.end);
    if (f.delta == null) {
      omitidos.push("seguidores (menos de 2 dias com contagem gravada no período)");
    } else {
      const ate = f.points[f.points.length - 1];
      const de = f.points[0];
      const sinal = f.delta >= 0 ? `ganhou ${fmtN(f.delta)}` : `perdeu ${fmtN(Math.abs(f.delta))}`;
      blocos.push(
        `Seguidores: o perfil ${sinal} seguidores entre ${de.date.split("-").reverse().slice(0, 2).join("/")} e ${ate.date.split("-").reverse().slice(0, 2).join("/")} e está com ${fmtN(ate.followers)}.`,
      );
    }
  }

  // Post destaque
  if (temIg) {
    const cand = inp.posts.filter((p) => p.reach != null && num(p.reach) > 0).sort((a, b) => num(b.reach) - num(a.reach))[0];
    if (!cand) {
      omitidos.push("post destaque (nenhum post com alcance no período)");
    } else {
      const legenda = String(cand.caption ?? "").split("\n")[0].trim();
      const trecho = legenda ? ` "${legenda.length > 80 ? legenda.slice(0, 77) + "..." : legenda}"` : "";
      const salvos = cand.saved != null ? `, com ${fmtN(num(cand.saved))} salvamentos` : "";
      blocos.push(
        `Post destaque:${trecho} (${cand.format ? fmtFormatKey(cand.format) : "post"}) alcançou ${fmtN(num(cand.reach))} contas${salvos}.${cand.permalink ? ` ${cand.permalink}` : ""}`,
      );
    }
  }

  // Anúncios
  if (!inp.fontes?.tem_anuncios) {
    omitidos.push("anúncios (conta de anúncios não conectada)");
  } else if (!inp.ads || num(inp.ads.gasto) <= 0) {
    omitidos.push("anúncios (conta conectada, mas sem investimento no período)");
  } else {
    let t = `Anúncios: investimento de ${fmtBRL(num(inp.ads.gasto))}`;
    if (num(inp.ads.conversas) > 0) {
      t += `, com ${fmtN(num(inp.ads.conversas))} conversas iniciadas`;
      if (inp.ads.custo_por_conversa != null) t += ` (${fmtBRL(num(inp.ads.custo_por_conversa))} por conversa)`;
    } else {
      t += ", sem conversas registradas nos anúncios";
    }
    blocos.push(t + ".");
  }

  // Atendimento
  if (!inp.fontes?.tem_atendimento) {
    omitidos.push("atendimento (WhatsApp de atendimento não conectado)");
  } else if (!inp.wts || num(inp.wts.atendimentos) <= 0) {
    omitidos.push("atendimento (conectado, mas sem atendimentos no período)");
  } else {
    let t = `Atendimento: ${fmtN(num(inp.wts.atendimentos))} atendimentos no WhatsApp, com ${fmtN(num(inp.wts.contatos_distintos))} contatos diferentes`;
    if (inp.wts.espera_mediana_seg != null && num(inp.wts.espera_cobertura) > 0) {
      t += `. A mediana do tempo até a primeira resposta foi de ${duracao(num(inp.wts.espera_mediana_seg))}`;
    }
    blocos.push(t + ".");
  }

  // Ações recomendadas (regras de ideias)
  let acoes: Ideia[] = [];
  if (temIg) {
    const r = buildIdeias(inp.posts, inp.perguntas);
    acoes = r.ideias.slice(0, 3);
    if (acoes.length === 0) omitidos.push("ações recomendadas (sem dado suficiente para as regras de ideias)");
  } else {
    omitidos.push("ações recomendadas (dependem do Instagram)");
  }
  if (acoes.length > 0) {
    blocos.push("Próximas ações recomendadas:\n" + acoes.map((a, i) => `${i + 1}. ${a.acao} ${a.porque}`).join("\n"));
  }

  let texto: string;
  if (blocos.length === 0) {
    texto = "";
  } else {
    texto = `Olá, ${primeiroNome(inp.clientName)}! Segue o resumo do período de ${inp.periodLabel}.\n\n${blocos.join("\n\n")}\n\nQualquer dúvida, estamos à disposição.`;
  }
  return { texto: limparTexto(texto), omitidos };
}
