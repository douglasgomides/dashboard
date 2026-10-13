import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, ChevronDown, Wrench } from "lucide-react";
import { getQualidadeDados, getCrmBaseViva, type ProblemaDado } from "@/lib/client-data";
import { ROTULO_RESPONSAVEL, type Responsavel } from "@/lib/insight";

// "Dado com erro": o que está entrando errado na origem (CRM, Instagram, anúncios),
// a causa provável e o que fazer para corrigir. Regras fixas no banco (qualidade_dados).

const FONTE: Record<string, string> = { crm: "CRM", instagram: "Instagram", anuncios: "Anúncios", atendimento: "WhatsApp", comentarios: "Comentários" };

export function useQualidadeDados(clientId: string) {
  return useQuery({ queryKey: ["qualidade-dados", clientId], queryFn: () => getQualidadeDados(clientId), staleTime: 10 * 60_000, retry: false });
}

function Item({ p, aberto: abertoInicial }: { p: ProblemaDado; aberto?: boolean }) {
  const [aberto, setAberto] = useState(!!abertoInicial);
  const alta = p.severidade === "alta";
  const Icon = alta ? AlertOctagon : AlertTriangle;
  return (
    <li className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="flex min-h-[48px] w-full items-start gap-3 py-3 text-left">
        <Icon size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: alta ? "var(--crit)" : "var(--warn)" }} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            {FONTE[p.fonte] ?? p.fonte} · {alta ? "afeta a leitura" : "atenção"}
          </span>
          <span className="mt-0.5 block text-[15px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
            {p.titulo}
          </span>
        </span>
        <ChevronDown size={18} aria-hidden className="mt-1 shrink-0" style={{ color: "var(--muted)", transform: aberto ? "rotate(180deg)" : undefined }} />
      </button>
      {aberto && (
        <dl className="mb-3 ml-[30px] space-y-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          <div><dt className="font-semibold" style={{ color: "var(--ink)" }}>O que os dados mostram</dt><dd>{p.evidencia}</dd></div>
          <div><dt className="font-semibold" style={{ color: "var(--ink)" }}>Causa provável</dt><dd>{p.causa}</dd></div>
          <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
            <dt className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--ink)" }}><Wrench size={14} aria-hidden /> Como corrigir</dt>
            <dd className="mt-0.5">{p.correcao}</dd>
            <dd className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Quem corrige: <b>{ROTULO_RESPONSAVEL[p.responsavel as Responsavel] ?? p.responsavel}</b></dd>
          </div>
          <div><dt className="font-semibold" style={{ color: "var(--ink)" }}>O que fica distorcido até corrigir</dt><dd>{p.afeta}</dd></div>
        </dl>
      )}
    </li>
  );
}

/** Lista de problemas de dado. `fonte` filtra (ex.: só CRM na tela Comercial). */
export function QualidadeDados({ clientId, fonte, titulo = "Dados com erro na origem", compacto = false }: { clientId: string; fonte?: string; titulo?: string; compacto?: boolean }) {
  const { data } = useQualidadeDados(clientId);
  const [todos, setTodos] = useState(false);
  const itens = (data ?? []).filter((p) => !fonte || p.fonte === fonte).sort((a, b) => (a.severidade === b.severidade ? 0 : a.severidade === "alta" ? -1 : 1));
  if (itens.length === 0) return null;
  const altas = itens.filter((p) => p.severidade === "alta").length;
  const visiveis = compacto && !todos ? itens.slice(0, 2) : itens;
  return (
    <section className="rounded-xl border px-4 pt-3 sm:px-5" style={{ background: "var(--surface)", borderColor: altas ? "var(--danger-border)" : "var(--warn-border)" }} aria-label={titulo}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {itens.length} {itens.length === 1 ? "problema" : "problemas"}{altas ? ` · ${altas} afeta${altas === 1 ? "" : "m"} a leitura` : ""}
        </span>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
        A sincronização roda sozinha todo dia. Estes problemas estão no dado que entra (CRM, Instagram, anúncios) e distorcem os números até serem corrigidos na origem.
      </p>
      <ul className="mt-1">
        {visiveis.map((p) => (
          <Item key={p.id} p={p} />
        ))}
      </ul>
      {compacto && itens.length > 2 && (
        <button type="button" onClick={() => setTodos(!todos)} className="mb-2 min-h-[44px] text-sm font-semibold" style={{ color: "var(--accent)" }}>
          {todos ? "Mostrar menos" : `Ver os ${itens.length} problemas`}
        </button>
      )}
      {!compacto && <div className="h-2" />}
    </section>
  );
}

