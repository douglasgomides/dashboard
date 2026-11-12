// "Do contato à venda" no formato 5 segundos (Phase 03.1.1.1, plano 05): o veredito da maior perda, as pessoas na mesa, os números-chave e as
// descobertas. Módulo puro, só dados fictícios: nenhum número, nome ou legenda dos pilotos entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cinco-pacientes.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AVISO_FORA_DE_ORDEM, NOMES_DO_FUNIL, type EtapaDesenhada, type FunilDesenhado } from "../src/lib/funil-desenhado";
import { checarDescoberta, checarFraseCinco, textoDaFrase } from "../src/lib/leitura/cinco-segundos";
import type { FatosDaTela } from "../src/lib/leitura/tipos";
import { ACOES_DE_PACIENTES, descobertasDePacientes, numerosDePacientes, pessoasNaMesa, pontoPorLeads, vereditoDePacientes, type EntradaCincoPacientes } from "../src/lib/leitura/cinco-pacientes";

// O real brasileiro sai com espaço sem quebra (U+00A0): nos testes comparamos com espaço comum.
const sp = (t: string) => t.replace(/ /g, " ");

const fatos = (ok = true): FatosDaTela => ({
  tela: "pacientes",
  versaoRegras: 1,
  tipoPeriodo: "periodo",
  periodo: { de: "2026-10-01", ate: "2026-10-30", anterior: { de: "2026-09-01", ate: "2026-09-30" } },
  portao: ok
    ? { ok: true }
    : { ok: false, codigo: "sem_dado", motivo: "as conversas do período não foram medidas", passo: { verbo: "conferir", texto: "a conexão das fontes", quem: "equipe_hub" } },
  fatos: [],
  proximoPasso: null,
  outrosPassos: [],
});

const IDS = ["conversou", "virou-lead", "atendido", "agendou", "fechou"] as const;
const etapa = (k: number, valor: number | null, motivo: string | null = null): EtapaDesenhada => ({
  id: IDS[k],
  nome: NOMES_DO_FUNIL[k],
  valor,
  texto: valor == null ? "Falta dado" : String(valor),
  estimado: false,
  motivo: valor == null ? (motivo ?? "Este número não veio neste período.") : null,
  explicacao: null,
  variacao: null,
  passagem: null,
  detalhe: [],
});
const funilDe = (valores: (number | null)[], resto: Partial<FunilDesenhado> = {}): FunilDesenhado => ({
  etapas: valores.map((v, k) => etapa(k, v)),
  maiorPerda: null,
  foraDeOrdem: false,
  aviso: null,
  ...resto,
});

