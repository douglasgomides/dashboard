// npx tsx scripts/test-conversa-leitura.ts
import assert from "node:assert/strict";
import { situacaoDa, frasesDa, resumirAtendimento, duracao, type LeituraConversaBanco } from "../src/lib/conversa-leitura";

const base: LeituraConversaBanco = {
  conversa_id: "a", msgs_paciente: 3, msgs_clinica: 2, msgs_automaticas: 0, primeira_resposta_seg: 600,
  mediana_resposta_comercial_seg: 600, maior_espera_seg: 600, esperas_longas: 0, vezes_paciente: 2,
  ultima_de: "clinica", ultima_msg_em: "2026-10-10T12:00:00Z", aguardando_seg: null, atendente: "Giovana",
  lead_etapa: "Consulta Agendada", lead_resultado: null,
};

assert.equal(situacaoDa(base), "ok");
assert.equal(situacaoDa({ ...base, primeira_resposta_seg: 7200 }), "demorou");
assert.equal(situacaoDa({ ...base, esperas_longas: 1 }), "demorou");
assert.equal(situacaoDa({ ...base, ultima_de: "paciente", aguardando_seg: 90000 }), "sem_resposta");
assert.equal(situacaoDa({ ...base, ultima_de: "paciente", msgs_clinica: 0, msgs_automaticas: 3 }), "so_robo");
assert.equal(situacaoDa({ ...base, ultima_de: "paciente_encerrou" }), "ok");
assert.equal(situacaoDa({ ...base, msgs_paciente: 0 }), "sem_dado");

assert.equal(duracao(30), "30 s");
assert.equal(duracao(600), "10 min");
assert.equal(duracao(5400), "1h30");
assert.equal(duracao(3 * 86400), "3 dias");

const f = frasesDa({ ...base, ultima_de: "paciente", aguardando_seg: 2 * 86400, lead_etapa: null });
assert.ok(f[0].includes("sem resposta há 2 dias"));
assert.ok(f.some((x) => x.includes("Não está ligado")));

const r = resumirAtendimento([
  base,
  { ...base, conversa_id: "b", primeira_resposta_seg: 7200, mediana_resposta_comercial_seg: 3000, atendente: "Larissa" },
  { ...base, conversa_id: "c", ultima_de: "paciente", msgs_clinica: 0, msgs_automaticas: 2, atendente: null, lead_etapa: null },
  { ...base, conversa_id: "d", msgs_paciente: 0 },
]);
assert.equal(r.conversas, 4);
assert.equal(r.comPaciente, 3);
assert.equal(r.semResposta, 1);
assert.equal(r.soRobo, 1);
assert.equal(r.demorou, 1);
assert.equal(r.medianaPrimeiraResposta, 600);
assert.equal(r.semLead, 1);
assert.deepEqual(r.porAtendente.map((a) => a.nome), ["Giovana", "Larissa"]);
console.log("conversa-leitura: ok");
