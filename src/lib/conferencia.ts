// Conferência de dados (admin): tipos e regras de tela. O trabalho pesado roda no servidor
// (api/_lib/conferencia.ts), etapa por etapa, e cada rodada fica salva em conferencias_dados.

export type Gravidade = "alta" | "media" | "baixa";
export type EtapaId = "duplicidades" | "contas_meta" | "inconsistencias" | "parados" | "fontes_obrigatorias";

export interface Achado {
  id: string;
  gravidade: Gravidade;
  tipo: string;
  cliente: string | null;
  titulo: string;
  detalhe: string;
  acao: string;
  risco?: string;
  etapa?: EtapaId;
}

export interface Verificado {
  etapa: EtapaId;
  tipo: "conta_anuncios" | "instagram" | "crm" | "cliente" | "token";
  nome: string;
  cliente: string | null;
  ok: boolean;
  nota: string;
}

export interface RegistroEtapa {
  etapa: EtapaId;
  status: "ok" | "erro";
  achados?: number;
  verificados?: number;
  ms?: number;
  erro?: string | null;
}

export interface Conferencia {
  id: string;
  iniciada_em: string;
  concluida_em: string | null;
  etapas: RegistroEtapa[];
  achados: Achado[];
  verificados: Verificado[];
  contas_vistas_na_meta: number | null;
  tokens_testados: number | null;
}

export const ETAPAS: { id: EtapaId; nome: string; oQue: string }[] = [
  { id: "duplicidades", nome: "Duplicidades", oQue: "Mesma conta de anúncios, Instagram ou CRM ligada a mais de um cliente." },
  { id: "contas_meta", nome: "Contas na Meta", oQue: "Contas de anúncios que a Meta mostra com gasto e que não estão no painel." },
  { id: "inconsistencias", nome: "Gasto painel x Meta", oQue: "Compara o gasto dos últimos 7 dias do painel com o da Meta, conta por conta." },
  { id: "parados", nome: "Sucesso, mas parado", oQue: "Fontes que sincronizam “com sucesso” mas não trazem dado novo há dias." },
  { id: "fontes_obrigatorias", nome: "Fontes obrigatórias", oQue: "Clientes sem Instagram (obrigatório), anúncios ou CRM ligados." },
];

export const ROTULO_GRAVIDADE: Record<Gravidade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

export const ROTULO_VERIFICADO: Record<Verificado["tipo"], string> = {
  conta_anuncios: "Conta de anúncios",
  instagram: "Instagram",
  crm: "CRM",
  cliente: "Cliente",
  token: "Acesso à Meta",
};

const ORDEM: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };

export function ordenarAchados(as: Achado[]): Achado[] {
  return [...as].sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade] || (a.cliente ?? "").localeCompare(b.cliente ?? ""));
}

export function resumirConferencia(c: Pick<Conferencia, "achados" | "verificados" | "etapas">) {
  const porGravidade: Record<Gravidade, number> = { alta: 0, media: 0, baixa: 0 };
  for (const a of c.achados) porGravidade[a.gravidade]++;
  const verificados = c.verificados.length;
  const comProblema = c.verificados.filter((v) => !v.ok).length;
  const etapasComErro = c.etapas.filter((e) => e.status === "erro").map((e) => e.etapa);
  return { total: c.achados.length, porGravidade, verificados, comProblema, etapasComErro };
}

export function filtrarAchados(as: Achado[], f: { gravidade?: Gravidade; etapa?: EtapaId; cliente?: string }): Achado[] {
  return as.filter((a) => (!f.gravidade || a.gravidade === f.gravidade) && (!f.etapa || a.etapa === f.etapa) && (!f.cliente || a.cliente === f.cliente));
}

/** Situação de uma etapa na tela, a partir do que já voltou do servidor e de qual está rodando agora. */
export function estadoDaEtapa(id: EtapaId, registros: RegistroEtapa[], rodando: EtapaId | null): "pendente" | "rodando" | "ok" | "erro" {
  if (rodando === id) return "rodando";
  const r = registros.find((x) => x.etapa === id);
  return r ? r.status : "pendente";
}
