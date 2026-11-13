// As respostas dos blocos dos Detalhes de Instagram › Público (quick-ver-tudo-abas, 13/11/2026): UMA frase tirada dos dados do PRÓPRIO
// bloco, com o número em destaque; sem dado, "Falta dado". Só números desta clínica (lidos ao vivo da Meta), sem jargão ("interações",
// nunca "engajamento mediano") e sem promessa. Os cartões "Em palavras simples" saíram: o que cada um dizia e o topo não mostra mora
// aqui, na cabeça do bloco que prova o número. Módulo puro.
import { comMaiuscula, enfase, faltaDado, inteiro, maiorItem, primeiraQueCabe, umaCasa, type CabecaDoBloco } from "./cabeca-do-bloco";

export interface FatiaDaMeta {
  chave: string;
  valor: number;
}

const soma = (xs: readonly FatiaDaMeta[]) => xs.reduce((s, x) => s + x.valor, 0);
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;

/** Gênero dos seguidores: quanto não informou (a divisão entre quem informou já está no cartão do topo). */
export function cabecaDoGenero(generos: readonly FatiaDaMeta[]): CabecaDoBloco {
  const total = soma(generos);
  if (total <= 0) return faltaDado("a Meta não devolveu o gênero dos seguidores");
  const naoInformou = generos.filter((g) => g.chave === "U").reduce((s, g) => s + g.valor, 0);
  if (naoInformou <= 0) return primeiraQueCabe([[{ texto: "Todos os " }, enfase(inteiro(total)), { texto: " seguidores contados informaram o gênero." }]], "neutro", "sem gênero");
  return primeiraQueCabe([[enfase(pct(naoInformou, total)), { texto: " dos seguidores não informaram o gênero." }]], "neutro", "sem gênero");
}

/** Quem engaja: a faixa de idade de quem mais interagiu no mês (só com 50 pessoas ou mais). */
export function cabecaDeQuemEngaja(faixas: readonly FatiaDaMeta[], minimo = 50): CabecaDoBloco {
  const total = soma(faixas);
  if (total < minimo) return faltaDado(`menos de ${minimo} pessoas interagiram no mês`);
  const maior = maiorItem(faixas.filter((f) => f.chave !== "U").map((f) => ({ nome: f.chave, valor: f.valor })), 1);
  if (!maior) return faltaDado("a Meta não devolveu a idade de quem interagiu");
  return primeiraQueCabe([[{ texto: `Quem mais interage tem ${maior.nome} anos: ` }, enfase(pct(maior.valor, total)), { texto: " de quem interagiu." }]], "neutro", "sem idade");
}

/** Seguidores × alcançados: a faixa em que o alcance mais passa (ou fica abaixo) do peso dela na base. Menos de 5 pontos: segue a base. */
export function cabecaDeSeguidoresEAlcancados(base: readonly FatiaDaMeta[], alcance: readonly FatiaDaMeta[], faixas: readonly string[]): CabecaDoBloco {
  const tb = soma(base);
  const ta = soma(alcance);
  if (tb <= 0 || ta <= 0) return faltaDado("sem idade dos seguidores e dos alcançados neste mês");
  const difs = faixas.map((f) => {
    const pb = ((base.find((x) => x.chave === f)?.valor ?? 0) / tb) * 100;
    const pa = ((alcance.find((x) => x.chave === f)?.valor ?? 0) / ta) * 100;
    return { f, pb, pa, pp: pa - pb };
  });
  const maior = difs.reduce((a, b) => (Math.abs(b.pp) > Math.abs(a.pp) ? b : a));
  if (Math.abs(maior.pp) < 5) return primeiraQueCabe([[{ texto: "O alcance segue a base: nenhuma faixa muda " }, enfase("5 pontos"), { texto: " ou mais." }]], "neutro", "sem idade");
  const chega = maior.pp > 0 ? "mais" : "menos";
  return primeiraQueCabe(
    [[{ texto: `O conteúdo chega ${chega} à faixa ${maior.f}: ` }, enfase(`${Math.round(maior.pa)}%`), { texto: ` do alcance, ${Math.round(maior.pb)}% da base.` }]],
    maior.pp > 0 ? "bom" : "atencao",
    "sem idade",
  );
}

