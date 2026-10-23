import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { textoDoArquivo, textoDeLegenda } from "../src/lib/reunioes-arquivo";
import { MAX_TRANSCRICAO } from "../src/lib/reunioes";

// .docx como o Google Docs exporta: parágrafos viram linhas, entidades são decodificadas.
const xml = '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Dra. Ana: vamos focar em menopausa &amp; sono</w:t></w:r></w:p><w:p><w:r><w:t>Equipe:</w:t><w:tab/><w:t>combinado</w:t></w:r></w:p></w:body></w:document>';
const docx = zipSync({ "word/document.xml": strToU8(xml), "[Content_Types].xml": strToU8("<Types/>") });
assert.equal(textoDoArquivo("Transcrição.docx", docx).texto, "Dra. Ana: vamos focar em menopausa & sono\nEquipe:\tcombinado");

// .vtt do Meet: sem cabeçalho, números e tempos; quem fala fica.
const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Dra. Ana>Quero focar em menopausa</v>\n\n2\n00:00:05.000 --> 00:00:07.000\nCombinado.";
assert.equal(textoDeLegenda(vtt), "Dra. Ana: Quero focar em menopausa\n\nCombinado.");
assert.equal(textoDoArquivo("aula.srt", strToU8("1\n00:00:01,000 --> 00:00:02,000\nOlá\n")).texto, "Olá");

// .txt com BOM; texto longo é cortado no limite da transcrição.
assert.equal(textoDoArquivo("t.txt", strToU8("﻿oi")).texto, "oi");
const longo = textoDoArquivo("t.txt", strToU8("a".repeat(MAX_TRANSCRICAO + 10)));
assert.equal(longo.texto.length, MAX_TRANSCRICAO);
assert.equal(longo.cortado, true);

// Erros com mensagem pronta para a tela.
assert.throws(() => textoDoArquivo("t.pdf", strToU8("x")), /docx, \.txt/);
assert.throws(() => textoDoArquivo("t.docx", strToU8("não é zip")), /Não consegui abrir/);
assert.throws(() => textoDoArquivo("t.docx", zipSync({ "x.txt": strToU8("x") })), /não tem texto/);
assert.throws(() => textoDoArquivo("t.txt", strToU8("   ")), /não tem texto/);
console.log("reunioes-arquivo ok");
