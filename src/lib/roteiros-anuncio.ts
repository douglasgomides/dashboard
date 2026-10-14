// Roteiros de ANÚNCIO para gravar, por etapa do funil, a partir de dores e objeções reais:
//   C1 (topo)  → atrair quem ainda não conhece: temas que geram identificação (relatos e elogios).
//                Campanha de reconhecimento/alcance.
//   C2 (meio)  → educar e gerar confiança: dúvidas de saúde e comparação de opções nos comentários.
//                Campanha de tráfego para o perfil ou engajamento.
//   C3 (fundo) → fazer a pessoa agir: quebra de objeção (preço, convênio, medo, "não é para mim", adiar,
//                agenda) dos comentários e das conversas de WhatsApp. Campanha de MENSAGENS (conversa).
//
// Regras: o gancho nunca copia o comentário nem diz "apareceu N vezes" (isso fica na evidência, para a
// equipe). CFM: sem preço, sem desconto, sem promessa de resultado, sem antes e depois, sem nome de remédio.

export type Etapa = "C1" | "C2" | "C3";

export const ETAPAS: Record<Etapa, { nome: string; papel: string; objetivoCampanha: string; cor: string }> = {
  C1: { nome: "C1 · Topo do funil", papel: "Atrair quem ainda não conhece o médico", objetivoCampanha: "Reconhecimento (alcance)", cor: "var(--s1)" },
  C2: { nome: "C2 · Meio do funil", papel: "Educar e gerar confiança em quem já conhece", objetivoCampanha: "Tráfego para o perfil ou engajamento", cor: "var(--s3)" },
  C3: { nome: "C3 · Fundo do funil", papel: "Quebrar a objeção e levar para a conversa", objetivoCampanha: "Mensagens (WhatsApp ou Direct)", cor: "var(--good)" },
};

export interface RoteiroAnuncio {
  id: string;
  etapa: Etapa;
  titulo: string;
  origem: string; // de onde veio (ex.: "Objeção no WhatsApp: preço")
  base: number; // pessoas ou conversas que sustentam
  baseTexto: string; // "8 pessoas nos comentários", "12 conversas no WhatsApp"
  objetivoCampanha: string;
  gancho: string; // primeira frase do vídeo (até 3 s)
  roteiro: string[]; // cenas para gravar
  copy: string; // texto do anúncio (legenda)
  cta: string;
  exemplos: string[]; // 2 a 3 comentários reais (para a equipe validar)
  aviso: string;
}

export interface EntradaRoteiros {
  /** Grupos de dúvida da voz do paciente (já sem ruído e sem pedido de dose). */
  grupos: { id: string; rotulo: string; termo: string; intencao: string; pessoas: number; exemplos: { texto: string }[]; cuidadoMedico?: boolean }[];
  /** Temas que geram identificação (relatos e elogios). */
  identificacao: { tema: string; pessoas: number; exemplos: string[] }[];
  /** Objeções nas conversas de WhatsApp (auditoria comercial), por tipo: { preco: 12, medo: 3 }. */
  objecoesWhatsapp?: Record<string, number> | null;
}

