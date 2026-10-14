// npx tsx scripts/test-relatorio-tom.ts
import assert from "node:assert/strict";
import { montarWhatsapp, montarExecutiva, LIMITE_WHATSAPP, type ConteudoEnvio } from "../src/lib/relatorio-envio";
import { pendenciasDoCliente, semJargao, textosComTom } from "../src/lib/relatorio-tom";

const item = (curto: string) => ({ texto: curto, curto, evidencia: "", chave: curto }) as any;
const c: ConteudoEnvio = {
  resumo: [item("alcance de 120 mil pessoas"), item("CTR de 1,8% nos anúncios")],
  vitorias: [item("o Reels de menopausa foi o mais salvo")],
  atencao: [item("o custo por lead subiu 30%")],
  acoes: [item("pausar a campanha Teste 8")],
  testes: [item("carrossel com dúvida de preço")],
  limitacoes: [item("WhatsApp não conectado")],
};
const inp = { clientName: "Dra. Ana Souza", periodLabel: "01/10 a 13/10" };

// Sem estilo: igual ao de antes.
assert.equal(montarWhatsapp(inp, c), montarWhatsapp(inp, c, LIMITE_WHATSAPP, {}));
assert.match(montarWhatsapp(inp, c), /^Olá, /);
assert.match(montarExecutiva(inp, c), /^Relatório executivo: Dra. Ana Souza/);

const extras = { pendencias: ["Autorizar de novo o acesso do Instagram no Business Manager."], proximaSemana: ["Qua 15/10: Carrossel · Quanto custa o implante"] };
const d = textosComTom(inp, c, "direto", extras);
const k = textosComTom(inp, c, "consultivo", extras);
const p = textosComTom(inp, c, "premium", extras);
// Mesmo conteúdo, jeito diferente.
for (const t of [d, k, p]) {
  assert.match(t.whatsapp, /pausar a campanha Teste 8/i);
  assert.match(t.whatsapp, /Autorizar de novo o acesso/);
  assert.match(t.whatsapp, /Quanto custa o implante/);
  assert.match(t.executiva, /Autorizar de novo o acesso/);
}
assert.match(d.whatsapp, /\*Fazer agora\*/);
assert.match(k.whatsapp, /O que pode estar custando pacientes/);
assert.match(k.whatsapp, /O que precisamos de você \(e por quê\)/);
assert.match(p.whatsapp, /posicionamento digital/);
assert.match(p.executiva, /Fico à disposição/);
assert.ok(d.whatsapp.length < k.whatsapp.length);
assert.ok(!/[—–]/.test(k.whatsapp)); // sem travessão

// Sem pendências: o bloco não aparece.
assert.doesNotMatch(textosComTom(inp, c, "consultivo", { pendencias: [], proximaSemana: [] }).whatsapp, /precisamos de você/i);

// Jargão explicado só na primeira vez, e não duas vezes.
const j = semJargao("CTR de 2%. O CTR caiu. Leads novos: 10.");
assert.match(j, /^CTR \(de cada 100 pessoas/);
assert.equal(j.match(/de cada 100/g)!.length, 1);
assert.match(j, /Leads \(contatos interessados\)/);
assert.equal(semJargao(j), j);
assert.match(semJargao("o custo por lead subiu"), /custo por contato/);
assert.match(textosComTom(inp, c, "consultivo", extras, { explicarTermos: true }).whatsapp, /CTR \(de cada 100/);

// Pendências: só o que é do cliente; o que é nosso fica fora.
const pend = pendenciasDoCliente(
  [
    { responsavel: "comercial", titulo: "Leads parados", correcao: "Mover os parados para perdido com o motivo.", afeta: "Taxa de conversão." },
    { responsavel: "equipe_hub", titulo: "Coleta parada", correcao: "Equipe: rodar a coleta." },
  ],
  [{ dono: "cliente", texto: "A Meta bloqueou o acesso do Instagram. Autorizar de novo." }, { dono: "nos", texto: "erro nosso" }],
);
assert.equal(pend.length, 2);
assert.match(pend[0], /bloqueou/);
assert.match(pend[1], /Até resolver, fica distorcido: taxa de conversão\./);
console.log("test-relatorio-tom: ok");
