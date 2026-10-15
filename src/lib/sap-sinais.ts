// SAP · confirmação, remarcação, motivos de não fechamento e auditoria semanal (06.06, 06.09, 07.06, 07.07, 08.05).
// Lógica pura (teste: scripts/test-sap-sinais.ts). Vira gatilhos de vazamento na leitura da semana:
//   V8  confirmação até a véspera abaixo de 85% (meta da Sessão 4)
//   V9  "remarcou" acima de 10% dos agendados
//   V12 preço, medo ou comparação acima de 40% dos não fechamentos (com 10 ou mais motivos)
//   V13 tempo para decidir ou cônjuge acima de 40% dos não fechamentos, ou "pensando" em cadência abaixo de 90%
//   V14 F1 em até 24 h abaixo de 90% (meta da Sessão 5)

export const CATEGORIAS_MOTIVO = ["Preço", "Tempo para decidir", "Cônjuge ou família", "Medo ou insegurança", "Comparando com outro profissional", "Sem indicação clínica", "Outro"] as const;
export type CategoriaMotivo = (typeof CATEGORIAS_MOTIVO)[number];

export interface SinaisBrutos {
  tem_sinal_confirmado: boolean;
  tem_sinal_remarcou: boolean;
  confirmados: number;
  remarcados: number;
  perdidos_com_motivo: number;
  motivos: { categoria: CategoriaMotivo; total: number; sugeridos: number }[];
  lista: { crm_connection_id: string; motivo_id: string; nome: string; categoria: CategoriaMotivo | null; sugestao: CategoriaMotivo | null; total: number }[];
}

export interface AuditoriaSemana {
  semana: string;
  conversas: number | null;
  nota_media: number | null; // 0 a 12
  confirmacao_vespera: number | null; // 0 a 1
  f1_24h: number | null;
  pensando_cadencia: number | null;
  observacao: string | null;
}

export const METAS_ATENDIMENTO = { confirmacao: 0.85, remarcacaoMax: 0.1, f1: 0.9, pensando: 0.9, nota: 10, motivosMin: 10, concentracao: 0.4 };

export function lerSinais(raw: unknown): SinaisBrutos | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const n = (v: unknown) => Number(v) || 0;
  return {
    tem_sinal_confirmado: !!r.tem_sinal_confirmado,
    tem_sinal_remarcou: !!r.tem_sinal_remarcou,
    confirmados: n(r.confirmados),
    remarcados: n(r.remarcados),
    perdidos_com_motivo: n(r.perdidos_com_motivo),
    motivos: ((r.motivos ?? []) as any[]).map((m) => ({ categoria: m.categoria, total: n(m.total), sugeridos: n(m.sugeridos) })),
    lista: ((r.lista ?? []) as any[]).map((m) => ({ ...m, total: n(m.total) })),
  };
}