// ---------------------------------------------------------------- veredito
{
  // Maior perda de Virou lead para Atendido com 10% passando.
  const f = funilDe([1000, 500, 50, 30, 18], { maiorPerda: { de: 1, para: 2, texto: "10% passam" } });
  const v = vereditoDePacientes({ funil: f, fatos: fatos() });
  assert.ok(v && v.tipo === "veredito");
  assert.equal(v.palavra, "Maior perda");
  assert.equal(v.tom, "ruim");
  assert.equal(textoDaFrase(v.frase), "Aqui você perde mais: só 10% dos leads são atendidos.");
  assert.ok(textoDaFrase(v.frase).length <= 90);
  assert.deepEqual(checarFraseCinco(textoDaFrase(v.frase)), []);
  // O número vai em destaque, como dado (nunca HTML).
  assert.deepEqual(v.frase.find((p) => p.enfase)?.texto, "só 10% dos leads são atendidos");
}
{
  // Cada ligação diz a etapa de baixo com as palavras dela, e a fração "N de M" também é aceita (base pequena).
  const f4 = funilDe([1000, 500, 300, 30, 18], { maiorPerda: { de: 2, para: 3, texto: "9,4% passam" } });
  assert.equal(textoDaFrase((vereditoDePacientes({ funil: f4, fatos: fatos() }) as any).frase), "Aqui você perde mais: só 9,4% dos atendidos agendam.");
  const f5 = funilDe([1000, 500, 300, 30, 18], { maiorPerda: { de: 3, para: 4, texto: "6 de 18" } });
  assert.equal(textoDaFrase((vereditoDePacientes({ funil: f5, fatos: fatos() }) as any).frase), "Aqui você perde mais: só 6 de 18 agendados fecham.");
}
{
  // Funil fora de ordem: "Atenção", nenhuma etapa nomeada, mesmo com uma maior perda no objeto (a regra do funil apaga, esta também).
  const f = funilDe([1000, 500, 50, 30, 40], { foraDeOrdem: true, aviso: AVISO_FORA_DE_ORDEM, maiorPerda: { de: 1, para: 2, texto: "10% passam" } });
  const v = vereditoDePacientes({ funil: f, fatos: fatos() });
  assert.ok(v && v.tipo === "veredito");
  assert.equal(v.palavra, "Atenção");
  assert.equal(v.tom, "atencao");
  assert.equal(textoDaFrase(v.frase), "Funil fora de ordem: a maior perda não é apontada.");
  for (const nome of NOMES_DO_FUNIL) assert.ok(!textoDaFrase(v.frase).includes(nome), `não nomeia ${nome}`);
}
{
  // Sem maior perda e em ordem: o veredito dos fatos (aqui, sem fato aproveitável: "Falta dado" com o motivo da leitura).
  const f = funilDe([1000, 500, 300, 30, 18]);
  const v = vereditoDePacientes({ funil: f, fatos: fatos() });
  assert.ok(v && v.tipo === "sem_leitura");
  // Portão negado: o mesmo "Falta dado: motivo" da leitura, mesmo havendo uma maior perda desenhada (D-05).
  const g = funilDe([1000, 500, 50, 30, 18], { maiorPerda: { de: 1, para: 2, texto: "10% passam" } });
  const sem = vereditoDePacientes({ funil: g, fatos: fatos(false) });
  assert.ok(sem && sem.tipo === "sem_leitura");
  assert.match(sem.motivo, /conversas do período/);
  // Ainda sem fatos e sem maior perda: nada a dizer.
  assert.equal(vereditoDePacientes({ funil: f, fatos: null }), null);
  // Texto da ligação que a regra não conhece: não inventa frase.
  const h = funilDe([1000, 500, 50, 30, 18], { maiorPerda: { de: 1, para: 2, texto: "talvez 10" } });
  const hv = vereditoDePacientes({ funil: h, fatos: fatos() });
  assert.ok(hv && hv.tipo === "sem_leitura");
}

// ---------------------------------------------------------------- pessoas na mesa
{
  const m = pessoasNaMesa(funilDe([1000, 500, 50, 30, 18]));
  assert.deepEqual(m, { esperando: 450, atendidos: 50, porPonto: 5, pontos: 100, pontosAtendidos: 10 });
  // Os pontos nunca passam de 100, em qualquer tamanho de base.
  for (const leads of [1, 7, 99, 100, 101, 250, 1500, 4800, 100_000, 3_000_000]) {
    const k = pontoPorLeads(leads);
    assert.ok(Math.ceil(leads / k) <= 100 || k === 100_000, `${leads} leads com ${k} por ponto`);
  }
  assert.equal(pontoPorLeads(100), 1);
  assert.equal(pontoPorLeads(101), 2);
  assert.equal(pontoPorLeads(500), 5);
  assert.equal(pontoPorLeads(1500), 20);
  // O limite de pontos pode ser menor (tela estreita): sobe um degrau da escala.
  assert.equal(pontoPorLeads(500, 60), 10);
  const pequeno = pessoasNaMesa(funilDe([100, 40, 10, 5, 2]));
  assert.ok(!("faltaDado" in pequeno && pequeno.faltaDado));
  assert.deepEqual(pequeno, { esperando: 30, atendidos: 10, porPonto: 1, pontos: 40, pontosAtendidos: 10 });
  // Atendido zero é um número medido (todos esperando), não "Falta dado".
  const todos = pessoasNaMesa(funilDe([100, 40, 0, 0, 0]));
  assert.deepEqual(todos, { esperando: 40, atendidos: 0, porPonto: 1, pontos: 40, pontosAtendidos: 0 });
  // Quem espera nunca some por arredondamento, e quem foi atendido também não.
  const quaseTodos = pessoasNaMesa(funilDe([100, 1000, 999, 0, 0]));
  assert.ok(quaseTodos.faltaDado == null && quaseTodos.esperando === 1 && quaseTodos.pontosAtendidos === quaseTodos.pontos - 1);
  const poucos = pessoasNaMesa(funilDe([100, 1000, 1, 0, 0]));
  assert.ok(poucos.faltaDado == null && poucos.pontosAtendidos === 1);
}
{
  // Atendido não medido: "Falta dado" com o motivo do funil, nunca 0 e nunca ponto.
  const f = { etapas: [etapa(0, 1000), etapa(1, 500), etapa(2, null, "A lista de quem foi atendido não veio inteira."), etapa(3, 30), etapa(4, 18)] };
  const m = pessoasNaMesa(f);
  assert.ok(m.faltaDado);
  assert.equal(m.faltaDado, "A lista de quem foi atendido não veio inteira.");
  assert.ok(!("esperando" in m));
  // Virou lead sem medida: o motivo dele.
  const l = pessoasNaMesa({ etapas: [etapa(0, 1000), etapa(1, null, "Virou lead não veio."), etapa(2, 50), etapa(3, 30), etapa(4, 18)] });
  assert.equal(l.faltaDado, "Virou lead não veio.");
  // Atendido acima de Virou lead: funil fora de ordem, nunca negativo.
  const fora = pessoasNaMesa(funilDe([1000, 40, 50, 30, 18]));
  assert.ok(fora.faltaDado);
  assert.match(sp(fora.faltaDado), /fora de ordem/i);
  assert.ok(!("esperando" in fora));
}

