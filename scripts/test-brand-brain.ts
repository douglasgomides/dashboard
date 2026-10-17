import assert from "node:assert/strict";
import { paraChave, textoSemDadoPessoal, validarPropostas } from "../src/lib/brand-brain";

// Dado pessoal: telefone, e-mail e CPF barrados; números agregados passam.
assert.equal(textoSemDadoPessoal("Ligue (84) 99999-1234"), false);
assert.equal(textoSemDadoPessoal("contato: ana@exemplo.com"), false);
assert.equal(textoSemDadoPessoal("CPF 123.456.789-00"), false);
assert.equal(textoSemDadoPessoal("Preço aparece em 34% das conversas (n = 120), ticket R$ 450"), true);

assert.equal(paraChave("Objeção de preço!"), "objecao_de_preco");

const bruto = {
  itens: [
    { memoria: "audiencia", chave: "Objeção de preço", valor: "Preço aparece em 12 de 40 resumos", fonte: "conversas", confianca: "media" },
    { memoria: "audiencia", chave: "objecao_de_preco", valor: "duplicado", fonte: "conversas" },
    { memoria: "marca", chave: "tom", valor: "acolhedor", fonte: "sessoes" },
    { memoria: "identidade", chave: "tom_de_voz", valor: "Acolhedor e direto", fonte: "drive" },
    { memoria: "comercial", chave: "contato", valor: "WhatsApp (84) 99999-1234", fonte: "ficha_sap" },
    { memoria: "criativa", chave: "gancho_forte", valor: "Perguntas sobre recuperação geram mais salvos", fonte: "instagram_posts", confianca: "alta", fonte_detalhe: "5 de 15 posts" },
    { memoria: "decisao", chave: "x", valor: "curta demais na chave", fonte: "sessoes" },
  ],
};
const { ok, descartes } = validarPropostas(bruto, ["conversas", "instagram_posts", "ficha_sap", "sessoes"]);
assert.deepEqual(ok.map((i) => i.chave), ["objecao_de_preco", "gancho_forte"]);
assert.equal(ok[1].confianca, "alta");
assert.equal(ok[1].fonte_detalhe, "5 de 15 posts");
assert.equal(descartes.length, 5);
assert.ok(descartes.some((d) => /fonte não lida/.test(d)) && descartes.some((d) => /dado pessoal/.test(d)) && descartes.some((d) => /repetido/.test(d)));
// Resposta sem a lista: nada passa.
assert.equal(validarPropostas({ foo: 1 }, ["conversas"]).ok.length, 0);
assert.equal(validarPropostas(null, ["conversas"]).ok.length, 0);

console.log("ok brand-brain");

// Padrões da auditoria comercial em %
import { padroesComerciais } from "../src/lib/brand-brain";
{
  const base = { comercial: true, objecoes: [] as string[], falhas: [] as string[] };
  assert.equal(padroesComerciais(Array.from({ length: 9 }, () => base), 30), null);
  const rs = [
    ...Array.from({ length: 4 }, () => ({ ...base, objecoes: ["preco", "preco"], falhas: ["sem_follow_up"], preco_pedido: true, preco_apresentado: true, recuperavel: true })),
    ...Array.from({ length: 2 }, () => ({ ...base, etapa: "agendou" })),
    ...Array.from({ length: 4 }, () => ({ ...base, objecoes: ["medo"], preco_pedido: true, preco_apresentado: false })),
    { comercial: false, objecoes: ["preco"] },
  ];
  const t = padroesComerciais(rs, 30)!;
  assert.match(t, /^10 conversas comerciais/);
  assert.match(t, /Agendaram: 20% \(2\)/);
  assert.match(t, /recuperáveis\): 40% \(4\)/);
  assert.match(t, /Pediram preço: 80% \(8\); a clínica apresentou o preço em 50%/);
  assert.match(t, /preço 40% \(4\); medo 40% \(4\)/);
  assert.match(t, /sem follow-up 40% \(4\)/);
  console.log("ok padroes comerciais");
}
