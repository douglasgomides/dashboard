import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REGISTRO_DE_TELAS, type TelaDoRegistro } from "../src/lib/registro-de-telas";

// Teste do inventário de telas e cartões (Phase 03.1, TELA-01). Régua do critério 1 do ROADMAP.
//
// O conjunto de telas da fase é o REGISTRO_DE_TELAS filtrado: fora as tiradas, o SAP congelado, as rotas de acesso, as que só
// redirecionam e a de desenvolvimento (43 rotas). docs/redesenho/inventario/*.md tem, por tela, uma linha na tabela "Telas"
// e, por cartão ou bloco, uma linha na tabela "Cartões e blocos". Uma tela só pode ficar "novo" quando a rota usa PaginaNexo e
// LeituraDaTela e nenhum bloco antigo é alcançado pelos imports dela. Só lê arquivos do repositório: não toca dado de produção.
//
// Uso: npx tsx scripts/test-telas-inventario.ts [--listar]   (--listar imprime, por rota, os blocos antigos achados)

/** O 03.1-17 troca para true: nenhuma linha pode ficar "pendente". */
const EXIGIR_TODAS_NOVAS = false;

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LISTAR = process.argv.includes("--listar");
const PROFUNDIDADE = 3;

// --- Telas da fase ------------------------------------------------------------------------------------------------------

const ehDaFase = (t: TelaDoRegistro) => t.situacao !== "tirada" && !t.congelado && !t.acesso && !t.soRedireciona && !t.soDesenvolvimento;
const TELAS = REGISTRO_DE_TELAS.filter(ehDaFase);
assert.equal(new Set(TELAS.map((t) => t.rota)).size, TELAS.length, "o registro tem rota repetida entre as telas da fase");

// --- Leitura das tabelas do inventário ---------------------------------------------------------------------------------

interface LinhaTela {
  rota: string;
  tela: string;
  pergunta: string;
  decisao: string;
  estado: string;
  plano: string;
  excecao: string;
  conferido: string;
  arquivo: string;
}
interface LinhaCartao {
  rota: string;
  cartao: string;
  antes: string;
  depois: string;
  plano: string;
  arquivo: string;
}

const PASTA_INVENTARIO = join(RAIZ, "docs/redesenho/inventario");
assert.ok(existsSync(PASTA_INVENTARIO), "docs/redesenho/inventario não existe");

/** Linhas de dados de uma seção "## Nome" do arquivo: células sem as bordas e sem o cabeçalho e o separador. */
function linhasDaSecao(texto: string, nome: string): string[][] {
  const linhas = texto.split("\n");
  const inicio = linhas.findIndex((l) => l.trim() === `## ${nome}`);
  if (inicio < 0) return [];
  const saida: string[][] = [];
  for (let i = inicio + 1; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (l.startsWith("## ")) break;
    if (!l.startsWith("|")) continue;
    if (/^\|\s*:?-{2,}/.test(l)) continue;
    const celulas = l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (celulas[0] === "Rota") continue;
    saida.push(celulas);
  }
  return saida;
}

const arquivosMd = readdirSync(PASTA_INVENTARIO).filter((f) => f.endsWith(".md")).sort();
assert.ok(arquivosMd.length > 0, "docs/redesenho/inventario não tem nenhum arquivo .md");

const linhasTela: LinhaTela[] = [];
const linhasCartao: LinhaCartao[] = [];
for (const arquivo of arquivosMd) {
  const texto = readFileSync(join(PASTA_INVENTARIO, arquivo), "utf8");
  const telas = linhasDaSecao(texto, "Telas");
  const cartoes = linhasDaSecao(texto, "Cartões e blocos");
  assert.ok(texto.includes("## Telas"), `${arquivo}: falta a seção "## Telas"`);
  assert.ok(texto.includes("## Cartões e blocos"), `${arquivo}: falta a seção "## Cartões e blocos"`);
  for (const c of telas) {
    assert.equal(c.length, 8, `${arquivo}: linha de Telas com ${c.length} colunas (esperado 8: Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido): ${c.join(" | ")}`);
    linhasTela.push({ rota: c[0], tela: c[1], pergunta: c[2], decisao: c[3], estado: c[4], plano: c[5], excecao: c[6], conferido: c[7], arquivo });
  }
  for (const c of cartoes) {
    assert.equal(c.length, 5, `${arquivo}: linha de Cartões e blocos com ${c.length} colunas (esperado 5: Rota | Card ou bloco | Antes | Depois | Plano): ${c.join(" | ")}`);
    linhasCartao.push({ rota: c[0], cartao: c[1], antes: c[2], depois: c[3], plano: c[4], arquivo });
  }
}

