// Audiência do Instagram lida ao vivo da Meta (api/_lib/meta-audiencia.ts) pelo endpoint de sincronização manual.
// Aqui ficam os tipos, a chamada e os textos de leitura (determinísticos, sem IA): o que os números querem dizer.
import { supabase } from "@/integrations/supabase/client";

export type Par = { chave: string; valor: number };
export type Bloco<T> = { ok: true; dados: T } | { ok: false; erro: string };

export interface StoryAoVivo {
  id: string;
  postado_em: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  media_type: string | null;
  alcance: number | null;
  views: number | null;
  respostas: number | null;
  compartilhamentos: number | null;
  interacoes: number | null;
  visitas_ao_perfil: number | null;
  novos_seguidores: number | null;
}

export interface Audiencia {
  gerado_em: string;
  periodo: { dias: number; de: string; ate: string };
  seguidores: Bloco<{ faixa_etaria: Par[]; genero: Par[]; cidades: Par[]; paises: Par[] }>;
  alcancados_no_mes: Bloco<{ faixa_etaria: Par[]; genero: Par[]; cidades: Par[]; mes: string }>;
  engajados_no_mes: Bloco<{ faixa_etaria: Par[]; genero: Par[]; mes: string }>;
  alcance_por_tipo_de_seguidor: Bloco<{ total: number; seguidores: number; nao_seguidores: number }>;
  visualizacoes_por_tipo_de_seguidor: Bloco<{ total: number; seguidores: number; nao_seguidores: number }>;
  origem: Bloco<{ conteudo: string; alcance: number; visualizacoes: number; interacoes: number }[]>;
  interacoes: Bloco<{ curtidas: number; comentarios: number; salvamentos: number; compartilhamentos: number }>;
  seguiram_e_deixaram: Bloco<{ seguiram: number; deixaram_de_seguir: number; saldo: number }>;
  horarios: Bloco<{ dias: number; fuso: string; mapa: number[][] }>;
  stories_ao_vivo: Bloco<StoryAoVivo[]>;
}

export type RespostaAudiencia = { nada_a_fazer?: string; erro?: string; dados?: Audiencia };

export async function getAudiencia(clientId: string): Promise<RespostaAudiencia> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) return { erro: "Sessão expirada. Entre de novo." };
  const r = await fetch("/api/sync/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ client_id: clientId, alvo: "audiencia" }),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) return { erro: corpo?.error ?? `A leitura da Meta falhou (${r.status}).` };
  if (corpo?.nada_a_fazer) return { nada_a_fazer: corpo.nada_a_fazer };
  if (corpo?.ok === false) return { erro: corpo.erro ?? "A leitura da Meta falhou." };
  return { dados: corpo.dados as Audiencia };
}

// ---------- formatação ----------
export const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");
export const fmtPct = (n: number, casas = 0) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
export const soma = (p: Par[]) => p.reduce((a, x) => a + x.valor, 0);
export const pctDe = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);

export const ROTULO_GENERO: Record<string, string> = { F: "Mulheres", M: "Homens", U: "Não informado" };

// "São Paulo, São Paulo (state)" -> "São Paulo (SP)" não dá para inferir a sigla de forma segura; fica "São Paulo, estado de São Paulo".
export function nomeDaCidade(bruto: string): string {
  const [cidade, estado] = bruto.split(",").map((s) => s.trim());
  const uf = estado?.replace(/\s*\(state\)\s*/i, "").trim();
  return uf && uf !== cidade ? `${cidade} (${uf})` : cidade;
}

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export { DIAS_SEMANA };

