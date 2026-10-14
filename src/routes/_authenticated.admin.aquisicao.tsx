import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { getSapPortfolio, portfolioDeExemplo, faseDoDia, proximoMarco, type Farol, type SapLinhaPortfolio } from "@/lib/sap-data";
import { fmtBRL, fmtNum } from "@/lib/format";
import { Painel, Selo, Ajuda } from "@/components/visual";

// Portfólio do Sistema de Aquisição de Pacientes: todas as clínicas numa tela,
// no lugar do 11.05 (painel) e da parte de números do 11.04 (score de saúde).
export const Route = createFileRoute("/_authenticated/admin/aquisicao")({
  component: PortfolioSap,
});

const COR: Record<Farol, string> = { verde: "var(--good)", amarelo: "var(--warn)", vermelho: "var(--crit)", cinza: "var(--muted)" };
const PESO: Record<Farol, number> = { vermelho: 3, amarelo: 2, cinza: 1, verde: 0 };

function piorFarol(l: SapLinhaPortfolio): Farol {
  return l.semana.alertas.reduce<Farol>((pior, a) => (PESO[a.farol] > PESO[pior] ? a.farol : pior), "verde");
}

function variacao(atual: number, anterior: number): string {
  if (!anterior) return atual ? "novo" : "";
  const p = Math.round(((atual - anterior) / anterior) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

function PortfolioSap() {
  const [exemplo, setExemplo] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["sap-portfolio"], queryFn: getSapPortfolio });

  const linhas = exemplo ? portfolioDeExemplo() : (data ?? []);
  const ordenadas = [...linhas].sort((a, b) => PESO[piorFarol(b)] - PESO[piorFarol(a)] || (a.dia ?? 0) - (b.dia ?? 0));

  if (isLoading && !exemplo) return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  if (error && !exemplo) return <p style={{ color: "var(--crit)" }}>Não consegui ler o portfólio: {(error as Error).message}</p>;

  if (!ordenadas.length) {
    return (
      <Painel icone={Target} titulo="Sistema de Aquisição · todas as clínicas" resumo={data === null ? "As tabelas sap_* ainda não existem no banco." : "Nenhuma clínica cadastrada ainda."}>
        <div className="space-y-3 text-sm" style={{ color: "var(--text-dim)" }}>
          <p>
            Aqui aparece cada clínica do sistema com o dia em que está, a fase, o próximo marco, o semáforo e os números da última
            semana. Para incluir uma clínica, abra o cliente, vá em <strong>Aquisição</strong> e clique em <strong>Ativar o SAP</strong> (marque
            "piloto" para um cliente de outro produto). Os números saem sozinhos do CRM e do WhatsApp.
          </p>
          <button type="button" onClick={() => setExemplo(true)} className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--accent)", color: "#fff" }}>
            Ver com clínicas de exemplo
          </button>
        </div>
      </Painel>
    );
  }

  const tot = ordenadas.reduce(
    (s, l) => ({
      leads: s.leads + l.semana.leads,
      consultas: s.consultas + l.semana.consultas,
      fechamentos: s.fechamentos + l.semana.fechamentos,
      receita: s.receita + l.semana.receita,
      vermelhas: s.vermelhas + (piorFarol(l) === "vermelho" ? 1 : 0),
    }),
    { leads: 0, consultas: 0, fechamentos: 0, receita: 0, vermelhas: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--text-dim)" }}>
          <strong style={{ color: "var(--text)" }}>Sistema de Aquisição · {ordenadas.length} clínica(s)</strong>
          <span>· últimos 7 dias fechados</span>
          {ordenadas.some((l) => l.automatico) && <span>· números do CRM e do WhatsApp</span>}
          {exemplo && <Selo cor="var(--warn)">clínicas de exemplo, nada disso está no banco</Selo>}
          <Ajuda>
            Ordem: primeiro quem tem luz vermelha, depois quem está mais no começo do programa. Semáforo com as regras do 08.05; as
            faixas são referências iniciais da Doctor Creator, a validar no piloto. Variação contra os 7 dias anteriores.
          </Ajuda>
        </div>
        {exemplo && (
          <button type="button" className="text-xs underline" style={{ color: "var(--text-dim)" }} onClick={() => setExemplo(false)}>
            Sair do exemplo
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Clínicas com vermelho", fmtNum(tot.vermelhas)],
          ["Leads", fmtNum(tot.leads)],
          ["Consultas", fmtNum(tot.consultas)],
          ["Fechamentos", fmtNum(tot.fechamentos)],
          ["Receita atribuída", fmtBRL(tot.receita)],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border p-3.5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-xs" style={{ color: "var(--text-dim)" }}>{r}</div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
              <th className="px-3 py-2.5 font-medium">Clínica</th>
              <th className="px-3 py-2.5 font-medium">Dia e fase</th>
              <th className="px-3 py-2.5 font-medium">Próximo marco</th>
              <th className="px-3 py-2.5 font-medium">Semáforo</th>
              <th className="px-3 py-2.5 text-right font-medium">Leads</th>
              <th className="px-3 py-2.5 text-right font-medium">Consultas</th>
              <th className="px-3 py-2.5 text-right font-medium">Fechou</th>
              <th className="px-3 py-2.5 text-right font-medium">Receita</th>
              <th className="px-3 py-2.5 text-right font-medium">1ª resposta</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((l) => {
              const m = proximoMarco(l.dia);
              const s = l.semana;
              const a = l.semanaAnterior;
              return (
                <tr key={l.clinica.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2.5">
                    {l.clinica.client_id ? (
                      <Link to="/$clientId/aquisicao" params={{ clientId: l.clinica.client_id }} className="font-medium underline-offset-2 hover:underline">
                        {l.clinica.nome}
                      </Link>
                    ) : (
                      <span className="font-medium">{l.clinica.nome}</span>
                    )}
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {[l.clinica.especialidade, l.clinica.cidade].filter(Boolean).join(" · ") || "sem dados de cadastro"}
                      {!l.clinica.client_id && " · sem cliente no Hub"}
                      {(l.clinica as { piloto?: boolean }).piloto && " · piloto"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-semibold tabular-nums">{l.dia === null ? "sem D0" : `D${l.dia}`}</span>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{faseDoDia(l.dia)}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {m ? (
                      <>
                        <span>{m.nome}</span>
                        <div className="text-xs" style={{ color: m.faltam <= 2 ? "var(--crit)" : "var(--muted)" }}>
                          D{m.dia} · {m.faltam === 0 ? "hoje" : `em ${m.faltam} dia(s)`}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>programa encerrado</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1.5">
                      {s.alertas.map((x) => (
                        <span key={x.chave} title={`${x.titulo}: ${x.valor}`} className="inline-block h-3 w-3 rounded-full" style={{ background: COR[x.farol] }} />
                      ))}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                      {s.alertas.filter((x) => x.farol === "vermelho").map((x) => x.titulo).join(", ") || "sem vermelho"}
                    </div>
                  </td>
                  <Num v={s.leads} ant={a.leads} />
                  <Num v={s.consultas} ant={a.consultas} />
                  <Num v={s.fechamentos} ant={a.fechamentos} />
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtBRL(s.receita)}
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{variacao(s.receita, a.receita)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s.medianaResposta === null ? "sem dado" : `${Math.round(s.medianaResposta)} min`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Num({ v, ant }: { v: number; ant: number }) {
  return (
    <td className="px-3 py-2.5 text-right tabular-nums">
      {fmtNum(v)}
      <div className="text-xs" style={{ color: "var(--muted)" }}>{variacao(v, ant)}</div>
    </td>
  );
}
