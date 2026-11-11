// Leitura por regra dos anúncios e dos links (Phase 3.1.1, plano 04). Só regra fixa, sem IA e sem banco.
// Rodar: npx tsx scripts/test-leitura-anuncios.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIMITES } from "../src/lib/limites";
import { VERBOS_PROVISORIOS, type FatosDaTela } from "../src/lib/leitura/tipos";
import { montarTexto, problemasDoTexto } from "../src/lib/leitura/texto";
import { fatosDosAnuncios, fatosDosLinks, VERSAO_REGRAS_ANUNCIOS } from "../src/lib/leitura/fatos-anuncios";
import { aplicarRastreio, diagnosticarAds, insightsDeAnuncios, planoDeAcao, type CampanhaCadastro, type DiagnosticoAds, type LinhaAds } from "../src/lib/anuncios-objetivo";

const DE = "2026-10-12", ATE = "2026-11-10", HOJE = "2026-11-11";
const base = { de: DE, ate: ATE, hoje: HOJE };

assert.equal(VERSAO_REGRAS_ANUNCIOS, 1, "as regras dos anúncios são a versão 1");

// ---------- fixtures (só números e nomes fictícios) ----------
const linha = (campaign_id: string, o: Partial<LinhaAds>): LinhaAds => ({
  date: "2026-10-25", campaign_id, spend: 0, impressions: 0, link_clicks: 0, conversations: 0, leads: 0, landing_page_views: 0, reach: 0, clicks: 0, ...o,
});
const cad = (campaign_id: string, name: string, objective = "MESSAGES", destinos: string[] = ["WHATSAPP"]): CampanhaCadastro => ({ campaign_id, name, objective, destinos });

/** Caso Doctor Creator: 7.391 cliques no link e 29 conversas atribuídas. */
const diagSuspeito = (): DiagnosticoAds =>
  aplicarRastreio(
    diagnosticarAds(
      [linha("c1", { spend: 3000, impressions: 400000, link_clicks: 7391, conversations: 29, clicks: 9000 })],
      [cad("c1", "Campanha de tráfego fictícia", "OUTCOME_TRAFFIC")],
      DE,
      ATE,
    ),
    null,
  );

/** Rastreio confiável: 4 campanhas de mensagem, 1 bem mais cara por conversa que as outras. */
const linhasBoas = (): LinhaAds[] => [
  linha("c1", { spend: 1000, impressions: 40000, link_clicks: 1200, conversations: 50, clicks: 1500 }),
  linha("c2", { spend: 1000, impressions: 40000, link_clicks: 1100, conversations: 45, clicks: 1400 }),
  linha("c3", { spend: 1000, impressions: 40000, link_clicks: 1000, conversations: 40, clicks: 1300 }),
  linha("c4", { spend: 1500, impressions: 50000, link_clicks: 1100, conversations: 10, clicks: 1300 }),
];
const cadBoas = [cad("c1", "Primeira consulta fictícia"), cad("c2", "Retorno fictício"), cad("c3", "Check-up fictício"), cad("c4", "Avaliação fictícia")];
const diagBom = (): DiagnosticoAds => aplicarRastreio(diagnosticarAds(linhasBoas(), cadBoas, DE, ATE), null);

const entradaDe = (diag: DiagnosticoAds, extra: object = {}) => ({
  ...base,
  diag,
  plano: planoDeAcao(diag),
  insights: insightsDeAnuncios(diag),
  ...extra,
});

/** O texto passa no filtro de linguagem e todo passo tem verbo da lista e quem resolve. */
function confere(fatos: FatosDaTela) {
  const t = montarTexto(fatos);
  assert.deepEqual(problemasDoTexto(t), [], `problemas de linguagem: ${JSON.stringify(problemasDoTexto(t))}`);
  const passo = t.tipo === "sem_leitura" ? t.passo : t.proximoPasso;
  if (passo) {
    assert.ok((VERBOS_PROVISORIOS as readonly string[]).includes(passo.verbo), `verbo fora da lista: ${passo.verbo}`);
    assert.ok(passo.quem, "todo passo diz quem resolve");
  }
  assert.ok(!/(?<![A-Za-z])(CTR|CPC|CPM|CPL|ROAS)(?![A-Za-z])/i.test(JSON.stringify(t)), "a leitura não usa CTR, CPC, CPM, CPL nem ROAS");
  return t;
}

