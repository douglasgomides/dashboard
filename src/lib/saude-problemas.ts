// Saúde das fontes (admin): cada problema de cada cliente numa linha só, com o TIPO do problema
// (falha técnica, do lado do cliente, sem dado na origem, configuração incompleta), a gravidade,
// quem resolve e a ação recomendada em linguagem de operação.
//
// Não cria regra nova de saúde: o estado vem de saudeDaFonte (tomDaFonte + motivoDaLinha) e os
// problemas de dado vêm de qualidade_dados (banco). Aqui só se classifica e se ordena.
import { type Fontes, type LinhaFonte } from "@/lib/saude-fontes";
import { motivoDaLinha } from "@/lib/motivos";
import { statusDaFonte } from "@/lib/status-fonte";
import type { ProblemaDado } from "@/lib/client-data";

export type TipoProblema = "falha_tecnica" | "cliente" | "sem_dado_origem" | "config_incompleta";
export type Gravidade = "alta" | "media" | "baixa";
export type QuemResolve = "equipe" | "cliente" | "meta" | "ninguem";
export type FonteSaude = "instagram" | "anuncios" | "crm" | "atendimento" | "comentarios";

export const ROTULO_TIPO: Record<TipoProblema, string> = {
  falha_tecnica: "Falha técnica",
  cliente: "Do lado do cliente",
  sem_dado_origem: "Sem dado na origem",
  config_incompleta: "Configuração incompleta",
};

export const EXPLICA_TIPO: Record<TipoProblema, string> = {
  falha_tecnica: "Algo quebrou na integração. É com a gente (ou com a Meta, quando ela está instável).",
  cliente: "Depende de uma ação do cliente: acesso, pagamento ou organização do CRM.",
  sem_dado_origem: "A integração funciona, mas não há dado novo para trazer. Não é erro.",
  config_incompleta: "Falta ligar ou cadastrar algo no painel para o dado entrar certo.",
};

export const ROTULO_GRAVIDADE: Record<Gravidade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

export const ROTULO_QUEM: Record<QuemResolve, string> = {
  equipe: "Doctor Creator",
  cliente: "Cliente",
  meta: "Meta (aguardar)",
  ninguem: "Só acompanhar",
};

export const ROTULO_FONTE_SAUDE: Record<FonteSaude, string> = {
  instagram: "Instagram",
  anuncios: "Anúncios",
  crm: "CRM",
  atendimento: "WhatsApp",
  comentarios: "Comentários",
};

export interface ProblemaFonte {
  id: string; // estável: cliente + fonte + origem do problema
  clientId: string;
  cliente: string;
  fonte: FonteSaude | string;
  tipo: TipoProblema;
  gravidade: Gravidade;
  quem: QuemResolve;
  titulo: string; // o que aconteceu, numa frase
  detalhe: string | null; // evidência / causa provável
  acao: string; // ação recomendada
  afeta: string | null; // o que fica distorcido
  ultimaTentativa: string | null; // ISO
  ultimoSucesso: string | null; // ISO
  ultimoErro: string | null; // texto técnico bruto
  dadoAte: string | null; // AAAA-MM-DD
}

export interface EntradaCliente {
  id: string;
  nome: string;
  fontes: Fontes;
  linhas: LinhaFonte[];
  qualidade?: ProblemaDado[];
  naoUsa?: string[]; // fontes marcadas como "não usa" (intencional)
}

const FLAG: Record<string, keyof NonNullable<Fontes>> = {
  instagram: "tem_instagram",
  anuncios: "tem_anuncios",
  crm: "tem_crm",
  atendimento: "tem_atendimento",
};

const ACAO = {
  equipe: "Rodar a sincronização desta fonte em Gerenciar e olhar o erro. Se repetir, corrigir a integração.",
  cliente: "Avisar o cliente com o passo a passo: a ação é dele (autorizar o acesso de novo, regularizar pagamento ou ajustar o CRM).",
  meta: "Nada a fazer agora: tentamos de novo na próxima atualização. Se passar de 2 dias, abrir chamado na Meta.",
  origemAds: "Confirmar com o cliente se pausou as campanhas ou se há pagamento pendente. Não é erro do painel.",
  origemCrm: "Confirmar com o cliente se entram leads novos no CRM (ou se é lançado à mão). Não é erro do painel.",
  origem: "Confirmar com o cliente se houve atividade nova. Não é erro do painel.",
  semDado: "A fonte está ligada, mas nunca trouxe dado: conferir o cadastro (conta, subdomínio, token) em Gerenciar e rodar a sincronização.",
  semInstagram: "Ligar a conta do Instagram em Gerenciar. Sem ela, o painel do cliente fica quase vazio.",
} as const;

const ORDEM_GRAVIDADE: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };
const ORDEM_TIPO: Record<TipoProblema, number> = { falha_tecnica: 0, config_incompleta: 1, cliente: 2, sem_dado_origem: 3 };

