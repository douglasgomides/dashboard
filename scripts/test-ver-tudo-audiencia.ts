// As respostas dos blocos dos Detalhes de Instagram › Público (quick-ver-tudo-abas, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-audiencia.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import {
  cabecaDaHoraMaisOnline,
  cabecaDaOrigem,
  cabecaDaPrincipalCidade,
  cabecaDasInteracoes,
  cabecaDasJanelas,
  cabecaDasVisualizacoes,
  cabecaDeQuemEngaja,
  cabecaDeSeguidoresEAlcancados,
  cabecaDoDiaMaisOnline,
  cabecaDoGenero,
  cabecaDosPaises,
  cabecaDosSeusPosts,
  melhorDiaDosPosts,
} from "../src/lib/leitura/ver-tudo-audiencia";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};

ok(cabecaDoGenero([{ chave: "F", valor: 760 }, { chave: "M", valor: 140 }, { chave: "U", valor: 100 }]), "10% dos seguidores não informaram o gênero.");
ok(cabecaDoGenero([{ chave: "F", valor: 70 }, { chave: "M", valor: 30 }]), "Todos os 100 seguidores contados informaram o gênero.");
assert.equal(cabecaDoGenero([]).tipo, "falta");

ok(cabecaDeQuemEngaja([{ chave: "25-34", valor: 40 }, { chave: "35-44", valor: 30 }, { chave: "U", valor: 50 }]), "Quem mais interage tem 25-34 anos: 33% de quem interagiu.");
assert.equal(textoDaCabeca(cabecaDeQuemEngaja([{ chave: "25-34", valor: 20 }])), "Falta dado: menos de 50 pessoas interagiram no mês");

const faixas = ["18-24", "25-34", "35-44"];
ok(
  cabecaDeSeguidoresEAlcancados([{ chave: "18-24", valor: 10 }, { chave: "25-34", valor: 60 }, { chave: "35-44", valor: 30 }], [{ chave: "18-24", valor: 30 }, { chave: "25-34", valor: 50 }, { chave: "35-44", valor: 20 }], faixas),
  "O conteúdo chega mais à faixa 18-24: 30% do alcance, 10% da base.",
);
ok(cabecaDeSeguidoresEAlcancados([{ chave: "25-34", valor: 50 }, { chave: "35-44", valor: 50 }], [{ chave: "25-34", valor: 52 }, { chave: "35-44", valor: 48 }], faixas), "O alcance segue a base: nenhuma faixa muda 5 pontos ou mais.");
assert.equal(cabecaDeSeguidoresEAlcancados([], [], faixas).tipo, "falta");

ok(cabecaDaPrincipalCidade([{ nome: "Goiânia (GO)", valor: 300 }, { nome: "Anápolis (GO)", valor: 100 }]), "Goiânia (GO) é a principal cidade: 75% de quem tem cidade conhecida.");
ok(cabecaDosPaises([{ nome: "Brasil", valor: 950 }, { nome: "Portugal", valor: 50 }]), "Brasil tem 95% dos seguidores.");
assert.equal(cabecaDosPaises([]).tipo, "falta");

ok(cabecaDasVisualizacoes({ seguidores: 3000, naoSeguidores: 7000 }), "70% das visualizações foram de quem ainda não segue.");
assert.equal(cabecaDasVisualizacoes(null).tipo, "falta");

ok(cabecaDaOrigem([{ conteudo: "Reels", visualizacoes: 800, alcance: 500, interacoes: 40 }, { conteudo: "Anúncios", visualizacoes: 200, alcance: 100, interacoes: 0 }]), "20% das visualizações foram de anúncios; o resto é orgânico.");
ok(cabecaDaOrigem([{ conteudo: "Reels", visualizacoes: 800, alcance: 500, interacoes: 40 }, { conteudo: "Carrossel", visualizacoes: 300, alcance: 200, interacoes: 30 }]), "Carrossel tem mais interação: 15% de quem alcança.");
assert.equal(cabecaDaOrigem([]).tipo, "falta");

ok(cabecaDasInteracoes({ curtidas: 700, comentarios: 100, salvamentos: 150, compartilhamentos: 50 }), "Salvos e compartilhados somam 20% das interações.");
assert.equal(cabecaDasInteracoes(null).tipo, "falta");

const mapa = [Array(24).fill(10), Array(24).fill(40), Array(24).fill(20)];
ok(cabecaDoDiaMaisOnline(mapa), "Segunda é o dia com mais gente online: 40 por hora, em média.");
assert.equal(cabecaDoDiaMaisOnline([]).tipo, "falta");
ok(cabecaDasJanelas([{ online: 139 }, { online: 120 }, { online: 98 }]), "As 3 melhores janelas têm de 139 a 98 seguidores online.");
ok(cabecaDaHoraMaisOnline([{ hora: 9, valor: 50 }, { hora: 14, valor: 120 }]), "14h é a hora com mais gente online: 120 em média.");

ok(cabecaDosSeusPosts([{ hora: 13, posts: 6, mediana: 54 }], 14), "Seus posts renderam mais às 13h: 54 interações no post típico (6 posts).");
ok(cabecaDosSeusPosts([{ hora: 9, posts: 4, mediana: 54 }], 19), "Seus posts renderam mais às 9h; o pico de gente online é às 19h.");
assert.equal(cabecaDosSeusPosts([], 14).tipo, "falta");
assert.equal(melhorDiaDosPosts([{ dia: 2, posts: 5 }]), "Terça foi o dia em que seus posts renderam mais (5 posts).");
assert.equal(melhorDiaDosPosts([]), null);

console.log("test-ver-tudo-audiencia: ok");
