// Cobertura do CRM por clínica (só equipe, D-06): quanto de cada número está medido ("N de M") e quem fecha cada
// lacuna (Cliente / Equipe / Nós). Regras fixas, sem IA e sem comparar com outra clínica (D-04): a régua é a própria
// clínica. Os números vêm da função crm_cobertura (plano 07); as fontes, da regra única de src/lib/status-fonte.ts.
import { statusDaFonte, FONTES, type FonteId } from "@/lib/status-fonte";

export type Quem = "Cliente" | "Equipe" | "Nós";

export interface DadosCobertura {
  origem: { leads: number; com_origem: number; por_como?: Record<string, number>; sem_traducao: number; checkout: number };
  valor: { ganhos: number; com_valor: number };
  etapas: { com_card: number; com_papel: number };
  compareceu: { estado: "sem_etapa" | "sem_uso" | "medido"; etapas: number; entradas_30d: number };
  tem_crm: boolean;
}

/** Uma fonte do cliente: se está no cadastro e a linha de status (client_sync_status ou a leitura reserva). */
export interface FonteDaCobertura {
  fonte: FonteId;
  cadastro: boolean;
  data_ate: string | null;
  last_error?: string | null;
  last_success_at?: string | null;
  motivo?: string | null;
  motivo_dono?: string | null;
}

export interface Lacuna {
  quem: Quem;
  texto: string;
  oQueFazer: string;
}

export type EstadoLinha = "completo" | "parcial" | "falta" | "nao_se_aplica";

export interface LinhaCobertura {
  id: "origem" | "valor" | "etapas" | "compareceu" | "fontes" | "leitura" | "crm";
  rotulo: string;
  /** Medido. null = a linha não é "N de M" (ex.: compareceu). */
  n: number | null;
  m: number | null;
  /** Fração medida (0 a 100) para a barra; null = sem barra. */
  pct: number | null;
  estado: EstadoLinha;
  /** O que aparece à direita: "40 de 100", "Nenhum ganho em 90 dias"... */
  resumo: string;
  lacunas: Lacuna[];
}

/** Origens que uma pessoa pode confirmar: as classes de crm_origem_classifica, mais o canal genérico. */
export const ORIGEM_GENERICA = "Genérico (não diz a origem)";
export const ORIGENS_PERMITIDAS = [
  "Indicação",
  "Google",
  "TikTok",
  "YouTube",
  "Anúncio",
  "Prospecção ativa",
  "Instagram",
  "Site",
  "Formulário",
  "Disparo para lista",
  "Base importada",
  "Paciente antigo",
  ORIGEM_GENERICA,
] as const;
export type OrigemPermitida = (typeof ORIGENS_PERMITIDAS)[number];

/**
 * Lacunas de leitura nossas ainda abertas (dado que o CRM manda e o Nexo não lê). Lista fixa, editada à mão quando um
 * achado novo aparece; vazia quando a fase "Dados do CRM completos" termina.
 */
export const LACUNAS_DE_LEITURA: readonly { texto: string; oQueFazer: string }[] = [];

const NOME_DA_FONTE: Record<FonteId, string> = {
  crm: "CRM",
  atendimento: "WhatsApp / atendimento",
  instagram: "Instagram",
  anuncios: "Anúncios",
};

const int = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const fmt = (n: number) => n.toLocaleString("pt-BR");
const plural = (n: number, um: string, varios: string) => `${fmt(n)} ${n === 1 ? um : varios}`;

function linhaNdeM(
  id: LinhaCobertura["id"],
  rotulo: string,
  n: number,
  m: number,
  semBase: string,
  lacunas: Lacuna[],
): LinhaCobertura {
  if (m <= 0) return { id, rotulo, n: null, m: null, pct: null, estado: "nao_se_aplica", resumo: semBase, lacunas: [] };
  const medido = Math.min(n, m);
  const estado: EstadoLinha = medido >= m ? "completo" : medido === 0 ? "falta" : "parcial";
  return { id, rotulo, n: medido, m, pct: (medido / m) * 100, estado, resumo: `${fmt(medido)} de ${fmt(m)}`, lacunas: medido >= m ? [] : lacunas };
}

function linhaOrigem(o: DadosCobertura["origem"]): LinhaCobertura {
  const leads = int(o?.leads);
  const com = Math.min(int(o?.com_origem), leads);
  const semTraducao = Math.min(int(o?.sem_traducao), leads - com);
  const resto = leads - com - semTraducao;
  const checkout = Math.min(int(o?.checkout), resto);
  const lacunas: Lacuna[] = [];
  if (semTraducao > 0) {
    lacunas.push({ quem: "Equipe", texto: `${plural(semTraducao, "lead", "leads")} de canal ou funil sem tradução`, oQueFazer: "confirmar a origem na lista abaixo" });
  }
  if (resto > 0) {
    const compra = checkout > 0 ? ` · ${fmt(checkout)} criados pela compra` : "";
    lacunas.push({ quem: "Cliente", texto: `${plural(resto, "lead", "leads")} sem campo de origem no CRM${compra}`, oQueFazer: "preencher a origem ao criar o lead" });
  }
  return linhaNdeM("origem", "Origem dos leads · 30 dias", com, leads, "Nenhum lead em 30 dias", lacunas);
}

function linhaValor(v: DadosCobertura["valor"]): LinhaCobertura {
  const ganhos = int(v?.ganhos);
  const com = Math.min(int(v?.com_valor), ganhos);
  const falta = ganhos - com;
  return linhaNdeM("valor", "Venda com valor · ganhos de 90 dias", com, ganhos, "Nenhum ganho em 90 dias", [
    { quem: "Cliente", texto: `${plural(falta, "ganho", "ganhos")} sem valor`, oQueFazer: "lançar o valor ao marcar ganho" },
  ]);
}

