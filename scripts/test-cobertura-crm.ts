// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cobertura-crm.ts
// Cobertura do CRM (D-06): números inventados, nenhuma clínica real.
import assert from "node:assert/strict";
import { montarCobertura, rpcAusente, type DadosCobertura, type FonteDaCobertura, type LinhaCobertura } from "../src/lib/cobertura-crm";

const HOJE = "2026-10-21"; // quarta-feira: dias úteis e corridos iguais para "ontem"
const ONTEM = "2026-10-20";

const base: DadosCobertura = {
  origem: { leads: 100, com_origem: 40, sem_traducao: 30, checkout: 5, por_como: {} },
  valor: { ganhos: 10, com_valor: 2 },
  etapas: { com_card: 8, com_papel: 6 },
  compareceu: { estado: "medido", etapas: 1, entradas_30d: 12 },
  tem_crm: true,
};
const emDia = (fonte: FonteDaCobertura["fonte"]): FonteDaCobertura => ({ fonte, cadastro: true, data_ate: ONTEM, last_success_at: `${ONTEM}T10:00:00Z` });
const fontesOk: FonteDaCobertura[] = [emDia("crm"), emDia("atendimento"), emDia("instagram"), emDia("anuncios")];
const linha = (ls: LinhaCobertura[], id: LinhaCobertura["id"]) => {
  const l = ls.find((x) => x.id === id);
  assert.ok(l, `linha ${id}`);
  return l;
};

// Origem: "40 de 100", lacuna da tradução (Equipe) e o resto sem campo (Cliente), checkout junto do resto.
{
  const ls = montarCobertura(base, fontesOk, { hoje: HOJE });
  const o = linha(ls, "origem");
  assert.equal(o.resumo, "40 de 100");
  assert.equal(o.n, 40);
  assert.equal(o.m, 100);
  assert.equal(o.pct, 40);
  assert.equal(o.estado, "parcial");
  assert.equal(o.lacunas.length, 2);
  assert.equal(o.lacunas[0].quem, "Equipe");
  assert.equal(o.lacunas[0].texto, "30 leads de canal ou funil sem tradução");
  assert.match(o.lacunas[0].oQueFazer, /confirmar/);
  assert.equal(o.lacunas[1].quem, "Cliente");
  assert.match(o.lacunas[1].texto, /^30 leads sem campo de origem/);
  assert.match(o.lacunas[1].texto, /5 criados pela compra/);
}

// Sem lead em 30 dias: não se aplica, sem barra.
{
  const o = linha(montarCobertura({ ...base, origem: { leads: 0, com_origem: 0, sem_traducao: 0, checkout: 0 } }, fontesOk, { hoje: HOJE }), "origem");
  assert.equal(o.estado, "nao_se_aplica");
  assert.equal(o.pct, null);
  assert.equal(o.lacunas.length, 0);
}

// Valor: "2 de 10", Cliente lança o valor; sem ganho = não se aplica.
{
  const v = linha(montarCobertura(base, fontesOk, { hoje: HOJE }), "valor");
  assert.equal(v.resumo, "2 de 10");
  assert.deepEqual(v.lacunas.map((l) => l.quem), ["Cliente"]);
  assert.match(v.lacunas[0].oQueFazer, /lançar o valor ao marcar ganho/);
  const zero = linha(montarCobertura({ ...base, valor: { ganhos: 0, com_valor: 0 } }, fontesOk, { hoje: HOJE }), "valor");
  assert.equal(zero.estado, "nao_se_aplica");
  assert.equal(zero.pct, null);
  assert.equal(zero.resumo, "Nenhum ganho em 90 dias");
  const todos = linha(montarCobertura({ ...base, valor: { ganhos: 4, com_valor: 4 } }, fontesOk, { hoje: HOJE }), "valor");
  assert.equal(todos.estado, "completo");
  assert.equal(todos.lacunas.length, 0);
}

// Etapas: "6 de 8", Equipe dá o papel.
{
  const e = linha(montarCobertura(base, fontesOk, { hoje: HOJE }), "etapas");
  assert.equal(e.resumo, "6 de 8");
  assert.equal(e.lacunas[0].quem, "Equipe");
}

// Compareceu: sem etapa e sem uso = Cliente; medido = sem lacuna.
{
  const sem = linha(montarCobertura({ ...base, compareceu: { estado: "sem_etapa", etapas: 0, entradas_30d: 0 } }, fontesOk, { hoje: HOJE }), "compareceu");
  assert.equal(sem.lacunas[0].quem, "Cliente");
  assert.match(sem.lacunas[0].oQueFazer, /criar a etapa Compareceu/);
  const semUso = linha(montarCobertura({ ...base, compareceu: { estado: "sem_uso", etapas: 1, entradas_30d: 0 } }, fontesOk, { hoje: HOJE }), "compareceu");
  assert.equal(semUso.lacunas[0].quem, "Cliente");
  assert.match(semUso.lacunas[0].oQueFazer, /mover o card para a etapa quando o paciente vier/);
  const medido = linha(montarCobertura(base, fontesOk, { hoje: HOJE }), "compareceu");
  assert.equal(medido.lacunas.length, 0);
  assert.equal(medido.estado, "completo");
}

