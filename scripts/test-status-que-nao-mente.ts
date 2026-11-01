// Status que não mente (auditoria de 01/11/2026): status de anúncios por conta, proteção contra gasto trocado por
// zero, "sem movimento" separado de falha técnica e o título da faixa de anúncios. Sem rede e sem banco.
import assert from "node:assert/strict";
import { avaliarConta, resumirCliente, contaCurta, type LeituraGuardada } from "../api/_lib/anuncios-status";
import { separarZerosSuspeitos, candidatasAZero, ultimoDiaProtegido, chaveDiaria } from "../api/_lib/anuncios-protecao";
import { erroCurto } from "../api/_lib/sync-status";
import { statusDaFonte } from "../src/lib/status-fonte";
import { motivoDaLinha, tituloDaFaixa } from "../src/lib/motivos";

const agora = new Date("2026-11-01T18:00:00Z");
const em = "2026-11-01T17:00:00Z";
const velho = "2026-10-29T10:00:00Z";
const leitura = (p: Partial<LeituraGuardada>): LeituraGuardada => ({ via: "windsor", em, rows: 0, erro: null, precisaReconferir: 0, motivo: null, motivoDono: null, ...p });
const conta = (adAccountId: string, leituras: LeituraGuardada[], ultimoDado: string | null = "2026-11-01", teveGasto = true) =>
  avaliarConta({ adAccountId, leituras, ultimoDado, teveGasto }, agora);

// 1. Dra. Lana: duas contas na Windsor; uma falha, a outra traz linhas. Antes: verde. Agora: erro dizendo qual conta.
{
  const r = resumirCliente([
    conta("100000000000001111", [leitura({ rows: 120 })]),
    conta("100000000000002222", [leitura({ erro: "Windsor.ai request failed (500): erro" })], "2026-10-31"),
  ]);
  assert.equal(r.ok, false, "conta com erro não pode ficar escondida pela outra conta do mesmo cliente");
  assert.match(r.erro ?? "", /final 2222/);
  assert.doesNotMatch(r.erro ?? "", /final 1111/);
}

// 2. HOMS: uma conta em dia e outra parada há 39 dias. O aviso da parada sobrevive, e não fala da conta em dia.
{
  const emDia = conta("200000000000003333", [leitura({ via: "graph", rows: 149 })]);
  const parada = conta("200000000000001399", [leitura({ via: "graph", rows: 0, motivo: "4 campanhas ligadas, mas sem entrega (WhatsApp Business required).", motivoDono: "cliente" })], "2026-09-23");
  const r = resumirCliente([emDia, parada]);
  assert.equal(r.ok, true, "as duas contas foram lidas por inteiro");
  assert.match(r.motivo ?? "", /final 1399: sem dado novo desde 23\/09 \(39 dias\)/);
  assert.match(r.motivo ?? "", /WhatsApp Business required/);
  assert.doesNotMatch(r.motivo ?? "", /final 3333/);
  assert.equal(r.motivoDono, "cliente");
  // A ordem das contas não muda o resultado (antes a última processada apagava o aviso da outra).
  assert.deepEqual(resumirCliente([parada, emDia]).motivo, r.motivo);
  // Parada sem gasto antes não vira aviso (conta que nunca rodou campanha).
  assert.equal(conta("x", [leitura({ via: "graph" })], "2026-09-23", false).aviso, null);
}

// 3. Dra. Glauce: conta com token lida pela Graph (0 linhas) + conta sem token que a Windsor não tem. Nunca "ok".
{
  const comToken = conta("300000000000004444", [leitura({ via: "graph", rows: 0 })], null, false);
  const ninguem = conta("300000000000005555", [leitura({ via: "windsor", rows: 0 })], null, false);
  assert.equal(comToken.estado, "ok");
  assert.equal(ninguem.estado, "nao_lida");
  const r = resumirCliente([comToken, ninguem]);
  assert.equal(r.ok, false);
  assert.match(r.erro ?? "", /final 5555 não lida/);
  const m = motivoDaLinha({ fonte: "anuncios", last_attempt_at: em, last_success_at: null, last_error: r.erro, last_rows: 0, data_ate: null });
  assert.equal(m?.dono, "cliente");
  assert.match(m?.texto ?? "", /não lida/);
}

// 4. Windsor: erro parcial (lote de campanhas falhou com linhas gravadas) vira "parcial"; falha total de conta antiga, "erro".
{
  const parcial = conta("400000000000006666", [leitura({ rows: 80, erro: "campanhas: falhou" })]);
  assert.equal(parcial.estado, "parcial");
  assert.match(parcial.erro ?? "", /dado incompleto/);
  const total = conta("400000000000007777", [leitura({ erro: "The operation was aborted due to timeout" })], "2026-10-30");
  assert.equal(total.estado, "erro");
  assert.equal(resumirCliente([parcial]).ok, false);
}

