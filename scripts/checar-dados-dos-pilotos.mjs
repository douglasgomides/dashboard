#!/usr/bin/env node
// Porta de privacidade da fase 03.1.1.1 (T-03.1.1.1-01): os pilotos HTML aprovados pelo João ficam FORA do repositório porque trazem
// números, nomes e legendas de clientes reais, e o repositório no GitHub é público. Este script confere que nenhuma linha ADICIONADA
// desde o commit-base do plano carrega um desses dados.
//
// Uso:
//   node scripts/checar-dados-dos-pilotos.mjs --pilotos DIR --base SHA     confere as linhas novas (exit 0 = limpo, 1 = achou, 2 = não deu para conferir)
//   node scripts/checar-dados-dos-pilotos.mjs --pilotos DIR --contar       só diz quantos itens proibidos montou (prova que a lista não está vazia)
//
// Lê TODO arquivo *.html e *.js direto em DIR e monta a lista proibida: (a) nomes (campos `nome:` com nome de pessoa ou clínica e
// "Dr./Dra. Nome Sobrenome" do texto), (b) os 20 primeiros caracteres de cada legenda (`cap:`), (c) todo inteiro de 4 dígitos ou mais
// (menos anos 2000-2099, múltiplos de 100 e as constantes de interface) com a forma pt-BR de milhar, (d) todo decimal com 3 dígitos ou
// mais na parte inteira, com a forma pt-BR e o "R$ ". Depois varre só as linhas adicionadas de `git diff -U0 <base>` em src, tests,
// scripts e docs (mais os arquivos novos ainda fora do git) e imprime APENAS "arquivo:linha" de cada achado: nunca o valor real.
// Este script não contém nenhum dado real. Sem dependência: só Node.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const PASTAS = ["src", "tests", "scripts", "docs"];
/** Constantes de interface que aparecem nos pilotos e no código (alturas e larguras da régua de 1,5 tela e das janelas de teste). */
const CONSTANTES_DE_INTERFACE = new Set(["1218", "1280", "1350", "1440"]);

function argumentos(argv) {
  const a = { pilotos: null, base: null, contar: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pilotos") a.pilotos = argv[++i] ?? null;
    else if (argv[i] === "--base") a.base = argv[++i] ?? null;
    else if (argv[i] === "--contar") a.contar = true;
    else {
      console.error(`argumento desconhecido: ${argv[i]}`);
      process.exit(2);
    }
  }
  return a;
}

