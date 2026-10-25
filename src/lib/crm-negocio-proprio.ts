export interface RegistroNegocio {
  id: string;
  pipeline_id: string | null;
  status_id: string | null;
  outcome: string | null;
  source: string | null;
  occurred_at: string | null;
  responsavel: string | null;
  motivo_perda: string | null;
}
export interface EtapaNegocio { pipeline_id: string; pipeline_name: string; status_id: string; status_name: string }
export type GrupoNegocio = "Base de conteúdo" | "Comercial e recuperação" | "Pós-venda e assinaturas" | "Sem classificação";

export function grupoNegocio(funil: string, etapa: string, fonte: string | null): GrupoNegocio {
  if (!funil) return "Sem classificação";
  if (/^(Assinaturas ativas|Assinaturas canceladas|Compras aprovadas|Reembolso\/Chargeback)$/i.test(funil)) return "Pós-venda e assinaturas";
  if (/^Instagram (Doctor|Douglas)$/i.test(funil) && /^(Base|Novo lead)$/i.test(etapa) && /material de isca/i.test(fonte ?? "")) return "Base de conteúdo";
  return "Comercial e recuperação";
}

/** Contagens por cadastro, sem inferir atendimento, intenção de compra ou pagamento. */
export function resumirNegocio(registros: RegistroNegocio[], etapas: EtapaNegocio[], desde: string, antesDe: string) {
  const catalogo = new Map(etapas.map(e => [`${e.pipeline_id}:${e.status_id}`, e]));
  const funis = new Map<string, { nome: string; total: number; abertos: number; ganhos: number; perdidos: number; semResultado: number }>();
  const grupos: Record<GrupoNegocio, number> = { "Base de conteúdo": 0, "Comercial e recuperação": 0, "Pós-venda e assinaturas": 0, "Sem classificação": 0 };
  const origens = new Map<string, number>();
  let semOrigem = 0, semResponsavel = 0, perdasSemMotivo = 0;
  const periodo = { novos: 0, ganhos: 0, perdidos: 0 };
  const vistos = new Set<string>();
  const inicio = Date.parse(desde), fim = Date.parse(antesDe);
  for (const r of registros) {
    if (vistos.has(r.id)) throw new Error("A leitura do CRM contém registros repetidos; atualize os dados.");
    vistos.add(r.id);
    const etapa = catalogo.get(`${r.pipeline_id}:${r.status_id}`);
    const nome = etapa?.pipeline_name ?? "Funil sem identificação";
    const f = funis.get(r.pipeline_id ?? "") ?? { nome, total: 0, abertos: 0, ganhos: 0, perdidos: 0, semResultado: 0 };
    f.total++;
    if (r.outcome === "open") f.abertos++;
    else if (r.outcome === "won") f.ganhos++;
    else if (r.outcome === "lost") f.perdidos++;
    else f.semResultado++;
    funis.set(r.pipeline_id ?? "", f);
    grupos[grupoNegocio(etapa?.pipeline_name ?? "", etapa?.status_name ?? "", r.source)]++;
    const fonte = r.source?.trim();
    if (!fonte) semOrigem++;
    else origens.set(fonte, (origens.get(fonte) ?? 0) + 1);
    if (r.outcome === "open" && !r.responsavel?.trim()) semResponsavel++;
    if (r.outcome === "lost" && !r.motivo_perda?.trim()) perdasSemMotivo++;
    const criado = r.occurred_at ? Date.parse(r.occurred_at) : NaN;
    if (criado >= inicio && criado < fim) {
      periodo.novos++;
      if (r.outcome === "won") periodo.ganhos++;
      if (r.outcome === "lost") periodo.perdidos++;
    }
  }
  return { total: registros.length, grupos, semOrigem, semResponsavel, perdasSemMotivo, periodo,
    funis: [...funis.values()].sort((a,b) => b.total-a.total || a.nome.localeCompare(b.nome)),
    origens: [...origens].map(([nome,total]) => ({nome,total})).sort((a,b) => b.total-a.total || a.nome.localeCompare(b.nome)),
  };
}

/** Contratos distintos: WTS retorna sessões; Clint retorna conversas e cursores parciais. */
export function resultadoImportacaoConversas(raw: unknown) {
  if (!raw || typeof raw !== "object") throw new Error("A atualização não retornou um resultado válido.");
  const r = raw as Record<string, unknown>;
  const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  if (Array.isArray(r.clint)) {
    if (!r.clint.length || r.clint.some(c => !c || typeof c !== "object" || !Array.isArray(c.erros) || typeof c.parcial !== "boolean") || typeof r.conversas !== "number") throw new Error("A Clint não informou uma cobertura válida das conversas.");
    const erros = r.clint.flatMap(c => Array.isArray(c.erros) ? c.erros : []);
    if (erros.length) throw new Error(erros.map(String).join("; "));
    return { total: count(r.conversas), completa: r.ok === true && r.clint.every(c => c.parcial === false), restantes: null };
  }
  if (typeof r.sessoes !== "number" || typeof r.restantes !== "number") throw new Error("A atualização não informou a cobertura das conversas.");
  return { total: count(r.sessoes), completa: r.restantes === 0, restantes: count(r.restantes) };
}

export interface LeituraCrmNegocio { resumo: ReturnType<typeof resumirNegocio>; conversas: { total: number; completas: number; ultimaConferencia: string | null } }
