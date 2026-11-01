/**
 * Testes de contrato das APIs: conferem se a resposta de cada API ainda tem os campos e os tipos de que o código
 * do Nexo depende. Ver docs/apis/README.md.
 *
 * Dois modos:
 *  - offline (sempre; roda no `npm run check`): lê a amostra sem dado pessoal em scripts/fixtures/contrato/<api>.json,
 *    confere os campos declarados e passa a amostra pelas funções reais de leitura do código (importadas, só leitura);
 *  - ao vivo (só com CONTRATO_AO_VIVO=1, fora do CI): faz GET na API de verdade com o token da variável de ambiente e
 *    compara o FORMATO da resposta com os mesmos campos. Nunca imprime token, URL com query nem corpo: só o nome do
 *    campo, o tipo esperado e o tipo encontrado.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Tipo = "string" | "number" | "boolean" | "object" | "array" | "null";
export type Campo = { caminho: string; tipos: Tipo[]; opcional: boolean };
export type Diferenca = { caminho: string; problema: "ausente" | "tipo" | "nao_e_lista" | "sem_amostra"; detalhe: string };

const TIPOS = new Set<Tipo>(["string", "number", "boolean", "object", "array", "null"]);

/**
 * Campos no formato "caminho: tipo|tipo". "?" no fim do caminho = pode faltar. "[]" = cada item da lista.
 * Ex.: "data[].id: string", "data[].won_at?: string|null", "[].code: number", "tags[]: string".
 * Regra do meio do caminho: lista ausente não gera folha (exija com "x: array"); objeto ausente faz o filho
 * contar como ausente (declare o filho com "?" se o objeto pode faltar).
 */
export function campos(linhas: string[]): Campo[] {
  return linhas.map((l) => {
    const i = l.lastIndexOf(":");
    if (i < 0) throw new Error(`campo sem tipo: ${l}`);
    let caminho = l.slice(0, i).trim();
    const tipos = l.slice(i + 1).split("|").map((t) => t.trim()) as Tipo[];
    for (const t of tipos) if (!TIPOS.has(t)) throw new Error(`tipo desconhecido em ${l}: ${t}`);
    const opcional = caminho.endsWith("?");
    if (opcional) caminho = caminho.slice(0, -1);
    return { caminho, tipos, opcional };
  });
}

export function tipoDe(v: unknown): Tipo {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return t;
  return "object";
}

const AUSENTE = Symbol("ausente");
const MAX_ITENS = 50; // amostra por lista: ao vivo não precisa olhar a página inteira

type Folha = { valor: unknown } | { ausente: true };

/** Valores no fim do caminho. Lista vazia no meio = nenhuma folha (sem amostra). */
function folhas(raiz: unknown, caminho: string, naoLista: string[]): Folha[] {
  const segs = caminho.split(".");
  let atuais: unknown[] = [raiz];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const lista = seg.endsWith("[]");
    const chave = lista ? seg.slice(0, -2) : seg;
    const prox: unknown[] = [];
    for (const no of atuais) {
      if (no === AUSENTE) { prox.push(AUSENTE); continue; }
      let v: unknown;
      if (chave === "") v = no;
      else if (no && typeof no === "object" && !Array.isArray(no) && Object.hasOwn(no, chave)) v = (no as Record<string, unknown>)[chave];
      else v = AUSENTE;
      if (!lista) { prox.push(v === null && i < segs.length - 1 ? AUSENTE : v); continue; }
      // Lista ausente: o ramo some (quem exige a lista declara "x: array"). Objeto ausente no meio: o filho conta como ausente.
      if (v === AUSENTE || v === null) continue;
      if (!Array.isArray(v)) { naoLista.push(segs.slice(0, i + 1).join(".")); continue; }
      prox.push(...v.slice(0, MAX_ITENS));
    }
    atuais = prox;
  }
  return atuais.map((v) => (v === AUSENTE ? { ausente: true as const } : { valor: v }));
}

/** Compara o corpo com os campos. Sem valores na saída: só caminho, tipo esperado e tipos vistos. */
export function compararFormato(corpo: unknown, lista: Campo[]): Diferenca[] {
  const out: Diferenca[] = [];
  for (const c of lista) {
    const naoLista: string[] = [];
    const fs = folhas(corpo, c.caminho, naoLista);
    for (const p of new Set(naoLista)) out.push({ caminho: p, problema: "nao_e_lista", detalhe: "esperava lista" });
    if (fs.length === 0) {
      if (!naoLista.length) out.push({ caminho: c.caminho, problema: "sem_amostra", detalhe: "lista vazia, campo não conferido" });
      continue;
    }
    const ausentes = fs.filter((f) => "ausente" in f).length;
    if (ausentes && !c.opcional) out.push({ caminho: c.caminho, problema: "ausente", detalhe: `ausente em ${ausentes} de ${fs.length}` });
    const vistos = new Set<Tipo>();
    for (const f of fs) if ("valor" in f) vistos.add(tipoDe(f.valor));
    const errados = [...vistos].filter((t) => !c.tipos.includes(t));
    if (errados.length) out.push({ caminho: c.caminho, problema: "tipo", detalhe: `esperava ${c.tipos.join("|")}, veio ${[...vistos].join("|")}` });
  }
  return out;
}

