import assert from "node:assert/strict";
import { ajustarNumeros, textoNaoMedido, textoPelaConversa, type Numero, type PacientesPeriodo } from "../src/lib/pacientes";

// G2 (decisão do João, 16/11/2026): quando o CRM não registra a etapa (não existe, ou ninguém usa), a tela diz "O CRM não
// registra isso" no lugar do 0, e o número da conversa aparece à parte, com o nome da fonte. Sem a marca do banco
// (crm_registra, migração 20261116150000), o número fica como está.
const n = (x: Partial<Numero> & Record<string, unknown>): Numero => ({ valor: null, fonte: "crm", motivo_sem_dado: null, responsavel: null, ...x }) as Numero;
const base = (numeros: Record<string, Numero>, extra: Record<string, unknown> = {}) =>
  ({ tem_crm: true, tem_funil_prospeccao: true, numeros, ...extra }) as unknown as PacientesPeriodo;

// 1. Agendou só pela conversa, com a marca do banco: o número vira "O CRM não registra isso" e a conversa vem à parte.
const so = ajustarNumeros(base({
  agendaram: n({ valor: 12, fonte: "crm_e_conversa", crm_registra: false, por_fonte: { crm: 0, conversa: 12, crm_e_conversa: 0 } }),
  fecharam: n({ valor: 3 }), compareceram: n({ valor: 1 }),
}));
assert.equal(so.numeros.agendaram.valor, null, "nunca mostra 12 como se fosse do CRM");
assert.equal(textoNaoMedido(so.numeros.agendaram), "O CRM não registra isso");
assert.equal(textoPelaConversa(so.numeros.agendaram), "12 pela conversa (leitura da IA)");
assert.deepEqual(ajustarNumeros(so), so, "aplicar duas vezes não muda");

// 2. Sem a marca (banco sem a migração): o número da conversa fica como hoje.
const sem = ajustarNumeros(base({ agendaram: n({ valor: 12, fonte: "crm_e_conversa", por_fonte: { crm: 0, conversa: 12, crm_e_conversa: 0 } }) }));
assert.equal(sem.numeros.agendaram.valor, 12);
assert.equal(textoPelaConversa(sem.numeros.agendaram), null);

// 3. Etapa que ninguém usa (130000) e etapa que não existe: o mesmo texto, nunca 0.
const morta = ajustarNumeros(base({
  agendaram: n({ valor: null, nao_medido_por: "etapa_sem_uso", motivo_sem_dado: "O CRM tem etapa de agendamento, mas nenhum card passou por ela" }),
  compareceram: n({ valor: null, motivo_sem_dado: "O CRM não tem uma etapa que marque que o paciente foi à consulta.", o_que_fazer: "Criar..." }),
  fecharam: n({ valor: null, motivo_sem_dado: "o CRM não marca venda", nao_se_aplica: true }),
  abordados: n({ valor: null, nao_se_aplica: true, motivo_sem_dado: "A clínica não usa funil de prospecção ativa no CRM" }),
}));
assert.equal(textoNaoMedido(morta.numeros.agendaram), "O CRM não registra isso");
assert.equal(textoNaoMedido(morta.numeros.compareceram), "O CRM não registra isso");
assert.equal(textoNaoMedido(morta.numeros.fecharam), "O CRM não registra isso");
assert.equal(textoNaoMedido(morta.numeros.abordados), "Não se aplica", "prospecção não é etapa do CRM: continua 'Não se aplica'");
assert.equal(textoPelaConversa(morta.numeros.agendaram), null, "sem conversa, nada à parte");

// 4. Sem CRM ligado, não é "o CRM não registra": é sem dado.
const semCrm = ajustarNumeros(base({ agendaram: n({ valor: null, nao_se_aplica: true }) }, { tem_crm: false }));
assert.notEqual(textoNaoMedido(semCrm.numeros.agendaram), "O CRM não registra isso");

// 5. Número medido pelo CRM: nada muda.
const medido = ajustarNumeros(base({ agendaram: n({ valor: 5, por_fonte: { crm: 5, conversa: 0, crm_e_conversa: 0 } }) }));
assert.equal(medido.numeros.agendaram.valor, 5);

console.log("test-crm-nao-registra: ok (G2: o CRM não registra isso no lugar do 0; a conversa à parte; sem a marca, nada muda)");
