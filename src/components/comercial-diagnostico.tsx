import { useQuery } from "@tanstack/react-query";
import { ArrowDown, CheckCircle2, CircleDashed, Clock, HelpCircle, ScanSearch, TrendingDown, XCircle, type LucideIcon } from "lucide-react";
import { getDiagnosticoComercial } from "@/lib/client-data";
import {
  ROTULO_TIPO,
  fmtN,
  fmtPct,
  lerComercial,
  passamFrase,
  type Funil,
  type ItemChecklist,
  type StatusItem,
  type TipoProblema,
} from "@/lib/comercial";
import { ROTULO_FAIXA, type Faixa } from "@/lib/benchmarks";
import { ROTULO_RESPONSAVEL, type Insight, type Tom } from "@/lib/insight";
import { BotaoAcao, InsightCard, OQueE, SeloStatus } from "@/components/insight-card";

// Peças da leitura comercial ("onde o funil quebra"), usadas pelas telas
// Comercial e Jornada. A lógica está toda em src/lib/comercial.ts.

export function useDiagnosticoComercial(clientId: string, start: string, end: string) {
  return useQuery({
    queryKey: ["diagnostico-comercial", clientId, start, end],
    queryFn: async () => {
      const d = await getDiagnosticoComercial(clientId, start, end);
      return { dados: d, ...lerComercial(d) };
    },
  });
}

// ---------------------------------------------------------------- tipo de problema
const ESTILO_TIPO: Record<TipoProblema, { cor: string; icone: LucideIcon }> = {
  performance: { cor: "var(--s1)", icone: TrendingDown },
  operacao: { cor: "var(--s2)", icone: Clock },
  rastreamento: { cor: "var(--s7)", icone: ScanSearch },
};

export function SeloTipo({ tipo }: { tipo: TipoProblema }) {
  const { cor, icone: Icon } = ESTILO_TIPO[tipo];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: `color-mix(in srgb, ${cor} 14%, transparent)`,
        color: cor,
      }}
    >
      <Icon size={12} aria-hidden /> {ROTULO_TIPO[tipo].titulo}
    </span>
  );
}

const TOM_FAIXA: Record<Faixa, Tom> = {
  bom: "bom",
  ok: "atencao",
  fraco: "ruim",
};

