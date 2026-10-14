/**
 * Anúncios lidos de uma planilha do gestor de tráfego (clients.ads_planilha_url).
 *
 * Existe para cliente cuja conta de anúncios nem a Meta nem a Windsor entregam (Dra. Marcelly Achkar:
 * impulsionamentos feitos pelo Instagram numa conta fora de qualquer BM nossa). A planilha é SEMANAL, uma
 * linha por post turbinado em cada dia de análise. Não existe dado diário nela, então o resultado vai para
 * ads_planilha_semanal e NUNCA é espalhado em dias nem gravado em meta_ads_daily: seria dado inventado.
 *
 * Regras de limpeza (a planilha tem sujeira real, conferida em 14/10/2026):
 *  - dia de análise no futuro é descartado (o bloco "30/12/2026" são acumulados do ano, não uma semana);
 *  - valor negativo vira nulo (o bloco de 10/07 subtrai acumulados e dá -R$ 12 mil no período);
 *  - linha sem data ou sem link do post é ignorada;
 *  - o mesmo post duas vezes no mesmo dia de análise: vale a primeira linha;
 *  - "seguidores no período" só vale quando Após - Antes bate com ele. Na análise de 10/07 cinco linhas
 *    trazem o TOTAL de seguidores no lugar do ganho (ex.: antes 8.991, após 15.103, "período" 8.991);
 *    nelas o ganho e o custo por seguidor viram nulos, em vez de mostrar um custo de R$ 0,01.
 */
import { createClient } from "@supabase/supabase-js";

export interface AdsPlanilhaLinha {
  analise_em: string;
  post_url: string;
  nome: string | null;
  tipo: string | null;
  status: string | null;
  acao: string | null;
  orcamento_dia: number | null;
  valor_total: number | null;
  valor_periodo: number | null;
  seguidores_antes: number | null;
  seguidores_apos: number | null;
  seguidores_periodo: number | null;
  mensagens_antes: number | null;
  mensagens_depois: number | null;
  mensagens_periodo: number | null;
  custo_seguidor: number | null;
  custo_mensagem: number | null;
}

export interface AdsPlanilhaLeitura {
  linhas: AdsPlanilhaLinha[];
  descartadas: { futuro: number; semLink: number; duplicadas: number };
  negativosAnulados: number;
  inconsistentesAnulados: number;
}

// CSV com aspas e quebras de linha dentro de campo (RFC 4180).
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      campo = "";
      linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

// "R$ 1.234,56" -> 1234.56 ; "\-R$ 4.269,16" -> -4269.16 ; vazio -> null
export function lerReais(s: string | undefined): number | null {
  const t = (s ?? "").replace(/\\/g, "").trim();
  if (!t) return null;
  const negativo = t.includes("-");
  const num = t.replace(/[^\d,]/g, "").replace(",", ".");
  if (!num) return null;
  const v = Number(num);
  if (!Number.isFinite(v)) return null;
  return negativo ? -v : v;
}

// "1.905" -> 1905 (ponto é milhar na planilha) ; "" -> null
export function lerInteiro(s: string | undefined): number | null {
  const t = (s ?? "").replace(/\\/g, "").trim();
  if (!t) return null;
  const negativo = t.includes("-");
  const num = t.replace(/[^\d]/g, "");
  if (!num) return null;
  const v = Number(num);
  return negativo ? -v : v;
}