// ---------------------------------------------------------------- números-chave
const entrada = (parte: Partial<EntradaCincoPacientes> = {}): EntradaCincoPacientes => ({
  funil: funilDe([1000, 500, 300, 100, 30], { maiorPerda: { de: 3, para: 4, texto: "30% passam" } }),
  somas: {
    atual: { mandaram_mensagem: 600, leads_novos: 200, agendaram: 70, fecharam: 18 },
    antes: { mandaram_mensagem: 500, leads_novos: 220, agendaram: 110, fecharam: 36 },
  },
  numeros: { fecharam: 18 },
  fatos: fatos(),
  dias: 30,
  ...parte,
});
{
  const [mesa, agendam, fecharam] = numerosDePacientes(entrada());
  assert.deepEqual([mesa.id, agendam.id, fecharam.id], ["mesa", "agendam", "fecharam"]);
  // Pessoas na mesa: 500 leads menos 300 atendidos; nunca tem comparação (o período anterior de pessoas únicas é proibido).
  assert.equal(mesa.valor, 200);
  assert.equal(mesa.textoDaVariacao, null);
  assert.equal(mesa.selo?.texto, "Falta dado · sem período anterior");
  assert.equal(mesa.motivo, null);
  // Agendam, de cada 100 leads: 70 de 200 = 35 agora e 110 de 220 = 50 antes: ▼ 15 pontos, pior.
  assert.equal(agendam.valor, 35);
  assert.equal(agendam.antes, 50);
  assert.equal(agendam.textoDaVariacao, "▼ 15 pontos · pior que antes");
  assert.equal(agendam.melhor, false);
  assert.deepEqual(agendam.selo, { tom: "ruim", texto: "Em queda" });
  // Fecharam: 18 contra 36 nas somas diárias (▼ 50%).
  assert.equal(fecharam.valor, 18);
  assert.equal(fecharam.textoDaVariacao, "▼ 50% · pior que antes");
  assert.deepEqual(fecharam.selo, { tom: "ruim", texto: "Em queda" });
}
{
  // Sem Atendido medido: "Falta dado" com o motivo, nunca 0.
  const f = { ...funilDe([1000, 500, null, 100, 30]), etapas: [etapa(0, 1000), etapa(1, 500), etapa(2, null, "A lista de quem foi atendido não veio inteira."), etapa(3, 100), etapa(4, 30)] };
  const [mesa] = numerosDePacientes(entrada({ funil: f }));
  assert.equal(mesa.valor, null);
  assert.equal(mesa.motivo, "A lista de quem foi atendido não veio inteira.");
  assert.equal(mesa.selo, null);
  // Período anterior com menos leads que a base mínima (LIMITES.funil.minLeads): a variação em pontos não é dita, e o selo diz o motivo.
  const [, pouco] = numerosDePacientes(entrada({ somas: { atual: { mandaram_mensagem: 600, leads_novos: 200, agendaram: 70, fecharam: 18 }, antes: { mandaram_mensagem: 500, leads_novos: 12, agendaram: 6, fecharam: 36 } } }));
  assert.equal(pouco.valor, 35);
  assert.equal(pouco.textoDaVariacao, null);
  assert.equal(pouco.antes, null);
  assert.equal(pouco.selo?.texto, "Falta dado · sem período anterior");
  // Poucos leads agora: "N de M", sem % e sem variação.
  const [, base] = numerosDePacientes(entrada({ somas: { atual: { mandaram_mensagem: 600, leads_novos: 12, agendaram: 5, fecharam: 18 }, antes: { mandaram_mensagem: 500, leads_novos: 220, agendaram: 110, fecharam: 36 } } }));
  assert.equal(base.valor, null);
  assert.equal(base.valorTexto, "5 de 12");
  assert.equal(base.textoDaVariacao, null);
  assert.equal(base.motivo, null);
  // Histórico diário sem cobertura (soma null): Falta dado com motivo, nunca 0; e Fecharam sem comparação diz o mesmo.
  const [, , sem] = numerosDePacientes(entrada({ somas: { atual: { leads_novos: null, agendaram: null, fecharam: null }, antes: { fecharam: null } } }));
  assert.equal(sem.valor, 18);
  assert.equal(sem.textoDaVariacao, null);
  assert.equal(sem.selo?.texto, "Falta dado · sem período anterior");
  const [, semAgenda] = numerosDePacientes(entrada({ somas: { atual: { leads_novos: null, agendaram: null }, antes: {} } }));
  assert.equal(semAgenda.valor, null);
  assert.match(semAgenda.motivo ?? "", /histórico por dia/);
  // Fecharam sem medida: o motivo do funil.
  const [, , fSem] = numerosDePacientes(entrada({ numeros: { fecharam: null }, funil: { ...funilDe([1000, 500, 300, 100, null]), etapas: [etapa(0, 1000), etapa(1, 500), etapa(2, 300), etapa(3, 100), etapa(4, null, "O CRM não respondeu.")] } }));
  assert.equal(fSem.valor, null);
  assert.equal(fSem.motivo, "O CRM não respondeu.");
  assert.equal(fSem.selo, null);
  // Igual a antes: "= igual", nunca uma seta de mentira.
  const [, igual] = numerosDePacientes(entrada({ somas: { atual: { mandaram_mensagem: 600, leads_novos: 200, agendaram: 70, fecharam: 18 }, antes: { mandaram_mensagem: 500, leads_novos: 200, agendaram: 70, fecharam: 18 } } }));
  assert.equal(igual.textoDaVariacao, "= igual");
  assert.equal(igual.selo?.texto, "Igual a antes");
}

