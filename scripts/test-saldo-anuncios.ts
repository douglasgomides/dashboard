import assert from "node:assert/strict";
import { saldoPrePagoZerado, limiteDeGastoAtingido } from "../api/_lib/diagnostico-anuncios";

// Caso real (Dra. Betina, 29/10/2026): conta pré-paga sem saldo, 3 campanhas ativas e gasto zero.
assert.equal(saldoPrePagoZerado("Saldo disponível (0,00 R$ (BRL))"), true);
assert.equal(saldoPrePagoZerado("Available balance (0.00 USD)"), true);
// Com saldo, ou cartão: não é falta de saldo.
assert.equal(saldoPrePagoZerado("Saldo disponível (0,50 R$ (BRL))"), false);
assert.equal(saldoPrePagoZerado("Saldo disponível (120,00 R$ (BRL))"), false);
assert.equal(saldoPrePagoZerado("Visa *1234"), false);
assert.equal(saldoPrePagoZerado(null), false);
// Moeda antes do número (conta em inglês).
assert.equal(saldoPrePagoZerado("Available balance (R$0.00 BRL)"), true);
assert.equal(saldoPrePagoZerado("Available balance (R$12.00 BRL)"), false);
// Limite de gasto da conta (centavos).
assert.equal(limiteDeGastoAtingido("500000", "500000"), true);
assert.equal(limiteDeGastoAtingido("500000", "499000"), false);
assert.equal(limiteDeGastoAtingido("0", "100"), false, "limite zero = sem limite");
assert.equal(limiteDeGastoAtingido(undefined, "100"), false);
console.log("test-saldo-anuncios: ok");
