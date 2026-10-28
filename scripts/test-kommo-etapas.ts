import assert from "node:assert/strict";
import { etapasDosFunis } from "../api/_lib/kommo-leads-sync";

// Resposta de GET /api/v4/leads/pipelines (formato do Kommo, nomes fictícios).
const body = {
  _embedded: {
    pipelines: [
      { id: 12944487, name: "Cadência", _embedded: { statuses: [{ id: 112594219, name: "Follow UP D7 " }, { id: 142, name: "Venda ganha" }] } },
      { id: 555, name: "Comercial", _embedded: { statuses: [{ id: 1, name: "  " }, { id: 2 }, { id: 3, name: "Consulta Agendada" }] } },
      { name: "sem id", _embedded: { statuses: [{ id: 9, name: "x" }] } },
    ],
  },
};
const linhas = etapasDosFunis(body, "conn");
assert.deepEqual(linhas, [
  { crm_connection_id: "conn", pipeline_id: "12944487", pipeline_name: "Cadência", status_id: "112594219", status_name: "Follow UP D7" },
  { crm_connection_id: "conn", pipeline_id: "12944487", pipeline_name: "Cadência", status_id: "142", status_name: "Venda ganha" },
  { crm_connection_id: "conn", pipeline_id: "555", pipeline_name: "Comercial", status_id: "3", status_name: "Consulta Agendada" },
], "etapa sem nome e funil sem id ficam de fora");
assert.deepEqual(etapasDosFunis(null, "conn"), []);
assert.deepEqual(etapasDosFunis({ _embedded: {} }, "conn"), []);
console.log("kommo etapas ok");