// Sem CRM: uma linha só, Equipe.
{
  const ls = montarCobertura({ ...base, tem_crm: false }, fontesOk, { hoje: HOJE });
  assert.equal(ls.length, 1);
  assert.equal(ls[0].resumo, "CRM não ligado");
  assert.equal(ls[0].lacunas[0].quem, "Equipe");
}

// Fontes: parada pelo cliente = Cliente; quebrada = Equipe; não ligada = Equipe; em dia = sem lacuna.
{
  const ok = linha(montarCobertura(base, fontesOk, { hoje: HOJE }), "fontes");
  assert.equal(ok.resumo, "4 de 4");
  assert.equal(ok.lacunas.length, 0);
  const fontes: FonteDaCobertura[] = [
    emDia("crm"),
    // Parada pelo cliente: rodou ontem sem erro, dado velho, motivo gravado com dono "cliente".
    { fonte: "anuncios", cadastro: true, data_ate: "2026-10-01", last_success_at: `${ONTEM}T10:00:00Z`, motivo: "Limite de gastos atingido", motivo_dono: "cliente" },
    // Quebrada: erro na última atualização.
    { fonte: "instagram", cadastro: true, data_ate: "2026-10-01", last_error: "token expirado" },
    // Não ligada: sem cadastro e sem dado.
  ];
  const f = linha(montarCobertura(base, fontes, { hoje: HOJE }), "fontes");
  assert.equal(f.resumo, "1 de 4");
  const porTexto = Object.fromEntries(f.lacunas.map((l) => [l.texto.split(/[ :]/)[0], l.quem]));
  assert.equal(porTexto["Anúncios"], "Cliente");
  assert.equal(porTexto["Instagram"], "Equipe");
  assert.equal(porTexto["WhatsApp"], "Equipe");
}

// "Nós": a linha existe; vazia por padrão, preenchida só pela lista fixa.
{
  const vazia = linha(montarCobertura(base, fontesOk, { hoje: HOJE }), "leitura");
  assert.equal(vazia.lacunas.length, 0);
  assert.equal(vazia.resumo, "Nada pendente");
  const aberta = linha(montarCobertura(base, fontesOk, { hoje: HOJE, leitura: [{ texto: "Campo X ainda não lido", oQueFazer: "ler no sync" }] }), "leitura");
  assert.deepEqual(aberta.lacunas.map((l) => l.quem), ["Nós"]);
  const todas = montarCobertura(base, fontesOk, { hoje: HOJE }).flatMap((l) => l.lacunas);
  assert.ok(todas.every((l) => l.quem !== "Nós"), "Nós só pela lista fixa");
}

// Nenhum texto compara clínicas, fala em média ou passa de 90 caracteres.
{
  const cenarios = [
    montarCobertura(base, [], { hoje: HOJE }),
    montarCobertura({ ...base, tem_crm: false }, [], { hoje: HOJE }),
    montarCobertura({ ...base, compareceu: { estado: "sem_etapa", etapas: 0, entradas_30d: 0 } }, [], { hoje: HOJE }),
    montarCobertura({ ...base, compareceu: { estado: "sem_uso", etapas: 1, entradas_30d: 0 } }, [], { hoje: HOJE }),
  ];
  const textos = cenarios.flat().flatMap((l) => [l.rotulo, l.resumo, ...l.lacunas.flatMap((x) => [x.texto, x.oQueFazer])]);
  for (const t of textos) {
    assert.doesNotMatch(t, /m[ée]dia|outras? cl[ií]nicas?|carteira|melhor que/i, t);
    assert.ok(t.length <= 90, `frase longa: ${t}`);
  }
}

// Dado torto do banco não quebra nem inventa: campos ausentes viram 0.
{
  const ls = montarCobertura({ tem_crm: true } as unknown as DadosCobertura, [], { hoje: HOJE });
  assert.equal(linha(ls, "origem").estado, "nao_se_aplica");
  assert.equal(linha(ls, "compareceu").estado, "falta");
}

// Função ausente (migração não aplicada).
assert.equal(rpcAusente({ code: "PGRST202", message: "Could not find the function public.crm_cobertura" }), true);
assert.equal(rpcAusente({ status: 404 }), true);
assert.equal(rpcAusente({ code: "42501", message: "permission denied" }), false);
assert.equal(rpcAusente(null), false);

console.log("test-cobertura-crm: ok");