/** Onde estão no Brasil: a principal cidade, entre os seguidores com cidade conhecida. */
export function cabecaDaPrincipalCidade(cidades: readonly { nome: string; valor: number }[]): CabecaDoBloco {
  const total = cidades.reduce((s, c) => s + c.valor, 0);
  const maior = maiorItem(cidades.map((c) => ({ nome: c.nome, valor: c.valor })), 1);
  if (!maior || total <= 0) return faltaDado("a Meta não devolveu as cidades dos seguidores");
  return primeiraQueCabe(
    [
      [{ texto: `${maior.nome} é a principal cidade: ` }, enfase(pct(maior.valor, total)), { texto: " de quem tem cidade conhecida." }],
      [{ texto: "A principal cidade tem " }, enfase(pct(maior.valor, total)), { texto: " de quem tem cidade conhecida." }],
    ],
    "neutro",
    "sem cidade",
  );
}

/** Países: o país com mais seguidores e a parte dele. */
export function cabecaDosPaises(paises: readonly { nome: string; valor: number }[]): CabecaDoBloco {
  const total = paises.reduce((s, p) => s + p.valor, 0);
  const maior = maiorItem(paises.map((p) => ({ nome: p.nome, valor: p.valor })), 1);
  if (!maior || total <= 0) return faltaDado("a Meta não devolveu os países dos seguidores");
  return primeiraQueCabe(
    [
      [{ texto: `${maior.nome} tem ` }, enfase(pct(maior.valor, total)), { texto: " dos seguidores." }],
      [{ texto: "O país com mais seguidores tem " }, enfase(pct(maior.valor, total)), { texto: " deles." }],
    ],
    "neutro",
    "sem país",
  );
}

/** Visualizações: que parte veio de quem ainda não segue. */
export function cabecaDasVisualizacoes(e: { seguidores: number; naoSeguidores: number } | null): CabecaDoBloco {
  if (!e || e.seguidores + e.naoSeguidores <= 0) return faltaDado("a Meta não devolveu as visualizações");
  return primeiraQueCabe([[enfase(pct(e.naoSeguidores, e.seguidores + e.naoSeguidores)), { texto: " das visualizações foram de quem ainda não segue." }]], "neutro", "sem visualizações");
}

/** Origem das visualizações: quanto veio de anúncio; sem anúncio, o tipo de conteúdo com mais interação por pessoa alcançada. */
export function cabecaDaOrigem(itens: readonly { conteudo: string; visualizacoes: number; alcance: number; interacoes: number }[]): CabecaDoBloco {
  const falta = "a Meta não devolveu a origem das visualizações";
  const totalV = itens.reduce((s, i) => s + i.visualizacoes, 0);
  if (totalV <= 0) return faltaDado(falta);
  const anuncio = itens.find((i) => i.conteudo === "Anúncios" && i.visualizacoes > 0);
  if (anuncio) return primeiraQueCabe([[enfase(pct(anuncio.visualizacoes, totalV)), { texto: " das visualizações foram de anúncios; o resto é orgânico." }]], "neutro", falta);
  const organicos = itens.filter((i) => i.alcance > 0 && i.interacoes > 0);
  if (organicos.length < 2) return faltaDado("menos de 2 tipos de conteúdo com interações medidas");
  const melhor = organicos.reduce((a, b) => (b.interacoes / b.alcance > a.interacoes / a.alcance ? b : a));
  return primeiraQueCabe(
    [
      [{ texto: `${melhor.conteudo} tem mais interação: ` }, enfase(`${umaCasa((melhor.interacoes / melhor.alcance) * 100)}%`), { texto: " de quem alcança." }],
      [{ texto: "O tipo com mais interação chega a " }, enfase(`${umaCasa((melhor.interacoes / melhor.alcance) * 100)}%`), { texto: " de quem alcança." }],
    ],
    "neutro",
    falta,
  );
}

