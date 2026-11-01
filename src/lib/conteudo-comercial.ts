/**
 * Conclusões em linguagem simples para a tela Conteúdo × Comercial. Funções puras sobre o retorno da RPC
 * conteudo_comercial. Só afirma o que a amostra sustenta; abaixo do mínimo, diz que ainda não dá para concluir.
 * Tudo é coincidência no tempo ou no assunto, nunca prova de que um post gerou uma conversa específica.
 */
import { chaveTema, rotuloDoTema, temaRelacionado } from "./classificacao-post.js";
import { LIMITES } from "./limites.js";

export interface DiaCruzamento { dia: string; posts: number; conversas: number }
export interface TemaCruzamento { tema: string; posts: number; alcance: number; conversas: number; pessoas?: number; comerciais: number; pediram_preco: number; agendaram: number; pessoas_agendaram?: number }
export interface DadosCruzamento {
  /** Série diária (posts e conversas por dia). É dela que sai a comparação de dias com e sem post. */
  dias?: DiaCruzamento[];
  grade: { dow: number; hora: number; posts: number; conversas: number; agendaram: number }[];
  temas: TemaCruzamento[];
  objecoes: { objecao: string; n: number; agendaram: number; pessoas?: number; pessoas_agendaram?: number }[];
}

export type Tom = "bom" | "atencao" | "neutro";
export interface Conclusao { titulo: string; texto: string; acao?: string; tom: Tom }

export const MIN_DIAS: number = LIMITES.amostra.conversas.diasCruzamento;
export const MIN_CONVERSAS_TEMA: number = LIMITES.amostra.conversas.conversasTema;
/** Máximo de dias que as RPCs da tela aceitam (cláusula p_ate - p_de <= 120). */
export const MAX_DIAS_PERIODO = 120;
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const OBJECAO: Record<string, string> = { preco: "preço", convenio: "convênio", distancia: "distância", adiamento: "deixar para depois", agenda: "agenda e horário", medo: "medo", desconfianca: "desconfiança", outro: "outras" };

const num = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const temaValido = (t: unknown): t is string => typeof t === "string" && t.trim() !== "" && !["null", "undefined"].includes(t.trim().toLowerCase());

const diaDaSemana = (dia: string) => new Date(`${dia.slice(0, 10)}T12:00:00Z`).getUTCDay();
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia.slice(0, 10)}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/**
 * Período que a tela consegue ler: as RPCs aceitam no máximo 120 dias. Período maior é cortado nos últimos 120 dias
 * (terminando no mesmo dia), e a tela avisa.
 */
export function recortarPeriodo(start: string, end: string): { start: string; end: string; cortado: boolean } {
  const dias = Math.round((new Date(`${end.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${start.slice(0, 10)}T12:00:00Z`).getTime()) / 86400000);
  if (dias <= MAX_DIAS_PERIODO) return { start, end, cortado: false };
  return { start: somaDias(end, -MAX_DIAS_PERIODO), end, cortado: true };
}

export interface EfeitoPareado {
  /** Dias com post que têm pelo menos um dia igual da semana sem post para comparar. */
  diasCom: number;
  /** Dias sem post usados na comparação. */
  diasSem: number;
  mediaCom: number;
  /** Média dos dias sem post, pesada pelos mesmos dias da semana dos dias com post. */
  mediaSem: number;
  /** Dias fora da comparação porque aquele dia da semana só teve um tipo (só com post ou só sem). */
  diasFora: number;
  /** Quantos dos dias sem post do período caíram no sábado ou no domingo. */
  semPostFimDeSemana: number;
  semPostTotal: number;
}

/**
 * Compara dias com e sem post só entre dias equivalentes: cada dia com post é comparado com a média dos dias sem
 * post do mesmo dia da semana. Sem isso, o fim de semana (pouco post e pouca conversa) faz o post parecer causar
 * conversa (Dra. Marcella, out/2026: "1186% mais conversas" eram só os 8 sábados, domingos e feriado sem post).
 */