// ===================================================================================================================
// Anúncios
// ===================================================================================================================

// O caso Doctor Creator: rastreio suspeito vira "sem leitura" para o gestor de tráfego, sem nenhum fato de conclusão.
{
  const diag = diagSuspeito();
  assert.equal(diag.rastreio?.suspeito, true, "o rastreio do caso Doctor Creator é suspeito");
  assert.equal(diag.cliquesLink, 7391);
  assert.equal(diag.conversas, 29);
  const fatos = fatosDosAnuncios(entradaDe(diag));
  assert.equal(fatos.tela, "anuncios");
  assert.equal(fatos.portao.ok, false, "rastreio suspeito nega");
  if (!fatos.portao.ok) {
    assert.equal(fatos.portao.codigo, "rastreio_suspeito");
    assert.equal(fatos.portao.passo.quem, "gestor_trafego");
    assert.equal(fatos.portao.passo.verbo, "corrigir");
    assert.match(fatos.portao.motivo, /7\.391/, "o motivo traz os cliques");
    assert.match(fatos.portao.motivo, /29/, "o motivo traz as conversas");
  }
  assert.deepEqual(
    fatos.fatos.filter((x) => x.tom !== "neutro" && !x.ressalva),
    [],
    "nenhum fato de conclusão com rastreio suspeito",
  );
  assert.equal(fatos.proximoPasso, null, "o passo é o do portão, não um passo de verba");
  const t = confere(fatos);
  assert.equal(t.tipo, "sem_leitura");
  if (t.tipo === "sem_leitura") {
    assert.match(t.motivo, /rastreio/);
    assert.equal(t.passo.rotuloQuem, "Gestor de tráfego");
    assert.match(t.passo.frase, /^Corrigir /);
  }
  const todo = JSON.stringify(t);
  assert.ok(!/convert|não funcion|ruins?|pausar|cortar/i.test(todo), "nunca culpa a campanha por defeito de medição");
}

// O portão decide por conta própria: mesmo com um diagnóstico que não passou por aplicarRastreio.
{
  const cru = diagnosticarAds(
    [linha("c1", { spend: 3000, impressions: 400000, link_clicks: 7391, conversations: 29, clicks: 9000 })],
    [cad("c1", "Campanha de tráfego fictícia", "OUTCOME_TRAFFIC")],
    DE,
    ATE,
  );
  const fatos = fatosDosAnuncios(entradaDe(cru));
  assert.equal(fatos.portao.ok, false);
  if (!fatos.portao.ok) assert.equal(fatos.portao.codigo, "rastreio_suspeito", "avaliarRastreio decide antes de qualquer fato");
}

// Todo clique foi para o perfil: não há o que estar mal rastreado, a leitura segue.
{
  const diag = aplicarRastreio(
    diagnosticarAds(
      [linha("c1", { spend: 800, impressions: 90000, link_clicks: 5000, conversations: 0, clicks: 6000 })],
      [cad("c1", "Perfil fictício", "OUTCOME_ENGAGEMENT", ["INSTAGRAM_PROFILE"])],
      DE,
      ATE,
    ),
    null,
  );
  const fatos = fatosDosAnuncios(entradaDe(diag));
  assert.equal(fatos.portao.ok, true, "visitas ao perfil não disparam o alarme de rastreio");
}

