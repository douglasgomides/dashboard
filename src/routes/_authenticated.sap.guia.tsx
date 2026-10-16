import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, UsersRound, Wrench } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import { FERRAMENTAS, FUNCOES, RITOS, type IdFuncao } from "@/lib/sap-operacao";

// Sistema de Aquisição · Como operamos: quem faz o quê, a rotina da semana e quando usar cada ferramenta (11.02).
export const Route = createFileRoute("/_authenticated/sap/guia")({
  component: GuiaOperacao,
});

function GuiaOperacao() {
  const { isAdmin } = useAuth();
  const [sel, setSel] = useState<IdFuncao | "todas">(isAdmin ? "todas" : "clinica");
  const funcoes = sel === "todas" ? FUNCOES : FUNCOES.filter((f) => f.id === sel);
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-dim)" }}>
        Regra simples: <strong>número e o que vence ficam no app</strong>; <strong>documento fica no Drive</strong>; <strong>hora e evidência ficam no ClickUp</strong>. Fonte: 11.02 · Operação Enxuta (piloto com 3 a 5 clínicas).
      </p>

      <Painel icone={UsersRound} titulo="Quem faz o quê" resumo="Funções do núcleo mínimo e onde cada uma trabalha no app">
        {isAdmin && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por função">
            {(["todas", ...FUNCOES.map((f) => f.id)] as (IdFuncao | "todas")[]).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={sel === id} onClick={() => setSel(id)}
                className="min-h-[32px] rounded-full border px-3 text-xs font-medium"
                style={sel === id ? { background: "var(--accent)", color: "white", borderColor: "var(--accent)" } : { borderColor: "var(--border)" }}>
                {id === "todas" ? "Todas" : FUNCOES.find((f) => f.id === id)!.nome}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {funcoes.map((f) => (
            <div key={f.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong>{f.nome}</strong>
                <Selo cor="var(--accent)">{f.horas}</Selo>
              </div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{f.acumula}</div>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{f.faz.map((x) => <li key={x}>{x}</li>)}</ul>
              <div className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}><strong>No app:</strong> {f.noApp.join(" · ")}</div>
            </div>
          ))}
        </div>
      </Painel>

      {isAdmin && (
        <Painel icone={CalendarRange} titulo="A semana da equipe" resumo="Rotina fixa de segunda a sexta (11.02, seção 3)">
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}><th className="py-1 pr-3 font-medium">Quando</th><th className="py-1 pr-3 font-medium">O quê</th><th className="py-1 pr-3 font-medium">Quem</th><th className="py-1 pr-3 font-medium">Tempo</th><th className="py-1 font-medium">Onde</th></tr></thead>
              <tbody>
                {RITOS.map((r) => (
                  <tr key={r.quando + r.rito} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-3 whitespace-nowrap font-medium">{r.quando}</td>
                    <td className="py-1.5 pr-3">{r.rito}</td>
                    <td className="py-1.5 pr-3 text-xs">{r.quem}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-xs">{r.duracao}</td>
                    <td className="py-1.5 text-xs" style={{ color: "var(--text-dim)" }}>{r.ondeNoApp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      )}

      <Painel icone={Wrench} titulo="Quando usar cada ferramenta" resumo="Para que serve, para que não serve e quem usa">
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {FERRAMENTAS.filter((f) => isAdmin || ["App (Sistema de Aquisição)", "WhatsApp", "CRM da clínica (Kommo, flwchat, outro)", "Planilha Tracker (08.04)"].includes(f.nome)).map((f) => (
            <div key={f.nome} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
              <strong>{f.nome}</strong>
              <div className="mt-1"><span style={{ color: "var(--good)" }}>Usar para:</span> {f.usarPara}</div>
              <div className="mt-0.5"><span style={{ color: "var(--crit)" }}>Não usar para:</span> {f.naoUsarPara}</div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>Quem: {f.quem}</div>
            </div>
          ))}
        </div>
      </Painel>
    </div>
  );
}
