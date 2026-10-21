import assert from "node:assert/strict";
import { origemDaDescricao } from "../api/_lib/flwchat-sync";

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

console.log("flwchat origem ok");