export function efeitoPorDiaDaSemana(dias: DiaCruzamento[]): EfeitoPareado {
  const por = new Map<number, { com: number[]; sem: number[] }>();
  for (const d of dias) {
    const k = diaDaSemana(d.dia);
    const g = por.get(k) ?? { com: [], sem: [] };
    (Number(d.posts) > 0 ? g.com : g.sem).push(Number(d.conversas) || 0);
    por.set(k, g);
  }
  let diasCom = 0, diasSem = 0, somaCom = 0, somaSemPesada = 0, diasFora = 0;
  for (const g of por.values()) {
    if (!g.com.length || !g.sem.length) { diasFora += g.com.length + g.sem.length; continue; }
    const mediaSemDia = g.sem.reduce((a, b) => a + b, 0) / g.sem.length;
    diasCom += g.com.length;
    diasSem += g.sem.length;
    somaCom += g.com.reduce((a, b) => a + b, 0);
    somaSemPesada += mediaSemDia * g.com.length;
  }
  const semPost = dias.filter((d) => !(Number(d.posts) > 0));
  return {
    diasCom, diasSem, diasFora,
    mediaCom: diasCom ? somaCom / diasCom : 0,
    mediaSem: diasCom ? somaSemPesada / diasCom : 0,
    semPostFimDeSemana: semPost.filter((d) => [0, 6].includes(diaDaSemana(d.dia))).length,
    semPostTotal: semPost.length,
  };
}

/** Mesma comparação para o dia seguinte: conversas do dia seguinte a um dia com post × a um dia sem post (mesmo dia da semana). */
export function efeitoDiaSeguinte(dias: DiaCruzamento[]): EfeitoPareado {
  const ordenados = [...dias].sort((a, b) => a.dia.localeCompare(b.dia));
  const pares: DiaCruzamento[] = [];
  for (let i = 0; i + 1 < ordenados.length; i++) {
    if (somaDias(ordenados[i].dia, 1) !== ordenados[i + 1].dia.slice(0, 10)) continue;
    pares.push({ dia: ordenados[i + 1].dia, posts: ordenados[i].posts, conversas: ordenados[i + 1].conversas });
  }
  return efeitoPorDiaDaSemana(pares);
}

export const efeitoComparavel = (e: EfeitoPareado) => e.diasCom >= MIN_DIAS && e.diasSem >= MIN_DIAS;

/** Pessoas que chamaram sobre o tema (cai para conversas quando a RPC ainda não conta pessoas). */
export const quem = (t: { conversas: number; pessoas?: number }) => Number(t.pessoas ?? t.conversas) || 0;
export const quemAgendou = (t: { agendaram: number; pessoas_agendaram?: number }) => Number(t.pessoas_agendaram ?? t.agendaram) || 0;

/**
 * Junta as grafias do mesmo tema (acento, maiúscula, espaço) numa linha só, somando as contagens. A RPC já junta
 * pela mesma chave (public.tema_chave); isto garante o mesmo resultado se vier uma versão antiga da RPC.
 */
export function juntarTemas<T extends TemaCruzamento>(temas: T[]): T[] {
  const grupos = new Map<string, T[]>();
  for (const t of temas) {
    if (!temaValido(t.tema)) continue;
    const k = chaveTema(t.tema);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(t);
  }
  const soma = (xs: T[], f: (t: T) => number | undefined) => xs.reduce((s, t) => s + (Number(f(t)) || 0), 0);
  return [...grupos.values()].map((xs) => {
    if (xs.length === 1) return { ...xs[0], tema: xs[0].tema.trim() };
    const pesos = xs.flatMap((t) => Array.from({ length: Math.max(1, t.posts + t.conversas) }, () => t.tema.trim()));
    const temPessoas = xs.some((t) => t.pessoas != null);
    return {
      ...xs[0],
      tema: rotuloDoTema(pesos),
      posts: soma(xs, (t) => t.posts), alcance: soma(xs, (t) => t.alcance), conversas: soma(xs, (t) => t.conversas),
      comerciais: soma(xs, (t) => t.comerciais), pediram_preco: soma(xs, (t) => t.pediram_preco), agendaram: soma(xs, (t) => t.agendaram),
      ...(temPessoas ? { pessoas: soma(xs, (t) => t.pessoas ?? t.conversas), pessoas_agendaram: soma(xs, (t) => t.pessoas_agendaram ?? t.agendaram) } : {}),
    };
  }).sort((a, b) => quem(b) - quem(a) || b.posts - a.posts);
}

