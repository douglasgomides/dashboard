import assert from "node:assert/strict";
import { montarResumoMedico } from "../src/lib/sap-resumo-medico";

const m = montarResumoMedico({
  nomeContato: "Dra. Paola", dia: 34,
  kpis: [
    { rotulo: "Tempo de 1ª resposta", agora: "12 min", partida: "95 min", melhorou: true },
    { rotulo: "Comparecimento", agora: "61%", partida: "70%", melhorou: false },
    { rotulo: "Conversão", agora: "—", partida: "—", melhorou: null },
  ],
  principal: { titulo: "Faltas acima da meta", acaoClinica: "Confirmar na véspera às 17h", acaoDc: "Ajustar a régua de confirmação", prazo: "Esta semana" },
  proximaReuniao: "Sessão 5, 03/11",
});
assert.ok(m.startsWith("Bom dia, Dra. Paola! Resumo da semana do programa (dia 34 de 90):"));
assert.ok(m.includes("• Tempo de 1ª resposta: 12 min (partida: 95 min) ✅"));
assert.ok(m.includes("⚠️"));
assert.ok(!m.includes("Conversão")); // sem número não entra
assert.ok(m.includes("Proposta para vocês: confirmar na véspera às 17h. Prazo: esta semana."));
assert.ok(m.includes("Próxima reunião: Sessão 5, 03/11."));
assert.ok(!/garant/i.test(m)); // sem promessa
const vazio = montarResumoMedico({ dia: null, kpis: [], principal: null });
assert.ok(vazio.includes("Ainda faltam dados"));
assert.ok(!vazio.includes("Nenhum ponto crítico"));
console.log("ok sap-resumo-medico");
