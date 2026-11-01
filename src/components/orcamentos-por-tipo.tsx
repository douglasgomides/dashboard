import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, ChevronDown } from "lucide-react";
import { Painel, Selo } from "@/components/visual";
import { useAuth } from "@/hooks/use-auth";
import { formatRangeLabel } from "@/lib/date-range";
import {
  conclusoesOrcamentos, corrigirTipo, getOrcamentosPorTipo, MIN_ITENS, TIPOS_PROCEDIMENTO,
  type NomeProcedimento, type TipoProcedimento,
} from "@/lib/orcamentos-tipo";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString("pt-BR");

/** Orçamentos agrupados por tipo de procedimento, contados por paciente. Some quando os cards não têm procedimento. */
export function OrcamentosPorTipo({ clientId, start, end }: { clientId: string; start: string; end: string }) {
  const q = useQuery({
    queryKey: ["crm-orcamentos-por-tipo", clientId, start, end],
    queryFn: () => getOrcamentosPorTipo(clientId, start, end),
    retry: false,
  });
  const d = q.data;
  if (q.isPending || q.isError || !d || d.itens < MIN_ITENS) return null;
  const conclusoes = conclusoesOrcamentos(d);

  return (
    <Painel
      icone={Layers}
      titulo="Orçamentos por tipo de procedimento"
      resumo={`${num(d.pessoas)} pacientes · ${num(d.itens)} itens de orçamento · ${formatRangeLabel({ start, end })}`}
      cor="var(--s2)"
      ajuda={
        <>
          Cada item do orçamento (consulta, exame, medicação, programa…) é um card no CRM. Aqui os itens são agrupados pelo tipo do
          procedimento e contados por paciente. <b>Aprovado</b> é a etapa marcada como ganho. <b>Esfriou</b> é o orçamento em aberto
          criado há mais de 60 dias: é só uma leitura nossa, nada muda no CRM. O tipo vem de uma regra pelo nome do procedimento; a
          equipe Doctor Creator pode corrigir abaixo.
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Numero rotulo="Pacientes que aprovaram algo" valor={`${num(d.pessoas_aprovadas)} de ${num(d.pessoas)}`} />
          <Numero rotulo="Valor por paciente" valor={d.valor_por_paciente ? brl(d.valor_por_paciente) : "—"} />
          <Numero rotulo="Valor aprovado" valor={brl(d.valor_aprovado)} />
          <Numero rotulo="Esfriaram (+60 dias)" valor={num(d.esfriados)} />
        </div>

        {conclusoes.length > 0 && (
          <ul className="space-y-1 rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)" }} aria-label="O que os números dizem">
            {conclusoes.map((c) => <li key={c}>• {c}</li>)}
          </ul>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Orçamentos por tipo de procedimento</caption>
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                <th className="py-1 pr-2 font-medium">Tipo</th>
                <th className="py-1 pr-2 text-right font-medium">Pacientes</th>
                <th className="py-1 pr-2 text-right font-medium">Itens</th>
                <th className="py-1 pr-2 text-right font-medium">Aprovados</th>
                <th className="py-1 pr-2 text-right font-medium">Valor aprovado</th>
                <th className="py-1 pr-2 text-right font-medium">Em aberto</th>
                <th className="py-1 text-right font-medium">Esfriou</th>
              </tr>
            </thead>
            <tbody>
              {d.tipos.map((t) => (
                <tr key={t.tipo} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <th scope="row" className="py-1.5 pr-2 text-left font-medium">{t.tipo}</th>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{num(t.pessoas)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{num(t.itens)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{num(t.aprovados)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {brl(t.valor_aprovado)}
                    {t.aprovados_sem_valor > 0 && <span className="block text-[11px]" style={{ color: "var(--muted)" }}>{num(t.aprovados_sem_valor)} sem valor</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{num(t.em_aberto)}</td>
                  <td className="py-1.5 text-right tabular-nums">{num(t.esfriados)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {d.pessoas_com_consulta > 0 && (
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            {num(d.pessoas_com_consulta)} pacientes tiveram consulta orçada no período; {num(d.consulta_e_compra)} deles também aprovaram
            outro item (exame, medicação, programa…).
          </p>
        )}

        {d.cards_internos > 0 && (
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            {num(d.cards_internos)} orçamentos de contatos marcados como Equipe ou Fornecedor no CRM ficaram fora destas contas.
          </p>
        )}

        <RevisarTipos clientId={clientId} nomes={d.procedimentos} />
      </div>
    </Painel>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
      <div className="text-xs" style={{ color: "var(--text-dim)" }}>{rotulo}</div>
      <div className="mt-1 font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

function RevisarTipos({ clientId, nomes }: { clientId: string; nomes: NomeProcedimento[] }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: ({ procedimento, tipo }: { procedimento: string; tipo: TipoProcedimento }) => corrigirTipo(clientId, procedimento, tipo),
    onSuccess: () => { setErro(null); void qc.invalidateQueries({ queryKey: ["crm-orcamentos-por-tipo", clientId] }); },
    onError: (e) => setErro(mensagemDeErroAcao(e)),
  });
  if (!isAdmin || nomes.length === 0) return null;
  return (
    <details className="group rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium">
        Revisar o tipo de cada procedimento ({nomes.length})
        <ChevronDown size={16} aria-hidden className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 p-3 pt-0">
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Só a equipe Doctor Creator vê esta lista. A correção vale para este cliente e para todo o histórico.
        </p>
        {erro && <p role="alert" className="text-xs" style={{ color: "var(--crit)" }}>Não salvou: {erro}</p>}
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {nomes.map((p) => (
            <li key={p.procedimento} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 break-words">
                {p.procedimento} <span className="text-xs" style={{ color: "var(--muted)" }}>· {num(p.itens)}</span>
                {p.corrigido && <> <Selo cor="var(--good)">corrigido</Selo></>}
              </span>
              <select
                aria-label={`Tipo de ${p.procedimento}`}
                className="rounded-md border px-2 py-1 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                value={p.tipo}
                disabled={m.isPending}
                onChange={(e) => m.mutate({ procedimento: p.procedimento, tipo: e.target.value as TipoProcedimento })}
              >
                {TIPOS_PROCEDIMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
