// npx tsx scripts/test-cobertura.ts
import assert from "node:assert/strict";
import { avisosDeCobertura, inicioComDado, type CoberturaFonte } from "../src/lib/cobertura";

// Dr. Antônio, 90 dias até 13/10 (dados reais de 13/10/2026).
const fs: CoberturaFonte[] = [
  { fonte: "anuncios", rotulo: "Anúncios", diaria: false, primeiro_geral: "2026-07-01", ultimo_geral: "2026-10-13", dias_com_dado: 86 },
  { fonte: "crm", rotulo: "CRM", diaria: false, primeiro_geral: "2025-03-14", ultimo_geral: "2026-10-13", dias_com_dado: 89 },
  { fonte: "instagram", rotulo: "Alcance e interações do Instagram", diaria: true, primeiro_geral: "2026-09-01", ultimo_geral: "2026-10-13", dias_com_dado: 43 },
  { fonte: "seguidores", rotulo: "Seguidores ganhos por dia", diaria: true, primeiro_geral: "2026-09-01", ultimo_geral: "2026-10-13", dias_com_dado: 43 },
  { fonte: "posts", rotulo: "Posts", diaria: false, primeiro_geral: "2020-10-04", ultimo_geral: "2026-10-13", dias_com_dado: 56 },
];
const a = avisosDeCobertura(fs, "2026-07-16", "2026-10-13", "2026-10-13");
assert.deepEqual(a.map((x) => x.fonte), ["instagram", "seguidores"]);
assert.ok(a[0].texto.startsWith("43 de 90 dias têm dado (01/09 a 13/10)"));
assert.ok(a[0].grave);
assert.ok(a[1].texto.includes("últimos 30 dias"));
assert.equal(inicioComDado(fs, "2026-07-16"), "2026-09-01");

// Fonte parada (Juliana Paola: último lead 09/10) e WhatsApp ligado depois do início.
const b = avisosDeCobertura(
  [
    { fonte: "crm", rotulo: "CRM", diaria: false, primeiro_geral: "2025-11-28", ultimo_geral: "2026-10-09", dias_com_dado: 60 },
    { fonte: "whatsapp", rotulo: "WhatsApp", diaria: false, primeiro_geral: "2026-08-20", ultimo_geral: "2026-10-12", dias_com_dado: 21 },
  ],
  "2026-07-16", "2026-10-13", "2026-10-13",
);
assert.ok(b[0].texto.includes("último dado é de 09/10"));
assert.ok(b[1].texto.startsWith("só há dado a partir de 20/08"));

// Período curto e completo: nenhum aviso.
assert.equal(avisosDeCobertura(fs, "2026-10-07", "2026-10-13", "2026-10-13").length, 0);
console.log("cobertura: ok");