/** Posts de temas parecidos (o mesmo tema dentro de outro, como "Menopausa" em "Mudanças na menopausa"). */
export function postsDeTemasParecidos(tema: string, temas: TemaCruzamento[]): { posts: number; temas: string[] } {
  const parecidos = temas.filter((t) => t.posts > 0 && chaveTema(t.tema) !== chaveTema(tema) && temaRelacionado(t.tema, tema));
  return { posts: parecidos.reduce((s, t) => s + t.posts, 0), temas: parecidos.map((t) => t.tema) };
}

/** Temas com procura e sem nenhum post do tema nem de tema parecido no período. */
export function temasSemPost<T extends TemaCruzamento>(temas: T[], min = 1): T[] {
  const juntos = juntarTemas(temas);
  return juntos.filter((t) => t.posts === 0 && quem(t) >= min && postsDeTemasParecidos(t.tema, juntos).posts === 0).sort((a, b) => quem(b) - quem(a));
}

/** Temas com 2+ posts e nenhuma conversa, nem sobre tema parecido. */
export function temasSemConversa<T extends TemaCruzamento>(temas: T[]): T[] {
  const juntos = juntarTemas(temas);
  return juntos
    .filter((t) => t.posts >= 2 && t.conversas === 0 && !juntos.some((o) => o.conversas > 0 && chaveTema(o.tema) !== chaveTema(t.tema) && temaRelacionado(o.tema, t.tema)))
    .sort((a, b) => b.posts - a.posts);
}