// --- Cobertura do registro (TELA-01) -------------------------------------------------------------------------------------

const rotasDaFase = new Set(TELAS.map((t) => t.rota));
const vistas = new Set<string>();
for (const l of linhasTela) {
  assert.ok(rotasDaFase.has(l.rota), `${l.arquivo}: a rota ${l.rota} não é tela da fase no registro (linha a mais)`);
  assert.ok(!vistas.has(l.rota), `${l.arquivo}: a rota ${l.rota} tem mais de uma linha na tabela Telas`);
  vistas.add(l.rota);
  assert.ok(l.estado === "pendente" || l.estado === "novo", `${l.rota}: Estado "${l.estado}" (use pendente ou novo)`);
  assert.match(l.plano, /^03\.1(\.1)?-\d{2}$/, `${l.rota}: Plano "${l.plano}" fora do formato 03.1-NN ou 03.1.1-NN`);
  if (l.excecao) assert.match(l.excecao, /^\S+\.tsx — .{20,}$/, `${l.rota}: Exceção "${l.excecao}" deve ser "arquivo.tsx — motivo" com 20 caracteres ou mais de motivo`);
}
for (const t of TELAS) assert.ok(vistas.has(t.rota), `a tela ${t.rota} (${t.rotulo}) do registro está sem linha no inventário`);

const cartoesPorRota = new Map<string, LinhaCartao[]>();
for (const c of linhasCartao) {
  assert.ok(rotasDaFase.has(c.rota), `${c.arquivo}: o cartão "${c.cartao}" aponta para a rota ${c.rota}, que não é tela da fase`);
  assert.ok(c.cartao.length > 0, `${c.arquivo}: cartão sem nome na rota ${c.rota}`);
  assert.ok(c.antes.length > 0, `${c.arquivo}: o cartão "${c.cartao}" (${c.rota}) está sem "Antes"`);
  const lista = cartoesPorRota.get(c.rota) ?? [];
  lista.push(c);
  cartoesPorRota.set(c.rota, lista);
}
for (const t of TELAS) assert.ok((cartoesPorRota.get(t.rota)?.length ?? 0) > 0, `a tela ${t.rota} está sem linha na tabela Cartões e blocos`);

// --- Marcas de bloco antigo ---------------------------------------------------------------------------------------------

/** Tira comentários de bloco e de linha (sem comer o "//" de uma URL). */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