export interface IndicadoresAtendimento {
  confirmacao: { valor: number | null; fonte: "crm" | "auditoria" | null };
  remarcacao: number | null;
  f1: number | null;
  pensando: number | null;
  nota: number | null;
  motivos: { categoria: string; total: number; parte: number }[];
  totalMotivos: number;
  gatilhos: { codigo: "V8" | "V9" | "V12" | "V13" | "V14"; motivo: string }[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** `agendados`: agendados do mesmo período (tracker automático). `auditoria`: a semana mais recente lançada. */
export function indicadoresAtendimento(s: SinaisBrutos | null, agendados: number, auditoria: AuditoriaSemana | null): IndicadoresAtendimento {
  const M = METAS_ATENDIMENTO;
  const confCrm = s?.tem_sinal_confirmado && agendados > 0 ? Math.min(1, s.confirmados / agendados) : null;
  const confirmacao = confCrm !== null ? { valor: confCrm, fonte: "crm" as const } : auditoria?.confirmacao_vespera != null ? { valor: Number(auditoria.confirmacao_vespera), fonte: "auditoria" as const } : { valor: null, fonte: null };
  const remarcacao = s?.tem_sinal_remarcou && agendados > 0 ? s.remarcados / agendados : null;
  const totalMotivos = (s?.motivos ?? []).reduce((a, m) => a + m.total, 0);
  const motivos = (s?.motivos ?? []).map((m) => ({ categoria: m.categoria, total: m.total, parte: totalMotivos ? m.total / totalMotivos : 0 }));
  const parte = (...cats: string[]) => motivos.filter((m) => cats.includes(m.categoria)).reduce((a, m) => a + m.parte, 0);
  const f1 = auditoria?.f1_24h != null ? Number(auditoria.f1_24h) : null;
  const pensando = auditoria?.pensando_cadencia != null ? Number(auditoria.pensando_cadencia) : null;

  const gatilhos: IndicadoresAtendimento["gatilhos"] = [];
  if (confirmacao.valor !== null && confirmacao.valor < M.confirmacao)
    gatilhos.push({ codigo: "V8", motivo: `Confirmação até a véspera em ${pct(confirmacao.valor)} (meta ${pct(M.confirmacao)})${confirmacao.fonte === "auditoria" ? ", pela auditoria da semana" : ""}.` });
  if (remarcacao !== null && agendados >= 10 && remarcacao > M.remarcacaoMax)
    gatilhos.push({ codigo: "V9", motivo: `${pct(remarcacao)} dos agendados remarcaram (limite ${pct(M.remarcacaoMax)}).` });
  if (totalMotivos >= M.motivosMin) {
    const objecao = parte("Preço", "Medo ou insegurança", "Comparando com outro profissional");
    if (objecao > M.concentracao) gatilhos.push({ codigo: "V12", motivo: `Preço, medo ou comparação somam ${pct(objecao)} dos não fechamentos (${totalMotivos} com motivo).` });
    const semPasso = parte("Tempo para decidir", "Cônjuge ou família");
    if (semPasso > M.concentracao) gatilhos.push({ codigo: "V13", motivo: `"Tempo para decidir" ou "cônjuge" somam ${pct(semPasso)} dos não fechamentos.` });
  }
  if (pensando !== null && pensando < M.pensando && !gatilhos.some((g) => g.codigo === "V13"))
    gatilhos.push({ codigo: "V13", motivo: `Só ${pct(pensando)} dos "pensando" com cadência ativa (meta ${pct(M.pensando)}).` });
  if (f1 !== null && f1 < M.f1) gatilhos.push({ codigo: "V14", motivo: `F1 em até 24 h em ${pct(f1)} das consultas sem fechamento (meta ${pct(M.f1)}).` });

  return { confirmacao, remarcacao, f1, pensando, nota: auditoria?.nota_media != null ? Number(auditoria.nota_media) : null, motivos, totalMotivos, gatilhos };
}

// ---------------------------------------------------------------- sugestão da IA para a auditoria (06.09)

export const ROTULO_FALHA: Record<string, string> = {
  sem_resposta: "sem resposta", demora: "demora para responder", desvio_preco: "desviou do preço", preco_sem_ancoragem: "preço sem explicar o valor",
  sem_cta: "sem chamar para agendar", sem_follow_up: "sem follow-up", nome_errado: "nome errado", informacao_inconsistente: "informação inconsistente",
  pressao: "pressão", so_emoji: "só emoji", desconto_reativo: "desconto reativo", excesso_audio: "excesso de áudio",
};

/** Converte a sugestão em valores do formulário: nota 0–10 da IA vira escala 0–12 da rubrica (estimativa) e as falhas
 *  mais frequentes viram o "o que corrigir no retreino". Confirmação até a véspera não sai da conversa: fica em branco. */
export function preencherComIA(s: { amostra: number; nota_media_0a10: number | null; falhas: { falha: string; n: number }[]; abertas: number; abertas_sem_follow_up: number }) {
  const nota = s.nota_media_0a10 === null ? null : Math.round(s.nota_media_0a10 * 1.2 * 10) / 10;
  const f1 = s.abertas > 0 ? Math.round(((s.abertas - s.abertas_sem_follow_up) / s.abertas) * 100) : null;
  const obs = s.falhas.slice(0, 3).map((f) => `${ROTULO_FALHA[f.falha] ?? f.falha} (${f.n})`).join("; ");
  return { conversas: s.amostra, nota, f1, obs: obs ? `IA: ${obs}` : "" };
}
