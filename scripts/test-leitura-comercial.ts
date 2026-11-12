// Leitura por regra do CRM (Phase 3.1.1, plano 03): Funil comercial, Jornada comercial e Resultados por origem.
// Só regra fixa, sem IA e sem banco. Rodar: npx tsx scripts/test-leitura-comercial.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIMITES } from "../src/lib/limites";
import { VERBOS_PROVISORIOS, type FatosDaTela } from "../src/lib/leitura/tipos";
import { montarTexto, problemasDoTexto } from "../src/lib/leitura/texto";
import { fatosDaJornada, fatosDoFunil, fatosPorOrigem, VERSAO_REGRAS_COMERCIAL } from "../src/lib/leitura/fatos-comercial";
import { montarFunil, type Contagem, type DadosComerciais } from "../src/lib/comercial";
import { montarFunil as montarFunilDaJornada, type FunilBanco } from "../src/lib/jornada-funil";
import { MIN_LEADS_RANKING } from "../src/lib/vendas-origem";

const DE = "2026-10-12", ATE = "2026-11-10", HOJE = "2026-11-11";
const entradaBase = { de: DE, ate: ATE, hoje: HOJE };

assert.equal(VERSAO_REGRAS_COMERCIAL, 1, "as regras do CRM são a versão 1");

// ---------- fixtures (só contagens: nenhum nome nem telefone) ----------
const contagem = (c: Partial<Contagem>): Contagem => ({
  leads: 200, atendidos: 150, naEntrada: 50, naEntrada3d: 10, agendados: 60, emConsulta: 60, agendadosProvaveis: 60, ganhosEmEtapaAgenda: 2,
  pareceConsulta: 0, ganhos: 25, perdidos: 10, comOrigem: 150, origemEhFunil: 0, comContato: 180, abertos: 165, abertosSemDono: null, ...c,
});
const dados = (c: Partial<Contagem>): DadosComerciais => ({
  origem: "completo", provider: "kommo", escopo: "periodo", c: contagem(c), base: contagem(c), listaImportada: 0,
  etapas: { total: 10, consulta: 2, consultaEquipe: null, pareceConsulta: 0 },
  whatsapp: { conectado: true, conversas: 100, respondidas: 90, esperaMedianaSeg: 600 }, crmCompartilhado: null,
});
const funilDe = (c: Partial<Contagem>) => montarFunil(dados(c));

/** O texto da leitura passa no filtro de linguagem e todo passo tem verbo da lista e quem resolve. */
function confere(fatos: FatosDaTela) {
  const t = montarTexto(fatos);
  assert.deepEqual(problemasDoTexto(t), [], `problemas de linguagem: ${JSON.stringify(problemasDoTexto(t))}`);
  const passo = t.tipo === "sem_leitura" ? t.passo : t.proximoPasso;
  if (passo) {
    assert.ok((VERBOS_PROVISORIOS as readonly string[]).includes(passo.verbo), `verbo fora da lista: ${passo.verbo}`);
    assert.ok(passo.quem, "todo passo diz quem resolve");
  }
  return t;
}
const semPorcentagem = (fatos: FatosDaTela) => {
  for (const x of fatos.fatos) for (const n of x.numeros) assert.ok(!/%/.test(n.exibicao), `porcentagem em ${x.id}: ${n.exibicao}`);
};

// ===================================================================================================================
// Funil comercial
// ===================================================================================================================

// Etapas em ordem e base acima de LIMITES.funil: a etapa de maior perda, com "N de M", o passo e quem resolve.
{
  const fatos = fatosDoFunil({ ...entradaBase, funil: funilDe({}) });
  assert.equal(fatos.tela, "crm-painel");
  assert.equal(fatos.portao.ok, true, "funil em ordem com base grande passa no portão");
  const perda = fatos.fatos.find((x) => x.id === "maior-perda");
  assert.ok(perda, "há o fato de maior perda");
  assert.match(perda!.frase, /Foram atendidos/);
  assert.match(perda!.frase, /Agendaram/);
  assert.equal(perda!.numeros[0].exibicao, "60 de 150 seguiram", "traz o N de M da passagem");
  assert.equal(perda!.peso, 3);
  assert.ok(fatos.proximoPasso, "há um só próximo passo");
  assert.ok(["ligar para", "revisar"].includes(fatos.proximoPasso!.verbo), `verbo ${fatos.proximoPasso!.verbo}`);
  assert.equal(fatos.proximoPasso!.quem, "comercial");
  assert.equal(fatos.proximoPasso!.fatoId, "maior-perda");
  const t = confere(fatos);
  assert.equal(t.tipo, "leitura");
  if (t.tipo === "leitura") {
    assert.match(t.aconteceu.frase + (t.porque?.frase ?? ""), /maior perda/);
    assert.match(t.proximoPasso!.frase, /^Ligar para/);
  }
}