/** Literais de texto do código: cada um é uma className possível. */
function literais(codigo: string): string[] {
  return [...codigo.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

/** Marcas de desenho antigo numa fonte (sem comentários). ws-metric-value fica de fora: o NxKpi o usa para os testes. */
function marcasDe(fonte: string): string[] {
  const codigo = semComentarios(fonte);
  const marcas = new Set<string>();
  if (/(?<![\w-])ws-panel(?![\w])/.test(codigo)) marcas.add("ws-panel");
  for (const m of codigo.matchAll(/(?<![\w-])ws-metric[\w-]*/g)) if (m[0] !== "ws-metric-value") marcas.add("ws-metric");
  if (/(?<![\w-])dbx-[\w-]+/.test(codigo)) marcas.add("dbx-");
  const cartaoTailwind = literais(codigo).some((l) => /(?:^|\s)rounded-(?:xl|lg|2xl)(?:\s|$)/.test(l) && /(?:^|\s)border(?:\s|$)/.test(l));
  if (cartaoTailwind) marcas.add("cartão Tailwind (rounded + border)");
  if (/from\s+["']recharts["']/.test(codigo)) marcas.add("recharts");
  if (/<table[\s>]/.test(codigo)) marcas.add("tag table");
  return [...marcas];
}

// Autoverificação com fontes sintéticas (T-03.1-08): a varredura tem de acusar as marcas, senão o teste passaria sem medir nada.
{
  assert.ok(marcasDe('<div className="ws-panel">x</div>').includes("ws-panel"), "autoverificação: ws-panel não foi acusado");
  assert.ok(marcasDe('<div className="p-4 rounded-xl border bg-white">x</div>').some((m) => m.startsWith("cartão Tailwind")), "autoverificação: rounded-xl border não foi acusado");
  assert.ok(marcasDe('import { LineChart } from "recharts";').includes("recharts"), "autoverificação: import de recharts não foi acusado");
  assert.ok(marcasDe("<table><tbody /></table>").includes("tag table"), "autoverificação: tag table não foi acusada");
  assert.ok(marcasDe('<span className="ws-metric">x</span>').includes("ws-metric"), "autoverificação: ws-metric não foi acusado");
  assert.ok(marcasDe('<div className="dbx-card">x</div>').includes("dbx-"), "autoverificação: dbx- não foi acusado");
  assert.deepEqual(marcasDe('<b className="ws-metric-value">1</b>'), [], "autoverificação: ws-metric-value não deve ser acusado");
  assert.deepEqual(marcasDe('// <table> ws-panel\n/* dbx-card */\n<div className="nx-card">x</div>'), [], "autoverificação: comentário não deve ser acusado");
  assert.deepEqual(marcasDe('<div className="rounded-xl p-4">x</div>'), [], "autoverificação: rounded-xl sem border não deve ser acusado");
}

// Peças duplicadas que a fase substitui: importadas por uma tela, contam como bloco antigo.
const PECAS_DUPLICADAS = new Set([
  // nx/comercial-base
  "CmTopo", "CmLeitura", "CmAviso", "CmMetodo", "CmRecolhido",
  // nx/instagram
  "IgCabecalho", "IgLeitura", "IgNota", "IgMetodo", "IgMaisAnalises",
  // nx/anuncios-graficos
  "NxTopo", "NxAlertaCurto", "NxNota",
  // nx/admin-base
  "AdmChip", "AdmContador",
  // nx/plano-pecas
  "PlanoCabecalho", "PlanoComo", "PlanoAviso", "PlanoVazio", "PlanoChip",
]);

// Arquivos do SAP congelados com desenho antigo: o fecho não desce neles, só confere os nomes importados.
const CONGELADOS = new Set(
  [
    "sem-fonte.tsx", "planejador-conteudo.tsx", "estrategias-ia.tsx", "agentes-ia.tsx", "prova-resultado.tsx",
    "operacao-recuperacao.tsx", "agentes-trabalho.tsx", "acompanhamento-servico.tsx", "grafico.tsx", "plano-semana.tsx",
    "visual.tsx", "botao-copiar.tsx", "copiloto-secao.tsx", "troca-produto.tsx",
  ].map((n) => `src/components/${n}`),
);

// Átomos dos congelados que uma tela nova pode importar.
const ATOMOS = new Set(["InfoDica", "Ajuda", "Miniatura", "IconeFormato", "BotaoCopiar"]);

/** nx e icons não são procurados em busca de marcas (a tabela do NxTabela é nx), mas os imports deles são seguidos. */
const semBusca = (caminho: string) => caminho.startsWith("src/components/nx/") || caminho.startsWith("src/components/icons/");

// --- Fecho de imports -------------------------------------------------------------------------------------------------

/** Arquivo .tsx de um import em src/components ou src/features, ou null. Só aceita alias @/ e caminhos relativos. */
function resolverImport(especificador: string, deArquivo: string): string | null {
  let base: string;
  if (especificador.startsWith("@/")) base = join(RAIZ, "src", especificador.slice(2));
  else if (especificador.startsWith(".")) base = resolve(dirname(join(RAIZ, deArquivo)), especificador);
  else return null;
  for (const candidato of [`${base}.tsx`, join(base, "index.tsx")]) {
    if (!existsSync(candidato)) continue;
    const rel = relative(RAIZ, candidato);
    if (rel.startsWith("src/components/") || rel.startsWith("src/features/")) return rel;
  }
  return null;
}

interface Importacao {
  de: string;
  nomes: string[];
}

/** Nomes de valor importados (sem `type`) por cada import de uma fonte sem comentários. */
function importacoes(fonte: string): Importacao[] {
  const saida: Importacao[] = [];
  for (const m of fonte.matchAll(/import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
    if (m[1]) continue;
    const nomes: string[] = [];
    const chaves = /\{([^}]*)\}/.exec(m[2]);
    const padrao = m[2].replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim();
    if (padrao && !padrao.startsWith("*")) nomes.push(padrao.split(/\s+/)[0]);
    if (chaves) {
      for (const parte of chaves[1].split(",")) {
        const p = parte.trim();
        if (!p || /^type\s/.test(p)) continue;
        nomes.push(p.split(/\s+as\s+/)[0].trim());
      }
    }
    saida.push({ de: m[3], nomes });
  }
  return saida;
}

const cacheDeFonte = new Map<string, string>();
function fonteDe(caminho: string): string {
  let f = cacheDeFonte.get(caminho);
  if (f === undefined) {
    f = semComentarios(readFileSync(join(RAIZ, caminho), "utf8"));
    cacheDeFonte.set(caminho, f);
  }
  return f;
}

/** routeId do registro -> arquivo em src/routes (/_authenticated/$clientId/ -> _authenticated.$clientId.index.tsx). */
function arquivoDaRota(rota: string): string {
  const miolo = rota.replace(/^\//, "");
  const ponto = miolo.endsWith("/") ? `${miolo.slice(0, -1).replace(/\//g, ".")}.index` : miolo.replace(/\//g, ".");
  return `src/routes/${ponto}.tsx`;
}

interface BlocoAntigo {
  arquivo: string;
  marca: string;
}

/** Blocos antigos alcançados a partir do arquivo da rota (até 3 níveis), menos os arquivos tirados pela Exceção. */
function blocosAntigosDa(arquivoRota: string, excecao: string): BlocoAntigo[] {
  const tirado = excecao ? excecao.split(" — ")[0].trim() : "";
  const achados: BlocoAntigo[] = [];
  const visitados = new Set<string>([arquivoRota]);
  let fila: string[] = [arquivoRota];
  for (let nivel = 0; nivel <= PROFUNDIDADE && fila.length > 0; nivel++) {
    const proxima: string[] = [];
    for (const arquivo of fila) {
      const fonte = fonteDe(arquivo);
      const ehRota = arquivo === arquivoRota;
      if (!semBusca(arquivo) && !CONGELADOS.has(arquivo)) {
        for (const marca of marcasDe(fonte)) achados.push({ arquivo, marca });
      }
      if (CONGELADOS.has(arquivo) && !ehRota) continue; // não desce nos congelados do SAP
      if (nivel === PROFUNDIDADE) continue;
      for (const imp of importacoes(fonte)) {
        const alvo = resolverImport(imp.de, arquivo);
        // Peça duplicada que a fase substitui, venha do arquivo ou do índice de nx.
        if (/(^|\/)components\/nx(\/|$)/.test(imp.de) || (alvo && alvo.startsWith("src/components/nx/"))) {
          for (const nome of imp.nomes) if (PECAS_DUPLICADAS.has(nome)) achados.push({ arquivo, marca: `peça duplicada ${nome}` });
        }
        if (!alvo) continue;
        if (CONGELADOS.has(alvo)) {
          for (const nome of imp.nomes) {
            if (/^[A-Z]/.test(nome) && !/^[A-Z0-9_]+$/.test(nome) && !ATOMOS.has(nome)) achados.push({ arquivo, marca: `bloco antigo ${nome} (${alvo.split("/").pop()})` });
          }
          continue;
        }
        if (!visitados.has(alvo)) {
          visitados.add(alvo);
          proxima.push(alvo);
        }
      }
    }
    fila = proxima;
  }
  return achados.filter((b) => !(tirado && (b.arquivo === tirado || b.arquivo.endsWith(`/${tirado}`))));
}

// --- Conferência por tela -----------------------------------------------------------------------------------------------

function dataValida(texto: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCFullYear() === Number(m[3]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[1]);
}

let novas = 0;
let pendentes = 0;
const antigosPorRota = new Map<string, BlocoAntigo[]>();
for (const t of TELAS) {
  const linha = linhasTela.find((l) => l.rota === t.rota) as LinhaTela;
  const arquivoRota = arquivoDaRota(t.rota);
  assert.ok(existsSync(join(RAIZ, arquivoRota)), `${t.rota}: o arquivo da rota ${arquivoRota} não existe`);
  const antigos = blocosAntigosDa(arquivoRota, linha.excecao);
  antigosPorRota.set(t.rota, antigos);
  if (linha.estado === "pendente") {
    pendentes++;
    continue;
  }
  novas++;
  const cartoes = cartoesPorRota.get(t.rota) ?? [];
  assert.ok(linha.pergunta.endsWith("?") && linha.pergunta.length <= 80, `${t.rota}: a Pergunta deve terminar em "?" e ter até 80 caracteres ("${linha.pergunta}")`);
  assert.ok(dataValida(linha.conferido), `${t.rota}: Conferido deve ser uma data dd/mm/aaaa ("${linha.conferido}")`);
  for (const c of cartoes) assert.ok(c.depois.length > 0, `${t.rota}: tela nova com o cartão "${c.cartao}" sem "Depois"`);
  const fonteRota = fonteDe(arquivoRota);
  assert.ok(fonteRota.includes("<PaginaNexo"), `${t.rota}: marcada novo, mas ${arquivoRota} não usa <PaginaNexo`);
  // Formato 5 segundos (quick-ver-tudo, João 13/11/2026): a leitura saiu do "Ver tudo"; a tela lê os mesmos fatos pelo veredito (com o portão
  // e o "Falta dado") e o que só a leitura dizia vira descoberta (descobertasDaLeitura). Uma das duas formas é obrigatória.
  // Abas sem o veredito (quick-ver-tudo-abas, 13/11/2026): as descobertas da leitura abrem a aba no lugar dela (NxDescobertasDaAba/leituraDaAba
  // ou NxDescobertas/descobertasDaLeitura com o "Falta dado"); abas em construção: o quadro "O que falta" (NxVazio emConstrucao).
  const leConformeOMolde =
    fonteRota.includes("<LeituraDaTela") ||
    (fonteRota.includes("<NxVeredito") && fonteRota.includes("descobertasDaLeitura(")) ||
    (fonteRota.includes("<NxDescobertasDaAba") && fonteRota.includes("leituraDaAba(")) ||
    (fonteRota.includes("<NxDescobertas") && fonteRota.includes("descobertasDaLeitura(") && fonteRota.includes("descobertaDaFaltaDeDado(")) ||
    (fonteRota.includes("<NxVazio") && /\bemConstrucao\b/.test(fonteRota) && fonteRota.includes("quem="));
  assert.ok(leConformeOMolde, `${t.rota}: marcada novo, mas ${arquivoRota} não usa <LeituraDaTela (nem o veredito ou as descobertas com descobertasDaLeitura, nem o quadro "Em construção")`);
  assert.equal(
    antigos.length,
    0,
    `${t.rota}: marcada novo, mas ainda alcança bloco antigo:\n${antigos.map((b) => `  - ${b.arquivo}: ${b.marca}`).join("\n")}`,
  );
}
if (EXIGIR_TODAS_NOVAS) assert.equal(pendentes, 0, `EXIGIR_TODAS_NOVAS: ${pendentes} tela(s) ainda pendente(s)`);

// --- --listar ---------------------------------------------------------------------------------------------------------

if (LISTAR) {
  for (const t of TELAS) {
    const antigos = antigosPorRota.get(t.rota) ?? [];
    console.log(`${t.rota} (${t.rotulo}): ${antigos.length} bloco(s) antigo(s)`);
    for (const b of antigos) console.log(`  - ${b.arquivo}: ${b.marca}`);
  }
}

// --- Tiradas pelo João em 11/11/2026 ("tira isso aí, ninguém usa") -------------------------------------------------------
// Cada arquivo tem a seção "## Tiradas (João 11/11)" com 4 colunas: Rota | Tela ou bloco | Situação | Vai para.

interface LinhaTirada {
  rota: string;
  tela: string;
  situacao: string;
  vaiPara: string;
  arquivo: string;
}
const linhasTiradas: LinhaTirada[] = [];
for (const arquivo of arquivosMd) {
  const texto = readFileSync(join(PASTA_INVENTARIO, arquivo), "utf8");
  for (const c of linhasDaSecao(texto, "Tiradas (João 11/11)")) {
    assert.equal(c.length, 4, `${arquivo}: linha de Tiradas com ${c.length} colunas (esperado 4: Rota | Tela ou bloco | Situação | Vai para): ${c.join(" | ")}`);
    linhasTiradas.push({ rota: c[0], tela: c[1], situacao: c[2], vaiPara: c[3], arquivo });
  }
}
for (const l of linhasTiradas) assert.equal(l.situacao, "tirada (João 11/11)", `${l.arquivo}: a Situação de "${l.tela}" (${l.rota}) deve ser "tirada (João 11/11)"`);
for (const t of REGISTRO_DE_TELAS.filter((x) => x.tiradaEm)) {
  const achada = linhasTiradas.find((l) => l.rota === t.rota && l.tela === t.rotulo);
  assert.ok(achada, `a tirada "${t.rotulo}" (${t.rota}) do registro está sem linha na seção Tiradas do inventário`);
  assert.equal(achada!.vaiPara, t.destino, `${t.rota} (${t.rotulo}): "Vai para" difere do destino do registro`);
}
// Bloco tirado de uma tela que fica ("Vai para" —): a rota tem de ser tela da fase.
for (const l of linhasTiradas.filter((x) => x.vaiPara === "—")) {
  assert.ok(rotasDaFase.has(l.rota), `${l.arquivo}: o bloco tirado "${l.tela}" aponta para ${l.rota}, que não é tela da fase`);
}

console.log(`test-telas-inventario: ok (${TELAS.length} telas: ${novas} novas, ${pendentes} pendentes; ${linhasCartao.length} cartões)`);