// ---------- leituras ----------
export function leituraDemografia(a: Audiencia): string[] {
  const out: string[] = [];
  if (a.seguidores.ok) {
    const { faixa_etaria, genero, cidades } = a.seguidores.dados;
    const totalIdade = soma(faixa_etaria);
    const maior = [...faixa_etaria].sort((x, y) => y.valor - x.valor)[0];
    if (maior && totalIdade > 0) out.push(`A maior faixa de seguidores é ${maior.chave} anos, com ${fmtPct(pctDe(maior.valor, totalIdade))} da base.`);
    const totalG = soma(genero);
    const mulheres = genero.find((g) => g.chave === "F")?.valor ?? 0;
    const homens = genero.find((g) => g.chave === "M")?.valor ?? 0;
    if (totalG > 0 && mulheres + homens > 0) {
      const dom = mulheres >= homens ? "mulheres" : "homens";
      out.push(`Entre quem informou o gênero, ${fmtPct(pctDe(Math.max(mulheres, homens), mulheres + homens))} são ${dom}.`);
    }
    const totalC = soma(cidades);
    if (cidades[0] && totalC > 0) {
      out.push(`A principal cidade é ${nomeDaCidade(cidades[0].chave)}, com ${fmtPct(pctDe(cidades[0].valor, totalC))} dos seguidores com cidade conhecida.`);
    }
  }
  if (a.seguidores.ok && a.alcancados_no_mes.ok) {
    const base = a.seguidores.dados.faixa_etaria;
    const alc = a.alcancados_no_mes.dados.faixa_etaria;
    const tb = soma(base);
    const ta = soma(alc);
    if (tb > 0 && ta > 0) {
      const dif = alc
        .map((x) => ({ chave: x.chave, pp: pctDe(x.valor, ta) - pctDe(base.find((b) => b.chave === x.chave)?.valor ?? 0, tb), pa: pctDe(x.valor, ta), pb: pctDe(base.find((b) => b.chave === x.chave)?.valor ?? 0, tb) }))
        .sort((x, y) => y.pp - x.pp);
      const topo = dif[0];
      if (topo && topo.pp >= 5) {
        out.push(`O conteúdo (${a.alcancados_no_mes.dados.mes}) chega mais à faixa ${topo.chave} (${fmtPct(topo.pa)} do alcance) do que ela pesa na base de seguidores (${fmtPct(topo.pb)}).`);
      }
      const fundo = dif[dif.length - 1];
      if (fundo && fundo.pp <= -5) {
        out.push(`A faixa ${fundo.chave} pesa ${fmtPct(fundo.pb)} dos seguidores, mas só ${fmtPct(fundo.pa)} do alcance: o conteúdo está chegando pouco a ela.`);
      }
    }
  }
  if (a.engajados_no_mes.ok) {
    const e = a.engajados_no_mes.dados.faixa_etaria;
    const te = soma(e);
    const m = [...e].sort((x, y) => y.valor - x.valor)[0];
    if (m && te >= 50) out.push(`Quem mais engaja (${a.engajados_no_mes.dados.mes}) tem ${m.chave} anos, ${fmtPct(pctDe(m.valor, te))} das pessoas que interagiram.`);
  }
  return out;
}

export function leituraOrigem(a: Audiencia): string[] {
  const out: string[] = [];
  if (a.alcance_por_tipo_de_seguidor.ok) {
    const d = a.alcance_por_tipo_de_seguidor.dados;
    if (d.total > 0) out.push(`${fmtPct(pctDe(d.nao_seguidores, d.total))} do alcance dos últimos ${a.periodo.dias} dias veio de quem ainda não segue. ${d.nao_seguidores > d.seguidores ? "O conteúdo está funcionando mais para atrair gente nova do que para falar com a base." : "O conteúdo fala mais com a base do que com gente nova."}`);
  }
  if (a.origem.ok) {
    const itens = a.origem.dados;
    const totalV = itens.reduce((x, i) => x + i.visualizacoes, 0);
    const anuncio = itens.find((i) => i.conteudo === "Anúncios");
    if (anuncio && totalV > 0 && anuncio.visualizacoes > 0) {
      out.push(`${fmtPct(pctDe(anuncio.visualizacoes, totalV))} das visualizações foram de anúncios. As outras ${fmtPct(100 - pctDe(anuncio.visualizacoes, totalV))} são orgânicas.`);
    }
    const organicos = itens.filter((i) => i.conteudo !== "Anúncios" && i.alcance > 0 && i.interacoes > 0);
    if (organicos.length >= 2) {
      const taxas = organicos.map((i) => ({ conteudo: i.conteudo, taxa: pctDe(i.interacoes, i.alcance) })).sort((x, y) => y.taxa - x.taxa);
      out.push(`Em interações por alcance, ${taxas[0].conteudo} lidera (${fmtPct(taxas[0].taxa, 1)}) e ${taxas[taxas.length - 1].conteudo} fica por último (${fmtPct(taxas[taxas.length - 1].taxa, 1)}).`);
    }
  }
  if (a.seguiram_e_deixaram.ok) {
    const s = a.seguiram_e_deixaram.dados;
    if (s.seguiram > 0) out.push(`Seguiram ${fmtN(s.seguiram)} e deixaram de seguir ${fmtN(s.deixaram_de_seguir)} nos últimos ${a.periodo.dias} dias: saldo de ${s.saldo >= 0 ? "+" : ""}${fmtN(s.saldo)}. Para cada 100 que seguem, ${fmtN(pctDe(s.deixaram_de_seguir, s.seguiram))} deixam de seguir.`);
  }
  return out;
}

// Janelas em que mais seguidores estão online (média dos últimos dias), em horário de Brasília.
export function melhoresJanelas(mapa: number[][], n = 5): { dia: number; hora: number; online: number }[] {
  const celulas: { dia: number; hora: number; online: number }[] = [];
  mapa.forEach((linha, dia) => linha.forEach((online, hora) => celulas.push({ dia, hora, online })));
  return celulas.sort((a, b) => b.online - a.online).slice(0, n);
}

export function horasDoDia(mapa: number[][]): number[] {
  return Array.from({ length: 24 }, (_, h) => Math.round(mapa.reduce((s, d) => s + (d[h] ?? 0), 0) / Math.max(1, mapa.length)));
}