const emMilhar = (inteiro) => inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Monta a lista proibida a partir dos arquivos .html e .js diretamente em `dir`. */
function listaProibida(dir) {
  const arquivos = readdirSync(dir).filter((n) => /\.(html|js)$/i.test(n) && statSync(join(dir, n)).isFile());
  const nomes = new Set();
  const aberturas = new Set();
  const numeros = new Set();
  for (const arquivo of arquivos) {
    const bruto = readFileSync(join(dir, arquivo), "utf8");

    // (a) nomes. Campo `nome:` só vale como nome de pessoa ou clínica (com título Dr./Dra. ou com 2 palavras iniciadas em maiúscula):
    // rótulos de interface de uma palavra só ("Conversas") não são nome de cliente.
    const pareceNome = (t) => t.length >= 6 && (/^Dra?\.?\s/.test(t) || (t.match(/(^|\s)\p{Lu}/gu) ?? []).length >= 2);
    for (const m of bruto.matchAll(/\bnome\s*:\s*(["'`])((?:(?!\1)[^\n])+)\1/g)) {
      const t = m[2].trim();
      if (pareceNome(t)) nomes.add(t.toLowerCase());
    }
    for (const m of bruto.matchAll(/\bDra?\.\s+\p{Lu}[\p{L}'’-]*(?:\s+(?:(?:de|da|do|dos|das|e)\s+)?\p{Lu}[\p{L}'’-]*)*/gu)) {
      const t = m[0].trim();
      if (t.length >= 6) nomes.add(t.toLowerCase());
    }

    // (b) abertura de legenda: os 20 primeiros caracteres de cada `cap:`.
    for (const m of bruto.matchAll(/\bcap\s*:\s*(["'`])((?:(?!\1)[^\n])+)\1/g)) {
      const t = m[2].trim();
      if (t.length >= 20) aberturas.add(t.slice(0, 20).toLowerCase());
    }

    // (c) e (d) números. Cores hexadecimais saem antes (não são dado).
    const texto = bruto.replace(/#[0-9a-fA-F]{3,8}\b/g, " ");
    for (const m of texto.matchAll(/(?<![\d.])(\d{4,})(?!\d)/g)) {
      const n = m[1];
      const valor = Number(n);
      if (valor >= 2000 && valor <= 2099) continue; // anos
      if (valor % 100 === 0) continue; // múltiplos de 100 (larguras, alturas, redondos)
      if (CONSTANTES_DE_INTERFACE.has(n)) continue;
      numeros.add(n);
      numeros.add(emMilhar(n));
    }
    for (const m of texto.matchAll(/(?<![\d.])(\d{3,})\.(\d+)(?!\d)/g)) {
      const inteira = m[1];
      const decimal = m[2];
      numeros.add(`${inteira}.${decimal}`);
      numeros.add(`${emMilhar(inteira)},${decimal}`);
    }
  }
  return { arquivos: arquivos.length, nomes: [...nomes], aberturas: [...aberturas], numeros };
}

function git(args, opcoes = {}) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...opcoes });
}

/** Linhas adicionadas: do diff contra a base (com número da linha no arquivo novo) e dos arquivos novos ainda fora do git. */
function linhasAdicionadas(base) {
  const saida = git(["diff", "-U0", "--no-color", "--no-ext-diff", base, "--", ...PASTAS]);
  const linhas = [];
  let arquivo = null;
  let atual = 0;
  for (const l of saida.split("\n")) {
    if (l.startsWith("+++ ")) {
      arquivo = l.startsWith("+++ b/") ? l.slice(6) : null;
    } else if (l.startsWith("@@")) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(l);
      atual = m ? Number(m[1]) : 0;
    } else if (l.startsWith("+") && !l.startsWith("+++")) {
      if (arquivo) linhas.push({ arquivo, linha: atual, texto: l.slice(1) });
      atual++;
    }
  }
  const novos = git(["ls-files", "--others", "--exclude-standard", "--", ...PASTAS]).split("\n").filter(Boolean);
  for (const arquivoNovo of novos) {
    let conteudo = "";
    try {
      conteudo = readFileSync(arquivoNovo, "utf8");
    } catch {
      continue;
    }
    conteudo.split("\n").forEach((texto, k) => linhas.push({ arquivo: arquivoNovo, linha: k + 1, texto }));
  }
  return linhas;
}

const a = argumentos(process.argv.slice(2));
if (!a.pilotos) {
  console.error("faltou --pilotos DIR");
  process.exit(2);
}
let proibida;
try {
  proibida = listaProibida(resolve(a.pilotos));
} catch (e) {
  console.error(`não deu para ler os pilotos: ${e.message}`);
  process.exit(2);
}
const total = proibida.nomes.length + proibida.aberturas.length + proibida.numeros.size;

if (a.contar) {
  console.log(`${total} itens proibidos montados de ${proibida.arquivos} arquivos dos pilotos`);
  console.log(`  nomes: ${proibida.nomes.length}, aberturas de legenda: ${proibida.aberturas.length}, números e formas: ${proibida.numeros.size}`);
  process.exit(total > 0 ? 0 : 1);
}
if (total === 0) {
  console.error("a lista proibida ficou vazia: a porta passaria sem conferir nada (use --contar para diagnosticar)");
  process.exit(2);
}
if (!a.base) {
  console.error("faltou --base SHA");
  process.exit(2);
}

let linhas;
try {
  linhas = linhasAdicionadas(a.base);
} catch (e) {
  console.error(`o git não conseguiu comparar com a base ${a.base}: ${String(e.stderr ?? e.message).split("\n")[0]}`);
  process.exit(2);
}

const achados = new Map(); // "arquivo:linha" -> quantidade
let trechos = 0;
for (const { arquivo, linha, texto } of linhas) {
  const baixa = texto.toLowerCase();
  let n = 0;
  for (const nome of proibida.nomes) if (baixa.includes(nome)) n++;
  for (const abertura of proibida.aberturas) if (baixa.includes(abertura)) n++;
  // Candidatos da linha: sequências de dígitos, decimais com ponto, formas pt-BR com milhar e decimais com vírgula.
  const candidatos = new Set([
    ...(texto.match(/(?<![\d.])\d+/g) ?? []),
    ...(texto.match(/\d+\.\d+/g) ?? []),
    ...(texto.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?/g) ?? []),
    ...(texto.match(/\d+,\d+/g) ?? []),
  ]);
  for (const candidato of candidatos) if (proibida.numeros.has(candidato)) n++;
  if (n > 0) {
    achados.set(`${arquivo}:${linha}`, n);
    trechos += n;
  }
}
for (const lugar of achados.keys()) console.log(lugar);
console.log(`${trechos} trechos dos pilotos nas linhas novas`);
process.exit(trechos > 0 ? 1 : 0);