const AVISO = "Sem preço, desconto ou promessa de resultado; sem antes e depois; sem nome de remédio (CFM).";
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Quebra de objeção (C3) por tipo. `termo` é o assunto, quando houver. */
function c3(tipo: string, termo: string | null): Omit<RoteiroAnuncio, "id" | "etapa" | "origem" | "base" | "baseTexto" | "objetivoCampanha" | "exemplos" | "aviso"> | null {
  const sobre = termo ? ` de ${termo}` : "";
  switch (tipo) {
    case "preco":
      return {
        titulo: "O que está incluído na avaliação",
        gancho: "Antes de perguntar o valor, entenda o que você leva de uma avaliação.",
        roteiro: [
          "Médico na câmera: \"Muita gente quer saber o valor antes de tudo. Faz sentido.\"",
          "Mostrar o que acontece na consulta: conversa longa, exame, explicação do plano.",
          "Dizer o que a pessoa leva para casa (orientação clara, próximos passos).",
          "Fechar com o convite para chamar no WhatsApp e ver horários.",
        ],
        copy: "Uma avaliação não é só uma consulta rápida: é tempo para entender o seu caso e sair com um plano claro. Chame no WhatsApp e veja os horários disponíveis.",
        cta: "Chamar no WhatsApp",
      };
    case "convenio":
      return {
        titulo: "Atendimento particular: como funciona",
        gancho: "Não tem convênio que cubra? Veja como funciona o atendimento particular.",
        roteiro: [
          "Explicar em uma frase por que o atendimento é particular.",
          "Mostrar o que muda para o paciente (tempo de consulta, acompanhamento).",
          "Dizer que a equipe explica no WhatsApp como funciona o pedido de reembolso, quando o plano permite.",
        ],
        copy: "Atendimento particular com tempo para ouvir o seu caso. A equipe te explica no WhatsApp como funciona, inclusive o reembolso quando o seu plano permite.",
        cta: "Tirar dúvidas no WhatsApp",
      };
    case "medo":
      return {
        titulo: `Medo${sobre}: o que acontece de verdade na consulta`,
        gancho: termo ? `Tem medo quando o assunto é ${termo}? Te mostro o que acontece de verdade.` : "Tem receio de marcar? Te mostro o que acontece de verdade na consulta.",
        roteiro: [
          "Nomear o medo mais comum, com acolhimento.",
          "Mostrar, passo a passo, como é a consulta e quem decide cada etapa (o paciente decide junto).",
          "Reforçar que nada é feito sem explicar antes.",
          "Convite: \"Se ficou alguma dúvida, me chama no WhatsApp.\"",
        ],
        copy: "Ter receio é normal. Na consulta, cada passo é explicado antes, e a decisão é sempre junto com você. Ficou alguma dúvida? Chame no WhatsApp.",
        cta: "Conversar no WhatsApp",
      };
    case "objecao":
      return {
        titulo: `"Isso não é para mim"${sobre}`,
        gancho: `"Isso não é para mim." Se você já pensou assim${sobre}, fica até o fim.`,
        roteiro: [
          "Ler a frase que muita gente pensa (sem citar quem disse).",
          "Explicar por que essa ideia é comum e o que muda caso a caso.",
          "Mostrar que existe avaliação para entender o seu caso, sem compromisso de tratamento.",
          "Convite para chamar no WhatsApp.",
        ],
        copy: "Muita gente acha que não é para si, até entender o próprio caso. Uma avaliação mostra o que faz sentido para você. Chame no WhatsApp.",
        cta: "Chamar no WhatsApp",
      };
    case "adiamento":
      return {
        titulo: "\"Vou ver isso depois\"",
        gancho: "\"Vou ver isso depois.\" Quantas vezes você já disse isso para a sua saúde?",
        roteiro: [
          "Cena do dia a dia: a pessoa adiando o cuidado.",
          "Explicar, sem assustar, por que cuidar cedo deixa tudo mais simples.",
          "Mostrar como é fácil dar o primeiro passo (mensagem, horário, consulta).",
        ],
        copy: "O primeiro passo é só uma mensagem. A equipe te ajuda a encontrar um horário que cabe na sua rotina.",
        cta: "Mandar mensagem",
      };
    case "agenda":
    case "agendamento":
      return {
        titulo: "Como agendar em 3 passos",
        gancho: "Agendar a sua avaliação leva menos de 2 minutos. Olha só.",
        roteiro: ["Passo 1: chamar no WhatsApp.", "Passo 2: escolher o melhor horário com a equipe.", "Passo 3: receber a confirmação e o que levar no dia."],
        copy: "Agendar é simples: chame no WhatsApp, escolha o horário com a equipe e receba a confirmação com tudo o que levar.",
        cta: "Agendar pelo WhatsApp",
      };
    case "desconfianca":
      return {
        titulo: "Como é o acompanhamento, do começo ao fim",
        gancho: "Quer saber como é ser paciente aqui antes de marcar? Te mostro.",
        roteiro: [
          "Apresentação curta do médico e da formação (sem superlativos).",
          "Mostrar o acompanhamento: primeira consulta, retorno, canal de dúvidas.",
          "Convite para conhecer pelo WhatsApp.",
        ],
        copy: "Do primeiro contato ao retorno, você sabe o que vai acontecer em cada etapa. Chame no WhatsApp para conhecer.",
        cta: "Conhecer pelo WhatsApp",
      };
    case "distancia":
      return {
        titulo: "Mora longe? Veja as formas de atendimento",
        gancho: "Mora longe da clínica? Veja as formas de atendimento que existem.",
        roteiro: ["Reconhecer a dificuldade de deslocamento.", "Mostrar as formas de atendimento que a clínica oferece de verdade.", "Convite para a equipe explicar no WhatsApp."],
        copy: "A distância não precisa ser o motivo para adiar. A equipe te explica no WhatsApp as formas de atendimento disponíveis.",
        cta: "Perguntar no WhatsApp",
      };
    default:
      return null;
  }
}

const ROTULO_OBJECAO_WTS: Record<string, string> = {
  preco: "preço",
  convenio: "convênio",
  distancia: "distância",
  adiamento: "\"vou pensar\"",
  agenda: "agenda",
  medo: "medo",
  desconfianca: "desconfiança",
};

