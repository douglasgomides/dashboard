import assert from "node:assert/strict";
import { atribuirConversa, destinoSite, destinoWhatsApp, dispositivo, ehRobo, mensagemComRef, novaRef, novoSlug, origemReferer, POSICOES, slugPersonalizado, slugValido } from "../src/lib/rastreio";
import { extrairCodigos } from "../api/_lib/shortio";

// ---- Slug, ref e destino
assert.match(novoSlug(), /^[a-z2-9]{7}$/);
const ref = novaRef();
assert.match(ref, /^[A-Z2-9]{6}$/);
assert.ok(!/[01OIL]/.test(ref));
const wa = destinoWhatsApp("(67) 99999-1234", POSICOES.bio.frase, "A7K9QX")!;
assert.ok(wa.startsWith("https://wa.me/5567999991234?text="));
assert.equal(decodeURIComponent(wa.split("text=")[1]), "Olá! Vim pelo link da bio (A7K9QX)");
assert.equal(destinoWhatsApp("123", "x", "A7K9QX"), null);
assert.deepEqual(extrairCodigos(mensagemComRef("Oi!", "A7K9QX")), ["A7K9QX"], "o leitor de código das conversas encontra a ref");
const site = new URL(destinoSite("https://clinica.com.br/agenda", "story", "Outubro Rosa", "A7K9QX")!);
assert.equal(site.searchParams.get("utm_medium"), "story");
assert.equal(site.searchParams.get("utm_campaign"), "outubro-rosa");
assert.equal(site.searchParams.get("utm_content"), "A7K9QX");
assert.equal(destinoSite("javascript:alert(1)", "bio", "x", "A7K9QX"), null);

// ---- Robôs de prévia não contam
assert.ok(ehRobo("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"));
assert.ok(ehRobo("WhatsApp/2.23.20.0 A"));
assert.ok(ehRobo(""));
assert.ok(!ehRobo("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0"));
assert.equal(dispositivo("Mozilla/5.0 (Linux; Android 14) Mobile"), "celular");
assert.equal(origemReferer("https://l.instagram.com/?u=x"), "instagram");
assert.equal(origemReferer(null), null);

// ---- Atribuição: ref → frase → horário
const links = [
  { id: "bio", codigo_ref: "AAAAAA", mensagem_modelo: "Oi! Vi o link na bio e quero saber mais. (ref AAAAAA)", criado_em: "2026-10-01T00:00:00Z" },
  { id: "st1", codigo_ref: "BBBBBB", mensagem_modelo: "Oi! Vi o seu story e quero saber mais. (ref BBBBBB)", criado_em: "2026-10-10T00:00:00Z" },
  { id: "st2", codigo_ref: "CCCCCC", mensagem_modelo: "Oi! Vi o seu story e quero saber mais. (ref CCCCCC)", criado_em: "2026-10-15T00:00:00Z" },
];
const ini = "2026-10-18T12:00:00Z";
const min = (m: number) => new Date(Date.parse(ini) - m * 60_000).toISOString();
assert.deepEqual(atribuirConversa("Oi! Vi o link na bio e quero saber mais. (ref AAAAAA)", ini, links, []), { link_id: "bio", como: "ref" });
assert.deepEqual(atribuirConversa("oi vi o link na bio e quero saber mais", ini, links, []), { link_id: "bio", como: "frase" }, "apagou a ref: casa pela frase");
assert.deepEqual(atribuirConversa("Oi! Vi o seu story e quero saber mais.", ini, links, [{ link_id: "st1", em: min(5) }]), { link_id: "st1", como: "frase" }, "frase igual em 2 stories: o clique mais perto decide");
assert.deepEqual(atribuirConversa("Oi! Vi o seu story e quero saber mais.", ini, links, []), { link_id: "st2", como: "frase" }, "sem clique: o story mais recente");
assert.deepEqual(atribuirConversa("Boa tarde, quanto custa?", ini, links, [{ link_id: "bio", em: min(3) }]), { link_id: "bio", como: "horario" });
assert.equal(atribuirConversa("Boa tarde, quanto custa?", ini, links, [{ link_id: "bio", em: min(3) }, { link_id: "st1", em: min(4) }]), null, "dois links na janela: não chuta");
assert.equal(atribuirConversa("Boa tarde", ini, links, [{ link_id: "bio", em: min(40) }]), null, "clique antigo não conta");
assert.equal(atribuirConversa("Boa tarde", ini, links, [{ link_id: "bio", em: new Date(Date.parse(ini) + 60_000).toISOString() }]), null, "clique depois da conversa não conta");

// Final do link escolhido pela equipe.
assert.equal(slugPersonalizado("Dra. Júlia Bio"), "dra-julia-bio");
assert.equal(slugPersonalizado("  DRAJULIA  "), "drajulia");
assert.equal(slugPersonalizado("ab"), null);
assert.equal(slugPersonalizado("admin"), null);
assert.equal(slugPersonalizado("a".repeat(31)), null);
assert.ok(slugValido(novoSlug()));
assert.ok(!slugValido("-abc") && !slugValido("abc,def") && !slugValido("a}b"));
console.log("rastreio: ok");
