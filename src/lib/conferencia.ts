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
  clientId?: string; // para ações por cliente (ex.: "É intencional")
  fontesFaltando?: ("instagram" | "anuncios" | "crm")[]; // só em "sem_fonte"
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

// ---------------------------------------------------------------- fonte não ligada (agrupada)

export type FonteObrigatoria = "instagram" | "anuncios" | "crm";
export const NOME_FONTE_OBRIG: Record<FonteObrigatoria, string> = { instagram: "Instagram", anuncios: "Anúncios", crm: "CRM" };

/** Fontes que faltam num ponto "sem_fonte". Conferências antigas não guardavam a lista: lê do título ("Sem anúncios, CRM ligado"). */
export function fontesFaltando(a: Achado): FonteObrigatoria[] {
  if (a.tipo !== "sem_fonte") return [];
  if (a.fontesFaltando?.length) return a.fontesFaltando;
  const t = a.titulo.toLowerCase();
  return (["instagram", "anuncios", "crm"] as FonteObrigatoria[]).filter((f) => t.includes(f === "anuncios" ? "anúncios" : f));
}

export interface LinhaSemFonte {
  achado: Achado;
  clientId: string | null;
  cliente: string;
  faltando: FonteObrigatoria[]; // já sem as marcadas como "não usa"
}

/**
 * Separa a lista: pontos de prioridade alta e média primeiro (destaque), depois a tabela única de
 * "fonte não ligada" (sem o que foi marcado como intencional) e, por fim, os demais pontos de prioridade baixa.
 */
export function separarAchados(
  as: Achado[],
  naoUsa: Set<string>, // "clientId:fonte"
  idPorNome: Map<string, string> = new Map(),
): { destaque: Achado[]; semFonte: LinhaSemFonte[]; demais: Achado[] } {
  const ord = ordenarAchados(as);
  const semFonte: LinhaSemFonte[] = [];
  for (const a of ord) {
    if (a.tipo !== "sem_fonte") continue;
    const clientId = a.clientId ?? (a.cliente ? idPorNome.get(a.cliente) ?? null : null);
    const faltando = fontesFaltando(a).filter((f) => !(clientId && naoUsa.has(`${clientId}:${f}`)));
    if (faltando.length) semFonte.push({ achado: a, clientId, cliente: a.cliente ?? "—", faltando });
  }
  return {
    destaque: ord.filter((a) => a.tipo !== "sem_fonte" && a.gravidade !== "baixa"),
    semFonte,
    demais: ord.filter((a) => a.tipo !== "sem_fonte" && a.gravidade === "baixa"),
  };
}