// Etapa abaixo da base mínima: "N de M", sem porcentagem para ela e sem conclusão.
{
  const funil = funilDe({ leads: 25, atendidos: 20, agendados: 8, agendadosProvaveis: 8, emConsulta: 8, ganhos: 3, perdidos: 1, ganhosEmEtapaAgenda: 0 });
  assert.ok(funil.passos[1].fracaoDoAnterior && funil.passos[1].pctDoAnterior == null, "montarFunil já devolve N de M abaixo da base");
  const fatos = fatosDoFunil({ ...entradaBase, funil });
  assert.equal(fatos.portao.ok, true);
  assert.ok(!fatos.fatos.some((x) => x.id === "maior-perda"), "base pequena não vira conclusão de maior perda");
  assert.equal(fatos.proximoPasso, null, "sem conclusão não há passo inventado");
  const pequena = fatos.fatos.find((x) => x.id === "base-pequena-atendidos");
  assert.ok(pequena, "a etapa abaixo da base vira fato de ressalva");
  assert.equal(pequena!.ressalva, true);
  assert.equal(pequena!.numeros[0].exibicao, "20 de 25");
  semPorcentagem(fatos);
  const aviso = fatos.fatos.find((x) => x.id === "aviso-mudanca-do-funil");
  assert.ok(aviso, "o aviso de mudança do funil entra como ressalva");
  assert.equal(aviso!.frase, 'Com poucos casos, a tela mostra "N de M" no lugar da porcentagem.');
  assert.ok(aviso!.frase.length <= 90 && aviso!.frase.split(/(?<=[.!?])\s+/).length === 1, "aviso com até 90 caracteres e uma frase");
  confere(fatos);
}

// Misto: a etapa de maior perda existe e a que tem base pequena não vira conclusão nem porcentagem.
{
  const funil = funilDe({ leads: 100, atendidos: 80, agendados: 10, agendadosProvaveis: 10, emConsulta: 10, ganhos: 3, perdidos: 1, ganhosEmEtapaAgenda: 0 });
  const fatos = fatosDoFunil({ ...entradaBase, funil });
  const perda = fatos.fatos.find((x) => x.id === "maior-perda");
  assert.ok(perda, "a passagem com base grande ainda vira a maior perda");
  assert.match(perda!.frase, /Foram atendidos.*Agendaram/);
  const pequena = fatos.fatos.find((x) => x.id === "base-pequena-compraram");
  assert.ok(pequena, "a passagem com base pequena fica em N de M");
  assert.equal(pequena!.numeros[0].exibicao, "3 de 10");
  assert.ok(!/Compraram/.test(perda!.frase), "a etapa de base pequena não é a escolhida");
  confere(fatos);
}

// Etapa maior que a anterior (fora de ordem): nega com o motivo e quem comercial.
{
  const funil = funilDe({ leads: 100, atendidos: 80, agendados: 90, agendadosProvaveis: 90, emConsulta: 90, ganhos: 5, perdidos: 1, ganhosEmEtapaAgenda: 0 });
  const fatos = fatosDoFunil({ ...entradaBase, funil });
  assert.equal(fatos.portao.ok, false);
  if (!fatos.portao.ok) {
    assert.equal(fatos.portao.codigo, "funil_fora_de_ordem");
    assert.equal(fatos.portao.passo.quem, "comercial");
    assert.equal(fatos.portao.passo.verbo, "corrigir");
  }
  assert.ok(!fatos.fatos.some((x) => x.id === "maior-perda"), "funil fora de ordem não conclui");
  const t = confere(fatos);
  assert.equal(t.tipo, "sem_leitura");
  if (t.tipo === "sem_leitura") assert.match(t.motivo, /fora de ordem/);
}

// CRM sem dado no período: nega com quem equipe_hub.
for (const funil of [null, funilDe({ leads: 0, atendidos: null, agendados: null, agendadosProvaveis: null, emConsulta: null, ganhos: 0, perdidos: 0 })]) {
  const fatos = fatosDoFunil({ ...entradaBase, funil });
  assert.equal(fatos.portao.ok, false);
  if (!fatos.portao.ok) {
    assert.equal(fatos.portao.codigo, "sem_dado");
    assert.equal(fatos.portao.passo.quem, "equipe_hub");
  }
  const t = confere(fatos);
  assert.equal(t.tipo, "sem_leitura");
}

