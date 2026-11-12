// Tipos da leitura por regra (Phase 3.1). A leitura é montada na hora, no navegador, só com regras fixas e modelos de
// frase em português leigo: sem IA, sem tabela, sem consulta nova (revisão do João em 10/11/2026 sobre o D-01).
// Cada tela calcula os FATOS do que ela já carrega, o portão de honestidade decide se dá para concluir, e o texto sai
// de um modelo. Módulo puro: nada daqui importa React, banco ou rede.
import type { Responsavel } from "@/lib/insight";

/**
 * Um id por tela viva da clínica e da equipe. São 43 rotas; a rota /ideias tem 3 visões, cada uma com a própria
 * leitura (roteiros, semana, encontrar), por isso são 45 ids.
 */
export type TelaId =
  | "resultados" | "pacientes" | "consultas" | "vendas" | "relatorio"
  | "conteudo" | "top" | "posts" | "audiencia" | "conteudo-comercial"
  | "anuncios" | "campanhas" | "links"
  | "ideias-roteiros" | "ideias-semana" | "ideias-encontrar" | "inteligencia-criativa" | "inspiracao" | "duvidas"
  | "central-atendimento" | "atendimento"
  | "crm-contatos" | "crm-painel" | "crm-guia" | "vendas-kommo" | "jornada" | "analisar" | "crm-estrutura"
  | "plano" | "reunioes" | "proximas-acoes" | "agentes" | "oportunidades" | "automacoes"
  | "carteira" | "conferencia" | "integracoes" | "configurar-cliente"
  | "caixa" | "referencia" | "relatorios-semana" | "central-agentes" | "brand-brain" | "equipe" | "assistentes-ia"
  // A tela de entrada da 03.1.1: a mesma rota que a Phase 9 evolui (D-06).
  | "hoje";

/** As 5 decisões do médico (brief do Nexo v5). D2 não é usada nesta fase. */
export type DecisaoMedico = "D1" | "D2" | "D3" | "D4" | "D5";
export const ROTULO_DECISAO: Record<DecisaoMedico, string> = {
  D1: "Onde perco paciente",
  D2: "Quem chamar hoje",
  D3: "O que trouxe paciente que fechou",
  D4: "Estou no ritmo da meta",
  D5: "O que fazer esta semana",
};

export type TomFato = "bom" | "atencao" | "ruim" | "neutro";

/** Número que sustenta a frase, já formatado para a tela (nunca um número solto sem frase). */
export interface Numeral {
  chave: string;
  exibicao: string;
  valor?: number | null;
}

/**
 * Uma barra de comparação (03.1.1, "menos texto, mais visual"). A regra já calcula a proporção: a tela só desenha, com largura
 * igual a `fracao`, e nunca refaz a conta.
 */
export interface BarraDoFato {
  /** O que a barra mede, leigo e curto ("Post de foto", "Alcance · Reels"). */
  rotulo: string;
  /** O valor ao lado da barra, já formatado ("1.230 pessoas", "12% salvam"). */
  exibicao: string;
  /** 0 a 1: o tamanho da barra em relação à maior da comparação (ou ao mínimo de dias, quando a barra mede amostra). */
  fracao: number;
  /** O que faltou (amostra abaixo do mínimo, dado ausente): a barra é listrada, nunca cheia. */
  faltou?: boolean;
}

/** A frase curta de uma comparação e as barras que a mostram. */
export interface ComparacaoDoFato {
  /** Uma frase, até 90 caracteres, em português leigo. */
  frase: string;
  /** De 1 a 4 barras. */
  barras: readonly BarraDoFato[];
}

export interface Fato {
  id: string;
  tom: TomFato;
  /** 3 pesa mais. Decide qual fato vira "O que aconteceu". */
  peso: 1 | 2 | 3;
  frase: string;
  /** Manchete curta e leiga escrita pela regra (até 40 caracteres), para a Hoje. Só existe quando a regra a escreveu. */
  manchete?: string;
  /** Comparação em barras (a regra escreve a frase curta e calcula as proporções). Só existe quando a regra a escreveu. */
  comparacao?: ComparacaoDoFato;
  numeros: Numeral[];
  /** Ressalva sobre o dado (ex.: período incompleto), não uma conclusão: só vira leitura se não houver conclusão melhor. */
  ressalva?: boolean;
  /** Tamanho da amostra que sustenta o fato (para o portão e para o texto). */
  n?: number;
}

