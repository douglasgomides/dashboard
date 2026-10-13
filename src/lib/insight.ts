// Contrato único de "inteligência acionável" do Hub.
//
// Toda tela que tira uma conclusão devolve Insights neste formato — nunca um
// número solto. A tela Resultado junta os insights de todas as áreas e monta
// "o que fazer nesta semana" ordenando por prioridade.
//
// Regras de escrita (valem para todo texto de insight):
// - linguagem de quem não é de marketing: nada de "mediana", "CTR", "CPM",
//   "taxa" sem explicar. Diga "o post típico", "de cada 100 pessoas que viram,
//   2 clicaram", "custo para aparecer para mil pessoas".
// - a ação é específica e verificável ("Pausar a campanha X e passar R$ 300
//   para a Y"), nunca genérica ("otimizar campanhas").
// - a evidência traz os números que sustentam a frase, para conferir.
// - sem dado suficiente, não vira insight: vira Limitacao.

export type Area = "resumo" | "conteudo" | "anuncios" | "comercial" | "ideias";
export type Tom = "bom" | "atencao" | "ruim";
export type Confianca = "alta" | "media" | "baixa";
export type Impacto = "alto" | "medio" | "baixo";
export type Responsavel = "medico" | "social_media" | "gestor_trafego" | "atendimento" | "comercial" | "equipe_hub";

export interface Insight {
  id: string;
  area: Area;
  tom: Tom;
  titulo: string; // o que aconteceu, numa frase
  diagnostico: string; // por que aconteceu / o que significa
  evidencia: string; // os números usados
  confianca: Confianca;
  motivoConfianca?: string; // ex.: "40 posts em 30 dias" ou "só 6 dias com dado"
  impacto: Impacto;
  impactoTexto?: string; // ex.: "≈ 30 conversas a mais por mês com a mesma verba"
  acao?: { texto: string; rota?: string; botao?: string }; // botao: rótulo específico ("Ver as 3 campanhas para cortar")
  responsavel: Responsavel;
  risco?: string; // limitação do dado que pode mudar a conclusão
}

export interface Limitacao {
  id: string;
  area: Area;
  texto: string; // o que falta e qual conclusão fica impossível
  resolve: Responsavel; // quem resolve
  comoResolver?: string;
}

export const ROTULO_RESPONSAVEL: Record<Responsavel, string> = {
  medico: "Médico(a)",
  social_media: "Social media",
  gestor_trafego: "Gestor de tráfego",
  atendimento: "Atendimento/secretária",
  comercial: "Comercial",
  equipe_hub: "Equipe Doctor Creator",
};
export const ROTULO_CONFIANCA: Record<Confianca, string> = { alta: "Confiança alta", media: "Confiança média", baixa: "Confiança baixa" };
export const ROTULO_IMPACTO: Record<Impacto, string> = { alto: "Impacto alto", medio: "Impacto médio", baixo: "Impacto baixo" };
export const ROTULO_TOM: Record<Tom, string> = { bom: "Bom", atencao: "Atenção", ruim: "Ruim" };

// Prioridade para "o que fazer nesta semana": o que está ruim e pesa mais vem
// primeiro; confiança baixa desce; o que está bom só entra para repetir.
const P_TOM: Record<Tom, number> = { ruim: 3, atencao: 2, bom: 1 };
const P_IMP: Record<Impacto, number> = { alto: 3, medio: 2, baixo: 1 };
const P_CONF: Record<Confianca, number> = { alta: 1, media: 0.8, baixa: 0.4 };
export function prioridade(i: Insight): number {
  return P_TOM[i.tom] * P_IMP[i.impacto] * P_CONF[i.confianca];
}
export function ordenarPorPrioridade(xs: Insight[]): Insight[] {
  return [...xs].sort((a, b) => prioridade(b) - prioridade(a));
}

// Confiança a partir do tamanho da amostra e da cobertura de dias.
export function confiancaPorAmostra(amostra: number, minimo: number, cobertura = 1): Confianca {
  if (amostra < minimo || cobertura < 0.6) return "baixa";
  if (amostra >= minimo * 3 && cobertura >= 0.9) return "alta";
  return "media";
}
