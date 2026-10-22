/**
 * Conclusões em linguagem simples para a tela Conteúdo × Comercial. Funções puras sobre o retorno da RPC
 * conteudo_comercial. Só afirma o que a amostra sustenta; abaixo do mínimo, diz que ainda não dá para concluir.
 * Tudo é coincidência no tempo ou no assunto, nunca prova de que um post gerou uma conversa específica.
 */

export interface DadosCruzamento {
  efeito_post: { dias_com_post: number; media_com_post: number | null; dias_sem_post: number; media_sem_post: number | null } | null;
  grade: { dow: number; hora: number; posts: number; conversas: number; agendaram: number }[];
  temas: { tema: string; posts: number; alcance: number; conversas: number; comerciais: number; pediram_preco: number; agendaram: number }[];
  objecoes: { objecao: string; n: number; agendaram: number }[];
}

export type Tom = "bom" | "atencao" | "neutro";
export interface Conclusao { titulo: string; texto: string; acao?: string; tom: Tom }

export const MIN_DIAS = 5;
export const MIN_CONVERSAS_TEMA = 5;
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const OBJECAO: Record<string, string> = { preco: "preço", convenio: "convênio", distancia: "distância", adiamento: "deixar para depois", agenda: "agenda e horário", medo: "medo", desconfianca: "desconfiança", outro: "outras" };

const num = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const temaValido = (t: unknown): t is string => typeof t === "string" && t.trim() !== "" && !["null", "undefined"].includes(t.trim().toLowerCase());

export function conclusoes(d: DadosCruzamento): Conclusao[] {
  const out: Conclusao[] = [];

  // 1. Postar muda o volume de conversas?
  const e = d.efeito_post;
  if (e && e.dias_com_post >= MIN_DIAS && e.dias_sem_post >= MIN_DIAS && e.media_com_post != null && e.media_sem_post != null) {
    const com = e.media_com_post, sem = e.media_sem_post;
    const dif = sem > 0 ? Math.round(((com - sem) / sem) * 100) : null;
    if (dif == null || Math.abs(dif) < 10) {
      out.push({ titulo: "Postar não mudou o volume de conversas", tom: "neutro", texto: `Nos dias com post chegaram ${num(com)} conversas por dia; nos dias sem post, ${num(sem)}. A diferença é pequena: o volume de conversas está vindo de outra coisa (anúncios, indicação, recorrência).` });
    } else if (dif > 0) {
      out.push({ titulo: `Dia com post tem ${dif}% mais conversas`, tom: "bom", texto: `Nos dias com post chegaram ${num(com)} conversas por dia, contra ${num(sem)} nos dias sem post. Pode ter influência de anúncio no mesmo dia, mas o sinal é a favor de manter a frequência.`, acao: "Evite dias sem post nas semanas de agenda vazia." });
    } else {
      out.push({ titulo: `Dia com post tem ${-dif}% menos conversas`, tom: "atencao", texto: `Nos dias com post chegaram ${num(com)} conversas por dia, contra ${num(sem)} nos dias sem post. O conteúdo não está puxando conversa; quem traz paciente hoje é outra fonte.`, acao: "Teste posts com chamada direta para o WhatsApp (C2/C3)." });
    }
  } else {
    out.push({ titulo: "Ainda não dá para comparar dias com e sem post", tom: "neutro", texto: `É preciso pelo menos ${MIN_DIAS} dias de cada tipo no período. Aumente o período no topo da tela.` });
  }

  const temas = d.temas.filter((t) => temaValido(t.tema));

  // 2. Tema que mais vira agendamento (amostra mínima).
  const comAmostra = temas.filter((t) => t.conversas >= MIN_CONVERSAS_TEMA).sort((a, b) => b.agendaram / b.conversas - a.agendaram / a.conversas || b.conversas - a.conversas);
  if (comAmostra.length) {
    const t = comAmostra[0];
    out.push({ titulo: `"${t.tema}" é o assunto que mais vira agendamento`, tom: "bom", texto: `${pct(t.agendaram, t.conversas)}% das conversas sobre esse tema agendaram (${t.agendaram} de ${t.conversas}). No período, o tema teve ${t.posts} ${t.posts === 1 ? "post" : "posts"}.`, acao: t.posts < 2 ? "Faça mais posts desse tema: é o que mais converte e quase não aparece no feed." : undefined });
  }

  // 3. Demanda sem conteúdo: pauta pronta.
  const semPost = temas.filter((t) => t.posts === 0 && t.conversas >= 2).sort((a, b) => b.conversas - a.conversas);
  if (semPost.length) {
    const lista = semPost.slice(0, 3).map((t) => `${t.tema} (${t.conversas})`).join(", ");
    out.push({ titulo: "Pacientes perguntam sobre temas que não tiveram post", tom: "atencao", texto: `Conversas sobre ${lista} chegaram sem nenhum post do tema no período.`, acao: "Essas são pautas prontas: o paciente já mostrou que quer saber disso." });
  }

  // 4. Conteúdo sem demanda.
  const semConversa = temas.filter((t) => t.posts >= 2 && t.conversas === 0).sort((a, b) => b.posts - a.posts);
  if (semConversa.length) {
    const t = semConversa[0];
    out.push({ titulo: `"${t.tema}" teve ${t.posts} posts e nenhuma conversa`, tom: "neutro", texto: "Pode ser conteúdo de alcance (C0/C1), que não é feito para gerar conversa na hora. Se a intenção era vender, falta chamada para o WhatsApp." });
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
    out.push({ titulo: `A objeção mais comum é ${OBJECAO[ob.objecao] ?? ob.objecao}`, tom: "atencao", texto: `Apareceu em ${ob.n} conversas, e ${pct(ob.agendaram, ob.n)}% delas agendaram mesmo assim.`, acao: "Um post que responda essa dúvida antes da conversa reduz a objeção no atendimento (sem citar preço: regra do CFM)." });
  }

  return out;
}

