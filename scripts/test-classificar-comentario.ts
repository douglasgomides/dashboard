import assert from "node:assert/strict";
import { classificarComentario as c } from "../src/lib/classificar-comentario";

// Caso real: elogio que virava "Pergunta repetida".
assert.equal(c("Eu poderia ter falado esse texto. Me identifico 200%. Seja bem-vindo de volta!"), "elogio");
assert.equal(c("Amei o conteúdo, parabéns doutora 👏"), "elogio");
assert.equal(c("Obrigada pela explicação"), "elogio");

assert.equal(c("Quanto custa a consulta?"), "pergunta");
assert.equal(c("Como faço para agendar"), "pergunta");
assert.equal(c("é normal sentir dor depois do procedimento"), "pergunta");
assert.equal(c("Doutora, queria saber se atende por convênio"), "pergunta");
assert.equal(c("@fulana você sabe se isso é verdade?"), "outro"); // pergunta a outro seguidor
assert.equal(c("@jaqueribeiro74 poderia passar o contato desse médico ?"), "outro");
assert.equal(c("Ah não é possível 😂😂😂😂 já ?"), "outro");
assert.equal(c("Como abaixar o cortisol??"), "pergunta");
assert.equal(c("Isso ajuda pra quem nao possui vesícula e foi diagnosticada com Sii?"), "pergunta");

assert.equal(c("Eu tive isso na minha gravidez e foi horrível"), "relato");
assert.equal(c("Aconteceu comigo, demorei anos pra descobrir"), "relato");
assert.equal(c("Me sinto pior que isso  coração doe  uma angústia"), "relato");
assert.equal(c("Euuu  angústia é horrível"), "relato");
assert.equal(c("Eu estava enlouquecendo e ninguém me falou."), "relato");
assert.equal(c("Vdd menopausa é horrível é a pior fase  da mulher"), "elogio"); // identificação
assert.equal(c("Parabéns para a minha médica favorita!!!!!"), "elogio");

assert.equal(c("@maria"), "marcacao");
assert.equal(c("@maria olha isso"), "marcacao");
assert.equal(c("@joao @ana kkkk"), "marcacao");

assert.equal(c("🔥🔥🔥"), "outro");
assert.equal(c("ok"), "outro");
assert.equal(c("Segue lá no meu perfil"), "outro");
console.log("test-classificar-comentario: ok");