// Rastreio confiável, conversas 20% acima do período anterior: o que aconteceu com o número ao lado e UM passo do plano.
{
  const diag = diagBom();
  assert.equal(diag.rastreio?.suspeito, false);
  const plano = planoDeAcao(diag);
  assert.ok(plano.length > 0, "a fixture tem uma ação de verba");
  const fatos = fatosDosAnuncios(
    entradaDe(diag, {
      atual: { gasto: 4500, conversas: 145, cliquesLink: 4400 },
      anterior: { gasto: 4500, conversas: 120, cliquesLink: 4300 },
    }),
  );
  assert.equal(fatos.portao.ok, true);
  const conversas = fatos.fatos.find((x) => x.id === "conversas");
  assert.ok(conversas, "há o fato das conversas");
  assert.equal(conversas!.tom, "bom");
  assert.equal(conversas!.peso, 3);
  assert.ok(conversas!.numeros[0].exibicao.includes("145"), "o número das conversas está ao lado da frase");
  assert.ok(conversas!.numeros[0].exibicao.includes("+21%"), "a variação contra o período anterior está ao lado");
  assert.ok(fatos.proximoPasso, "há um só próximo passo");
  assert.equal(fatos.proximoPasso!.fatoId, plano[0].id, "o passo é o item 1 do plano de ação");
  assert.equal(fatos.proximoPasso!.quem, "gestor_trafego");
  assert.ok((VERBOS_PROVISORIOS as readonly string[]).includes(fatos.proximoPasso!.verbo));
  const t = confere(fatos);
  assert.equal(t.tipo, "leitura");
  if (t.tipo === "leitura") {
    // As conversas com a variação abrem a leitura; o item do plano que sustenta o passo vem no "por quê".
    assert.match(t.aconteceu.frase, /conversas/);
    assert.ok(t.aconteceu.numeros.some((n) => n.exibicao.includes("+21%")), "a variação das conversas aparece ao lado do número");
    assert.ok(t.porque, "o plano explica o passo");
    assert.ok(t.proximoPasso, "o passo passa no filtro de linguagem");
    assert.match(t.proximoPasso!.frase, /^(Revisar|Pausar|Reforçar) /, "o passo é o do plano, em frase curta com verbo da lista");
    assert.equal(t.proximoPasso!.rotuloQuem, "Gestor de tráfego");
  }
}

// Conversas em queda: tom ruim, com a queda ao lado, sem dizer de quem é a culpa.
{
  const fatos = fatosDosAnuncios(
    entradaDe(diagBom(), {
      atual: { gasto: 4500, conversas: 100, cliquesLink: 4400 },
      anterior: { gasto: 4500, conversas: 150, cliquesLink: 4300 },
    }),
  );
  const conversas = fatos.fatos.find((x) => x.id === "conversas");
  assert.equal(conversas?.tom, "ruim");
  assert.ok(conversas!.numeros[0].exibicao.includes("−33%"), "queda de 33%");
  confere(fatos);
}

// Sem período anterior a conta não inventa variação: só o número do período.
{
  const fatos = fatosDosAnuncios(entradaDe(diagBom(), { atual: { gasto: 4500, conversas: 145, cliquesLink: 4400 }, anterior: null }));
  const conversas = fatos.fatos.find((x) => x.id === "conversas");
  assert.ok(conversas, "o número do período aparece mesmo sem comparação");
  assert.ok(!/%/.test(conversas!.numeros[0].exibicao), "sem comparação não há porcentagem");
  confere(fatos);
}

// Sem gasto no período: nega com "sem dado" e quem equipe_hub.
{
  const vazio = diagnosticarAds([], [], DE, ATE);
  const fatos = fatosDosAnuncios(entradaDe(vazio));
  assert.equal(fatos.portao.ok, false);
  if (!fatos.portao.ok) {
    assert.equal(fatos.portao.codigo, "sem_dado");
    assert.equal(fatos.portao.passo.quem, "equipe_hub");
  }
  const semDiag = fatosDosAnuncios({ ...base, diag: null });
  assert.equal(semDiag.portao.ok, false, "sem diagnóstico também nega");
  confere(fatos);
  confere(semDiag);
}

// Nome de campanha com texto externo nunca estraga a leitura: só entra como texto e passa no filtro.
{
  const cadMau = [cad("c1", "<img src=x onerror=alert(1)> CTR campanha"), ...cadBoas.slice(1)];
  const diag = aplicarRastreio(diagnosticarAds(linhasBoas(), cadMau, DE, ATE), null);
  const fatos = fatosDosAnuncios(entradaDe(diag));
  confere(fatos);
}

