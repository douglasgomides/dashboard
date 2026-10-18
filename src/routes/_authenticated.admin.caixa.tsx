import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Carregando } from "@/components/sem-fonte";
import type { PendenciasClinica } from "@/lib/resumo-equipe";

// Caixa de entrada da equipe: o que os agentes deixaram esperando uma pessoa, em todas as clínicas, por ordem de
// urgência (falha de agente, pacientes para recuperar, anúncios, aprovações, roteiros, estratégias, Brain). As mesmas
// contagens do e-mail das 7h30 (api/_lib/resumo-equipe.ts).
export const Route = createFileRoute("/_authenticated/admin/caixa")({
  component: CaixaDeEntrada,
});

const db = supabase as any;

async function lerPendencias(): Promise<PendenciasClinica[]> {
  const desde = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const [clientes, sug, camp, brain, apr, falhas, rec] = await Promise.all([
    db.from("clients").select("id, name").eq("active", true),
    db.from("sugestoes_agentes").select("client_id, agente").eq("estado", "proposta").gte("criado_em", desde(24 * 7)).limit(5000),
    db.from("campanhas_ideias").select("client_id").eq("estado", "proposta").limit(2000),
    db.from("brain_itens").select("client_id").eq("estado", "proposto").limit(5000),
    db.from("aprovacoes").select("client_id").eq("estado", "pendente").limit(1000),
    db.from("agente_execucoes").select("client_id").eq("estado", "falhou").gte("atualizado_em", desde(24)).limit(1000),
    db.from("sugestoes_agentes").select("client_id").eq("agente", "recuperacao").eq("resultado", "agendou").gte("medido_em", desde(24 * 7)).limit(5000),
  ]);
  for (const r of [clientes, sug, camp, brain, apr, falhas, rec]) if (r.error) throw r.error;
  const por = new Map<string, PendenciasClinica>();
  for (const c of clientes.data as { id: string; name: string }[])
    por.set(c.id, { client_id: c.id, nome: c.name, recuperacao: 0, anuncios: 0, conteudo: 0, campanhas: 0, brain: 0, aprovacoes: 0, falhas: 0, agendaram: 0 });
  const mais = (id: string, k: keyof PendenciasClinica) => { const p = por.get(id); if (p) (p[k] as number)++; };
  for (const s of sug.data as { client_id: string; agente: "recuperacao" | "anuncios" | "conteudo" }[]) mais(s.client_id, s.agente);
  for (const x of camp.data as { client_id: string }[]) mais(x.client_id, "campanhas");
  for (const x of brain.data as { client_id: string }[]) mais(x.client_id, "brain");
  for (const x of apr.data as { client_id: string }[]) mais(x.client_id, "aprovacoes");
  for (const x of falhas.data as { client_id: string }[]) mais(x.client_id, "falhas");
  for (const x of rec.data as { client_id: string }[]) mais(x.client_id, "agendaram");
  return [...por.values()];
}

const ITENS: { k: keyof PendenciasClinica; rotulo: string; onde: (id: string) => string }[] = [
  { k: "falhas", rotulo: "falhas de agente", onde: () => "/admin/agentes" },
  { k: "recuperacao", rotulo: "pacientes para recuperar", onde: (id) => `/${id}/atendimento` },
  { k: "anuncios", rotulo: "ajustes de anúncio", onde: (id) => `/${id}/anuncios` },
  { k: "aprovacoes", rotulo: "aprovações", onde: () => "/admin/agentes" },
  { k: "conteudo", rotulo: "roteiros prontos", onde: (id) => `/${id}/ideias` },
  { k: "campanhas", rotulo: "estratégias", onde: (id) => `/${id}/campanhas` },
  { k: "brain", rotulo: "itens do Brain", onde: () => "/admin/brain" },
];

function CaixaDeEntrada() {
  const q = useQuery({ queryKey: ["caixa-entrada"], queryFn: lerPendencias, refetchInterval: 5 * 60_000 });
  if (q.isLoading) return <Carregando texto="Juntando o que os agentes prepararam…" />;
  if (q.error) return <p className="text-sm" style={{ color: "var(--crit)" }}>Não consegui ler as pendências. Atualize a página.</p>;
  const peso = (c: PendenciasClinica) => c.falhas * 1000 + c.recuperacao * 3 + c.anuncios * 2 + c.aprovacoes * 2 + c.conteudo + c.campanhas + c.brain;
  const linhas = (q.data ?? []).filter((c) => peso(c) > 0 || c.agendaram > 0).sort((a, b) => peso(b) - peso(a));
  const soma = (k: keyof PendenciasClinica) => (q.data ?? []).reduce((s, c) => s + Number(c[k] || 0), 0);
  return (
    <div className="space-y-4">
      <div className="hpagehead">
        <h2>Caixa de entrada</h2>
        <p>Tudo que os agentes prepararam e está esperando a equipe, em todas as clínicas, do mais urgente para o menos. Atualiza sozinha a cada 5 minutos. O mesmo resumo chega por e-mail às 7h30.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Pacientes para recuperar", soma("recuperacao")], ["Ajustes de anúncio", soma("anuncios")], ["Roteiros prontos", soma("conteudo")], ["Recuperados que agendaram (7 dias)", soma("agendaram")]].map(([r, v]) => (
          <div key={r as string} className="rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-xl font-bold tabular-nums">{v as number}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>{r as string}</div>
          </div>
        ))}
      </div>
      {soma("falhas") > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)", color: "var(--crit)" }}>
          <AlertTriangle size={16} aria-hidden /> {soma("falhas")} execuções de agente falharam nas últimas 24 h. <Link to="/admin/agentes" className="font-semibold underline">Abrir a Central</Link>
        </p>
      )}
      {linhas.length === 0 ? (
        <div className="hempty"><CheckCircle2 aria-hidden /><h2>Nada esperando a equipe</h2><p>Os agentes rodam sozinhos; quando prepararem algo, aparece aqui.</p></div>
      ) : (
        <ul className="space-y-2">
          {linhas.map((c) => (
            <li key={c.client_id} className="rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to="/$clientId/agentes" params={{ clientId: c.client_id }} className="flex items-center gap-1.5 font-semibold"><Bot size={15} aria-hidden style={{ color: "var(--accent)" }} /> {c.nome}</Link>
                {c.agendaram > 0 && <span className="text-xs font-semibold" style={{ color: "var(--ok, var(--accent))" }}>{c.agendaram} recuperados agendaram</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ITENS.filter((i) => Number(c[i.k]) > 0).map((i) => (
                  <a key={i.k} href={i.onde(c.client_id)} className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: i.k === "falhas" ? "var(--crit)" : "var(--surface-2)", color: i.k === "falhas" ? "#fff" : "var(--ink)" }}>
                    {c[i.k] as number} {i.rotulo}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
