// Teste da lógica pura com dados reais lidos do Supabase em 01/10/2026
// (amostras: séries diárias completas; posts/comentários = recorte recente).
// Rodar: npx tsx scripts/test-hub-conteudo.ts
import { analyzeFollowers, analyzeFormatsAndTemas, buildIdeias } from "../src/lib/hub-conteudo";
import { buildRelatorio } from "../src/lib/hub-relatorio";

const TODAY = "2026-10-01";
const R = (a: any[][]) => a.map(([date, followers_count, reach]) => ({ date, followers_count, reach, new_followers: null }));
const P = (a: any[][]) => a.map(([format, tema, funnel_stage, methodology_stage, reach, saved], i) => ({ id: String(i), format, tema, funnel_stage, methodology_stage, reach, saved, caption: `post ${i}`, permalink: null, engagement: saved }));
const Q = (a: string[]) => a.map((text, i) => ({ id: String(i), text, like_count: 0 }));

const sergioMet = R([["2026-08-14",57001,4039],["2026-08-15",57046,3294],["2026-08-16",57053,2444],["2026-08-17",56965,1085],["2026-08-18",56973,963],["2026-08-19",56990,1923],["2026-08-20",57053,3745],["2026-08-21",57110,2685],["2026-08-22",57166,2152],["2026-08-23",57218,1454],["2026-08-24",57260,2441],["2026-08-25",57324,2619],["2026-08-26",57399,2141],["2026-08-27",57444,5697],["2026-08-28",57487,5248],["2026-08-29",57536,1751],["2026-08-30",57586,1751],["2026-08-31",57641,1426],["2026-09-01",57688,2559],["2026-09-02",57738,2645],["2026-09-03",57787,4924],["2026-09-04",57822,5901],["2026-09-05",57866,6598],["2026-09-06",57940,10044],["2026-09-07",58006,7674],["2026-09-08",58056,5406],["2026-09-09",58108,4541],["2026-09-10",58154,3672],["2026-09-11",58183,2859],["2026-09-12",null,2325],["2026-09-18",null,4626],["2026-10-01",58587,506]]);
const julMet = R([["2026-08-17",946143,75771],["2026-08-18",946997,59006],["2026-08-19",947755,69913],["2026-08-20",948548,53755],["2026-08-21",949250,61115],["2026-08-22",950191,172717],["2026-08-23",951462,139057],["2026-08-24",952365,71003],["2026-08-25",953282,59379],["2026-08-26",954176,58365],["2026-08-27",954926,46311],["2026-08-28",955643,50132],["2026-08-29",956419,69528],["2026-08-30",957396,70571],["2026-08-31",958263,63699],["2026-09-01",959155,79971],["2026-09-02",959993,73833],["2026-09-03",960721,132001],["2026-09-04",961486,107362],["2026-09-05",962265,141242],["2026-09-06",963233,114385],["2026-09-07",964097,77727],["2026-09-08",964767,56640],["2026-09-09",965403,51068],["2026-09-10",966136,56075],["2026-09-11",966766,41005],["2026-09-12",null,82772],["2026-09-13",null,58237],["2026-09-14",null,49683],["2026-09-15",null,61014],["2026-09-16",null,67586],["2026-09-17",null,64621],["2026-09-18",null,84147],["2026-09-19",null,95464],["2026-09-20",null,101427],["2026-09-21",null,65674],["2026-09-22",null,56173],["2026-09-23",null,51716],["2026-09-24",null,150397],["2026-09-25",null,207144],["2026-09-26",null,288436],["2026-09-27",null,239832],["2026-09-28",null,60127],["2026-09-29",null,78842],["2026-09-30",null,41942],["2026-10-01",975777,1133]]);
// Lana: só 2 dias com seguidores no trimestre, lacuna 26/08 a 01/09
const lanaMet = R([["2026-07-26",null,155507],["2026-08-25",null,29269],["2026-09-02",null,150784],["2026-09-09",119795,74772],["2026-09-12",null,52613],["2026-10-01",128311,2118]]);
const dcMet = R([["2026-09-29",null,35309],["2026-09-30",126380,1619]]);

