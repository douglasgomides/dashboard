/**
 * Lê no navegador o arquivo de transcrição enviado na tela Reuniões. O arquivo não é guardado: só o texto extraído vai
 * para o campo de transcrição (e passa pela mesma máscara de dado pessoal antes da IA).
 * Aceita .docx (a transcrição do Meet é um Google Doc: Arquivo › Fazer download › .docx ou .txt), .txt, .md, .vtt e .srt.
 */
import { unzipSync, strFromU8 } from "fflate";
import { MAX_TRANSCRICAO } from "./reunioes";

export const EXTENSOES_TRANSCRICAO = [".docx", ".txt", ".md", ".vtt", ".srt"];
export const MAX_ARQUIVO_BYTES = 5 * 1024 * 1024;

const ENTIDADES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const limpar = (t: string) => t.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** Legenda (.vtt/.srt): tira cabeçalho, numeração e marcações de tempo; mantém falas e nomes de quem fala. */
export function textoDeLegenda(t: string): string {
  return limpar(t.replace(/^﻿/, "").split("\n")
    .filter((l) => !/^WEBVTT/.test(l) && !/^\d+\s*$/.test(l.trim()) && !/-->/.test(l) && !/^(NOTE|STYLE)\b/.test(l))
    .map((l) => l.replace(/<v\s+([^>]+)>/g, "$1: ").replace(/<[^>]+>/g, ""))
    .join("\n"));
}

/** .docx: lê word/document.xml; cada parágrafo vira uma linha. */
export function textoDeDocx(bytes: Uint8Array): string {
  let arquivos: Record<string, Uint8Array>;
  try { arquivos = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" }); }
  catch { throw new Error("Não consegui abrir o .docx. Baixe a transcrição de novo ou envie como .txt."); }
  const xml = arquivos["word/document.xml"];
  if (!xml) throw new Error("Este .docx não tem texto. Baixe a transcrição de novo ou envie como .txt.");
  return limpar(strFromU8(xml)
    .replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTIDADES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))));
}

/** Extrai o texto conforme a extensão. Erro com mensagem pronta para a tela quando não dá. */
export function textoDoArquivo(nome: string, bytes: Uint8Array): { texto: string; cortado: boolean } {
  const ext = nome.toLowerCase().slice(nome.lastIndexOf("."));
  if (!EXTENSOES_TRANSCRICAO.includes(ext)) throw new Error("Envie a transcrição em .docx, .txt, .vtt ou .srt. PDF ainda não é lido.");
  if (bytes.byteLength > MAX_ARQUIVO_BYTES) throw new Error("Arquivo maior que 5 MB. Envie só a transcrição, sem gravação.");
  const bruto = ext === ".docx" ? textoDeDocx(bytes) : strFromU8(bytes);
  const texto = ext === ".vtt" || ext === ".srt" ? textoDeLegenda(bruto) : limpar(bruto.replace(/^﻿/, ""));
  if (!texto) throw new Error("O arquivo não tem texto.");
  return { texto: texto.slice(0, MAX_TRANSCRICAO), cortado: texto.length > MAX_TRANSCRICAO };
}
