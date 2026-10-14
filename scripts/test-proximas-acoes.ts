// npx tsx scripts/test-proximas-acoes.ts
import assert from "node:assert/strict";
import { montarProximasAcoes, statusDoBanco, STATUS_PARA_BANCO } from "../src/lib/proximas-acoes";

// Vazio: nenhuma ação inventada.
assert.deepEqual(montarProximasAcoes({}), []);

const acoes = montarProximasAcoes({
  problemas: [
    { id: "crm-leads-parados", fonte: "crm", severidade: "alta", titulo: "78% parados", evidencia: "3.087 de 3.942", causa: "Ninguém fecha os leads.", correcao: "Mover para perdido com motivo.", responsavel: "comercial", afeta: "taxas do funil" },
    { id: "sync-erro-instagram", fonte: "instagram", severidade: "media", titulo: "Instagram com erro na atualização", evidencia: "", causa: "O token do Instagram expirou.", correcao: "Reconectar o Instagram na Business Manager.", responsavel: "equipe_hub", afeta: "posts" },
  ],
  ads: {
    campanhas: [
      { campaign_id: "1", campanha: "Camp cara", vereditoOficial: "Cortar", gasto: 900, motivo: "Custa 2,4x o típico.", comparacao: "R$ 90 x R$ 37" },
      { campaign_id: "2", campanha: "Camp boa", vereditoOficial: "Escalar", gasto: 500, motivo: "", comparacao: "" },
      { campaign_id: "3", campanha: "Camp atrai", vereditoOficial: "Atrai mas não converte", gasto: 200, motivo: "Clica e não conversa.", comparacao: "" },
    ],
  } as any,
  campanhasSemQualificado: [{ campanha: "Teste 8", gasto: 752, leads: 19 }, { campanha: "Teste 4", gasto: 429, leads: 3 }],
  posts: [
    { id: "a", reach: 1000, saved: 10, shares: 2, caption: "Post comum" },
    { id: "b", reach: 1200, saved: 12, shares: 1, caption: "Outro" },
    { id: "c", reach: 3000, saved: 150, shares: 40, caption: "Menopausa e sono: o que ninguém conta" },
    { id: "d", reach: 900, saved: 8, shares: 1, caption: "x" },
    { id: "e", reach: 1100, saved: 9, shares: 0, caption: "y" },
  ],
  duvidas: [
    { rotulo: "Preço do implante", pessoas: 6, sugestaoPost: { formato: "Reels", titulo: "Quanto custa o implante?" } },
    { rotulo: "Dose", pessoas: 4, cuidadoMedico: true },
    { rotulo: "Uma pessoa só", pessoas: 1 },
  ],
  atendimento: { conversas: 50, comPaciente: 45, semResposta: 8, soRobo: 2, demorou: 10, medianaPrimeiraResposta: 5400, medianaComercial: 900, semLead: 5, porAtendente: [] },
  precoPedidoSemResposta: 12,
});

const ids = acoes.map((a) => a.id);
// Cada fonte gerou a sua ação.
for (const id of ["dado-crm-leads-parados", "dado-sync-erro-instagram", "ads-cortar-1", "ads-converte-3", "ads-qualidade-Teste 8", "conteudo-vencedor-c", "duvida-Preço do implante", "atend-sem-resposta", "atend-demora", "atend-preco"])
  assert.ok(ids.includes(id), `faltou ${id}`);
// Não gera: campanha boa, campanha com poucos leads, dúvida de dose, dúvida de uma pessoa.
for (const id of ["ads-cortar-2", "ads-qualidade-Teste 4", "duvida-Dose", "duvida-Uma pessoa só"]) assert.ok(!ids.includes(id), `não devia ter ${id}`);

// Ordem: alta primeiro; entre altas, dado/CRM antes de anúncio.
assert.equal(acoes[0].severidade, "alta");
assert.equal(acoes[0].categoria, "crm");
const sev = acoes.map((a) => a.severidade);
assert.deepEqual(sev, [...sev].sort((a, b) => ({ alta: 0, media: 1, baixa: 2 })[a] - ({ alta: 0, media: 1, baixa: 2 })[b]));

// Campos obrigatórios preenchidos em todas.
for (const a of acoes) for (const k of ["recomendacao", "porque", "impacto", "evidencia"] as const) assert.ok(a[k] && a[k].length > 3, `${a.id}.${k} vazio`);
// Responsável mapeado.
assert.equal(acoes.find((a) => a.id === "dado-crm-leads-parados")?.responsavel, "cliente");
assert.equal(acoes.find((a) => a.id === "dado-sync-erro-instagram")?.responsavel, "doctor_creator");
assert.equal(acoes.find((a) => a.id === "ads-cortar-1")?.responsavel, "trafego");

// Status: ida e volta com a tabela das Oportunidades.
for (const s of ["pendente", "em_andamento", "resolvido", "ignorado"] as const) assert.equal(statusDoBanco(STATUS_PARA_BANCO[s]), s);
assert.equal(statusDoBanco("resultado_avaliado"), "resolvido");
assert.equal(statusDoBanco(undefined), "pendente");
console.log(`proximas-acoes: ok (${acoes.length} ações)`);
