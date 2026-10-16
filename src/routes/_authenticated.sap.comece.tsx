import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FASES } from "@/lib/sap-cronograma";
import { PAPEIS } from "@/lib/sap-tarefas";
import { marcarVistoSap } from "@/lib/sap-data";

// Sistema de Aquisição · Comece aqui: leitura de 2 minutos para quem acabou de chegar.
export const Route = createFileRoute("/_authenticated/sap/comece")({
  component: ComeceAqui,
});

function ComeceAqui() {
  const qc = useQueryClient();
  useEffect(() => { marcarVistoSap("comece").then(() => qc.invalidateQueries({ queryKey: ["sap-pref"] })).catch(() => undefined); }, [qc]);
  const caixa = { borderColor: "var(--border)", background: "var(--surface)" } as const;
  return (
    <div className="mx-auto max-w-3xl space-y-5 text-sm">
      <section className="rounded-xl border p-4" style={caixa}>
        <h2 className="text-base font-semibold">O que é o Sistema de Aquisição (SAP)</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5" style={{ color: "var(--text-dim)" }}>
          <li>Um programa de 90 dias que a Doctor Creator implanta em cada clínica, contado a partir do D0 (dia da assinatura).</li>
          <li>O objetivo é que mais pacientes certos cheguem, sejam bem atendidos, agendem, compareçam e fechem.</li>
          <li>Medimos 3 números com a clínica (resposta, comparecimento e conversão) contra o ponto de partida (baseline).</li>
          <li>O programa segue um cronograma fixo de 35 tarefas; cada tarefa tem um papel responsável e um prazo.</li>
          <li>Tudo o que é número e prazo fica aqui no app; documentos ficam no Drive; horas ficam no ClickUp.</li>
        </ul>
      </section>

      <section className="rounded-xl border p-4" style={caixa}>
        <h2 className="text-base font-semibold">A linha do tempo D0 a D90</h2>
        <ol className="mt-2 grid gap-1 sm:grid-cols-2">
          {FASES.filter((f) => f.de < 91).map((f, i) => (
            <li key={f.nome}><span className="tabular-nums" style={{ color: "var(--muted)" }}>{i + 1}.</span> <strong>{f.nome}</strong> <span style={{ color: "var(--text-dim)" }}>D{f.de} a D{f.ate - 1}</span></li>
          ))}
        </ol>
        <p className="mt-2" style={{ color: "var(--text-dim)" }}>Marcos: anúncios no ar perto do D29, checkpoint no D60, janela da garantia do D62 ao D89 e reunião de encerramento no D90. Rotinas semanais (leitura, call em grupo, Score de Saúde) rodam em paralelo.</p>
      </section>

      <section className="rounded-xl border p-4" style={caixa}>
        <h2 className="text-base font-semibold">Quem faz o quê</h2>
        <ul className="mt-2 space-y-1">
          {PAPEIS.map((p) => <li key={p.id}><strong>{p.nome}:</strong> <span style={{ color: "var(--text-dim)" }}>{p.resumo}</span></li>)}
        </ul>
        <p className="mt-2" style={{ color: "var(--text-dim)" }}>Em cada clínica, a tela <strong>Quem é quem</strong> diz qual pessoa ocupa cada papel.</p>
      </section>

      <section className="rounded-xl border p-4" style={caixa}>
        <h2 className="text-base font-semibold">Como ler e fechar uma tarefa</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5" style={{ color: "var(--text-dim)" }}>
          <li>Abra a clínica: a primeira tela é <strong>Minhas tarefas</strong>, só com o que é do seu papel, em Atrasadas, Hoje, Esta semana e Depois.</li>
          <li>Cada linha mostra o número (ex.: 2.3), o nome, o prazo ("vence em 2 dias"), o papel com a pessoa e o status.</li>
          <li>Clique na linha: aparecem <strong>por que existe</strong>, <strong>como fazer</strong> (passos), <strong>onde fazer</strong> (botão que leva à tela ou ao documento) e <strong>pronto quando</strong>.</li>
          <li>Fez? Cole o link ou envie o print da evidência e clique em <strong>Marcar como feito</strong>. Fica registrado quem marcou e quando. Errou? Use <strong>Desfazer</strong> com o motivo.</li>
          <li>O que o sistema consegue ver sozinho (D0, fontes ligadas, acessos, testes de rastreamento, baseline) aparece como <strong>feito automaticamente</strong>.</li>
        </ol>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to="/sap" className="inline-flex min-h-[40px] items-center rounded-lg px-4 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>Ir para as clínicas →</Link>
        <Link to="/sap/docs" className="inline-flex min-h-[40px] items-center rounded-lg border px-4 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>Documentos do SAP</Link>
      </div>
    </div>
  );
}