// "dd/mm/aaaa" -> "aaaa-mm-dd" (ou null se não for data válida)
export function lerData(s: string | undefined): string | null {
  const m = (s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, a] = m;
  const iso = `${a}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function texto(s: string | undefined): string | null {
  const t = (s ?? "").replace(/\\/g, "").replace(/\s+/g, " ").trim();
  return t || null;
}

// Tira parâmetros (?img_index=4) e barra final, para o mesmo post ter sempre a mesma chave.
function normalizarLink(s: string | undefined): string | null {
  const t = (s ?? "").replace(/\\/g, "").trim();
  if (!t) return null;
  return t.split("?")[0].replace(/\/+$/, "");
}

export function interpretarPlanilha(csv: string, hojeIso: string): AdsPlanilhaLeitura {
  const tabela = lerCsv(csv);
  const cab = (tabela[0] ?? []).map((c) => c.trim().toLowerCase());
  const col = (nome: string) => cab.indexOf(nome.toLowerCase());
  const idx = {
    dia: col("Dia da Análise"),
    status: col("Status"),
    acao: col("Ações"),
    nome: col("Nome da Campanha"),
    link: col("Link do Post"),
    tipo: col("Tipo"),
    orc: col("Orçamento"),
    total: col("Valor Investido Total"),
    seguAntes: col("Seguidores Antes"),
    periodo: col("Valor no Período"),
    seguApos: col("Seguidores Após"),
    seguPer: col("Seguidores Periodo"),
    cSeg: col("Custo por Seguidor"),
    cMsg: col("Custo por Mensagem"),
    msgAntes: col("Mensagens Antes"),
    msgDepois: col("Mensagens Depois"),
    msgPer: col("Mensagens Período"),
  };
  const faltando = Object.entries(idx).filter(([, v]) => v < 0).map(([k]) => k);
  if (faltando.length) throw new Error(`Planilha mudou de formato: faltam as colunas ${faltando.join(", ")}`);

  const vistos = new Set<string>();
  const out: AdsPlanilhaLinha[] = [];
  const descartadas = { futuro: 0, semLink: 0, duplicadas: 0 };
  let negativosAnulados = 0;
  let inconsistentesAnulados = 0;
  const anulaNegativo = (v: number | null): number | null => {
    if (v != null && v < 0) {
      negativosAnulados++;
      return null;
    }
    return v;
  };

  for (const r of tabela.slice(1)) {
    const dia = lerData(r[idx.dia]);
    if (!dia) continue; // linha separadora ou data ilegível
    if (dia > hojeIso) {
      descartadas.futuro++;
      continue;
    }
    const link = normalizarLink(r[idx.link]);
    if (!link) {
      descartadas.semLink++;
      continue;
    }
    const chave = `${dia}|${link}`;
    if (vistos.has(chave)) {
      descartadas.duplicadas++;
      continue;
    }
    vistos.add(chave);
    const antes = lerInteiro(r[idx.seguAntes]);
    const apos = lerInteiro(r[idx.seguApos]);
    let segPer = anulaNegativo(lerInteiro(r[idx.seguPer]));
    let custoSeg = anulaNegativo(lerReais(r[idx.cSeg]));
    if (segPer != null && !(antes != null && apos != null && apos - antes === segPer)) {
      inconsistentesAnulados++;
      segPer = null;
      custoSeg = null;
    }
    out.push({
      analise_em: dia,
      post_url: link,
      nome: texto(r[idx.nome]),
      tipo: texto(r[idx.tipo]),
      status: texto(r[idx.status]),
      acao: texto(r[idx.acao]),
      orcamento_dia: lerInteiro(r[idx.orc]),
      valor_total: anulaNegativo(lerReais(r[idx.total])),
      valor_periodo: anulaNegativo(lerReais(r[idx.periodo])),
      seguidores_antes: antes,
      seguidores_apos: apos,
      seguidores_periodo: segPer,
      mensagens_antes: lerInteiro(r[idx.msgAntes]),
      mensagens_depois: lerInteiro(r[idx.msgDepois]),
      mensagens_periodo: anulaNegativo(lerInteiro(r[idx.msgPer])),
      custo_seguidor: custoSeg,
      custo_mensagem: anulaNegativo(lerReais(r[idx.cMsg])),
    });
  }
  return { linhas: out, descartadas, negativosAnulados, inconsistentesAnulados };
}

const MOTIVO_PLANILHA =
  "Anúncios lidos da planilha de distribuição do gestor de tráfego, porque a conta de anúncios ainda não está liberada para o dashboard na Meta. Os valores são semanais, anotados a cada análise.";

export interface AdsPlanilhaSyncEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  onlyClientId?: string;
}

export interface AdsPlanilhaSyncResult {
  client_id: string;
  rows: number;
  errors: string[];
  ate?: string | null;
}

export async function runAdsPlanilhaSync(env: AdsPlanilhaSyncEnv): Promise<AdsPlanilhaSyncResult[]> {
  const sb = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let q = sb.from("clients").select("id, ads_planilha_url").eq("active", true).not("ads_planilha_url", "is", null);
  if (env.onlyClientId) q = q.eq("id", env.onlyClientId);
  const { data: clientes, error } = await q;
  if (error) throw new Error(error.message);

  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const resultados: AdsPlanilhaSyncResult[] = [];
  for (const c of clientes ?? []) {
    const res: AdsPlanilhaSyncResult = { client_id: c.id, rows: 0, errors: [] };
    resultados.push(res);
    try {
      const url = String(c.ads_planilha_url);
      if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) throw new Error("Link da planilha não é do Google Planilhas");
      const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`Planilha respondeu ${r.status} (o compartilhamento do link precisa estar aberto)`);
      const csv = await r.text();
      if (csv.trimStart().startsWith("<")) throw new Error("A planilha pediu login: o link não está aberto para quem tem o link");
      const { linhas } = interpretarPlanilha(csv, hoje);
      if (linhas.length === 0) throw new Error("Nenhuma linha válida na planilha");
      const agora = new Date().toISOString();
      for (let i = 0; i < linhas.length; i += 200) {
        const lote = linhas.slice(i, i + 200).map((l) => ({ ...l, client_id: c.id, atualizado_em: agora }));
        const { error: eUp } = await sb.from("ads_planilha_semanal").upsert(lote, { onConflict: "client_id,analise_em,post_url" });
        if (eUp) throw new Error(eUp.message);
        res.rows += lote.length;
      }
      res.ate = linhas.reduce((m, l) => (l.analise_em > m ? l.analise_em : m), "");
      // Fonte manual: sem isto o painel lê "sem dado novo na origem" quando a última análise passa de 3 dias.
      await sb.from("sync_status").upsert(
        {
          client_id: c.id,
          fonte: "anuncios",
          motivo: MOTIVO_PLANILHA,
          motivo_dono: "manual",
          motivo_em: new Date().toISOString(),
        },
        { onConflict: "client_id,fonte" },
      );
    } catch (e) {
      res.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return resultados;
}