// ---------------------------------------------------------------- descobertas
{
  const { itens, aviso } = descobertasDePacientes(entrada());
  // Agendam 35 (era 50) piora, fecham 26 de cada 100 (era 33) piora, conversa vira lead 33 (era 44) piora, e a maior perda do funil.
  assert.ok(itens.length >= 3 && itens.length <= 5, `${itens.length} descobertas`);
  assert.equal(aviso, null);
  for (const d of itens) {
    assert.deepEqual(checarDescoberta(d), [], d.id);
    assert.deepEqual(checarFraseCinco(d.frase), [], d.id);
    assert.ok(d.porque.barras.length >= 2 && d.porque.barras.length <= 3, `${d.id}: ${d.porque.barras.length} fatores`);
    assert.ok(d.acao.local && !d.acao.rota, `${d.id}: a ação só abre algo da própria tela`);
    assert.ok(d.quem === "Atendimento/secretária" || d.quem === "Comercial", `${d.id}: quem resolve ${d.quem}`);
    // As pessoas que esperam NÃO se repetem como descoberta: são o número-chave 1.
    assert.ok(!/mesa|esperando/i.test(d.frase), `${d.id}: não repete as pessoas na mesa`);
  }
  // O que piorou vem primeiro; a maior perda do funil é a última entre as que pioraram (não repete o veredito no topo).
  assert.ok(itens.every((d) => d.tom === "ruim"));
  assert.equal(itens.at(-1)?.id, "pacientes-maior-perda");
  const agenda = itens.find((d) => d.id === "pacientes-lead-agenda");
  assert.equal(agenda?.frase, "De cada 100 leads, 35 agendam. Antes eram 50.");
  assert.equal(agenda?.impacto, "50 → 35 de cada 100");
  assert.equal(agenda?.acao.local, ACOES_DE_PACIENTES.agendaram);
  const perda = itens.find((d) => d.id === "pacientes-maior-perda");
  assert.equal(sp(perda?.frase ?? ""), "Entre Agendou e Fechou, 30% passam.");
  assert.equal(perda?.acao.local, ACOES_DE_PACIENTES.funil);
  // A razão de conversas avisa que inclui pacientes antigos (D-05): uma proporção, não uma passagem.
  assert.match(itens.find((d) => d.id === "pacientes-conversa-vira-lead")?.porque.obs ?? "", /pacientes antigos/);
}
{
  // Funil fora de ordem: nenhuma descoberta aponta a maior perda.
  const f = funilDe([1000, 500, 300, 100, 30], { foraDeOrdem: true, aviso: AVISO_FORA_DE_ORDEM });
  assert.ok(!descobertasDePacientes(entrada({ funil: f })).itens.some((d) => d.id === "pacientes-maior-perda"));
  // Portão negado: nenhuma descoberta (a tela diz Falta dado).
  assert.deepEqual(descobertasDePacientes(entrada({ fatos: fatos(false) })), { itens: [], aviso: null });
  // Menos de 3 válidas: só as válidas e o aviso com o motivo (nunca inventa).
  const poucas = descobertasDePacientes(
    entrada({ funil: funilDe([1000, 500, 300, 100, 30]), somas: { atual: { mandaram_mensagem: 600, leads_novos: 200, agendaram: 70, fecharam: 18 }, antes: { mandaram_mensagem: 500, leads_novos: 12, agendaram: 6, fecharam: 36 } } }),
  );
  assert.ok(poucas.itens.length < 3);
  assert.match(poucas.aviso ?? "", /^Poucas descobertas neste período: .+\.$/);
  // Tudo igual a antes e sem maior perda: nenhuma descoberta, e o aviso diz que os números ficaram iguais.
  const igual = descobertasDePacientes(entrada({ funil: funilDe([1000, 500, 300, 100, 30]), somas: { atual: { mandaram_mensagem: 600, leads_novos: 200, agendaram: 70, fecharam: 18 }, antes: { mandaram_mensagem: 600, leads_novos: 200, agendaram: 70, fecharam: 18 } } }));
  assert.deepEqual(igual.itens, []);
  assert.match(igual.aviso ?? "", /iguais aos de antes/);
  // O lado bom também é dito: agendam subiu.
  const sobe = descobertasDePacientes(entrada({ somas: { atual: { mandaram_mensagem: 600, leads_novos: 200, agendaram: 110, fecharam: 18 }, antes: { mandaram_mensagem: 500, leads_novos: 220, agendaram: 70, fecharam: 18 } } }));
  const bom = sobe.itens.find((d) => d.id === "pacientes-lead-agenda");
  assert.equal(bom?.tom, "bom");
  assert.equal(bom?.selo, "Em alta");
  // Etapa fora de ordem nos somas (fecharam acima de agendaram): a razão não é dita.
  const fora = descobertasDePacientes(entrada({ somas: { atual: { mandaram_mensagem: 600, leads_novos: 200, agendaram: 70, fecharam: 90 }, antes: { mandaram_mensagem: 500, leads_novos: 220, agendaram: 110, fecharam: 36 } } }));
  assert.ok(!fora.itens.some((d) => d.id === "pacientes-agendado-fecha"));
}

// ---------------------------------------------------------------- a regra só lê contagens (T-03.1.1.1-12)
{
  const fonte = await readFile(new URL("../src/lib/leitura/cinco-pacientes.ts", import.meta.url), "utf8");
  assert.ok(!/telefone|email/i.test(fonte), "a regra não lê telefone nem e-mail");
  assert.ok(!/\.nome\b/.test(fonte), "a regra não lê nome de pessoa");
}

console.log("test-cinco-pacientes: ok");