// Mesma regra de cor do admin (status-fonte.ts): parado = vermelho por tempo (mais de 3 dias ou sem dado).
function velho(l: LinhaFonte): boolean {
  return !l.data_ate || statusDaFonte({ cadastro: true, data_ate: l.data_ate }).cor === "vermelho";
}

/** Problema de uma fonte ligada (sync_status), ou null se está em dia. Mesmas regras de saudeDaFonte. */
export function problemaDaLinha(c: Pick<EntradaCliente, "id" | "nome">, l: LinhaFonte): ProblemaFonte | null {
  const p = problemaBruto(c, l);
  // Mesma régua de cor do admin: fonte em VERMELHO (mais de 3 dias ou erro) nunca é "baixa / só acompanhar".
  // Sem erro nosso, a ação é confirmar com o cliente (campanha pausada, CRM lançado à mão, planilha).
  if (p && velho(l) && p.gravidade === "baixa") return { ...p, gravidade: "media", quem: p.quem === "ninguem" ? "cliente" : p.quem };
  return p;
}

function problemaBruto(c: Pick<EntradaCliente, "id" | "nome">, l: LinhaFonte): ProblemaFonte | null {
  const base = {
    clientId: c.id,
    cliente: c.nome,
    fonte: l.fonte,
    ultimaTentativa: l.last_attempt_at,
    ultimoSucesso: l.last_success_at,
    ultimoErro: l.last_error,
    dadoAte: l.data_ate,
    afeta: "Todos os números desta fonte no painel do cliente.",
  };
  const nome = ROTULO_FONTE_SAUDE[l.fonte as FonteSaude] ?? l.fonte;
  if (!l.data_ate && !l.last_error) {
    return { ...base, id: `${c.id}:${l.fonte}:sem-dado`, tipo: "config_incompleta", gravidade: "alta", quem: "equipe", titulo: `${nome} ligado, mas nenhum dado chegou ainda`, detalhe: "A fonte está marcada como ligada no cadastro, mas a sincronização nunca gravou dado.", acao: ACAO.semDado };
  }
  if (!l.last_error && l.data_ate && statusDaFonte({ cadastro: true, data_ate: l.data_ate }).cor === "verde") return null;
  const m = motivoDaLinha(l);
  const parado = velho(l);
  const quando = l.data_ate ? `Último dado: ${l.data_ate.slice(8, 10)}/${l.data_ate.slice(5, 7)}` : "Sem dado";
  if (!m && parado) {
    // Parada há mais de 3 dias, sem erro gravado e sem sucesso recente: a atualização não está rodando.
    return { ...base, id: `${c.id}:${l.fonte}:parado`, tipo: "falha_tecnica", gravidade: "media", quem: "equipe", titulo: `${nome} parado sem causa identificada`, detalhe: `${quando}. A atualização não registrou erro nem sucesso recente.`, acao: ACAO.equipe };
  }
  if (!m) {
    // Atrasada 2–3 dias, sem erro e sem causa: só acompanhar.
    return { ...base, id: `${c.id}:${l.fonte}:atraso`, tipo: "sem_dado_origem", gravidade: "baixa", quem: "ninguem", titulo: `${nome} com 2 a 3 dias de atraso`, detalhe: `${quando}. Sem erro na atualização; a causa aparece aqui se passar de 3 dias.`, acao: "Aguardar a próxima atualização automática." };
  }
  if (m.dono === "nos") {
    return { ...base, id: `${c.id}:${l.fonte}:erro`, tipo: "falha_tecnica", gravidade: parado ? "alta" : "media", quem: "equipe", titulo: parado ? `${nome} parado por erro na atualização` : `${nome} em dia, mas a última atualização deu erro`, detalhe: `${quando}. ${m.texto}`, acao: ACAO.equipe };
  }
  if (m.dono === "meta") {
    return { ...base, id: `${c.id}:${l.fonte}:meta`, tipo: "falha_tecnica", gravidade: parado ? "media" : "baixa", quem: "meta", titulo: `${nome}: a Meta não entregou os dados`, detalhe: `${quando}. ${m.texto}`, acao: ACAO.meta };
  }
  if (m.dono === "cliente") {
    return { ...base, id: `${c.id}:${l.fonte}:cliente`, tipo: "cliente", gravidade: parado ? "alta" : "media", quem: "cliente", titulo: `${nome} depende de ação do cliente`, detalhe: `${quando}. ${m.texto}`, acao: ACAO.cliente };
  }
  const acao = l.fonte === "anuncios" ? ACAO.origemAds : l.fonte === "crm" ? ACAO.origemCrm : ACAO.origem;
  return { ...base, id: `${c.id}:${l.fonte}:origem`, tipo: "sem_dado_origem", gravidade: "baixa", quem: "ninguem", titulo: `${nome} sem dado novo na origem`, detalhe: `${quando}. ${m.texto}`, acao };
}

// Problemas de dado (qualidade_dados) que não repetem o sync: "sync-erro-*" já vem pela linha da fonte.
const TIPO_QUALIDADE: Record<string, TipoProblema> = {
  "crm-compartilhado": "config_incompleta",
  "ads-sem-objetivo": "config_incompleta",
  "ads-sem-gasto": "sem_dado_origem",
  "ig-alcance-parado": "falha_tecnica",
  "ig-posts-parados": "falha_tecnica",
  "ig-seguidores-nao-fecham": "falha_tecnica",
};

