import assert from "node:assert/strict";
import {
  aplicarCritica, casarPublicacao, filtrarComentarios, filtrarConversas, filtrarPosts, licoesAnuncios, licoesComerciais, licoesConteudo, licoesParaPrompt,
  licoesResultados, lerNotas, resultadoCampanha, resultadoPublicacao, somarFiltros, textoFiltro, tipoGancho, type PostMetricas, type ResumoConversa,
} from "../src/lib/aprendizado";

// ---- Filtro de comentários: só pergunta e relato; ruído sai com motivo
const fc = filtrarComentarios([
  { text: "Amei!!! 😍😍" },
  { text: "@fulana olha isso" },
  { text: "Doutora, quanto tempo depois do parto posso voltar a treinar?" },
  { text: "Doutora, quanto tempo depois do parto posso voltar a treinar? 🙏" },
  { text: "Eu tive isso na minha gravidez e ninguém me explicou nada sobre o assunto" },
  { text: "Parabéns pelo conteúdo, maravilhoso demais" },
  { text: "👏👏👏" },
]);
assert.deepEqual(fc.uteis.map((c) => c.tipo), ["pergunta", "relato"]);
assert.equal(fc.filtro.lidos, 7);
assert.equal(fc.filtro.uteis, 2);
assert.equal(fc.filtro.ruido, 5);
assert.equal(fc.filtro.motivos["repetido"], 1);
assert.match(textoFiltro(fc.filtro), /leu 7, aproveitou 2, descartou 5 como ruído/);

// ---- Filtro de conversas e posts
const fr = filtrarConversas([{ comercial: true, situacao: "agendou" }, { comercial: false, situacao: "agendou" }, { comercial: null }, { comercial: true }] as ResumoConversa[]);
assert.equal(fr.uteis.length, 1);
assert.equal(fr.filtro.ruido, 3);
const fp = filtrarPosts([{ reach: 50, saved: 1 }, { reach: 500, saved: 3 }, { reach: null, saved: null }] as PostMetricas[]);
assert.equal(fp.uteis.length, 1);
assert.equal(somarFiltros(fr.filtro, fp.filtro).lidos, 7);

// ---- Tipo de gancho pela primeira linha
assert.equal(tipoGancho("Você sabia que a dor no ombro pode vir do pescoço?\nTexto"), "pergunta");
assert.equal(tipoGancho("3 sinais de que sua tireoide não vai bem"), "numero");
assert.equal(tipoGancho("O maior erro de quem quer emagrecer"), "erro_mito");
assert.equal(tipoGancho("Quando eu comecei a atender, uma paciente me disse"), "historia");
assert.equal(tipoGancho("Se você acorda cansada todo dia, leia isso"), "voce");
assert.equal(tipoGancho("Acne adulta tem tratamento"), "afirmacao");

// ---- Lições de conteúdo: Reels com taxa bem maior que a média viram "faça"; nada com amostra pequena
const post = (format: string, reach: number, saved: number, caption: string): PostMetricas => ({ format, tema: null, caption, reach, saved, shares: 0 });
const posts: PostMetricas[] = [
  ...Array.from({ length: 10 }, (_, i) => post("reels", 1000, 40 + i, `${i + 3} sinais de alerta no seu corpo`)),
  ...Array.from({ length: 10 }, (_, i) => post("estatico", 1000, 4 + i, `Bom dia, pacientes ${i}`)),
  ...Array.from({ length: 6 }, (_, i) => post("carrossel", 1000, 15 + i, `Tratamento moderno número ${i}`)),
];
const lc = licoesConteudo(posts);
const reels = lc.find((l) => l.chave === "conteudo:formato:reels");
assert.ok(reels && reels.sinal === "faz" && reels.efeito >= 1.3, "Reels deveria ser lição positiva");
assert.ok(lc.find((l) => l.chave === "conteudo:formato:estatico")?.sinal === "evita");
assert.ok(lc.some((l) => l.chave === "conteudo:gancho:numero"));
assert.equal(licoesConteudo(posts.slice(0, 8)).length, 0, "poucos posts: nenhuma lição");

// ---- Lições comerciais: demora derruba agendamento; diferença pequena não vira lição
const conv = (agendou: boolean, falhas: string[] = []): ResumoConversa => ({ comercial: true, situacao: agendou ? "agendou" : "aguardando_paciente", falhas });
const resumos = [
  ...Array.from({ length: 20 }, (_, i) => conv(i < 2, ["demora"])),
  ...Array.from({ length: 30 }, (_, i) => conv(i < 15)),
];
const lco = licoesComerciais(resumos);
const demora = lco.find((l) => l.chave === "comercial:falha:demora");
assert.ok(demora && demora.sinal === "evita", "demora deveria virar lição 'evita'");
assert.match(demora!.texto, /10% agendaram, contra 50%/);
assert.equal(licoesComerciais(resumos.slice(0, 10)).length, 0);

