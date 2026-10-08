import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Route as RouteIcon, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Painel, Selo } from "@/components/visual";

export const Route = createFileRoute("/_authenticated/$clientId/jornada")({
  component: JornadaPage,
});

const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
const quando = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

const ROTULO: Record<string, string> = {
  comentario: "Comentou num post",
  lead_criado: "Virou lead no CRM",
  mensagem_whatsapp: "Chamou no WhatsApp",
  clique_link: "Clicou num link",
};

function Etapa({ n, rotulo, base }: { n: number; rotulo: string; base: number }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="text-2xl font-semibold tabular-nums">{n.toLocaleString("pt-BR")}</div>
      <div className="text-xs" style={{ color: "var(--text-dim)" }}>{rotulo}</div>
      <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>{pct(n, base)} das pessoas</div>
    </div>
  );
}

function Tabela({ cab, linhas }: { cab: string[]; linhas: (string | number | JSX.Element)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: "var(--text-faint)" }} className="text-left text-xs uppercase">
            {cab.map((c) => <th key={c} className="py-1 pr-3 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
              {l.map((c, j) => <td key={j} className="py-1.5 pr-3 align-top tabular-nums">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JornadaPage() {
  const { clientId } = Route.useParams();
  const [q, setQ] = useState("");
  const [pessoa, setPessoa] = useState<string | null>(null);

  const resumo = useQuery({
    queryKey: ["jornada", clientId],
    queryFn: async () => {
      const { data, error } = await rpc("jornada_resumo", { p_client: clientId });
      if (error) throw new Error(error.message);
      return data as any;
    },
  });
  const busca = useQuery({
    queryKey: ["jornada-busca", clientId, q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await rpc("buscar_pessoas", { p_client: clientId, p_q: q.trim() });
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });
  const detalhe = useQuery({
    queryKey: ["jornada-pessoa", pessoa],
    enabled: !!pessoa,
    queryFn: async () => {
      const { data, error } = await rpc("jornada_pessoa", { p_pessoa: pessoa });
      if (error) throw new Error(error.message);
      return data as any;
    },
  });

  const r = resumo.data;
  return (
    <div className="space-y-4">
      <Painel icone={RouteIcon} titulo="Jornada: do post à venda" resumo="Cada pessoa ligada por telefone, @ do Instagram ou identificador do atendimento. O que cruzou e o que ainda está solto.">
        {resumo.isLoading && <p className="text-sm">Calculando…</p>}
        {resumo.error && <p className="text-sm">{(resumo.error as Error).message}</p>}
        {r && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Etapa n={r.pessoas} rotulo="pessoas identificadas" base={r.pessoas} />
              <Etapa n={r.comentaram} rotulo="comentaram em posts" base={r.pessoas} />
              <Etapa n={r.conversaram} rotulo="têm conversa no WhatsApp" base={r.pessoas} />
              <Etapa n={r.viraram_lead} rotulo="viraram lead no CRM" base={r.pessoas} />
              <Etapa n={r.ganhos} rotulo={`compraram${r.receita > 0 ? ` · ${brl(r.receita)}` : ""}`} base={r.pessoas} />
            </div>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
              <div>Comentaram <b>e</b> viraram lead: <b>{r.comentaram_e_lead}</b></div>
              <div>Conversaram <b>e</b> viraram lead: <b>{r.conversaram_e_lead}</b></div>
              <div>Comentaram <b>e</b> conversaram: <b>{r.comentaram_e_conversaram}</b></div>
            </div>
            {r.leads_sem_pessoa > 0 && (
              <p className="mt-3 rounded-lg border p-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
                {r.leads_sem_pessoa.toLocaleString("pt-BR")} de {r.leads_total.toLocaleString("pt-BR")} leads do CRM ainda não foram ligados a uma pessoa
                (sem telefone, @ ou conversa guardada). Quanto mais conversas puxadas, mais ligam.
              </p>
            )}
          </>
        )}
      </Painel>

      {r && r.por_origem.length > 0 && (
        <Painel icone={RouteIcon} titulo="Resultado por origem do lead" resumo="Origem que o CRM registrou: leads, vendas e receita.">
          <Tabela
            cab={["Origem", "Leads", "Vendas", "Conversão", "Receita"]}
            linhas={r.por_origem.map((o: any) => [o.o, o.leads, o.ganhos, pct(o.ganhos, o.leads), o.receita > 0 ? brl(o.receita) : "—"])}
          />
        </Painel>
      )}

      {r && r.posts.length > 0 && (
        <Painel icone={RouteIcon} titulo="Posts que geraram gente de verdade" resumo="Quem comentou no post e depois virou lead ou comprou.">
          <Tabela
            cab={["Post", "Comentaristas", "Viraram lead", "Compraram", "Receita"]}
            linhas={r.posts.map((p: any) => [
              <a key={p.id} href={p.permalink ?? "#"} target="_blank" rel="noreferrer" className="underline">{(p.legenda || "(sem legenda)").slice(0, 70)}</a>,
              p.comentaristas, p.viraram_lead, p.ganhos, p.receita > 0 ? brl(p.receita) : "—",
            ])}
          />
        </Painel>
      )}

      {r && r.links.length > 0 && (
        <Painel icone={RouteIcon} titulo="Links rastreados" resumo="Clique → conversa → lead → venda, pelo código que vai na mensagem.">
          <Tabela
            cab={["Link", "Tipo", "Cliques", "Conversas", "Leads", "Vendas"]}
            linhas={r.links.map((l: any) => [l.titulo ?? l.short_url, l.tipo, l.cliques_total ?? 0, l.conversas, l.viraram_lead, l.ganhos])}
          />
        </Painel>
      )}

      <Painel icone={Search} titulo="Linha do tempo de uma pessoa" resumo="Busque por nome, @ do Instagram ou os 4+ últimos dígitos do telefone.">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome, @ ou telefone"
          className="mb-2 w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
        <div className="flex flex-wrap gap-1.5">
          {busca.data?.map((p) => (
            <button key={p.id} onClick={() => setPessoa(p.id)} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: p.id === pessoa ? "var(--accent)" : "var(--border)" }}>
              {p.nome ?? p.ig_username ?? "Sem nome"} {p.telefone_final ? `· ${p.telefone_final}` : ""} {p.ig_username ? `· @${p.ig_username}` : ""}
            </button>
          ))}
        </div>
        {detalhe.data && (
          <div className="mt-3 space-y-2">
            <div className="text-sm font-semibold">{detalhe.data.pessoa?.nome ?? "Sem nome"}</div>
            <ol className="space-y-1.5 border-l pl-3" style={{ borderColor: "var(--border)" }}>
              {detalhe.data.linha.map((e: any, i: number) => (
                <li key={i} className="text-sm">
                  <span className="text-xs" style={{ color: "var(--text-faint)" }}>{quando(e.quando)} </span>
                  {ROTULO[e.tipo] ?? e.tipo}
                  {e.legenda ? <span style={{ color: "var(--text-dim)" }}> — “{e.legenda}”</span> : e.detalhe ? <span style={{ color: "var(--text-dim)" }}> — {e.detalhe}</span> : null}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-1.5">
              {detalhe.data.leads.map((l: any, i: number) => (
                <Selo key={i} cor={l.resultado === "won" ? "var(--accent)" : "var(--muted)"}>
                  {l.resultado === "won" ? "Comprou" : l.resultado === "lost" ? "Perdido" : "Em aberto"}{l.valor > 0 ? ` · ${brl(Number(l.valor))}` : ""}{l.origem ? ` · ${l.origem}` : ""}
                </Selo>
              ))}
              {detalhe.data.conversas.length > 0 && <Selo>{detalhe.data.conversas.length} conversa(s) no WhatsApp</Selo>}
            </div>
          </div>
        )}
      </Painel>
    </div>
  );
}