// ===================================================================================================================
// Links
// ===================================================================================================================
const links = (o: { rotulo: string; cliques: number; conversas: number; agendou?: number; vendas?: number }[]) =>
  o.map((x) => ({ agendou: 0, vendas: 0, ...x }));

// Sem nenhum link criado: nega com quem equipe_hub.
{
  const fatos = fatosDosLinks({ ...base, links: [] });
  assert.equal(fatos.tela, "links");
  assert.equal(fatos.portao.ok, false);
  if (!fatos.portao.ok) {
    assert.equal(fatos.portao.codigo, "sem_dado");
    assert.equal(fatos.portao.passo.quem, "equipe_hub");
  }
  const t = confere(fatos);
  assert.equal(t.tipo, "sem_leitura");
  const nulo = fatosDosLinks({ ...base, links: null });
  assert.equal(nulo.portao.ok, false, "sem leitura dos links também nega");
  confere(nulo);
}

// Links criados, nenhum clique no período: nega, sem inventar zero como resultado.
{
  const fatos = fatosDosLinks({ ...base, links: links([{ rotulo: "Bio", cliques: 0, conversas: 0 }, { rotulo: "Story", cliques: 0, conversas: 0 }]) });
  assert.equal(fatos.portao.ok, false);
  confere(fatos);
}

// Base acima do mínimo: o link com mais conversas aparece com o N de M.
{
  const fatos = fatosDosLinks({
    ...base,
    links: links([
      { rotulo: "Bio", cliques: 300, conversas: 40, agendou: 10, vendas: 2 },
      { rotulo: "Story", cliques: 100, conversas: 12 },
      { rotulo: "QR code", cliques: 20, conversas: 3 },
    ]),
  });
  assert.equal(fatos.portao.ok, true);
  const lider = fatos.fatos.find((x) => x.id === "link-lider");
  assert.ok(lider, "com base acima de LIMITES.leitura.grupoMinimo o link líder aparece");
  assert.match(lider!.frase, /Bio/);
  assert.equal(lider!.numeros[0].exibicao, "40 de 55 conversas");
  assert.ok(fatos.proximoPasso, "há um passo");
  assert.equal(fatos.proximoPasso!.fatoId, "link-lider");
  const t = confere(fatos);
  assert.equal(t.tipo, "leitura");
}

// Base abaixo do mínimo: não conclui qual link é o melhor.
{
  const poucas = LIMITES.leitura.grupoMinimo; // exatamente o mínimo: "passa de" exige mais
  const fatos = fatosDosLinks({ ...base, links: links([{ rotulo: "Bio", cliques: 40, conversas: poucas - 2 }, { rotulo: "Story", cliques: 10, conversas: 2 }]) });
  assert.equal(fatos.portao.ok, true);
  assert.ok(!fatos.fatos.some((x) => x.id === "link-lider"), "base pequena não vira conclusão de link líder");
  const pequena = fatos.fatos.find((x) => x.id === "base-pequena-links");
  assert.ok(pequena, "a base pequena vira ressalva");
  assert.equal(pequena!.ressalva, true);
  assert.equal(pequena!.numeros[0].exibicao, `${poucas} conversas`);
  confere(fatos);
}

// Nome de link com texto externo: passa pelo filtro de linguagem; nada de dado pessoal na saída.
{
  const fatos = fatosDosLinks({
    ...base,
    links: links([
      { rotulo: "<script>alert(1)</script> CTR 5511999998888", cliques: 300, conversas: 40 },
      { rotulo: "Story", cliques: 100, conversas: 12 },
    ]),
  });
  const t = confere(fatos);
  assert.ok(!/5511999998888/.test(JSON.stringify(t)), "telefone no nome do link não chega à leitura");
}

// ---------- o módulo é puro: sem banco, sem consulta, sem React e sem IA ----------
const fonte = readFileSync(new URL("../src/lib/leitura/fatos-anuncios.ts", import.meta.url), "utf8");
assert.ok(!/supabase|useQuery|chamarIA|from "react"/.test(fonte), "fatos-anuncios.ts não usa banco, consulta, React nem IA");
assert.ok(/avaliarRastreio\(/.test(fonte), "o portão do rastreio usa avaliarRastreio");

console.log("test-leitura-anuncios: ok");