const julPosts = P([["reels",null,null,null,2984,6],["reels",null,null,null,7675,28],["carrossel","Menopausa e o casal",null,null,450625,1602],["carrossel","Exames e investigacao hormonal",null,null,9057,23],["reels",null,null,null,9767,88],["carrossel","Sintomas da menopausa",null,null,315215,367],["reels","Sintomas da menopausa",null,null,25209,9],["carrossel","Suplementos e nutrientes",null,null,19776,113],["reels","Exames e investigacao hormonal",null,null,5900,41],["carrossel","Suplementos e nutrientes",null,null,6842,34],["reels","Exames e investigacao hormonal",null,null,24172,688],["carrossel","Exames e investigacao hormonal",null,null,20772,81],["reels","Exames e investigacao hormonal",null,null,8218,39],["reels","Sintomas da menopausa",null,null,64481,54],["reels","Exames e investigacao hormonal",null,null,29090,516],["carrossel","Sintomas da menopausa",null,null,57739,106],["reels","Exames e investigacao hormonal",null,null,11034,77],["carrossel","Suplementos e nutrientes",null,null,30072,234],["reels","Exames e investigacao hormonal",null,null,58890,52],["reels","Sintomas da menopausa",null,null,6309,60],["carrossel","Exames e investigacao hormonal",null,null,42444,384],["reels","Sintomas da menopausa",null,null,10894,7],["reels","Sintomas da menopausa",null,null,8022,60],["carrossel","Suplementos e nutrientes",null,null,15573,53],["reels","Tratamento da menopausa",null,null,10887,148],["carrossel","Exames e investigacao hormonal",null,null,12165,28],["reels","Tratamento da menopausa",null,null,6683,40],["reels","Sintomas da menopausa",null,null,6958,45],["carrossel","Exames e investigacao hormonal",null,null,16060,79],["carrossel","Menopausa e o casal",null,null,53643,63],["reels","Sintomas da menopausa",null,null,32741,60],["carrossel",null,null,null,8046,46],["carrossel","Suplementos e nutrientes",null,null,19547,191],["reels","Tratamento da menopausa",null,null,7668,67],["carrossel","Sintomas da menopausa",null,null,7692,74],["reels","Tratamento da menopausa",null,null,3466,32],["carrossel","Suplementos e nutrientes",null,null,24662,543],["reels","Tratamento da menopausa",null,null,8352,74],["carrossel","Suplementos e nutrientes",null,null,33483,468],["reels","Quando a paciente nao e ouvida",null,null,14584,81]]);
const julQ = Q(["Como tratar?","E como tratar o cortisol alto??","Como abaixar o cortisol @drajulianapaola ?!","E como tratar Cortisol alto gente?? Faço academia, hidroterapia","O mal estar pode ser algum sintoma da Menopausa?","Vai ajudar nas palpitações também? Quem me dera sentir só fogachos!"]);
const lanaPosts = P([["estatico","Emagrecimento",null,null,285,3],["reels","Saude intima e relacionamento",null,null,764,0],["reels",null,null,null,51411,434],["estatico","Emagrecimento",null,null,2068,5],["reels","Bastidores e pessoal",null,null,1448,1],["reels","Reposicao hormonal",null,null,1404,3],["reels","Emagrecimento",null,null,621,1],["reels","Saude intima e relacionamento",null,null,621,1],["reels","Suplementacao",null,null,13669,652],["estatico","Exames e biomarcadores",null,null,196622,1198],["reels","Hormonios e testosterona",null,null,13095,232],["estatico","Emagrecimento",null,null,17220,133],["carrossel","Emagrecimento",null,null,2434,9],["estatico","Sintomas da menopausa/perimenopausa",null,null,2761,34],["estatico","Sintomas da menopausa/perimenopausa",null,null,67004,727],["estatico","Sintomas da menopausa/perimenopausa",null,null,18994,491],["reels","Exames e biomarcadores",null,null,1196266,22005],["reels","Exames e biomarcadores",null,null,1938,29],["carrossel","Suplementacao",null,null,2161,44],["reels","Suplementacao",null,null,806,1]]);
const lanaQ = Q(["Quais exames fazer para saber quais preciso tomar? Obrigada","E qual é o Magnésio?","Qual o magnésio é mais recomendado? Quais as dosagens?","E como tomar esses suplementos?","E quem não pode fazer reposição hormonal?"]);
const sergioPosts = P([["carrossel",null,null,null,217,1],["carrossel",null,null,null,443,3],["carrossel",null,null,null,3660,39],["carrossel",null,null,null,2670,21],["carrossel",null,null,null,681,5],["carrossel",null,null,null,2518,71],["reels",null,null,null,3103,20],["reels",null,null,null,2431,9],["reels",null,null,null,638,5],["reels",null,null,null,782,6],["reels",null,null,null,597,3],["estatico",null,null,null,6223,20],["estatico",null,null,null,3240,14],["estatico",null,null,null,3900,12]]);
const sergioQ = Q(["Hoje só não emagrece quem não tem $ kkk"]);
const dcPosts = P([["carrossel","Regulacao CFM",null,null,19372,335],["carrossel","Regulacao CFM",null,null,19284,175],["carrossel","Regulacao CFM",null,null,4105,38],["carrossel","Regulacao CFM",null,null,11042,92],["carrossel","Prompts e IA",null,null,599,21],["carrossel","Prompts e IA",null,null,3081,78],["estatico",null,null,null,479,3],["estatico",null,null,null,15440,120],["estatico",null,null,null,8943,27],["estatico",null,null,null,26403,163]]);