const RAIZ_FIXTURES = fileURLToPath(new URL("../fixtures/contrato/", import.meta.url));

export function carregarFixture(api: string): Record<string, unknown> {
  const fixture = JSON.parse(readFileSync(`${RAIZ_FIXTURES}${api}.json`, "utf8")) as Record<string, unknown>;
  const problemas = dadoSensivel(fixture);
  if (problemas.length) throw new Error(`fixture ${api} parece ter dado real: ${problemas.join("; ")}`);
  return fixture;
}

/**
 * Trava contra dado real na amostra: e-mail só @exemplo.com, telefone só com "0000", nenhum campo de segredo
 * preenchido com algo que não seja "EXEMPLO". Heurística, não substitui revisão.
 */
export function dadoSensivel(v: unknown, caminho = "", out: string[] = []): string[] {
  if (typeof v === "string") {
    for (const m of v.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []) if (!/@exemplo\.com$/i.test(m)) out.push(`${caminho}: e-mail fora de @exemplo.com`);
    const digitos = v.replace(/[\s()+-]/g, "");
    if (/^\d{10,13}$/.test(digitos) && !digitos.includes("0000")) out.push(`${caminho}: parece telefone real`);
    if (/\b(eyJ[\w-]{10,}|sk-[\w-]{10,}|pn_[\w-]{10,}|EAA[\w]{20,})/.test(v)) out.push(`${caminho}: parece token`);
  } else if (Array.isArray(v)) v.forEach((x, i) => dadoSensivel(x, `${caminho}[${i}]`, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (/^(access_?token|api_?key|token|authorization|secret|senha|password)$/i.test(k) && typeof x === "string" && x !== "EXEMPLO") out.push(`${caminho}.${k}: segredo preenchido`);
      dadoSensivel(x, `${caminho}.${k}`, out);
    }
  }
  return out;
}

/** `seguir` (seguir redirecionamento) só vale sem cabeçalhos: nenhum segredo pode ir para outro host. */
export type PedidoAoVivo = { url: string; headers?: Record<string, string>; corpo?: "json" | "texto"; seguir?: boolean };

export interface Endpoint {
  /** Nome curto, igual à chave da fixture (scripts/fixtures/contrato/<api>.json). */
  nome: string;
  /** Nome mostrado na saída, quando o mesmo formato é conferido mais de uma vez (ex.: um por modelo de IA). */
  rotulo?: string;
  /** O que o código lê desta resposta. */
  campos: Campo[];
  /** Transforma o corpo antes de comparar (ex.: CSV → cabeçalho). Usado nos dois modos. */
  transformar?: (corpo: unknown) => unknown;
  /** Avisos extras sem valores (ex.: "duas ações de conversa na mesma linha"). Usado nos dois modos. */
  avisos?: (corpo: unknown) => string[];
  /**
   * Como chamar ao vivo (só GET). null = faltam variáveis; a mensagem diz quais. `anteriores` traz os corpos já
   * lidos nesta rodada (ficam só na memória), para pegar um id de exemplo.
   */
  aoVivo?: (env: NodeJS.ProcessEnv, anteriores: Record<string, unknown>) => PedidoAoVivo | null | string;
  /** Hosts aceitos ao vivo. Qualquer outro é recusado antes do pedido. */
  hosts?: RegExp; // obrigatório para quem tem aoVivo: sem ele o pedido é recusado
  /** Cabeçalhos sem segredo que vale mostrar (ex.: facebook-api-version). */
  cabecalhos?: string[];
}

export interface Contrato {
  api: string;
  endpoints: Endpoint[];
  /** Passa a fixture pelas funções reais do código. Lança erro (assert) se o resultado não for o esperado. */
  normalizadores: (fixture: Record<string, unknown>) => void | Promise<void>;
  /** Variáveis de ambiente usadas ao vivo (para a mensagem de "pulado"). */
  variaveis?: string[];
}

function imprimir(api: string, nome: string, difs: Diferenca[], avisos: string[]) {
  for (const d of difs) console.log(`  [${api}/${nome}] ${d.problema}: ${d.caminho} (${d.detalhe})`);
  for (const a of avisos) console.log(`  [${api}/${nome}] aviso: ${a}`);
}

export function offline(c: Contrato, fixture: Record<string, unknown>): number {
  let falhas = 0;
  for (const e of c.endpoints) {
    if (!Object.hasOwn(fixture, e.nome)) throw new Error(`fixture ${c.api} sem a amostra "${e.nome}"`);
    const corpo = e.transformar ? e.transformar(fixture[e.nome]) : fixture[e.nome];
    const difs = compararFormato(corpo, e.campos);
    // Offline a amostra tem de cobrir tudo: "sem amostra" também é falha.
    if (difs.length) { falhas += difs.length; imprimir(c.api, e.nome, difs, []); }
  }
  return falhas;
}

