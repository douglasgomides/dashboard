import { useState } from "react";
import { Carregando } from "@/components/sem-fonte";
import { MANUAL_CRM } from "@/lib/manual-crm";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy, Printer } from "lucide-react";
import { NxCard, NxTag } from "@/components/nx";
import { CmKpi, CmRecolhido, CmTopo, icT } from "@/components/nx/comercial-base";
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
  if (!data || !data.provider) return <div className="nexo-comercial"><p className="nx-vazio text-center text-sm">Este cliente não tem CRM conectado.</p></div>;

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

  const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR");
  return (
    <div className="nexo-comercial guia-crm">
      <CmTopo
        pergunta={`${client?.name ? `${client.name}: ` : ""}o que ajustar no CRM para o painel ler certo?`}
        detalhe={`Guia para organizar o CRM · ${data.provider} · números dos últimos 90 dias`}
        acoes={
          <span className="flex flex-wrap gap-2 print:hidden">
            <button type="button" onClick={copiar} className="ws-action ws-action--primary inline-flex min-h-[40px] items-center gap-1.5">
              <Copy size={15} aria-hidden /> {copiado ? "Copiado!" : "Copiar mensagem para o cliente"}
            </button>
            <button type="button" onClick={() => window.print()} className="nx-botao" style={{ minHeight: 40 }}>
              <Printer size={15} aria-hidden /> Imprimir / salvar PDF
            </button>
            <button type="button" onClick={async () => (await import("@/lib/pdf-manual-crm")).baixarManualCrm(client?.name)} className="nx-botao" style={{ minHeight: 40 }}>
              <Printer size={15} aria-hidden /> Baixar o manual do CRM (PDF)
            </button>
          </span>
        }
      />

      <section className="nx-grade nx-grade--4" aria-label="Situação do CRM">
        <CmKpi
          i={0}
          icone="checklist"
          rotulo="Passos prontos"
          valor={`${feitos} de ${g.passos.length}`}
          extra={
            <span className="cm-progresso" role="progressbar" aria-label="Passos prontos" aria-valuemin={0} aria-valuemax={g.passos.length} aria-valuenow={feitos}>
              <i style={{ width: `${g.passos.length ? Math.max(2, (feitos / g.passos.length) * 100) : 0}%` }} />
            </span>
          }
        />
        <CmKpi i={1} icone="users" rotulo="Leads" valor={fmt(data.leads)} nota="últimos 90 dias" />
        <CmKpi i={2} icone="checklist" rotulo="Ganhos" valor={fmt(data.ganhos)} nota="últimos 90 dias" />
        <CmKpi i={3} icone="x" rotulo="Perdidos" valor={fmt(data.perdidos)} nota="últimos 90 dias" />
      </section>

      <NxCard id="passos" nivel={2} icone={icT("checklist")} titulo="Passo a passo" subtitulo="Cada passo que falta deixa uma pergunta sem resposta (quantos agendaram, de onde vieram, por que perdemos).">
        <ol className="cm-passos" aria-label="Passo a passo">
          {g.passos.map((p, i) => (
            <li key={p.id} className={`cm-passo${p.feito ? " cm-passo--feito" : ""}`}>
              <span className="cm-passo__n" aria-hidden>
                {p.feito ? <CheckCircle2 size={17} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3>
                  {i + 1}. {p.titulo} <NxTag tom={p.feito ? "up" : "or"}>{p.feito ? "pronto" : "falta"}</NxTag>
                </h3>
                <p>{p.porque}</p>
                {!p.feito && (
                  <ul>
                    {p.como.map((c, j) => <li key={j}>{c}</li>)}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </NxCard>

      <NxCard id="etapas-hoje" nivel={2} icone={icT("filter")} titulo="As etapas de hoje e o que cada uma vira" subtitulo="Leitura automática pelo nome da etapa. Em vermelho, as que não dá para saber o que significam: são as primeiras a perguntar para a equipe da clínica.">
        {funis.map(([funil, es]) => (
          <div key={funil} className="cm-tabela">
            <table>
              <caption className="px-3 py-2 text-left" style={{ background: "var(--field)" }}>
                Funil “{funil}” · {es.reduce((s, e) => s + e.total, 0).toLocaleString("pt-BR")} leads
              </caption>
              <thead>
                <tr className="text-left">
                  <th>Etapa hoje</th>
                  <th className="text-right">Leads</th>
                  <th>Vira no padrão</th>
                </tr>
              </thead>
              <tbody>
                {es.sort((a, b) => b.total - a.total).map((e) => (
                  <tr key={e.status_name}>
                    <td style={{ fontWeight: 600 }}>{e.status_name}</td>
                    <td className="cm-num">{e.total.toLocaleString("pt-BR")}</td>
                    <td style={{ color: COR_PAPEL[e.papel] ?? "var(--text)", fontWeight: e.papel === "desconhecida" ? 700 : 500 }}>{ROTULO_PAPEL[e.papel]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </NxCard>

      <CmRecolhido titulo="Como o funil principal deve ficar" subtitulo="As etapas do padrão e o que cada uma quer dizer">
        <ol className="grid gap-2 sm:grid-cols-2" aria-label="Etapas padrão">
          {PADRAO.map((p) => (
            <li key={p.papel} className="rounded-xl p-3 text-sm" style={{ background: "var(--field)" }}>
              <b>{p.nome}</b>
              <div style={{ color: "var(--text-2)" }}>{p.o_que_e}</div>
            </li>
          ))}
        </ol>
      </CmRecolhido>
      <ManualCrm />
    </div>
  );
}

// Manual completo (mesmo texto do PDF e do onboarding): o padrão que o painel precisa ler.
function ManualCrm() {
  return (
    <CmRecolhido titulo="Manual de organização do CRM" subtitulo="O mesmo texto do PDF e do onboarding: o padrão que o painel precisa ler">
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
    </CmRecolhido>
  );
}