export function montarRoteiros(e: EntradaRoteiros): RoteiroAnuncio[] {
  const out: RoteiroAnuncio[] = [];
  const base = (etapa: Etapa) => ({ etapa, objetivoCampanha: ETAPAS[etapa].objetivoCampanha, aviso: AVISO });

  // C1: temas que geram identificação.
  for (const [i, t] of e.identificacao.slice(0, 3).entries()) {
    out.push({
      ...base("C1"),
      id: `c1-${i}`,
      titulo: `${t.tema}: não é só com você`,
      origem: `Tema que gera identificação nos comentários`,
      base: t.pessoas,
      baseTexto: `${plural(t.pessoas, "pessoa se identificou", "pessoas se identificaram")} nos comentários`,
      gancho: `Se isso já aconteceu com você, presta atenção nos próximos segundos.`,
      roteiro: [
        `Abrir com uma cena comum de quem vive ${t.tema.toLowerCase()} (sem expor ninguém).`,
        "Dizer que é mais comum do que parece e por que acontece, em linguagem simples.",
        "Uma orientação útil e segura para hoje.",
        "Fechar convidando a seguir o perfil para mais conteúdo assim.",
      ],
      copy: `${cap(t.tema)}: mais gente passa por isso do que você imagina. Siga para entender o que acontece e quando vale procurar avaliação.`,
      cta: "Seguir o perfil",
      exemplos: t.exemplos.slice(0, 3),
    });
  }

  // C2: dúvidas de saúde e comparação de opções.
  const educar = e.grupos.filter((g) => !g.cuidadoMedico && (g.intencao === "duvida_clinica" || g.intencao === "comparacao")).sort((a, b) => b.pessoas - a.pessoas).slice(0, 3);
  for (const [i, g] of educar.entries()) {
    const comparacao = g.intencao === "comparacao";
    out.push({
      ...base("C2"),
      id: `c2-${i}`,
      titulo: comparacao ? `${g.rotulo}: qual opção faz sentido` : `${g.rotulo}: explicado de forma simples`,
      origem: comparacao ? "Comparação de opções nos comentários" : "Dúvida de saúde repetida nos comentários",
      base: g.pessoas,
      baseTexto: `${plural(g.pessoas, "pessoa perguntou", "pessoas perguntaram")} nos comentários`,
      gancho: comparacao ? `Qual é melhor? A resposta honesta sobre ${g.termo} é: depende. E eu te mostro do quê.` : `${cap(g.termo)}: o que quase ninguém te explica direito.`,
      roteiro: [
        "Médico na câmera, direto ao ponto (sem introdução longa).",
        comparacao ? "Explicar para que serve cada opção, em linhas gerais." : "Explicar o básico em 2 ou 3 frases, com um exemplo do dia a dia.",
        "Mostrar o que o médico avalia antes de indicar qualquer caminho.",
        "Convite: salvar o vídeo e visitar o perfil para mais respostas.",
      ],
      copy: `${cap(g.termo)} gera muita dúvida. Neste vídeo, a explicação sem complicação e o que é avaliado em cada caso.`,
      cta: "Ver o perfil",
      exemplos: g.exemplos.slice(0, 3).map((x) => x.texto),
    });
  }

  // C3: objeções dos comentários (preço, agendamento, medo, "não é para mim") e do WhatsApp.
  const porTipo = new Map<string, { base: number; origem: string[]; termo: string | null; exemplos: string[] }>();
  for (const g of e.grupos) {
    if (g.cuidadoMedico) continue;
    const tipo = g.intencao === "agendamento" ? "agendamento" : g.intencao;
    if (!["preco", "agendamento", "medo", "objecao"].includes(tipo)) continue;
    const atual = porTipo.get(tipo) ?? { base: 0, origem: [], termo: null, exemplos: [] };
    atual.base += g.pessoas;
    atual.origem.push(`${plural(g.pessoas, "pessoa", "pessoas")} nos comentários`);
    atual.termo = atual.termo ?? (tipo === "medo" || tipo === "objecao" ? g.termo : null);
    atual.exemplos.push(...g.exemplos.map((x) => x.texto));
    porTipo.set(tipo, atual);
  }
  for (const [tipo, n] of Object.entries(e.objecoesWhatsapp ?? {})) {
    if (!n || !ROTULO_OBJECAO_WTS[tipo]) continue;
    const atual = porTipo.get(tipo) ?? { base: 0, origem: [], termo: null, exemplos: [] };
    atual.base += n;
    atual.origem.push(`${plural(n, "conversa", "conversas")} no WhatsApp`);
    porTipo.set(tipo, atual);
  }
  const fundo = [...porTipo.entries()].sort((a, b) => b[1].base - a[1].base).slice(0, 4);
  for (const [i, [tipo, info]] of fundo.entries()) {
    const r = c3(tipo, info.termo);
    if (!r) continue;
    out.push({
      ...base("C3"),
      ...r,
      id: `c3-${i}`,
      origem: `Objeção: ${ROTULO_OBJECAO_WTS[tipo] ?? (tipo === "objecao" ? "\"não é para mim\"" : tipo === "agendamento" ? "como agendar" : tipo)}`,
      base: info.base,
      baseTexto: info.origem.join(" + "),
      exemplos: info.exemplos.slice(0, 3),
    });
  }
  return out;
}
