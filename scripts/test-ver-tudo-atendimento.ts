// As respostas dos blocos do "Ver tudo" de Atendimento › Qualidade (quick-ver-tudo, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-atendimento.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import {
  cabecaDaEsperaPorDia,
  cabecaDoCustoDoWhatsapp,
  cabecaDosNumerosDoAtendimento,
  cabecaDoTempoAteFechar,
  cabecaPorAtendente,
  cabecaPorEquipe,
  duracao,
} from "../src/lib/leitura/ver-tudo-atendimento";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};

assert.equal(duracao(40), "40s");
assert.equal(duracao(900), "15min");
assert.equal(duracao(4800), "1h20");
assert.equal(duracao(7200), "2h");

ok(cabecaDosNumerosDoAtendimento({ esperaSeg: 900, fatiaSemRoteamento: 4, semRoteamento: 20 }), "Na metade dos atendimentos, a 1ª resposta veio em até 15min.");
// Mais de 40% sem equipe: esse é o primeiro ajuste (o aviso que o "Em resumo" levava).
ok(cabecaDosNumerosDoAtendimento({ esperaSeg: 900, fatiaSemRoteamento: 55, semRoteamento: 300 }), "55% das conversas não foram para nenhuma equipe: organizar isso primeiro.");
assert.equal(cabecaDosNumerosDoAtendimento({ esperaSeg: null, fatiaSemRoteamento: 4, semRoteamento: 20 }).tipo, "falta");
const demorada = cabecaDosNumerosDoAtendimento({ esperaSeg: 4000, fatiaSemRoteamento: 4, semRoteamento: 20 });
assert.equal(demorada.tipo === "frase" ? demorada.tom : null, "atencao", "espera acima de 1 hora pede atenção");

ok(cabecaDaEsperaPorDia([10, 12, null, 11]), "A espera até a 1ª resposta foi de 10min a 12min por dia.");
ok(cabecaDaEsperaPorDia([10, 10, 10]), "A espera até a 1ª resposta ficou em 10min todo dia.");
assert.equal(cabecaDaEsperaPorDia([10, null]).tipo, "falta", "dia sem medida nunca vira zero");

ok(cabecaPorEquipe([{ nome: "Comercial", atendimentos: 480, fatia: 92, esperaSeg: 780 }, { nome: "Geral", atendimentos: 40, fatia: 8, esperaSeg: null }]), "Comercial atendeu 92% das conversas, com espera de 13min.");
assert.equal(cabecaPorEquipe([]).tipo, "falta");
ok(cabecaDoTempoAteFechar(39960), "11h06 entre abrir e encerrar a conversa: não é o tempo de atendimento.");
ok(cabecaPorAtendente([{ nome: "Atendente fictícia", atendimentos: 300, esperaSeg: 660 }]), "Atendente fictícia fez 300 atendimentos, com espera de 11min.");
ok(cabecaDoCustoDoWhatsapp({ custo: 42.5, pagas: 120 }), "O WhatsApp custou cerca de R$ 42,50 no período: 120 mensagens pagas.");

console.log("test-ver-tudo-atendimento: ok");