/**
 * PROVISÓRIA (D-10): lista aceita pelo João em 10/11; a decisão aberta 9 continua dele.
 * Todo próximo passo começa por um destes verbos.
 */
export const VERBOS_PROVISORIOS = ["ligar para", "responder", "revisar", "pausar", "reforçar", "corrigir", "publicar", "conferir"] as const;
export type VerboPasso = (typeof VERBOS_PROVISORIOS)[number];

export interface PassoFato {
  verbo: VerboPasso;
  /** O resto da frase, sem o verbo e sem ponto final ("a conexão do Instagram"). */
  texto: string;
  quem: Responsavel;
  /** Por que este passo (uma frase leiga). */
  motivo?: string;
  /** Fato que sustenta o passo. */
  fatoId?: string;
  /** Arrumação interna do dado, feita pela equipe: a tela Hoje não mostra para o médico (só numa linha "Para a equipe"). */
  soEquipe?: boolean;
}

export type CodigoNegacao = "sem_dado" | "fonte_parada" | "rastreio_suspeito" | "selo_ilegivel" | "funil_fora_de_ordem" | "erro_de_dado" | "amostra_pequena";

/** O portão de honestidade (D-03): com dado incompleto ou não confiável a leitura diz o problema e para. */
export type Portao = { ok: true } | { ok: false; codigo: CodigoNegacao; motivo: string; passo: PassoFato };

export interface PeriodoLeitura {
  de: string;
  ate: string;
  /** Período anterior de mesmo tamanho, que termina no dia anterior ao início (D-06). null = sem comparação. */
  anterior: { de: string; ate: string } | null;
}

export interface FatosDaTela {
  tela: TelaId;
  versaoRegras: number;
  /** "hoje" para telas que falam da situação de agora (título "Situação de hoje"). */
  tipoPeriodo: "periodo" | "hoje";
  periodo: PeriodoLeitura;
  portao: Portao;
  fatos: Fato[];
  /** Um só (D-05): o de maior impacto. */
  proximoPasso: PassoFato | null;
  outrosPassos: PassoFato[];
}

export interface LinhaTexto {
  fatoId: string;
  frase: string;
  numeros: Numeral[];
  tom: TomFato;
  /** Barras de comparação do fato (03.1.1): a linha da leitura as desenha embaixo da frase. Só quando todas passam no filtro. */
  barras?: readonly BarraDoFato[];
}

export interface PassoTexto {
  /** Frase pronta: "Conferir a conexão do Instagram." */
  frase: string;
  verbo: VerboPasso;
  quem: Responsavel;
  rotuloQuem: string;
  motivo?: string;
}

export type TextoDaLeitura =
  | { tipo: "sem_leitura"; motivo: string; passo: PassoTexto }
  | {
      tipo: "leitura";
      aconteceu: LinhaTexto;
      porque: LinhaTexto | null;
      proximoPasso: PassoTexto | null;
      /** Quando não há passo: por que não há (nunca inventa um). */
      semPassoMotivo: string | null;
      verMais: PassoTexto[];
    };

/** Resumo da clínica (3 linhas, D-07): quem monta é o 03.1-03; o desenho já está pronto aqui. */
export type TextoDoResumo =
  | { tipo: "sem_leitura"; motivo: string; passo: PassoTexto }
  | { tipo: "resumo"; aconteceu: LinhaTexto | null; preocupa: LinhaTexto | null; acao: PassoTexto | null; semAcaoMotivo: string | null };

// ---------- período anterior (D-06) ----------
const DIA = 86_400_000;
const ms = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Mesmo número de dias, terminando no dia anterior ao início. Aritmética ao meio-dia UTC, como date-range.ts. */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const dias = Math.max(1, Math.round((ms(ate) - ms(de)) / DIA) + 1);
  return { de: iso(ms(de) - dias * DIA), ate: iso(ms(de) - DIA) };
}
