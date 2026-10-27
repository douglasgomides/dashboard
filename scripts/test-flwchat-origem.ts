import assert from "node:assert/strict";
import { origemDaDescricao, origemDasTags, tipoDasTags } from "../api/_lib/flwchat-sync";

assert.equal(origemDaDescricao("Origem: Instagram"), "Instagram");
assert.equal(origemDaDescricao("origem organica, quer agendar"), "Orgânico");
assert.equal(origemDaDescricao("Orgânico"), "Orgânico");
assert.equal(origemDaDescricao("Veio pelo CONTEÚDO do reels"), "Conteúdo");
assert.equal(origemDaDescricao("Indicação. Esposo de paciente"), "Indicação");
assert.equal(origemDaDescricao("Instagram e indicação"), null);
assert.equal(origemDaDescricao("Implanon por convenio"), null);
assert.equal(origemDaDescricao("instagramer"), null);
assert.equal(origemDaDescricao(""), null);
assert.equal(origemDaDescricao(undefined), null);
assert.equal(origemDaDescricao(42), null);

// Tags do contato no WTS (Dr. Sergio Maia): "Origem · X" e "Tipo · X".
assert.equal(origemDasTags(["Tipo · Paciente", "Origem · Instagram"]), "Instagram");
assert.equal(origemDasTags(["Origem · Indicação", "Origem · Indicação"]), "Indicação", "a mesma tag duas vezes conta como uma");
assert.equal(origemDasTags(["Origem · Instagram", "Origem · Anúncio"]), null, "duas origens: não adivinha");
assert.equal(origemDasTags(["Origem · Não identificada"]), null, "não identificada fica vazia");
assert.equal(origemDasTags(["Oportunidade", "Remarketing"]), null);
assert.equal(origemDasTags([]), null);
assert.equal(tipoDasTags(["Tipo · Fornecedor ou representante", "Oportunidade"]), "Fornecedor ou representante");
assert.equal(tipoDasTags(["Tipo · Paciente", "Tipo · Lead novo"]), null, "dois tipos: não escolhe");

console.log("flwchat origem ok");