export function conclusoes(d: DadosCruzamento): Conclusao[] {
  const out: Conclusao[] = [];

  // 1. Postar muda o volume de conversas? Só entre dias equivalentes (mesmo dia da semana).
  const e = efeitoPorDiaDaSemana(d.dias ?? []);
  if (efeitoComparavel(e)) {
    const com = e.mediaCom, sem = e.mediaSem;
    const dif = sem > 0 ? Math.round(((com - sem) / sem) * 100) : null;
    const base = `Comparando cada dia com post com os dias sem post do mesmo dia da semana (${e.diasCom} dias com post e ${e.diasSem} sem post entraram na conta)`;
    if (dif == null || Math.abs(dif) < 10) {
      out.push({ titulo: "Postar não mudou o volume de conversas", tom: "neutro", texto: `${base}, chegaram ${num(com)} conversas por dia com post e ${num(sem)} sem post. A diferença é pequena: o volume de conversas está vindo de outra coisa (anúncios, indicação, recorrência).` });
    } else if (dif > 0) {
      out.push({ titulo: `Dia com post tem ${dif}% mais conversas que o mesmo dia da semana sem post`, tom: "bom", texto: `${base}, chegaram ${num(com)} conversas por dia com post e ${num(sem)} sem post. Pode ter influência de anúncio ou feriado no mesmo dia, mas o sinal é a favor de manter a frequência.`, acao: "Evite deixar sem post os dias úteis de agenda vazia." });
    } else {
      out.push({ titulo: `Dia com post tem ${-dif}% menos conversas que o mesmo dia da semana sem post`, tom: "atencao", texto: `${base}, chegaram ${num(com)} conversas por dia com post e ${num(sem)} sem post. O conteúdo não está puxando conversa; quem traz paciente hoje é outra fonte.`, acao: "Teste posts com chamada direta para o WhatsApp." });
    }
  } else {
    const fds = e.semPostTotal > 0 && e.semPostFimDeSemana / e.semPostTotal >= 0.6
      ? ` Quase todos os dias sem post (${e.semPostFimDeSemana} de ${e.semPostTotal}) caíram no sábado ou no domingo, quando a procura já é menor; comparar com os dias úteis daria um efeito falso.`
      : "";
    out.push({ titulo: "Ainda não dá para comparar dias com e sem post", tom: "neutro", texto: `A comparação só vale entre dias equivalentes (segunda com segunda, sábado com sábado), e precisa de pelo menos ${MIN_DIAS} dias de cada lado. No período, ${e.diasCom} dias com post e ${e.diasSem} sem post têm par para comparar.${fds}` });
  }

  const temas = juntarTemas(d.temas);

  // 2. Tema que mais vira agendamento (amostra mínima de pessoas, não de conversas repetidas).
  const comAmostra = temas.filter((t) => quem(t) >= MIN_CONVERSAS_TEMA).sort((a, b) => quemAgendou(b) / quem(b) - quemAgendou(a) / quem(a) || quem(b) - quem(a));
  if (comAmostra.length) {
    const t = comAmostra[0];
    const parecidos = postsDeTemasParecidos(t.tema, temas).posts;
    const posts = t.posts + parecidos;
    out.push({ titulo: `"${t.tema}" é o assunto que mais vira agendamento`, tom: "bom", texto: `${pct(quemAgendou(t), quem(t))}% das pessoas que chamaram sobre esse tema agendaram (${quemAgendou(t)} de ${quem(t)}). No período, o tema teve ${posts} ${posts === 1 ? "post" : "posts"}${parecidos ? ", contando temas parecidos" : ""}.`, acao: posts < 2 ? "Faça mais posts desse tema: é o que mais converte e quase não aparece no feed." : undefined });
  }

  // 3. Demanda sem conteúdo: pauta pronta. Tema parecido já postado ("Mudanças na menopausa" para "Menopausa") não conta como falta.
  const semPost = temasSemPost(temas, 2);
  if (semPost.length) {
    const lista = semPost.slice(0, 3).map((t) => `${t.tema} (${quem(t)})`).join(", ");
    out.push({ titulo: "Pessoas perguntam sobre temas que não tiveram post", tom: "atencao", texto: `Chamaram sobre ${lista} sem nenhum post do tema, nem de tema parecido, no período. O número entre parênteses é de pessoas.`, acao: "Essas são pautas prontas: quem chamou já mostrou que quer saber disso." });
  }

  // 4. Conteúdo sem demanda.
  const semConversa = temasSemConversa(temas);
  if (semConversa.length) {
    const t = semConversa[0];
    out.push({ titulo: `"${t.tema}" teve ${t.posts} posts e nenhuma conversa`, tom: "neutro", texto: "Pode ser conteúdo para atrair gente nova, que não é feito para gerar conversa na hora. Se a intenção era vender, falta chamada para o WhatsApp." });
  }

  // 5. Horário: quando o paciente chama × quando o post sai.
  const totalPosts = d.grade.reduce((s, g) => s + g.posts, 0);
  const totalConv = d.grade.reduce((s, g) => s + g.conversas, 0);
  if (totalConv >= 20 && totalPosts >= 5) {
    // Faixas de maior conversa até somar metade das conversas do período.
    const ordem = [...d.grade].filter((g) => g.conversas > 0).sort((a, b) => b.conversas - a.conversas);
    const topo: typeof ordem = [];
    for (let soma = 0, i = 0; i < ordem.length && soma < totalConv / 2; i++) { topo.push(ordem[i]); soma += ordem[i].conversas; }
    const chaves = new Set(topo.map((g) => `${g.dow}-${g.hora}`));
    const postsNoTopo = d.grade.filter((g) => chaves.has(`${g.dow}-${g.hora}`)).reduce((s, g) => s + g.posts, 0);
    const p = topo[0];
    const p2 = pct(postsNoTopo, totalPosts);
    out.push({ titulo: `Pico de conversas: ${DIAS[p.dow]} às ${p.hora}h`, tom: p2 >= 25 ? "bom" : "atencao", texto: `Metade das conversas chega em ${topo.length} ${topo.length === 1 ? "faixa" : "faixas"} de dia e hora; só ${p2}% dos posts saíram nessas faixas.`, acao: p2 < 25 ? "Publique perto desses horários, ou deixe o atendimento preparado para o pico." : undefined });
  }

  // 6. Objeção mais comum.
  const ob = [...d.objecoes].filter((o) => o.objecao !== "outro").sort((a, b) => b.n - a.n)[0];
  if (ob && ob.n >= 3) {
    const pessoas = ob.pessoas ?? ob.n, agendaram = ob.pessoas_agendaram ?? ob.agendaram;
    out.push({ titulo: `A objeção mais comum é ${OBJECAO[ob.objecao] ?? ob.objecao}`, tom: "atencao", texto: ob.pessoas != null ? `Apareceu em ${ob.n} conversas de ${pessoas} pessoas, e ${pct(agendaram, pessoas)}% delas agendaram mesmo assim.` : `Apareceu em ${ob.n} conversas, e ${pct(ob.agendaram, ob.n)}% delas agendaram mesmo assim.`, acao: "Um post que responda essa dúvida antes da conversa reduz a objeção no atendimento (sem citar preço: regra do CFM)." });
  }

  return out;
}