/** Interações: quanto salvos e compartilhados somam (o que a pessoa quer guardar ou repassar). */
export function cabecaDasInteracoes(t: { curtidas: number; comentarios: number; salvamentos: number; compartilhamentos: number } | null): CabecaDoBloco {
  const total = t ? t.curtidas + t.comentarios + t.salvamentos + t.compartilhamentos : 0;
  if (!t || total <= 0) return faltaDado("a Meta não devolveu as interações");
  return primeiraQueCabe([[{ texto: "Salvos e compartilhados somam " }, enfase(pct(t.salvamentos + t.compartilhamentos, total)), { texto: " das interações." }]], "neutro", "sem interações");
}

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Seguidores online (mapa dia × hora): o dia com mais gente online em média (a melhor janela, dia e hora, já está no topo). */
export function cabecaDoDiaMaisOnline(mapa: readonly (readonly number[])[]): CabecaDoBloco {
  const medias = mapa.map((linha, dia) => ({ dia, media: linha.length ? linha.reduce((s, v) => s + v, 0) / linha.length : 0 }));
  const melhor = medias.length ? medias.reduce((a, b) => (b.media > a.media ? b : a)) : null;
  if (!melhor || melhor.media <= 0) return faltaDado("a Meta não devolveu os horários dos seguidores");
  return primeiraQueCabe([[{ texto: `${DIAS[melhor.dia]} é o dia com mais gente online: ` }, enfase(inteiro(melhor.media)), { texto: " por hora, em média." }]], "neutro", "sem horários");
}

/** 5 melhores janelas: de quanto a quanto vão. */
export function cabecaDasJanelas(janelas: readonly { online: number }[]): CabecaDoBloco {
  if (janelas.length < 2) return faltaDado("menos de 2 janelas com gente online");
  const max = Math.max(...janelas.map((j) => j.online));
  const min = Math.min(...janelas.map((j) => j.online));
  return primeiraQueCabe([[{ texto: `As ${janelas.length} melhores janelas têm de ` }, enfase(inteiro(max)), { texto: ` a ${inteiro(min)} seguidores online.` }]], "neutro", "sem janelas");
}

/** Por hora do dia: a hora com mais gente online, somando os 7 dias. */
export function cabecaDaHoraMaisOnline(porHora: readonly { hora: number; valor: number }[]): CabecaDoBloco {
  const maior = porHora.length ? porHora.reduce((a, b) => (b.valor > a.valor ? b : a)) : null;
  if (!maior || maior.valor <= 0) return faltaDado("a Meta não devolveu os horários dos seguidores");
  return primeiraQueCabe([[{ texto: `${maior.hora}h é a hora com mais gente online: ` }, enfase(inteiro(maior.valor)), { texto: " em média." }]], "neutro", "sem horários");
}

/**
 * E os seus posts?: a hora em que os posts renderam mais (interações do post típico). Longe do pico de gente online (3 horas ou mais),
 * a frase diz as duas horas.
 */
export function cabecaDosSeusPosts(horasPosts: readonly { hora: number; posts: number; mediana: number }[], horaOnline: number | null): CabecaDoBloco {
  if (horasPosts.length === 0) return faltaDado("nenhuma hora tem 3 ou mais posts no período");
  const h = horasPosts[0];
  if (horaOnline != null && Math.abs(horaOnline - h.hora) >= 3) {
    return primeiraQueCabe([[{ texto: "Seus posts renderam mais às " }, enfase(`${h.hora}h`), { texto: `; o pico de gente online é às ${horaOnline}h.` }]], "atencao", "sem horas");
  }
  return primeiraQueCabe([[{ texto: `Seus posts renderam mais às ${h.hora}h: ` }, enfase(inteiro(h.mediana)), { texto: ` interações no post típico (${h.posts} posts).` }]], "neutro", "sem horas");
}

/** O dia da semana em que os posts renderam mais, para a linha embaixo do gráfico das horas. null sem dia com posts suficientes. */
export function melhorDiaDosPosts(diasPosts: readonly { dia: number; posts: number }[]): string | null {
  const d = diasPosts[0];
  return d ? `${comMaiuscula(DIAS[d.dia].toLowerCase())} foi o dia em que seus posts renderam mais (${d.posts} posts).` : null;
}
