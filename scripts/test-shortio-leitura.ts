// Cartão dos links do short.gy (debug numeros-nao-batem-fonte, 16/11/2026): soma todos os links, diz até quando vão os 30 dias e
// avisa a leitura parada, em vez de mostrar o número velho como se fosse de hoje.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-shortio-leitura.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca } from "../src/lib/leitura/cabeca-do-bloco";
import { cabecaDosLinks } from "../src/lib/leitura/ver-tudo-crm-painel";
import { DIAS_PARA_LEITURA_PARADA, notaDosCliques, resumoDosLinksShortio, rotuloDosCliques, type LinkShortioLido } from "../src/lib/shortio-leitura";

const link = (humanos: number | null, total: number | null, stats_em: string | null): LinkShortioLido => ({ cliques_humanos: humanos, cliques_total: total, stats_em });

// Leitura parada: todos os links lidos em 07/11 à noite (UTC), hoje 16/11.
const parados = [link(100, 140, "2026-11-07T21:12:00Z"), link(null, 30, "2026-11-07T23:10:00Z"), link(0, 5, "2026-11-07T20:10:00Z")];
const r1 = resumoDosLinksShortio(parados, "2026-11-16");
assert.equal(r1.cliques, 130, "humanos quando há; sem a separação, o total");
assert.equal(r1.ate, "2026-11-07");
assert.equal(r1.desde, null, "todos no mesmo dia de Brasília");
assert.equal(r1.paradaDesde, "2026-11-07");
assert.equal(rotuloDosCliques(r1), "Cliques de pessoas (30 dias até 07/11)");
assert.equal(notaDosCliques(r1), "Robôs fora");

// Leitura de 01:00 UTC já é o dia anterior em Brasília.
assert.equal(resumoDosLinksShortio([link(1, 1, "2026-11-08T01:00:00Z")], "2026-11-08").ate, "2026-11-07");

// Em dia: lido ontem e hoje (cada link fecha os 30 dias num dia).
const emDia = resumoDosLinksShortio([link(5, 9, "2026-11-15T15:00:00Z"), link(7, 7, "2026-11-16T12:00:00Z")], "2026-11-16");
assert.equal(emDia.paradaDesde, null);
assert.equal(emDia.ate, "2026-11-16");
assert.equal(emDia.desde, "2026-11-15");
assert.equal(notaDosCliques(emDia), "Robôs fora · lidos de 15/11 a 16/11");
// A régua: 1 dia sem leitura ainda é em dia; 2 dias já é parada.
assert.equal(resumoDosLinksShortio([link(1, 1, "2026-11-15T15:00:00Z")], "2026-11-16").paradaDesde, null);
assert.equal(DIAS_PARA_LEITURA_PARADA, 2);
assert.equal(resumoDosLinksShortio([link(1, 1, "2026-11-14T15:00:00Z")], "2026-11-16").paradaDesde, "2026-11-14");

// Soma TODOS os links, não só os 50 com mais cliques (o cartão antes pedia .limit(50)).
const muitos = Array.from({ length: 53 }, (_, i) => link(1, 1, "2026-11-16T12:00:00Z"));
assert.equal(resumoDosLinksShortio(muitos, "2026-11-16").cliques, 53);
assert.equal(resumoDosLinksShortio(muitos, "2026-11-16").links, 53);

// Nenhum link lido: sem número (nunca 0) e sem data.
const nunca = resumoDosLinksShortio([link(null, null, null), link(null, null, null)], "2026-11-16");
assert.equal(nunca.cliques, null);
assert.equal(nunca.ate, null);
assert.equal(nunca.paradaDesde, null);
assert.equal(rotuloDosCliques(nunca), "Cliques de pessoas (30 dias)");

// A frase do bloco: parada diz que parou; em dia diz até quando.
const cParada = cabecaDosLinks({ links: 3, cliques: r1.cliques, ate: r1.ate, paradaDesde: r1.paradaDesde });
assert.deepEqual(checarCabeca(cParada), []);
assert.equal(textoDaCabeca(cParada), "130 cliques de pessoas nos 30 dias até 07/11; a leitura parou nesse dia.");
assert.equal(cParada.tipo === "frase" ? cParada.tom : null, "atencao");
const cEmDia = cabecaDosLinks({ links: 2, cliques: emDia.cliques, ate: emDia.ate, paradaDesde: null });
assert.deepEqual(checarCabeca(cEmDia), []);
assert.equal(textoDaCabeca(cEmDia), "12 cliques de pessoas em 2 links rastreados, nos 30 dias até 16/11.");
assert.equal(textoDaCabeca(cabecaDosLinks({ links: 2, cliques: null, ate: null, paradaDesde: null })), "2 links rastreados ligados a esta clínica.");

console.log("test-shortio-leitura: ok");