/** Cruzamentos com ligação real (RPC conteudo_comercial_profundo): comentário → post, conversa → lead → valor. */
export interface DadosProfundos {
  posts_compra: { post_id: string; comentarios: number; compra: number; palavra?: number; preco: number; agendar: number; onde: number; convenio: number; contato: number; permalink: string | null; thumbnail_url: string | null; legenda: string; tema: string | null; formato: string | null; posted_at: string }[];
  comentarios: { total: number; compra: number; posts_com_compra: number; palavra?: number; guardados_posts_periodo?: number; instagram_posts_periodo?: number };
  compra_por_formato: { formato: string; posts: number; compra: number; comentarios: number }[];
  temas_valor: { tema: string; conversas: number; com_lead: number; ganhos: number; perdidos: number; ganhos_com_valor: number; receita: number }[];
  resposta: { faixa: string; conversas: number; agendaram: number }[];
  resposta_tema: { tema: string; rapidas: number; rapidas_agendaram: number; lentas: number; lentas_agendaram: number }[];
  cobertura: { conversas: number; com_lead: number; com_tema: number; horario_comercial: number };
}

export const FAIXA_RESPOSTA: Record<string, string> = { "1_ate_15min": "Até 15 min", "2_15_a_60min": "15 a 60 min", "3_1_a_4h": "1 a 4 horas", "4_mais_de_4h": "Mais de 4 horas", "5_sem_resposta": "Sem resposta humana" };
export const MIN_GANHOS_TEMA: number = LIMITES.amostra.conversas.ganhosTema;
/** Pedidos (preço, horário, contato, palavra-chave) mínimos nos comentários para apontar o post que mais atrai compra. */
export const MIN_COMENTARIOS_COMPRA: number = LIMITES.amostra.conversas.comentariosCompra;