function linhaEtapas(e: DadosCobertura["etapas"]): LinhaCobertura {
  const comCard = int(e?.com_card);
  const comPapel = Math.min(int(e?.com_papel), comCard);
  const falta = comCard - comPapel;
  return linhaNdeM("etapas", "Etapas com papel", comPapel, comCard, "Nenhuma etapa com card", [
    { quem: "Equipe", texto: `${plural(falta, "etapa", "etapas")} sem papel`, oQueFazer: "dar o papel na aba Etapas" },
  ]);
}

function linhaCompareceu(c: DadosCobertura["compareceu"]): LinhaCobertura {
  const base = { id: "compareceu" as const, rotulo: "Compareceu", n: null, m: null, pct: null };
  if (c?.estado === "medido") {
    return { ...base, estado: "completo", resumo: `Medido · ${plural(int(c.entradas_30d), "entrada", "entradas")} em 30 dias`, lacunas: [] };
  }
  if (c?.estado === "sem_uso") {
    return {
      ...base,
      estado: "parcial",
      resumo: "Etapa existe, sem uso em 30 dias",
      lacunas: [{ quem: "Cliente", texto: "Ninguém entrou na etapa em 30 dias", oQueFazer: "mover o card para a etapa quando o paciente vier" }],
    };
  }
  return {
    ...base,
    estado: "falta",
    resumo: "Sem etapa de comparecimento",
    lacunas: [{ quem: "Cliente", texto: "O funil não tem etapa de comparecimento", oQueFazer: "criar a etapa Compareceu" }],
  };
}

/** Fonte funcionando: verde, amarela ou "Sem movimento" (rodou sem erro, a origem só não teve atividade). */
function lacunaDaFonte(f: FonteDaCobertura, hoje?: string): Lacuna | null {
  const nome = NOME_DA_FONTE[f.fonte];
  const s = statusDaFonte(
    {
      fonte: f.fonte,
      cadastro: f.cadastro,
      data_ate: f.data_ate,
      last_error: f.last_error ?? null,
      ultimo_sucesso: f.last_success_at ?? null,
      motivo: f.motivo ?? null,
      motivo_dono: f.motivo_dono ?? null,
    },
    hoje,
  );
  if (!s.ligado) return { quem: "Equipe", texto: `${nome} não ligado`, oQueFazer: "ligar a fonte com o acesso do cliente" };
  if (s.rotulo === "Parada pelo cliente") {
    return { quem: "Cliente", texto: `${nome} parado pelo cliente`, oQueFazer: "resolver a pendência na conta da clínica" };
  }
  if (s.cor === "vermelho") return { quem: "Equipe", texto: `${nome}: ${s.rotulo.toLowerCase()}`, oQueFazer: "conferir a atualização da fonte" };
  return null;
}

function linhaFontes(fontes: FonteDaCobertura[], hoje?: string): LinhaCobertura {
  const porFonte = new Map(fontes.map((f) => [f.fonte, f]));
  const todas = FONTES.map((id) => porFonte.get(id) ?? { fonte: id, cadastro: false, data_ate: null });
  const lacunas = todas.map((f) => lacunaDaFonte(f, hoje)).filter((l): l is Lacuna => !!l);
  return linhaNdeM("fontes", "Fontes ligadas e em dia", todas.length - lacunas.length, todas.length, "Nenhuma fonte", lacunas);
}

function linhaLeitura(abertas: readonly { texto: string; oQueFazer: string }[]): LinhaCobertura {
  const lacunas = abertas.map((l) => ({ quem: "Nós" as const, texto: l.texto, oQueFazer: l.oQueFazer }));
  return {
    id: "leitura",
    rotulo: "Dado que o CRM manda e o Nexo lê",
    n: null,
    m: null,
    pct: null,
    estado: lacunas.length ? "parcial" : "completo",
    resumo: lacunas.length ? plural(lacunas.length, "leitura pendente", "leituras pendentes") : "Nada pendente",
    lacunas,
  };
}

/** Monta as linhas da cobertura. `hoje` (AAAA-MM-DD) só para teste; `leitura` é a lista fixa de lacunas nossas. */
export function montarCobertura(
  dados: DadosCobertura,
  fontes: FonteDaCobertura[],
  opcoes: { hoje?: string; leitura?: readonly { texto: string; oQueFazer: string }[] } = {},
): LinhaCobertura[] {
  if (!dados?.tem_crm) {
    return [
      {
        id: "crm",
        rotulo: "CRM",
        n: null,
        m: null,
        pct: null,
        estado: "falta",
        resumo: "CRM não ligado",
        lacunas: [{ quem: "Equipe", texto: "CRM não ligado", oQueFazer: "ligar o CRM da clínica em Integrações" }],
      },
    ];
  }
  return [
    linhaOrigem(dados.origem),
    linhaValor(dados.valor),
    linhaEtapas(dados.etapas),
    linhaCompareceu(dados.compareceu),
    linhaFontes(fontes, opcoes.hoje),
    linhaLeitura(opcoes.leitura ?? LACUNAS_DE_LEITURA),
  ];
}

/** A função do banco ainda não existe (migração do plano 07 não aplicada): PostgREST PGRST202, 42883 ou 404. */
export function rpcAusente(erro: unknown): boolean {
  const e = erro as { code?: string; status?: number; message?: string } | null;
  return !!e && (e.code === "PGRST202" || e.code === "42883" || e.status === 404 || /could not find the function|does not exist/i.test(e.message ?? ""));
}

export const AVISO_SEM_REGRA = "Falta dado: a regra nova ainda não foi aplicada no banco";
