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