// 5. Graph: período só em parte (janelas que falharam) não é "ok"; extras (conjuntos, alcance 7 dias) não contam.
{
  assert.equal(conta("a", [leitura({ via: "graph", rows: 300, erro: "Meta devolveu dado só de parte do período (2 janelas falharam)" })]).estado, "parcial");
  // Erro de token da Graph não é escondido pela Windsor vazia na mesma conta principal.
  assert.equal(conta("b", [leitura({ via: "graph", erro: "(#190) token expirado" }), leitura({ via: "windsor" })], "2026-10-20").estado, "erro");
  // Windsor errando numa conta que a Graph leu inteira é o ruído esperado.
  assert.equal(conta("c", [leitura({ via: "graph", rows: 10 }), leitura({ via: "windsor", erro: "sem acesso" })]).estado, "ok");
  // Leitura de 3 dias atrás não mantém o "ok".
  assert.equal(conta("d", [leitura({ via: "graph", rows: 10, em: velho })]).estado, "sem_leitura");
}

assert.equal(contaCurta("act_904923780140000"), "final 0000");

// 6. Gasto do dia 21/09 trocado por zero: dia passado com gasto > 0 não é regravado com zero.
{
  const limite = ultimoDiaProtegido("2026-10-21");
  assert.equal(limite, "2026-10-19");
  const existente = new Map([[chaveDiaria("2026-09-21", "c1"), 61.78], [chaveDiaria("2026-10-21", "c1"), 10]]);
  const novas = [
    { date: "2026-09-21", campaign_id: "c1", spend: 0 }, // suspeita: pula
    { date: "2026-09-21", campaign_id: "c2", spend: 0 }, // zero de verdade, nada gravado antes: grava
    { date: "2026-09-22", campaign_id: "c1", spend: 33.6 }, // gasto real: grava
    { date: "2026-10-21", campaign_id: "c1", spend: 0 }, // hoje: a Meta ainda fecha o dia, grava
  ];
  assert.equal(candidatasAZero(novas, limite).length, 2);
  const { gravar, puladas } = separarZerosSuspeitos(novas, existente, limite);
  assert.deepEqual(puladas.map((l) => `${l.date}|${l.campaign_id}`), ["2026-09-21|c1"]);
  assert.equal(gravar.length, 3);
}

// 7. "Sem movimento" não é "Dados parados": rodou sem erro hoje, a origem só não teve atividade.
{
  const semMov = statusDaFonte({ fonte: "crm", cadastro: true, data_ate: "2026-10-26", ultimo_sucesso: "2026-11-01T10:00:00Z" }, "2026-11-01");
  assert.equal(semMov.cor, "cinza");
  assert.equal(semMov.rotulo, "Sem movimento");
  assert.equal(semMov.ligado, true);
  // Sem atualização recente continua vermelho; com erro também; com aviso do cliente (pagamento) também.
  assert.equal(statusDaFonte({ fonte: "crm", cadastro: true, data_ate: "2026-10-26", ultimo_sucesso: "2026-10-26T10:00:00Z" }, "2026-11-01").cor, "vermelho");
  assert.equal(statusDaFonte({ fonte: "crm", cadastro: true, data_ate: "2026-10-26", ultimo_sucesso: "2026-11-01T10:00:00Z", last_error: "falhou" }, "2026-11-01").cor, "vermelho");
  assert.equal(statusDaFonte({ fonte: "anuncios", cadastro: true, data_ate: "2026-09-10", ultimo_sucesso: "2026-11-01T10:00:00Z", motivo: "Erro de pagamento", motivo_dono: "cliente" }, "2026-11-01").cor, "vermelho");
  // Anúncios em dia com aviso de outra conta: amarelo "Atenção", não verde.
  const atencao = statusDaFonte({ fonte: "anuncios", cadastro: true, data_ate: "2026-11-01", motivo: "Conta final 1399: sem dado novo desde 23/09", motivo_dono: "cliente" }, "2026-11-01");
  assert.equal(atencao.cor, "amarelo");
  assert.equal(atencao.rotulo, "Atenção");
  // CRM lançado à mão com dado em dia continua verde (o aviso é só para anúncios).
  assert.equal(statusDaFonte({ fonte: "crm", cadastro: true, data_ate: "2026-11-01", motivo: "planilha", motivo_dono: "cliente" }, "2026-11-01").cor, "verde");
}

// 8. Faixa de anúncios: "Sem dado novo desde 01/11" não aparece com dado de 01/11.
assert.equal(tituloDaFaixa("2026-11-01", false), "Dados até 01/11, com aviso");
assert.equal(tituloDaFaixa("2026-09-23", true), "Sem dado novo desde 23/09");
assert.equal(tituloDaFaixa(null, false), "Sem dado de anúncios");

// 9. Erro da Windsor é gravado agora: a chave que viaja na URL não pode ir junto.
assert.equal(erroCurto("falhou https://connectors.windsor.ai/facebook?api_key=abc123&date_from=x"), "falhou https://connectors.windsor.ai/facebook?api_key=***&date_from=x");

console.log("status-que-nao-mente: ok");
