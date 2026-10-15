// SAP · Plano de Rastreamento e Mensuração (05.03). Lógica pura (teste: scripts/test-sap-rastreamento.ts).
// Checklist de teste antes de subir anúncio (seção 9), recheck da categoria saúde e bem-estar (seção 7) e
// leitura da fila de conversões offline (seção 6). Nenhum token passa pelo painel: credenciais ficam no n8n.

export type Obrigatoriedade = "sim" | "se_pagina" | "se_google" | "se_formulario" | "se_whatsapp" | "se_sem_restricao" | "recomendado";
export interface TesteRastreio { n: number; nome: string; como: string; evidencia: string; obrigatorio: Obrigatoriedade }

const T = (n: number, nome: string, como: string, evidencia: string, obrigatorio: Obrigatoriedade): TesteRastreio => ({ n, nome, como, evidencia, obrigatorio });

export const TESTES_RASTREIO: TesteRastreio[] = [
  T(1, "Acessos", "Conta de anúncios, conjunto de dados, Google Ads e domínio acessíveis pela DC; BM com 2 administradores da clínica", "Print das permissões", "sim"),
  T(2, "Domínio verificado na Meta", "Configurações do negócio > Domínios", "Print", "sim"),
  T(3, "Categoria saúde e bem-estar", "Gerenciador de Eventos > conjunto > Configurações > Gerenciar categorias de fonte de dados", "Print e status registrado", "sim"),
  T(4, "Pixel dispara", "Abrir a página com a extensão de diagnóstico do pixel; ver PageView e Lead", "Print do Testar eventos", "se_pagina"),
  T(5, "CAPI chega e deduplica", "Testar eventos: o mesmo envio aparece por navegador e servidor, marcado como deduplicado", "Print", "se_pagina"),
  T(6, "Qualidade de correspondência", "Gerenciador de Eventos, evento Lead", "Print da nota", "recomendado"),
  T(7, "Tag do Google e conversões", "Assistente de tags; status da ação de conversão; diagnóstico das conversões otimizadas", "Print", "se_google"),
  T(8, "UTMs persistem", "Clicar no anúncio em pré-visualização, enviar formulário, conferir UTMs e gclid/fbc nos campos ocultos", "Linha do lead de teste", "sim"),
  T(9, "Formulário instantâneo", "Ferramenta de teste de leads da Meta; lead chega ao n8n/CRM em até 1 min", "Print + linha", "se_formulario"),
  T(10, "Pontuação", "Enviar 3 testes (um A, um B, um C) e conferir a classificação e o destino", "3 linhas", "sim"),
  T(11, "Aviso à recepção", "Lead A gera aviso no WhatsApp da recepção em até 1 min", "Print", "sim"),
  T(12, "WhatsApp rastreado", "Link com mensagem pré-preenchida com código; conversa chega com o código; recepção sabe registrar", "Print", "se_whatsapp"),
  T(13, "Etapas offline", "Marcar agendou, compareceu e fechou no lead de teste; conferir chegada na Meta e no Google", "Prints", "se_sem_restricao"),
  T(14, "Tracker", "Lead de teste aparece no Tracker em cada etapa", "Print", "sim"),
  T(15, "LGPD", "Caixa de consentimento visível; nenhum termo de saúde em URL, evento ou público", "Print + revisão", "sim"),
  T(16, "Plano B pronto", "Planilha manual com os mesmos campos e a recepção sabe usar", "Link", "sim"),
];

/** Testes a repetir a cada mudança de página, formulário ou ferramenta (seção 12). */
export const TESTES_REPETIR = [4, 5, 8, 9, 10, 14];

export type StatusTeste = "pendente" | "aprovado" | "reprovado" | "nao_se_aplica";
export interface RegistroTeste { item: number; status: StatusTeste; evidencia: string | null; feito_em: string | null }
export type CategoriaMeta = "sem_restricao" | "basica" | "intermediaria" | "total";

export const ROTULO_CATEGORIA: Record<CategoriaMeta, string> = {
  sem_restricao: "Sem restrição",
  basica: "Configuração básica",
  intermediaria: "Restrição intermediária",
  total: "Restrição total",
};

/** O que a seção 7 manda fazer em cada nível. */
export const PLANO_CATEGORIA: Record<CategoriaMeta, string> = {
  sem_restricao: "Plano completo: pixel + CAPI + devolução offline de todas as etapas, com nomes neutros.",
  basica: "Plano completo. A Meta descarta a URL depois do domínio: a leitura por UTM fica no Tracker.",
  intermediaria: "Campanhas de formulário instantâneo ou mensagem, público amplo. Devolução só do que o Gerenciador aceitar; fundo de funil no Tracker.",
  total: "Sem otimização por evento do site e sem envio de etapas à Meta. Só formulário instantâneo ou mensagem; tudo o mais medido no Tracker.",
};