export async function aoVivo(c: Contrato): Promise<{ conferidos: number; diferencas: number; erros: number; pulados: number }> {
  const anteriores: Record<string, unknown> = {};
  let diferencas = 0;
  let erros = 0;
  let pulados = 0;
  let conferidos = 0;
  for (const e of c.endpoints) {
    const nome = e.rotulo ?? e.nome;
    if (!e.aoVivo) { console.log(`  [${c.api}/${nome}] ao vivo: não se aplica`); continue; }
    let p: ReturnType<NonNullable<Endpoint["aoVivo"]>>;
    try { p = e.aoVivo(process.env, anteriores); } catch { p = "não deu para montar o pedido"; }
    if (!p || typeof p === "string") {
      pulados++;
      console.log(`  [${c.api}/${nome}] ao vivo: pulado (${typeof p === "string" ? p : `faltam ${(c.variaveis ?? []).join(", ")}`})`);
      continue;
    }
    let url: URL;
    try { url = new URL(p.url); } catch { erros++; console.log(`  [${c.api}/${nome}] ao vivo: endereço inválido`); continue; }
    // Sem lista de hosts, não chama: o token só vai para o host conhecido da API.
    if (url.protocol !== "https:" || !e.hosts || !e.hosts.test(url.hostname)) {
      erros++;
      console.log(`  [${c.api}/${nome}] ao vivo: host recusado (${url.hostname})`);
      continue;
    }
    try {
      // Só GET, sem seguir redirecionamento (o token não vai para outro host), com prazo.
      const seguir = !!p.seguir && !p.headers && !url.search.match(/token|key/i);
      const r = await fetch(url, { method: "GET", headers: p.headers, redirect: seguir ? "follow" : "error", signal: AbortSignal.timeout(20_000) });
      for (const h of e.cabecalhos ?? []) {
        const v = r.headers.get(h);
        console.log(`  [${c.api}/${nome}] cabeçalho ${h}: ${v ? v.slice(0, 40) : "ausente"}`);
      }
      if (!r.ok) {
        erros++;
        // Só o código: o corpo pode trazer dado do cliente ou eco do token.
        console.log(`  [${c.api}/${nome}] ao vivo: HTTP ${r.status}${r.status === 429 ? " (limite de pedidos)" : r.status === 401 || r.status === 403 ? " (token ou permissão)" : ""}`);
        await r.body?.cancel();
        continue;
      }
      const bruto = p.corpo === "texto" ? await r.text() : await r.json();
      anteriores[e.nome] = bruto;
      conferidos++;
      const corpo = e.transformar ? e.transformar(bruto) : bruto;
      const difs = compararFormato(corpo, e.campos);
      const avisos = e.avisos ? e.avisos(corpo) : [];
      const reais = difs.filter((d) => d.problema !== "sem_amostra");
      diferencas += reais.length;
      if (!difs.length && !avisos.length) console.log(`  [${c.api}/${nome}] ao vivo: formato igual`);
      imprimir(c.api, nome, difs, avisos);
    } catch (err) {
      erros++;
      // Só o tipo do erro: a mensagem de alguns erros de fetch repete a URL (com token na query, em RD e Windsor).
      const tipo = err instanceof Error ? err.name : "erro";
      console.log(`  [${c.api}/${nome}] ao vivo: falha (${tipo}: rede, prazo ou resposta que não é JSON)`);
    }
  }
  return { conferidos, diferencas, erros, pulados };
}

/** Ponto de entrada de cada scripts/test-contrato-<api>.ts. */
export async function rodarContrato(c: Contrato): Promise<void> {
  const fixture = carregarFixture(c.api);
  const falhas = offline(c, fixture);
  await c.normalizadores(fixture);
  if (falhas) throw new Error(`contrato ${c.api}: a amostra não tem o formato que o código lê (${falhas} diferença(s))`);
  console.log(`contrato ${c.api} offline ok (${c.endpoints.length} respostas)`);

  if (process.env.CONTRATO_AO_VIVO !== "1") return;
  if (process.env.CI) { console.log(`contrato ${c.api}: modo ao vivo ignorado no CI`); return; }
  const r = await aoVivo(c);
  const ok = r.diferencas === 0 && r.erros === 0;
  // "ok" com nada conferido seria o mesmo erro do "sync ok que falhou": a situação diz se houve conferência.
  const situacao = !ok ? "mudou_ou_falhou" : r.conferidos === 0 ? "nao_conferido" : "ok";
  // Linha para a rotina diária ler (sem valores).
  console.log(`CONTRATO_RESULTADO ${JSON.stringify({ api: c.api, ok, situacao, ...r })}`);
  if (!ok) process.exitCode = 1;
}
