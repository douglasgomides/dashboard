import assert from "node:assert/strict";
import { contatosPendentes, nomesDasTagsClint } from "../api/_lib/clint-tags";

// Tags que o próprio Nexo escreve no CRM não dizem origem; nomes repetidos e vazios saem.
assert.deepEqual(
  nomesDasTagsClint([{ name: "instagram_douglas" }, { name: "Nexo | Origem não documentada" }, "site_doctor", { name: " " }, "site_doctor"]),
  ["instagram_douglas", "site_doctor"],
);
assert.deepEqual(nomesDasTagsClint(null), []);

// Fila: do negócio mais novo para o mais velho, sem repetir, pulando quem foi lido há pouco.
const agora = Date.parse("2026-10-29T12:00:00Z");
const lidos = new Map([
  ["b", "2026-10-28T12:00:00Z"], // lido ontem: pula
  ["c", "2026-09-01T12:00:00Z"], // lido há 2 meses: lê de novo
]);
assert.deepEqual(contatosPendentes(["a", "b", "a", "c", "", "d"], lidos, agora), ["a", "c", "d"]);
console.log("test-clint-tags: ok");
