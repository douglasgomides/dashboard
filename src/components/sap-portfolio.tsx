import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { listAllClients } from "@/lib/admin-data";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { getSapPorCliente, getSapPortfolio, novaClinicaSap, portfolioDeExemplo, faseDoDia, proximoMarco, type Farol, type SapLinhaPortfolio } from "@/lib/sap-data";
import { fmtBRL, fmtNum } from "@/lib/format";
import { Painel, Selo, Ajuda } from "@/components/visual";
import { corDaSaude } from "@/components/sap-scores";

// Portfólio do Sistema de Aquisição: todas as clínicas numa tela (início da área do SAP para a equipe),
// no lugar do 11.05 (painel) e da parte de números do 11.04 (score de saúde).

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

export function PortfolioSap() {
  const [exemplo, setExemplo] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["sap-portfolio"], queryFn: getSapPortfolio });

  const linhas = exemplo ? portfolioDeExemplo() : (data ?? []);
  // Risco: primeiro a cor do Score de Saúde (11.04), depois o semáforo dos números, depois o começo do programa.
  const riscoSaude = (l: SapLinhaPortfolio) => { const c = l.saude?.ultima?.cor ?? ""; return c.startsWith("Vermelho") ? 3 : c.startsWith("Amarelo") ? 2 : c === "Verde" ? 0 : 1; };
  const ordenadas = [...linhas].sort((a, b) => riscoSaude(b) - riscoSaude(a) || PESO[piorFarol(b)] - PESO[piorFarol(a)] || (a.dia ?? 0) - (b.dia ?? 0));

  if (isLoading && !exemplo) return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  if (error && !exemplo) return <p style={{ color: "var(--crit)" }}>Não foi possível carregar as clínicas: {(error as Error).message}</p>;

  if (!ordenadas.length) {
    return (
      <Painel icone={Target} titulo="Clínicas do SAP" resumo={data === null ? "O ambiente de dados do SAP ainda precisa ser configurado pela administração." : "Cadastre a primeira clínica para acompanhar a implantação."}>
        <div className="space-y-3 text-sm" style={{ color: "var(--text-dim)" }}>
          <p>
            Acompanhe a fase, o próximo marco, os alertas e os indicadores de cada clínica. Comece em <strong>Cadastrar nova clínica</strong>.
            Os números disponíveis dependem das fontes conectadas e dos registros da operação. Ao fim dos 90 dias, o histórico é preservado;
            a continuidade no Nexo depende de contratação e liberação próprias.
          </p>
          <AbrirClinica />
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

  // 11.04: média da carteira abaixo de 7 por 2 semanas é gatilho de contratação (11.01).
  const notas = ordenadas.map((l) => l.saude?.ultima?.nota).filter((n): n is number => typeof n === "number");
  const mediaSaude = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;

  return (
    <div className="space-y-5">
      <AbrirClinica />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--text-dim)" }}>
          <strong style={{ color: "var(--text)" }}>SAP · {ordenadas.length} clínica(s) em acompanhamento</strong>
          <span>· últimos 7 dias fechados</span>
          {ordenadas.some((l) => l.automatico) && <span>· números do CRM e do WhatsApp</span>}
          {exemplo && <Selo cor="var(--warn)">Demonstração · dados fictícios</Selo>}
          <Ajuda>
            A lista prioriza o risco de saúde da operação, os alertas dos indicadores e o início do programa.
            As faixas são referências iniciais da Doctor Creator, em validação no piloto. A variação compara os últimos 7 dias fechados com os 7 dias anteriores.
          </Ajuda>
        </div>
        {exemplo && (
          <button type="button" className="text-xs underline" style={{ color: "var(--text-dim)" }} onClick={() => setExemplo(false)}>
            Sair do exemplo
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["Saúde média da carteira", mediaSaude === null ? "sem registro" : `${mediaSaude.toFixed(1).replace(".", ",")}${mediaSaude < 7 ? " · abaixo de 7" : ""}`],
          ["Clínicas com alerta crítico", fmtNum(tot.vermelhas)],
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
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
              <th className="px-3 py-2.5 font-medium">Clínica</th>
              <th className="px-3 py-2.5 font-medium">Dia e fase</th>
              <th className="px-3 py-2.5 font-medium">Próximo marco</th>
              <th className="px-3 py-2.5 font-medium">Semáforo</th>
              <th className="px-3 py-2.5 text-right font-medium">Leads</th>
              <th className="px-3 py-2.5 text-right font-medium">Consultas</th>
              <th className="px-3 py-2.5 text-right font-medium">Fechamentos</th>
              <th className="px-3 py-2.5 text-right font-medium">Receita</th>
              <th className="px-3 py-2.5 text-right font-medium">1ª resposta</th>
              <th className="px-3 py-2.5 text-right font-medium">Saúde</th>
              <th className="px-3 py-2.5 text-right font-medium">Execução</th>
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
                      <Link to="/sap/$clientId" params={{ clientId: l.clinica.client_id }} className="font-medium underline-offset-2 hover:underline">
                        {l.clinica.nome}
                      </Link>
                    ) : (
                      <span className="font-medium">{l.clinica.nome}</span>
                    )}
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {[l.clinica.especialidade, l.clinica.cidade].filter(Boolean).join(" · ") || "sem dados de cadastro"}
                      {!l.clinica.client_id && " · sem cliente no Nexo"}
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
                      {s.alertas.filter((x) => x.farol === "vermelho").map((x) => x.titulo).join(", ") || "sem alerta crítico"}
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
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {l.saude?.ultima ? (
                      <>
                        <span className="font-semibold" style={{ color: corDaSaude(l.saude.ultima.cor) }}>{l.saude.ultima.nota?.toFixed(1).replace(".", ",")}</span>
                        <div className="text-xs" style={{ color: corDaSaude(l.saude.ultima.cor) }}>
                          S{l.saude.ultima.semana} · {l.saude.ultima.cor}
                          {l.saude.vermelhasSeguidas >= 2 ? " · 2 semanas" : ""}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>sem registro</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {l.execucao === null || l.execucao === undefined ? (
                      <span style={{ color: "var(--muted)" }}>sem itens</span>
                    ) : (
                      <span className="font-semibold" style={{ color: l.execucao >= 0.8 ? "var(--good)" : "var(--crit)" }}>{Math.round(l.execucao * 100)}%</span>
                    )}
                  </td>
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

/** Abre (ou ativa) o Sistema de Aquisição de qualquer cliente do Hub. */
// Entrada do SAP: clínica NOVA é cadastrada aqui (nasce no programa e, depois do D90, segue no Hub com os mesmos dados).
// Cliente que já está no Hub só entra no SAP como exceção (piloto), pela opção "Trazer um cliente do Hub".
function AbrirClinica() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ nome: "", especialidade: "", cidade: "", instagram: "", d0: "", servico: "", ticket: "", piloto: false });
  const clientesQ = useQuery({ queryKey: ["admin-clients"], queryFn: listAllClients });
  const sapQ = useQuery({ queryKey: ["sap-por-cliente"], queryFn: getSapPorCliente });
  const todos = ((clientesQ.data ?? []) as { id: string; name: string }[]).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const noSap = todos.filter((c) => sapQ.data?.has(c.id));
  const soHub = todos.filter((c) => !sapQ.data?.has(c.id));
  const criar = useMutation({
    mutationFn: () => novaClinicaSap({ nome: f.nome, especialidade: f.especialidade, cidade: f.cidade, instagram: f.instagram, d0: f.d0 || null, piloto: f.piloto, servico: f.servico, ticket: f.ticket ? Number(f.ticket.replace(/\./g, "").replace(",", ".")) : null }),
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["admin-clients"] });
      qc.invalidateQueries({ queryKey: ["sap-portfolio"] });
      qc.invalidateQueries({ queryKey: ["sap-por-cliente"] });
      navigate({ to: "/sap/$clientId/passo-a-passo" as never, params: { clientId: id } as never });
    },
  });
  const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
  const input = (k: keyof typeof f, rot: string, extra: Record<string, unknown> = {}) => (
    <label className="text-xs">{rot}<input value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-0.5 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={campo} {...extra} /></label>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setAberto((x) => !x)} className="min-h-[40px] rounded-lg px-4 text-sm font-semibold text-white" style={{ background: "#C49A5C" }} aria-expanded={aberto}>
          + Cadastrar nova clínica
        </button>
        {noSap.length > 0 && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span style={{ color: "var(--text-dim)" }}>Abrir clínica do programa:</span>
            <select defaultValue="" onChange={(e) => e.target.value && navigate({ to: "/sap/$clientId", params: { clientId: e.target.value } })} className="min-h-[38px] rounded-lg border px-2 text-sm" style={campo}>
              <option value="">Escolha…</option>
              {noSap.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {aberto && (
        <form onSubmit={(e) => { e.preventDefault(); if (f.nome.trim()) criar.mutate(); }} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="mb-3 text-sm" style={{ color: "var(--text-dim)" }}>
            Crie o cadastro para organizar a implantação e vincular os dados da clínica. O histórico permanece disponível ao fim do SAP;
            o acesso ao Nexo é liberado conforme a contratação. Informe a data da assinatura e do pagamento como início do programa (D0).
            Se a contratação ainda não foi concluída, deixe a data em branco.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {input("nome", "Nome da clínica ou do médico *", { required: true, autoComplete: "off" })}
            {input("especialidade", "Especialidade")}
            {input("cidade", "Cidade")}
            {input("instagram", "@ do Instagram")}
            {input("d0", "Início do programa (D0)", { type: "date" })}
            {input("servico", "Serviço prioritário")}
            {input("ticket", "Ticket médio (R$)", { inputMode: "decimal" })}
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.piloto} onChange={(e) => setF({ ...f, piloto: e.target.checked })} /> Piloto</label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={criar.isPending || !f.nome.trim()} className="min-h-[40px] rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
              {criar.isPending ? "Cadastrando…" : "Cadastrar e abrir o passo a passo"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="text-sm" style={{ color: "var(--text-dim)" }}>Cancelar</button>
            {criar.isError && <span className="text-sm" style={{ color: "var(--crit)" }}>{(criar.error as Error).message}</span>}
          </div>
        </form>
      )}
      {soHub.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer" style={{ color: "var(--text-dim)" }}>Exceção: trazer para o SAP um cliente que já está no Nexo</summary>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Clientes que já estavam com a Doctor Creator continuam no Nexo. Use só para um piloto combinado.</p>
          <select defaultValue="" onChange={(e) => e.target.value && navigate({ to: "/sap/$clientId", params: { clientId: e.target.value } })} className="mt-1 min-h-[38px] rounded-lg border px-2 text-sm" style={campo}>
            <option value="">Escolha o cliente do Nexo…</option>
            {soHub.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </details>
      )}
    </div>
  );
}