export interface ResumoTestes {
  obrigatorios: { aprovados: number; total: number };
  reprovados: number[];
  faltam: number[];
  /** Todos os obrigatórios aprovados (ou fora de escopo) e conferidos pelo Coordenador. */
  liberado: boolean;
  aguardandoConferencia: boolean;
}

/** "Não se aplica" só vale para item condicional (página, Google, formulário, WhatsApp) ou recomendado; o 13 também
 *  pode sair do escopo quando a categoria é intermediária ou total. Item "sim" nunca é dispensado. */
export function dispensavel(t: TesteRastreio, categoria: CategoriaMeta | null): boolean {
  if (t.obrigatorio === "sim") return false;
  if (t.obrigatorio === "se_sem_restricao") return categoria === "intermediaria" || categoria === "total";
  return true;
}

export function resumoTestes(regs: RegistroTeste[], categoria: CategoriaMeta | null, conferidoPor: string | null): ResumoTestes {
  const m = new Map(regs.map((r) => [r.item, r]));
  const exigidos = TESTES_RASTREIO.filter((t) => t.obrigatorio !== "recomendado");
  const ok = (t: TesteRastreio) => {
    const st = m.get(t.n)?.status ?? "pendente";
    return st === "aprovado" || (st === "nao_se_aplica" && dispensavel(t, categoria));
  };
  const aprovados = exigidos.filter(ok).length;
  const reprovados = TESTES_RASTREIO.filter((t) => m.get(t.n)?.status === "reprovado").map((t) => t.n);
  const faltam = exigidos.filter((t) => !ok(t)).map((t) => t.n);
  const tudo = faltam.length === 0 && categoria !== null;
  return {
    obrigatorios: { aprovados, total: exigidos.length },
    reprovados,
    faltam,
    liberado: tudo && !!conferidoPor,
    aguardandoConferencia: tudo && !conferidoPor,
  };
}

/** Recheck da categoria: no D18, antes de subir (D27) e a cada 15 dias até o D90. */
export function recheckCategoria(verificadaEm: string | null, hoje: string): { vencido: boolean; dias: number | null } {
  if (!verificadaEm) return { vencido: true, dias: null };
  const dias = Math.round((Date.parse(hoje) - Date.parse(verificadaEm)) / 86_400_000);
  return { vencido: dias > 15, dias };
}

export type StatusConversao = "pendente" | "enviado" | "falhou" | "expirado" | "bloqueado" | "sem_dados";
export interface LinhaConversao { etapa: "EtapaA" | "EtapaB" | "EtapaC" | "EtapaD"; plataforma: "meta" | "google"; status: StatusConversao; motivo: string | null; ocorreu_em: string; enviado_em: string | null }

export const ETAPAS_NEUTRAS: { etapa: LinhaConversao["etapa"]; marco: string }[] = [
  { etapa: "EtapaA", marco: "Lead qualificado (A ou B)" },
  { etapa: "EtapaB", marco: "Agendou" },
  { etapa: "EtapaC", marco: "Compareceu" },
  { etapa: "EtapaD", marco: "Fechou (com valor em R$)" },
];

export interface ResumoFila {
  porStatus: Record<StatusConversao, number>;
  /** Pendentes com mais de 5 dias: a 2 dias de perder o prazo de 7 dias da Meta. */
  metaPertoDeExpirar: number;
  /** Fração das etapas que não podem ir por falta de telefone/e-mail no CRM. */
  semDadosPct: number | null;
  ultimoEnvio: string | null;
}

export function resumoFila(linhas: LinhaConversao[], plataforma: "meta" | "google", agoraIso: string): ResumoFila {
  const porStatus: Record<StatusConversao, number> = { pendente: 0, enviado: 0, falhou: 0, expirado: 0, bloqueado: 0, sem_dados: 0 };
  let perto = 0;
  let ultimo: string | null = null;
  const agora = Date.parse(agoraIso);
  const da = linhas.filter((l) => l.plataforma === plataforma);
  for (const l of da) {
    porStatus[l.status]++;
    if (plataforma === "meta" && l.status === "pendente" && agora - Date.parse(l.ocorreu_em) > 5 * 86_400_000) perto++;
    if (l.enviado_em && (!ultimo || l.enviado_em > ultimo)) ultimo = l.enviado_em;
  }
  return {
    porStatus,
    metaPertoDeExpirar: perto,
    semDadosPct: da.length ? porStatus.sem_dados / da.length : null,
    ultimoEnvio: ultimo,
  };
}
