import { useMemo, useState } from "react";
import { usePacientesPeriodo } from "@/hooks/use-pacientes-periodo";
import { NxTabela, NxVazio, NxCarregando, NxErro, NxAviso } from "@/components/nx/blocos";
import { EM_CONSTRUCAO } from "@/lib/leitura/fatos-pacientes";
import type { ItemPessoa, PacientesPeriodo } from "@/lib/pacientes";
import { usePublicarContagem } from "@/components/nx/abas-em-pasta";

/** Número das abas Consultas e Vendas: o mesmo "Fechou" do CRM. null ("—") quando a clínica não tem essa fonte. */
export function usePublicarFechados(clientId: string, start: string, end: string, q: { isLoading: boolean; error: unknown; data?: PacientesPeriodo }) {
  const n = q.data?.numeros?.fecharam;
  const ligado = !!q.data?.tem_crm && n?.fonte === "crm" && n.valor != null && String(n.criterio ?? "").includes("consulta realizada");
  const valor = q.isLoading ? undefined : q.error || !ligado ? null : (n!.valor as number);
  usePublicarContagem({ clientId, de: start, ate: end, rota: "/_authenticated/$clientId/consultas", valor });
  usePublicarContagem({ clientId, de: start, ate: end, rota: "/_authenticated/$clientId/vendas", valor });
}

// Consultas e Vendas lidas do CRM (19/11/2026, João): quando a clínica marca no card a data da consulta realizada,
// essa é a fonte. Cada linha mostra de onde veio (evidência) e o que foi vendido. Sem dado nunca vira zero.

type Item = ItemPessoa & { medico?: string | null; lead_id?: string | null; evidencia?: string | null };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dataBR = (d: string | null) => (d ? d.split("-").reverse().join("/") : null);

export function FechadosDoCrm({ clientId, start, end, modo }: { clientId: string; start: string; end: string; modo: "consultas" | "vendas" }) {
  const q = usePacientesPeriodo(clientId, start, end);
  usePublicarFechados(clientId, start, end, q);
  const num = q.data?.numeros?.fecharam;
  const todos = (q.data?.listas?.fecharam?.itens ?? []) as Item[];
  // Filtro por médico (19/11/2026): o card pode ter mais de um médico ("Lana, Josué"); conta para cada um que aparece nele.
  const medicos = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of todos) for (const m of (i.medico || "não identificado").split(",").map((x) => x.trim())) c.set(m, (c.get(m) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  }, [todos]);
  const [medico, setMedico] = useState<string>("todos");
  const itens = useMemo(
    () => (medico === "todos" ? todos : todos.filter((i) => (i.medico || "não identificado").split(",").map((x) => x.trim()).includes(medico))),
    [todos, medico],
  );

  const porMedico = useMemo(() => {
    const m = new Map<string, { n: number; valor: number; comValor: number }>();
    for (const i of itens) {
      const k = i.medico || "não identificado";
      const r = m.get(k) ?? { n: 0, valor: 0, comValor: 0 };
      r.n++;
      if (i.valor && i.valor > 0) { r.valor += i.valor; r.comValor++; }
      m.set(k, r);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [itens]);

  if (q.isLoading) return <NxCarregando />;
  if (q.error) return <NxErro texto="Não foi possível ler o CRM agora." onTentar={() => q.refetch()} />;

  const ligado = !!q.data?.tem_crm && num?.fonte === "crm" && num.valor != null && String(num.criterio ?? "").includes("consulta realizada");
  if (!ligado) {
    return (
      <NxVazio
        emConstrucao
        titulo={modo === "consultas" ? "O que falta para medir as consultas" : "O que falta para medir as vendas"}
        falta={EM_CONSTRUCAO[modo]!.falta}
        passo="Marcar no card do CRM a data da consulta realizada e o valor, ou conectar a fonte da clínica (Feegow, Ninsaúde ou checkout)."
        quem="equipe_hub"
      />
    );
  }

  const comValor = itens.filter((i) => i.valor && i.valor > 0);
  const total = comValor.reduce((s, i) => s + (i.valor ?? 0), 0);
  const semValor = itens.length - comValor.length;
  const lista = modo === "vendas" ? [...comValor, ...itens.filter((i) => !(i.valor && i.valor > 0))] : itens;

  return (
    <div className="nx-fechados">
      <label className="nx-fechados__filtro" style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 12px", fontSize: 14 }}>
        Médico
        <select value={medico} onChange={(e) => setMedico(e.target.value)} style={{ padding: "4px 8px", borderRadius: 8 }}>
          <option value="todos">Todos ({todos.length})</option>
          {medicos.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </label>
      <NxAviso tom="info" titulo={modo === "consultas" ? `${itens.length} consultas realizadas no período${medico !== "todos" ? ` com ${medico}` : ""}` : `${itens.length} vendas fechadas no período${medico !== "todos" ? ` com ${medico}` : ""}`}>
        {modo === "consultas"
          ? "Conta cada pessoa com a data da consulta realizada marcada no card do CRM, dentro do período."
          : `Venda fechada = consulta paga, consulta realizada ou tratamento vendido. ${comValor.length} com valor registrado (${brl(total)}); ${semValor} sem valor no card.`}
      </NxAviso>
      {modo === "vendas" && semValor > 0 && (
        <NxAviso tom="atencao" titulo={`${semValor} de ${itens.length} vendas sem valor no CRM`}>
          O total em R$ cobre só as vendas com valor preenchido no card. Quem resolve: comercial da clínica.
        </NxAviso>
      )}
      <NxTabela
        rotulo="Por médico"
        colunas={[
          { chave: "medico", titulo: "Médico" },
          { chave: "n", titulo: modo === "consultas" ? "Consultas" : "Vendas", numerica: true },
          ...(modo === "vendas" ? [{ chave: "valor", titulo: "Valor registrado", numerica: true }] : []),
        ]}
        linhas={porMedico.map(([k, r]) => ({ medico: k, n: r.n, valor: r.comValor ? brl(r.valor) : "Sem valor" }))}
      />
      <NxTabela
        rotulo={modo === "consultas" ? "Consultas realizadas" : "Vendas fechadas"}
        colunas={[
          { chave: "data", titulo: "Data" },
          { chave: "nome", titulo: "Paciente" },
          { chave: "medico", titulo: "Médico" },
          ...(modo === "vendas" ? [{ chave: "valor", titulo: "Valor", numerica: true }] : []),
          { chave: "etapa", titulo: "Etapa no CRM" },
          { chave: "evidencia", titulo: "De onde veio" },
        ]}
        chaveDaLinha={(_, k) => lista[k]?.id ?? k}
        linhas={lista.map((i) => ({
          data: dataBR(i.data),
          nome: i.nome ?? "Sem nome",
          medico: i.medico || "não identificado",
          valor: i.valor && i.valor > 0 ? brl(i.valor) : "Sem valor",
          etapa: [i.crm?.funil, i.crm?.etapa].filter(Boolean).join(" · ") || null,
          evidencia: `${i.evidencia ?? "CRM"}${i.lead_id ? ` (card ${i.lead_id})` : ""}`,
        }))}
      />
    </div>
  );
}