// ---- Lições de anúncios: referência e desperdício
const la = licoesAnuncios([
  { campaign_id: "a", spend: 100, leads: 0, conversations: 20 },
  { campaign_id: "b", spend: 300, leads: 0, conversations: 15 },
  { campaign_id: "c", spend: 400, leads: 5, conversations: 15 },
  { campaign_id: "d", spend: 500, leads: 0, conversations: 0 },
], { a: "Campanha A", d: "Campanha D" });
assert.ok(la.some((l) => l.chave === "anuncios:referencia:a" && l.sinal === "faz"));
assert.ok(la.some((l) => l.chave === "anuncios:desperdicio:d" && l.sinal === "evita"));

// ---- Resultado das próprias sugestões
const lr = licoesResultados([
  ...Array.from({ length: 6 }, () => ({ agente: "recuperacao", tipo: "aguardando_clinica", estado: "feita", resultado: "respondeu" })),
  ...Array.from({ length: 6 }, () => ({ agente: "recuperacao", tipo: "interesse", estado: "feita", resultado: "enviada" })),
]);
assert.equal(lr.length, 2);
assert.ok(lr.find((l) => l.chave === "resultado:recuperacao:aguardando_clinica")?.sinal === "faz");

// ---- Bloco do prompt
const bloco = licoesParaPrompt([{ texto: "Reels rende mais.", evidencia: ["\"x\" (5%)"], sinal: "faz", confianca: "alta" }, { texto: "Demora derruba.", evidencia: [], sinal: "evita", confianca: "media" }]);
assert.match(bloco, /FAÇA: Reels rende mais\. Exemplos: "x" \(5%\)\./);
assert.match(bloco, /EVITE: Demora derruba\./);
assert.equal(licoesParaPrompt([]), "");

// ---- Medição: peça publicada e campanha depois da recomendação
const pub = casarPublicacao({ titulo: "3 sinais de que sua tireoide não vai bem", gancho: "Sua tireoide pode estar pedindo socorro", criado_em: "2026-10-01T00:00:00Z" }, [
  { ...post("reels", 2000, 60, "3 sinais de que sua tireoide não vai bem e você nem percebe"), posted_at: "2026-10-05T00:00:00Z" },
  { ...post("reels", 2000, 60, "3 sinais de que sua tireoide não vai bem"), posted_at: "2026-09-20T00:00:00Z" },
  { ...post("reels", 2000, 60, "Rotina de skincare para o verão"), posted_at: "2026-10-06T00:00:00Z" },
]);
assert.equal(pub?.posted_at, "2026-10-05T00:00:00Z");
assert.equal(casarPublicacao({ titulo: "Mito sobre colesterol", criado_em: "2026-10-01T00:00:00Z" }, [{ ...post("reels", 1, 1, "Rotina de skincare"), posted_at: "2026-10-05T00:00:00Z" }]), null);
assert.match(resultadoPublicacao(post("reels", 1000, 60, ""), 0.03), /^publicado: acima da média \(6% de salvamento, 2,0x a mediana/);
assert.match(resultadoCampanha([{ campaign_id: "a", spend: 100, leads: 0, conversations: 10 }], [{ campaign_id: "a", spend: 100, leads: 0, conversations: 20 }])!, /custo por resultado caiu 50%/);
assert.match(resultadoCampanha([{ campaign_id: "a", spend: 100, leads: 0, conversations: 10 }], [])!, /sem gasto/);

// ---- Autocrítica: abaixo do corte sai; sem nota passa
const notas = lerNotas({ notas: [{ i: 0, nota: 9, motivo: "usa dúvida real" }, { i: 1, nota: 3, motivo: "genérico" }, { i: 1, nota: 10 }, { i: 7, nota: 10 }] }, 3);
assert.equal(notas.size, 2);
const cr = aplicarCritica(["a", "b", "c"].map((x) => ({ x })), notas);
assert.deepEqual(cr.ok.map((o) => [o.x, o.nota]), [["a", 9], ["c", null]]);
assert.deepEqual(cr.descartes, ["autocrítica (nota 3): genérico"]);
assert.equal(lerNotas("lixo", 2).size, 0);

console.log("aprendizado: ok");
