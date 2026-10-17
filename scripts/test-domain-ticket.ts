import assert from "node:assert/strict";
import { parseTicket, ticketForInput } from "../src/lib/ticket";

for (const [text, expected] of [["1234,56", 1234.56], ["1.234,56", 1234.56], ["1.234", 1234], ["10", 10], ["0,01", 0.01], ["  25,5 ", 25.5]] as const) {
  assert.equal(parseTicket(text), expected, text);
}
for (const invalid of ["", "0", "0,00", "-1", "1e3", "1e309", "Infinity", "NaN", "1234.56", "1,234.56", "1.23", "1,234", "1,", "R$ 10", "9".repeat(310)]) assert.equal(parseTicket(invalid), null, invalid);
for (const amount of [1234.56, 1500.5, 1.25, 0.01, 1000]) {
  assert.equal(parseTicket(ticketForInput(amount)), amount, "the database value survives opening and saving the editor unchanged");
}
assert.equal(ticketForInput(1234.56), "1234,56", "a decimal dot must not become a thousands separator in the editor");
assert.equal(ticketForInput(null), "");
assert.equal(ticketForInput(Infinity), "");
console.log("Ticket regressions passed: Brazilian decimals, unchanged-value round trip, non-finite and ambiguous input rejection.");