export function problemaDeQualidade(c: Pick<EntradaCliente, "id" | "nome">, p: ProblemaDado): ProblemaFonte | null {
  if (p.id.startsWith("sync-erro-")) return null;
  const tipo: TipoProblema = TIPO_QUALIDADE[p.id] ?? (p.responsavel === "equipe_hub" ? "falha_tecnica" : "cliente");
  const quem: QuemResolve = tipo === "sem_dado_origem" ? "ninguem" : p.responsavel === "equipe_hub" ? "equipe" : "cliente";
  const gravidade: Gravidade = tipo === "sem_dado_origem" ? "baixa" : p.severidade === "alta" ? "alta" : "media";
  return {
    id: `${c.id}:q:${p.id}`,
    clientId: c.id,
    cliente: c.nome,
    fonte: p.fonte,
    tipo,
    gravidade,
    quem,
    titulo: p.titulo,
    detalhe: [p.evidencia, p.causa && `Causa provável: ${p.causa}`].filter(Boolean).join(" "),
    acao: p.correcao,
    afeta: p.afeta || null,
    ultimaTentativa: null,
    ultimoSucesso: null,
    ultimoErro: null,
    dadoAte: null,
  };
}

/** Todos os problemas de todos os clientes, do mais urgente ao menos urgente. */
export function montarProblemasFontes(clientes: EntradaCliente[]): ProblemaFonte[] {
  const out: ProblemaFonte[] = [];
  for (const c of clientes) {
    const f = c.fontes;
    // Instagram é a fonte base do painel: cliente sem Instagram ligado é configuração incompleta.
    if (f && !f.tem_instagram && !c.naoUsa?.includes("instagram")) {
      out.push({ id: `${c.id}:instagram:nao-ligado`, clientId: c.id, cliente: c.nome, fonte: "instagram", tipo: "config_incompleta", gravidade: "media", quem: "equipe", titulo: "Instagram não está ligado", detalhe: "O cadastro do cliente não tem conta do Instagram ativa.", acao: ACAO.semInstagram, afeta: "Visão geral, conteúdo, ideias e relatório.", ultimaTentativa: null, ultimoSucesso: null, ultimoErro: null, dadoAte: null });
    }
    for (const l of c.linhas) {
      const flag = FLAG[l.fonte];
      if (!flag || !f?.[flag]) continue; // fonte desligada: não é problema
      const p = problemaDaLinha(c, l);
      if (p) out.push(p);
    }
    for (const q of c.qualidade ?? []) {
      const p = problemaDeQualidade(c, q);
      if (p) out.push(p);
    }
  }
  return out.sort(
    (a, b) => ORDEM_GRAVIDADE[a.gravidade] - ORDEM_GRAVIDADE[b.gravidade] || ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] || a.cliente.localeCompare(b.cliente),
  );
}

export interface ResumoProblemas {
  total: number;
  porGravidade: Record<Gravidade, number>;
  porTipo: Record<TipoProblema, number>;
  porQuem: Record<QuemResolve, number>;
  clientesAfetados: number;
  prioridade: ProblemaFonte | null; // o primeiro a atacar: alta e nosso, senão o mais grave
}

export function resumirProblemas(ps: ProblemaFonte[]): ResumoProblemas {
  const porGravidade: Record<Gravidade, number> = { alta: 0, media: 0, baixa: 0 };
  const porTipo: Record<TipoProblema, number> = { falha_tecnica: 0, cliente: 0, sem_dado_origem: 0, config_incompleta: 0 };
  const porQuem: Record<QuemResolve, number> = { equipe: 0, cliente: 0, meta: 0, ninguem: 0 };
  for (const p of ps) {
    porGravidade[p.gravidade]++;
    porTipo[p.tipo]++;
    porQuem[p.quem]++;
  }
  const ordenados = [...ps].sort((a, b) => ORDEM_GRAVIDADE[a.gravidade] - ORDEM_GRAVIDADE[b.gravidade] || (a.quem === "equipe" ? 0 : 1) - (b.quem === "equipe" ? 0 : 1));
  return { total: ps.length, porGravidade, porTipo, porQuem, clientesAfetados: new Set(ps.map((p) => p.clientId)).size, prioridade: ordenados[0] ?? null };
}

export interface FiltroProblemas {
  fonte?: string;
  cliente?: string;
  gravidade?: Gravidade;
  quem?: QuemResolve;
  tipo?: TipoProblema;
}

export function filtrarProblemas(ps: ProblemaFonte[], f: FiltroProblemas): ProblemaFonte[] {
  return ps.filter(
    (p) => (!f.fonte || p.fonte === f.fonte) && (!f.cliente || p.clientId === f.cliente) && (!f.gravidade || p.gravidade === f.gravidade) && (!f.quem || p.quem === f.quem) && (!f.tipo || p.tipo === f.tipo),
  );
}