// Conta de CRM compartilhada vira ressalva, sem nome de cliente.
{
  const fatos = fatosDoFunil({ ...entradaBase, funil: funilDe({}), dados: { escopo: "periodo", crmCompartilhado: { clientes: 2, nomes: ["Clínica Fictícia"] } } });
  const x = fatos.fatos.find((y) => y.id === "crm-compartilhado");
  assert.ok(x && x.ressalva);
  assert.equal(x!.frase, "Conta de CRM compartilhada com outra clínica.");
  assert.ok(!JSON.stringify(fatos).includes("Clínica Fictícia"), "nome de outro cliente não chega à leitura");
}

// ===================================================================================================================
// Jornada comercial
// ===================================================================================================================
const banco = (c: Partial<FunilBanco> = {}, fontes: Partial<FunilBanco["fontes"]> = {}): FunilBanco => ({
  alcance: 50000, dias_alcance: 30, interacoes: 2000, dias_interacoes: 30, comentarios: 300, comentaristas: 200, conversas: 120, leads: 100,
  leads_com_etapa: 90, agendados: 30, vendas: 6, receita: 0, dias_periodo: 30,
  fontes: { tem_instagram: true, tem_comentarios: true, tem_whatsapp: true, tem_conversas: true, tem_crm: true, tem_etapa_agendamento: true, tem_venda_registrada: true, crm_provider: "kommo", ...fontes },
  ...c,
});

// CRM sem dado: nega com quem equipe_hub.
for (const funil of [null, montarFunilDaJornada(banco({}, { tem_crm: false }), undefined, undefined)]) {
  const fatos = fatosDaJornada({ ...entradaBase, funil });
  assert.equal(fatos.tela, "jornada");
  assert.equal(fatos.portao.ok, false);
  if (!fatos.portao.ok) {
    assert.equal(fatos.portao.codigo, "sem_dado");
    assert.equal(fatos.portao.passo.quem, "equipe_hub");
  }
  assert.equal(confere(fatos).tipo, "sem_leitura");
}

// Jornada montada: a passagem com mais perda, "N de M" e o passo para o Comercial.
{
  const fatos = fatosDaJornada({ ...entradaBase, funil: montarFunilDaJornada(banco(), undefined, undefined) });
  assert.equal(fatos.portao.ok, true);
  const perda = fatos.fatos.find((x) => x.id === "maior-perda");
  assert.ok(perda, "há a passagem com mais perda");
  assert.match(perda!.frase, /consulta agendada.*venda/);
  assert.equal(perda!.numeros[0].exibicao, "6 de 30 seguiram");
  assert.equal(fatos.proximoPasso?.quem, "comercial");
  assert.ok(["ligar para", "revisar", "responder"].includes(fatos.proximoPasso!.verbo));
  assert.equal(confere(fatos).tipo, "leitura");
}

// Abaixo da base mínima: não conclui, só "N de M".
{
  const funil = montarFunilDaJornada(banco({ conversas: 15, leads: 20, agendados: 6, vendas: 2, leads_com_etapa: 20 }), undefined, undefined);
  const fatos = fatosDaJornada({ ...entradaBase, funil });
  assert.equal(fatos.portao.ok, true);
  assert.ok(!fatos.fatos.some((x) => x.id === "maior-perda"), "base pequena não conclui");
  assert.equal(fatos.proximoPasso, null);
  const pequenas = fatos.fatos.filter((x) => x.id.startsWith("base-pequena-"));
  assert.ok(pequenas.length >= 1, "as etapas abaixo da base viram N de M");
  semPorcentagem(fatos);
  confere(fatos);
}

// Contatos sem pessoa ligada: só com a base mínima de contatos.
{
  const funil = montarFunilDaJornada(banco(), undefined, undefined);
  const com = fatosDaJornada({ ...entradaBase, funil, resumo: { leads_total: 80, leads_sem_pessoa: 50 } });
  const x = com.fatos.find((y) => y.id === "sem-pessoa");
  assert.ok(x, "mais da metade sem pessoa vira fato");
  assert.equal(x!.numeros[0].exibicao, "50 de 80");
  assert.equal(x!.frase, "A maioria dos contatos do período não está ligada a uma pessoa.");
  assert.ok(x!.frase.length <= 90 && x!.frase.split(/(?<=[.!?])\s+/).length === 1, "frase curta, uma só");
  assert.equal(x!.comparacao!.barras.length, 1);
  assert.equal(x!.comparacao!.barras[0].faltou, true, "a barra do que falta ligar é listrada");
  assert.ok(x!.comparacao!.barras[0].fracao >= 0 && x!.comparacao!.barras[0].fracao <= 1);
  assert.equal(x!.comparacao!.barras[0].fracao, 50 / 80);
  assert.ok(com.outrosPassos.some((p) => p.verbo === "corrigir" && p.quem === "comercial"));
  confere(com);
  const pouco = fatosDaJornada({ ...entradaBase, funil, resumo: { leads_total: LIMITES.funil.minLeads - 1, leads_sem_pessoa: 20 } });
  assert.ok(!pouco.fatos.some((y) => y.id === "sem-pessoa"), "abaixo da base mínima de contatos não conclui");
}