/** Parte dos comentários dos posts do período que o painel guardou, contra o total que o Instagram informa. */
export function coberturaComentarios(c: DadosProfundos["comentarios"]): number | null {
  const ig = Number(c.instagram_posts_periodo ?? 0), guardados = Number(c.guardados_posts_periodo ?? 0);
  if (!(ig > 0)) return null;
  return Math.min(1, guardados / ig);
}
export const MIN_CONVERSAS_FAIXA: number = LIMITES.amostra.conversas.conversasFaixa;
const FORMATO: Record<string, string> = { reels: "Reels", carrossel: "Carrossel", estatico: "Post estático", CAROUSEL_ALBUM: "Carrossel", VIDEO: "Vídeo", IMAGE: "Imagem" };
export const nomeFormato = (f: string | null) => (f ? FORMATO[f] ?? f : "Formato não informado");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function conclusoesProfundas(d: DadosProfundos): Conclusao[] {
  const out: Conclusao[] = [];

  // Comentários com intenção de compra: ligação direta com o post. Conclui pelo número de pedidos, não pelo total.
  const c = d.comentarios;
  const cob = coberturaComentarios(c);
  const avisoCobertura = cob != null && cob < 0.8 ? ` O painel tem ${Math.round(cob * 100)}% dos comentários que o Instagram mostra nos posts do período; o número real é maior.` : "";
  const palavra = c.palavra ?? 0;
  const tipos = palavra > 0 ? "pedem preço, horário, contato ou o material da palavra-chave" : "pedem preço, horário ou contato";
  if (c.compra >= MIN_COMENTARIOS_COMPRA && d.posts_compra.length) {
    const p = d.posts_compra[0];
    const tema = temaValido(p.tema) ? `"${p.tema}"` : "sem tema identificado";
    out.push({ titulo: `${c.compra} comentários ${tipos}`, tom: "bom", texto: `São ${pct(c.compra, c.total)}% dos ${c.total} comentários do período, em ${c.posts_com_compra} posts${palavra > 0 ? ` (${palavra} deles são a palavra-chave pedida na legenda)` : ""}. O que mais atraiu quem quer comprar foi um ${nomeFormato(p.formato).toLowerCase()} de tema ${tema} (${p.compra} comentários assim).${avisoCobertura}`, acao: "Responda esses comentários chamando para o WhatsApp e repita o tema e o formato desse post." });
  } else if (c.total > 0) {
    out.push({ titulo: "Poucos pedidos nos comentários para concluir", tom: "neutro", texto: `${c.compra} de ${c.total} comentários do período ${tipos}. Com ${MIN_COMENTARIOS_COMPRA} ou mais pedidos dá para ver quais posts atraem quem quer comprar.${avisoCobertura}` });
  }

  // Tema × valor fechado no CRM.
  const comValor = d.temas_valor.filter((t) => temaValido(t.tema) && t.ganhos_com_valor >= MIN_GANHOS_TEMA);
  if (comValor.length) {
    const t = [...comValor].sort((a, b) => b.receita - a.receita)[0];
    out.push({ titulo: `"${t.tema}" é o tema que mais fatura`, tom: "bom", texto: `${t.ganhos} vendas fechadas a partir de conversas sobre esse tema, ${brl(t.receita)} no total (ticket médio de ${brl(t.receita / t.ganhos_com_valor)}). Fechamento: ${pct(t.ganhos, t.com_lead)}% das conversas com lead.`, acao: "Priorize esse tema no conteúdo e nos anúncios." });
  } else if (d.temas_valor.some((t) => t.ganhos > 0)) {
    out.push({ titulo: "Ainda não dá para dizer qual tema fatura mais", tom: "neutro", texto: `É preciso ao menos ${MIN_GANHOS_TEMA} vendas com valor no CRM em um mesmo tema. Peça para a equipe preencher o valor ao marcar a venda como ganha.` });
  } else {
    out.push({ titulo: "O CRM não tem vendas ligadas às conversas", tom: "atencao", texto: "Sem venda marcada como ganha (com valor) nas conversas do período, não dá para saber quanto cada tema fatura.", acao: "Combine com a equipe: ao fechar, marcar o lead como ganho e preencher o valor." });
  }

  // Tempo de resposta × agendamento (horário comercial).
  const f = new Map(d.resposta.map((r) => [r.faixa, r]));
  const rapida = f.get("1_ate_15min"), lenta = [f.get("3_1_a_4h"), f.get("4_mais_de_4h")].filter(Boolean) as DadosProfundos["resposta"];
  const lentaN = lenta.reduce((s, r) => s + r.conversas, 0), lentaA = lenta.reduce((s, r) => s + r.agendaram, 0);
  if (rapida && rapida.conversas >= MIN_CONVERSAS_FAIXA && lentaN >= MIN_CONVERSAS_FAIXA) {
    const tr = pct(rapida.agendaram, rapida.conversas), tl = pct(lentaA, lentaN);
    out.push(tr > tl
      ? { titulo: `Responder em até 15 min agenda ${tr}%; depois de 1 hora, ${tl}%`, tom: "atencao", texto: `Em horário comercial, ${pct(lentaN, d.cobertura.horario_comercial)}% das conversas esperaram mais de 1 hora pela primeira resposta de uma pessoa. É correlação, não prova, mas o sinal é claro.`, acao: "Defina um responsável por responder em até 15 minutos no horário comercial." }
      : { titulo: "A demora na resposta não mudou o agendamento", tom: "neutro", texto: `Até 15 min: ${tr}% agendaram. Mais de 1 hora: ${tl}%. O gargalo está em outra etapa do atendimento.` });
  }
  const sem = f.get("5_sem_resposta");
  if (sem && d.cobertura.horario_comercial >= MIN_CONVERSAS_FAIXA && pct(sem.conversas, d.cobertura.horario_comercial) >= 15) {
    out.push({ titulo: `${pct(sem.conversas, d.cobertura.horario_comercial)}% das conversas em horário comercial sem resposta de uma pessoa`, tom: "atencao", texto: `${sem.conversas} conversas receberam só mensagem automática ou nenhuma resposta registrada.`, acao: "Confira se a equipe responde por outro número ou se essas conversas ficaram sem atendimento." });
  }
  return out;
}