// ---------------------------------------------------------------- funil
export function FunilOndeQuebra({ funil }: { funil: Funil }) {
  const mp = funil.maiorPerda;
  const rotulo = (id: string) => funil.passos.find((p) => p.id === id)?.rotulo.toLowerCase() ?? id;
  return (
    <div className="space-y-3">
      {mp && (
        <div
          className="rounded-xl border p-3"
          style={{
            borderColor: ESTILO_TIPO[mp.tipo].cor,
            background: `color-mix(in srgb, ${ESTILO_TIPO[mp.tipo].cor} 8%, var(--surface))`,
          }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <SeloTipo tipo={mp.tipo} />
          </div>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug">
            O funil quebra entre “{rotulo(mp.de)}” e “{rotulo(mp.para)}”: {passamFrase(mp.pct)}.
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
            {fmtN(mp.perdidos)} ficaram pelo caminho nessa passagem ({fmtPct(mp.pct)}). É a maior perda entre os passos que dá para medir.
          </p>
        </div>
      )}
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {funil.passos.map((p, i) => (
          <li
            key={p.id}
            className="relative rounded-xl border p-3"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                {i + 1}. {p.rotulo}
              </div>
              {p.faixa && <SeloStatus tom={TOM_FAIXA[p.faixa]} texto={ROTULO_FAIXA[p.faixa]} />}
              {p.estimado && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-dim)",
                  }}
                >
                  estimativa
                </span>
              )}
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{p.valor === null ? "—" : fmtN(p.valor)}</div>
            {p.pctDoAnterior !== null && (
              <div className="text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>
                <ArrowDown size={11} className="mr-0.5 inline" aria-hidden />
                {fmtPct(p.pctDoAnterior)} dos que {p.anterior}
              </div>
            )}
            {p.deCada && (
              <p className="mt-1 text-sm leading-snug" style={{ color: "var(--text)" }}>
                {p.deCada.charAt(0).toUpperCase() + p.deCada.slice(1)}.
              </p>
            )}
            {p.aviso && (
              <p className="mt-1.5 rounded-md p-2 text-xs leading-snug" style={{ background: "var(--warn-bg)", color: "var(--text)" }}>
                {p.aviso}
              </p>
            )}
            <div className="mt-1">
              <OQueE>{p.explica}</OQueE>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Contando {funil.escopoTexto}, pela situação de hoje no CRM; em "agendaram" entram também os que já passaram por uma etapa de consulta e depois andaram. Só pintamos de verde/vermelho o que tem referência de mercado confiável
        (agendamento: clínicas agendam perto de 4 em cada 10 leads).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- checklist
const ICONE_STATUS: Record<StatusItem, { icone: LucideIcon; cor: string; texto: string }> = {
  feito: { icone: CheckCircle2, cor: "var(--good-text)", texto: "Feito" },
  parcial: { icone: CircleDashed, cor: "var(--warn)", texto: "Parcial" },
  falta: { icone: XCircle, cor: "var(--crit)", texto: "Falta" },
  sem_dado: {
    icone: HelpCircle,
    cor: "var(--text-faint)",
    texto: "Sem leitura",
  },
};

export function ChecklistDados({ itens, clientId, compacto = false }: { itens: ItemChecklist[]; clientId: string; compacto?: boolean }) {
  const feitos = itens.filter((i) => i.status === "feito").length;
  return (
    <div>
      <p className="mb-2 text-sm" style={{ color: "var(--text-dim)" }}>
        <b style={{ color: "var(--text)" }}>
          {feitos} de {itens.length}
        </b>{" "}
        itens prontos. Cada item que falta deixa uma pergunta sem resposta.
      </p>
      <ul className="space-y-2">
        {itens.map((it, n) => {
          const s = ICONE_STATUS[it.status];
          const Icon = s.icone;
          return (
            <li
              key={it.id}
              className="rounded-xl border p-3"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
              }}
            >
              <div className="flex items-start gap-2.5">
                <Icon size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: s.cor }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-sm font-semibold">
                      {n + 1}. {it.titulo}
                    </span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: s.cor }}>
                      {s.texto}
                      {it.pct !== null && it.status !== "feito" ? ` · ${fmtPct(it.pct)}` : ""}
                    </span>
                  </div>
                  {it.pct !== null && (
                    <span
                      aria-hidden
                      className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(2, Math.min(100, it.pct * 100))}%`,
                          background: s.cor,
                        }}
                      />
                    </span>
                  )}
                  <p className="mt-1.5 text-sm leading-snug" style={{ color: "var(--text-dim)" }}>
                    {it.detalhe}
                  </p>
                  {it.status !== "feito" && !compacto && (
                    <>
                      <p className="mt-1 text-xs leading-snug" style={{ color: "var(--text)" }}>
                        <b>Sem isso:</b> {it.semIsso.replace(/^Sem isso, /, "")}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                        Quem resolve: <b>{ROTULO_RESPONSAVEL[it.resolve]}</b> · {it.comoResolver}
                      </p>
                      {it.rota && (
                        <div className="mt-2">
                          <BotaoAcao texto="Marcar as etapas do CRM" rota={it.rota} clientId={clientId} variante="secundario" />
                        </div>
                      )}
                    </>
                  )}
                  {it.status !== "feito" && compacto && (
                    <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                      Quem resolve: <b>{ROTULO_RESPONSAVEL[it.resolve]}</b>
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- problemas por tipo
export function ProblemasPorTipo({
  porTipo,
  clientId,
  esconderRastreamentoDoChecklist = true,
}: {
  porTipo: Record<TipoProblema, Insight[]>;
  clientId: string;
  esconderRastreamentoDoChecklist?: boolean;
}) {
  const ids = [
    "comercial:rastreamento:whatsapp",
    "comercial:rastreamento:origem",
    "comercial:rastreamento:etapas",
    "comercial:rastreamento:resultado",
    "comercial:rastreamento:contato",
  ];
  const grupos: { tipo: TipoProblema; itens: Insight[] }[] = (["performance", "operacao", "rastreamento"] as TipoProblema[]).map(
    (tipo) => ({
      tipo,
      itens: tipo === "rastreamento" && esconderRastreamentoDoChecklist ? porTipo[tipo].filter((i) => !ids.includes(i.id)) : porTipo[tipo],
    }),
  );
  const algum = grupos.some((g) => g.itens.length > 0);
  if (!algum) {
    return (
      <p className="text-sm" style={{ color: "var(--text-dim)" }}>
        Nenhum problema de performance ou de operação com dado suficiente para afirmar. Veja abaixo o que falta medir.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {grupos
        .filter((g) => g.itens.length > 0)
        .map((g) => (
          <section key={g.tipo} className="space-y-2 border-l-4 pl-3" style={{ borderColor: ESTILO_TIPO[g.tipo].cor }}>
            <div className="flex flex-wrap items-center gap-2">
              <SeloTipo tipo={g.tipo} />
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                {ROTULO_TIPO[g.tipo].explica}
              </span>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {g.itens.map((i) => (
                <InsightCard key={i.id} insight={i} clientId={clientId} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
