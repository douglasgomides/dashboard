import assert from "node:assert/strict";
import { lerFunis, porGrupo, vale } from "../src/lib/funis-periodo";

// Formato da RPC crm_funis_periodo (bigint em texto, como o PostgREST devolve).
const linhas = lerFunis([
  { grupo: "Skin Place - Gyn", funil: "Consultas", entraram: "249", importados: "31", consultas_agendadas: 7, ganhos: 7, ganhos_sem_valor: 5, perdidos: 3, valor_ganho: "26584.9", etapa_do_ganho: "Consulta agendada" },
  { grupo: "Skin Place - Gyn", funil: "Social Seller", entraram: 718, consultas_agendadas: 0, ganhos: 8, ganhos_sem_valor: 8, perdidos: 40, valor_ganho: 0, etapa_do_ganho: "Lead" },
  { grupo: "Resgate ", funil: "Preenchimento", entraram: 12, consultas_agendadas: 3, ganhos: 0, ganhos_sem_valor: 0, perdidos: 0, valor_ganho: 0, etapa_do_ganho: null },
  { grupo: null, funil: "Funil sem grupo", entraram: 2, consultas_agendadas: 0, ganhos: 0, ganhos_sem_valor: 0, perdidos: 0, valor_ganho: 0, etapa_do_ganho: null },
]);
assert.equal(linhas[0].entraram, 249);
assert.equal(linhas[0].importados, 31, "planilha importada fica fora de entraram");
assert.equal(linhas[1].importados, 0);
assert.equal(linhas[0].valor_ganho, 26584.9);
assert.equal(linhas[2].grupo, "Resgate", "espaço do nome do grupo no Clint não separa grupos");

const grupos = porGrupo(linhas);
assert.deepEqual(grupos.map((g) => g.grupo), ["Skin Place - Gyn", "Resgate", "Outros funis"]);
assert.equal(grupos[0].entraram, 967);
assert.equal(grupos[0].ganhos, 15);

assert.equal(vale(linhas), true);
assert.equal(vale([linhas[0]]), false, "um funil só: os números do topo bastam");
assert.deepEqual(lerFunis(null), []);
console.log("funis-periodo ok");