function show(titulo: string, obj: unknown) {
  console.log(`\n=== ${titulo} ===`);
  console.log(typeof obj === "string" ? obj : JSON.stringify(obj, null, 1));
}
function resumoSeg(nome: string, met: any[], start: string, end = TODAY) {
  const a = analyzeFollowers(met, start, end, TODAY);
  show(`${nome} | seguidores ${start}..${end}`, {
    diasComDado: `${a.daysWithData}/${a.expectedDays} (${Math.round(a.coverage * 100)}%)`,
    ultimaColeta: a.lastDate, delta: a.delta, gaps: a.gaps.slice(0, 4), semColetaAntes: a.semColetaAntes,
    projecao: a.projection.ok ? { porDia: +a.projection.slopePerDay.toFixed(1), atual: a.projection.atEnd, em30d: a.projection.projected, ate: a.projection.target } : a.projection,
  });
}

resumoSeg("Dra. Juliana Paola", julMet, "2026-07-03");   // 90d: 28/91 cobertura baixa
resumoSeg("Dra. Juliana Paola", julMet, "2026-09-02");   // 30d: janela boa?
resumoSeg("Dra. Juliana Paola", julMet, "2026-08-17", "2026-09-11"); // só trecho contínuo
resumoSeg("Dr. Sergio Maia", sergioMet, "2026-08-14", "2026-09-11");
resumoSeg("Dr. Sergio Maia", sergioMet, "2026-07-03");
resumoSeg("Lana Torres", lanaMet, "2026-07-03");
resumoSeg("Doctor Creator", dcMet, "2026-07-03");
resumoSeg("Dra. Samira (sem Instagram)", [], "2026-07-03");

for (const [nome, posts, qs] of [["Juliana Paola", julPosts, julQ], ["Lana Torres", lanaPosts, lanaQ], ["Dr. Sergio Maia", sergioPosts, sergioQ], ["Doctor Creator", dcPosts, []], ["Dra. Samira (vazio)", [], []]] as [string, any[], any[]][]) {
  const f = analyzeFormatsAndTemas(posts);
  show(`${nome} | melhor formato`, f.melhorFormato ? `${f.melhorFormato.label}: mediana ${f.melhorFormato.reachMedian} em ${f.melhorFormato.count} posts` : (f.melhorFormatoMotivo ?? "sem posts"));
  const r = buildIdeias(posts, qs);
  show(`${nome} | ideias (${r.ideias.length}) `, r.ideias.map((i) => `[${i.regra}] ${i.tema} | ${i.formato} | ${i.funil} | ${i.acao} | POR QUE: ${i.porque}`).join("\n") || "(nenhuma)");
  if (r.faltas.length) show(`${nome} | faltas`, r.faltas.join("\n"));
}

const rel = buildRelatorio({
  clientName: "Dra. Juliana Paola", periodLabel: "17/08/2026 a 11/09/2026", start: "2026-08-17", end: "2026-09-11",
  fontes: { tem_instagram: true, tem_anuncios: false, tem_atendimento: false },
  metrics: julMet, posts: julPosts, perguntas: julQ, ads: null, wts: null,
});
show("RELATORIO Juliana Paola", rel.texto + "\n--- omitidos: " + rel.omitidos.join("; "));
const rel2 = buildRelatorio({
  clientName: "Dra. Samira", periodLabel: "03/07/2026 a 01/10/2026", start: "2026-07-03", end: TODAY,
  fontes: { tem_instagram: false, tem_anuncios: true, tem_atendimento: true },
  metrics: [], posts: [], perguntas: [], ads: { gasto: 1234.5, conversas: 40, custo_por_conversa: 30.86 }, wts: { atendimentos: 120, contatos_distintos: 98, espera_mediana_seg: 540, espera_cobertura: 0.9 },
});
show("RELATORIO Samira (sem IG, com ads+wts)", rel2.texto + "\n--- omitidos: " + rel2.omitidos.join("; "));
const bad = /[—–]|\p{Extended_Pictographic}/u.test(rel.texto + rel2.texto);
console.log("\nTravessao/emoji no texto gerado:", bad ? "SIM (falha)" : "nenhum");