/** Cruzamentos com ligação real (RPC conteudo_comercial_profundo): comentário → post, conversa → lead → valor. */
export interface DadosProfundos {
  posts_compra: { post_id: string; comentarios: number; compra: number; preco: number; agendar: number; onde: number; convenio: number; contato: number; permalink: string | null; thumbnail_url: string | null; legenda: string; tema: string | null; formato: string | null; posted_at: string }[];
  comentarios: { total: number; compra: number; posts_com_compra: number };
  compra_por_formato: { formato: string; posts: number; compra: number; comentarios: number }[];
  temas_valor: { tema: string; conversas: number; com_lead: number; ganhos: number; perdidos: number; ganhos_com_valor: number; receita: number }[];
  resposta: { faixa: string; conversas: number; agendaram: number }[];
  resposta_tema: { tema: string; rapidas: number; rapidas_agendaram: number; lentas: number; lentas_agendaram: number }[];
  cobertura: { conversas: number; com_lead: number; com_tema: number; horario_comercial: number };
}

export const FAIXA_RESPOSTA: Record<string, string> = { "1_ate_15min": "Até 15 min", "2_15_a_60min": "15 a 60 min", "3_1_a_4h": "1 a 4 horas", "4_mais_de_4h": "Mais de 4 horas", "5_sem_resposta": "Sem resposta humana" };
export const MIN_GANHOS_TEMA = 5;
export const MIN_CONVERSAS_FAIXA = 30;
const FORMATO: Record<string, string> = { reels: "Reels", carrossel: "Carrossel", estatico: "Post estático", CAROUSEL_ALBUM: "Carrossel", VIDEO: "Vídeo", IMAGE: "Imagem" };
export const nomeFormato = (f: string | null) => (f ? FORMATO[f] ?? f : "Formato não informado");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function conclusoesProfundas(d: DadosProfundos): Conclusao[] {
  const out: Conclusao[] = [];

  // Comentários com intenção de compra: ligação direta com o post.
  const c = d.comentarios;
  if (c.total >= 50 && d.posts_compra.length) {
    const p = d.posts_compra[0];
    const tema = temaValido(p.tema) ? `"${p.tema}"` : "sem tema identificado";
    out.push({ titulo: `${c.compra} comentários pedem preço, horário ou contato`, tom: "bom", texto: `São ${pct(c.compra, c.total)}% dos ${c.total} comentários do período, em ${c.posts_com_compra} posts. O que mais atraiu quem quer comprar foi um ${nomeFormato(p.formato).toLowerCase()} de tema ${tema} (${p.compra} comentários assim).`, acao: "Responda esses comentários chamando para o WhatsApp e repita o tema e o formato desse post." });
  } else if (c.total > 0) {
    out.push({ titulo: "Poucos comentários para concluir", tom: "neutro", texto: `Foram ${c.total} comentários no período. Com 50 ou mais dá para ver quais posts atraem quem quer comprar.` });
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