/** Converte cada problema em recomendação operacional (entra em Oportunidades e no Início). */
export function problemasParaInsights(ps: ProblemaDado[]) {
  return ps.map((p) => ({
    id: `dado-${p.id}`,
    area: "resumo" as const,
    tom: (p.severidade === "alta" ? "ruim" : "atencao") as "ruim" | "atencao",
    titulo: p.titulo,
    diagnostico: `${p.causa} Até corrigir, fica distorcido: ${p.afeta}`,
    evidencia: p.evidencia,
    confianca: "alta" as const,
    motivoConfianca: "Contagem direta no banco, sem estimativa.",
    impacto: (p.severidade === "alta" ? "alto" : "medio") as "alto" | "medio",
    acao: { texto: p.correcao, rota: p.fonte === "crm" ? "/$clientId/crm-painel" : p.fonte === "anuncios" ? "/$clientId/anuncios" : undefined, botao: p.fonte === "crm" ? "Ver o funil do CRM" : p.fonte === "anuncios" ? "Ver anúncios" : undefined },
    responsavel: (p.responsavel as any) ?? "equipe_hub",
    regra: "Verificação fixa de qualidade dos dados (função qualidade_dados no banco): leads abertos parados há 90+ dias, CRM sem lead novo enquanto chegam conversas, origem vazia, ganho não registrado, CRM compartilhado, erro de sincronização, Instagram ou anúncio parado.",
    fonte: "Banco do Intelligence Hub (CRM, Instagram, Meta Ads, WhatsApp)",
    risco: "Recomendação sobre o dado de entrada: não diz se o resultado foi bom ou ruim, diz que a leitura está comprometida.",
  }));
}

/** Base viva x parada: quantos leads em aberto de fato estão em movimento. */
export function BaseVivaCrm({ clientId }: { clientId: string }) {
  const { data: b } = useQuery({ queryKey: ["crm-base-viva", clientId], queryFn: () => getCrmBaseViva(clientId), staleTime: 10 * 60_000, retry: false });
  if (!b) return null;
  const pct = (x: number) => `${Math.round((x / b.abertos) * 100)}%`;
  const fmt = (x: number) => x.toLocaleString("pt-BR");
  const meio = Math.max(0, b.abertos - b.vivos_30d - b.parados_90d);
  const partes = [
    { rot: "Em movimento (últimos 30 dias)", v: b.vivos_30d, cor: "var(--good)" },
    { rot: "Sem movimento de 30 a 90 dias", v: meio, cor: "var(--warn)" },
    { rot: "Parados há 90+ dias", v: b.parados_90d, cor: "var(--crit)" },
  ];
  return (
    <section className="rounded-xl border p-4 sm:p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }} aria-label="Base viva do CRM">
      <h2 className="text-[15px] font-semibold">Leads em aberto: quantos estão vivos</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
        Dos <b>{fmt(b.abertos)}</b> leads em aberto no CRM, <b>{fmt(b.vivos_30d)}</b> ({pct(b.vivos_30d)}) tiveram alguma movimentação nos últimos 30 dias.
        {b.parados_90d > 0 && <> <b>{fmt(b.parados_90d)}</b> ({pct(b.parados_90d)}) estão parados há mais de 90 dias: é estoque, não fila de atendimento.</>}
      </p>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label={partes.map((p) => `${p.rot}: ${fmt(p.v)}`).join("; ")}>
        {partes.map((p) => (p.v > 0 ? <span key={p.rot} style={{ width: `${(p.v / b.abertos) * 100}%`, background: p.cor }} /> : null))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--ink-2)" }}>
        {partes.map((p) => (
          <li key={p.rot} className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: p.cor }} />{p.rot}: {fmt(p.v)}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        Os números de “base” mais abaixo continuam contando todos os leads (a definição não mudou). Para ler o funil de hoje, olhe os do período. Movimentação = última atualização do lead no CRM; uma edição em massa (importação, troca de etapa em lote) conta como movimento. Como corrigir: no CRM, mover os parados para “perdido” com o motivo, ou para um funil de reativação.
      </p>
    </section>
  );
}