// ===================================================================================================================
// Resultados por origem do CRM
// ===================================================================================================================
const linha = (chave: string, total: number, ganhos: number, perdidos = 0, abertos: number | null = null) => ({ chave, total, ganhos, perdidos, abertos });

// Origem líder afirmada com a base de LIMITES.crm.leadsRanking.
{
  assert.equal(MIN_LEADS_RANKING, LIMITES.amostra.crm.leadsRanking);
  const fatos = fatosPorOrigem({ hoje: HOJE, linhas: [linha("Instagram", 300, 30, 60, 210), linha("Indicação", 100, 20, 10, 70), linha("Não informado", 20, 1, 0, 19)] });
  assert.equal(fatos.tela, "vendas-kommo");
  assert.equal(fatos.portao.ok, true);
  const lider = fatos.fatos.find((x) => x.id === "origem-lider");
  assert.ok(lider, "origem líder com base suficiente é afirmada");
  assert.match(lider!.frase, /Instagram/);
  assert.equal(lider!.numeros[0].exibicao, "30 de 300 contatos");
  assert.equal(fatos.proximoPasso?.verbo, "conferir", "ganho pode ser agendamento: o passo é conferir o significado");
  assert.equal(fatos.proximoPasso?.quem, "comercial");
  assert.equal(confere(fatos).tipo, "leitura");
}

// Origem líder com menos leads que LIMITES.crm.leadsRanking: não afirma.
{
  const fatos = fatosPorOrigem({ hoje: HOJE, linhas: [linha("Origem Pequena A", MIN_LEADS_RANKING - 1, 4), linha("Origem Pequena B", 6, 2), linha("Não informado", 30, 1, 0, 29)] });
  assert.equal(fatos.portao.ok, true);
  assert.ok(!fatos.fatos.some((x) => x.id === "origem-lider"), "base menor que leadsRanking não afirma líder");
  assert.ok(!JSON.stringify(fatos).includes("Origem Pequena"), "o nome de uma origem pequena não vira conclusão");
  assert.ok(fatos.fatos.some((x) => x.id === "sem-origem-lider" && x.ressalva));
  confere(fatos);
}

// "Não informado" acima da metade das vendas: nega, quem comercial, passo corrigir.
{
  const fatos = fatosPorOrigem({ hoje: HOJE, linhas: [linha("Instagram", 40, 5), linha("Não informado", 60, 20)] });
  assert.equal(fatos.portao.ok, false);
  if (!fatos.portao.ok) {
    assert.equal(fatos.portao.passo.quem, "comercial");
    assert.equal(fatos.portao.passo.verbo, "corrigir");
  }
  assert.ok(!fatos.fatos.some((x) => x.id === "origem-lider"), "sem origem acima da metade: não afirma líder");
  const t = confere(fatos);
  assert.equal(t.tipo, "sem_leitura");
}

// Só "Não informado", ou nenhum contato: sem dado.
{
  const so = fatosPorOrigem({ hoje: HOJE, linhas: [linha("Não informado", 80, 0)] });
  assert.equal(so.portao.ok, false);
  if (!so.portao.ok) assert.equal(so.portao.passo.quem, "comercial");
  confere(so);
  const vazio = fatosPorOrigem({ hoje: HOJE, linhas: [] });
  assert.equal(vazio.portao.ok, false);
  if (!vazio.portao.ok) {
    assert.equal(vazio.portao.codigo, "sem_dado");
    assert.equal(vazio.portao.passo.quem, "equipe_hub");
  }
  confere(vazio);
}

// ---------- módulo puro (T-03.1.1-06 e T-03.1.1-07) ----------
const fonte = readFileSync(new URL("../src/lib/leitura/fatos-comercial.ts", import.meta.url), "utf8");
assert.ok(!/supabase|useQuery|chamarIA|from "react"/.test(fonte), "fatos-comercial.ts não consulta, não usa IA nem React");

console.log("test-leitura-comercial: ok");
