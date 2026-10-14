import { useState } from "react";
import { Carregando } from "@/components/sem-fonte";
import { MANUAL_CRM } from "@/lib/manual-crm";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Copy, Printer, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getClient } from "@/lib/client-data";
import { montarGuiaCrm, ROTULO_PAPEL, PADRAO, type EtapaCrm, type Papel } from "@/lib/guia-crm";

export const Route = createFileRoute("/_authenticated/$clientId/crm-guia")({
  component: GuiaCrmPage,
});

const COR_PAPEL: Partial<Record<Papel, string>> = {
  desconhecida: "var(--crit)",
  reativacao: "var(--muted)",
  pos: "var(--muted)",
  ganho: "var(--good)",
  perdido: "var(--warn)",
};

// Guia de organização do CRM: o que ajustar, por quê e como, no CRM que o cliente usa.
function GuiaCrmPage() {
  const { clientId } = Route.useParams();
  const { data: client } = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId) });
  const { data, isLoading } = useQuery({
    queryKey: ["crm-guia", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("crm_guia_dados", { p_client_id: clientId });
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as any;
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  const [copiado, setCopiado] = useState(false);

  if (isLoading) return <Carregando texto="Lendo o CRM…" />;
  if (!data || !data.provider) return <p className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>Este cliente não tem CRM conectado.</p>;

  const num = (v: unknown) => (v == null ? null : Number(v));
  const g = montarGuiaCrm((data.etapas ?? []) as EtapaCrm[], {
    provider: String(data.provider).split(",")[0],
    leads: Number(data.leads ?? 0),
    comOrigem: num(data.com_origem),
    perdidos: Number(data.perdidos ?? 0),
    perdidosComMotivo: num(data.perdidos_com_motivo),
    comValorNoGanho: num(data.com_valor_no_ganho),
    ganhos: Number(data.ganhos ?? 0),
    semDono: num(data.sem_dono),
    abertos: Number(data.abertos ?? 0),
    paradosMais90: num(data.parados_90),
  });
  const feitos = g.passos.filter((p) => p.feito).length;
  const porFunil = new Map<string, typeof g.etapas>();
  for (const e of g.etapas) porFunil.set(e.pipeline_name, [...(porFunil.get(e.pipeline_name) ?? []), e]);
  const funis = [...porFunil.entries()].sort((a, b) => b[1].reduce((s, e) => s + e.total, 0) - a[1].reduce((s, e) => s + e.total, 0));

  async function copiar() {
    try {
      await navigator.clipboard.writeText(g.textoCliente);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* navegador sem permissão de área de transferência */
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 guia-crm">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
          <ClipboardList size={14} aria-hidden /> Guia para organizar o CRM · {data.provider}
        </div>
        <h1 className="text-xl font-semibold">{client?.name ? `${client.name}: ` : ""}o que ajustar no CRM para o painel ler certo</h1>
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          <b>{feitos} de {g.passos.length}</b> passos prontos. Cada passo que falta deixa uma pergunta sem resposta (quantos agendaram, de onde vieram, por que perdemos).
          Números dos últimos 90 dias: {Number(data.leads).toLocaleString("pt-BR")} leads, {Number(data.ganhos).toLocaleString("pt-BR")} ganhos, {Number(data.perdidos).toLocaleString("pt-BR")} perdidos.
        </p>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={copiar} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--accent-fg, #fff)" }}>
            <Copy size={14} aria-hidden /> {copiado ? "Copiado!" : "Copiar mensagem para o cliente"}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <Printer size={14} aria-hidden /> Imprimir / salvar PDF
          </button>
          <button
            type="button"
            onClick={async () => (await import("@/lib/pdf-manual-crm")).baixarManualCrm(client?.name)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold"
            style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--surface)" }}
          >
            <Printer size={14} aria-hidden /> Baixar o manual do CRM (PDF)
          </button>
        </div>
      </header>

      <section className="space-y-3" aria-label="Passo a passo">
        <h2 className="text-[15px] font-semibold">Passo a passo</h2>
        <ol className="space-y-3">
          {g.passos.map((p, i) => (
            <li key={p.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="flex items-start gap-2.5">
                {p.feito ? <CheckCircle2 size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--good)" }} /> : <Circle size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{i + 1}. {p.titulo} {p.feito && <span className="text-xs font-normal" style={{ color: "var(--good)" }}>· pronto</span>}</div>
                  <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>{p.porque}</p>
                  {!p.feito && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--ink)" }}>
                      {p.como.map((c, j) => <li key={j}>{c}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3" aria-label="Etapas padrão">
        <h2 className="text-[15px] font-semibold">Como o funil principal deve ficar</h2>
        <ol className="grid gap-2 sm:grid-cols-2">
          {PADRAO.map((p) => (
            <li key={p.papel} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <b>{p.nome}</b>
              <div style={{ color: "var(--ink-2)" }}>{p.o_que_e}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3" aria-label="Etapas de hoje">
        <h2 className="text-[15px] font-semibold">As etapas de hoje e o que cada uma vira</h2>
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          Leitura automática pelo nome da etapa. Em vermelho, as que não dá para saber o que significam: são as primeiras a perguntar para a equipe da clínica.
        </p>
        {funis.map(([funil, es]) => (
          <div key={funil} className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <caption className="px-3 py-2 text-left font-semibold" style={{ background: "var(--surface-2, var(--surface))" }}>
                Funil “{funil}” · {es.reduce((s, e) => s + e.total, 0).toLocaleString("pt-BR")} leads
              </caption>
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                  <th className="px-3 py-1.5 font-medium">Etapa hoje</th>
                  <th className="px-3 py-1.5 font-medium">Leads</th>
                  <th className="px-3 py-1.5 font-medium">Vira no padrão</th>
                </tr>
              </thead>
              <tbody>
                {es.sort((a, b) => b.total - a.total).map((e) => (
                  <tr key={e.status_name} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-1.5">{e.status_name}</td>
                    <td className="px-3 py-1.5 tabular-nums">{e.total.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-1.5" style={{ color: COR_PAPEL[e.papel] ?? "var(--ink)", fontWeight: e.papel === "desconhecida" ? 600 : undefined }}>
                      {ROTULO_PAPEL[e.papel]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
      <ManualCrm />
    </div>
  );
}

// Manual completo (mesmo texto do PDF e do onboarding): o padrão que o painel precisa ler.
function ManualCrm() {
  return (
    <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }} aria-label="Manual de organização do CRM">
      <h2 className="text-[15px] font-semibold">Manual de organização do CRM</h2>
      {MANUAL_CRM.map((s) => (
        <div key={s.titulo}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{s.titulo}</h3>
          {s.intro && <p className="text-sm" style={{ color: "var(--ink-2)" }}>{s.intro}</p>}
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {s.itens.map((i) => (
              <li key={i.titulo}><b>{i.titulo}:</b> {i.texto}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
