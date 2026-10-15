import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import {
  diaAtual, getAcessosSap, getAcoesSap, getAuditoriasSap, getClinicaSap, getExecucaoSap, getFidelizacaoSap, getMarcosSap, getSaudeSap,
  getTestesRastreioSap,
} from "@/lib/sap-data";
import { cronogramaComDatas } from "@/lib/sap-cronograma";
import { recheckCategoria, resumoTestes } from "@/lib/sap-rastreamento";
import { calcularExecucao } from "@/lib/sap-scores";
import { ROTULO_PAPEL, contarPorSituacao, rotuloPrazo, segundaDe, tarefasDaSemana, type Papel, type Situacao } from "@/lib/sap-semana";
import { hojeBrasilia } from "@/lib/status-fonte";

const COR: Record<Situacao, string> = { atrasado: "var(--crit)", hoje: "var(--warn)", semana: "var(--accent)" };
const dm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

/** Uma lista só com o que vence nos próximos 7 dias (ou já venceu), filtrável por papel. A clínica vê só o que é dela. */
export function EstaSemanaSap({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const hoje = hojeBrasilia();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const c = cadQ.data ?? null;
  const id = c?.id;
  const on = !!id;
  const marcosQ = useQuery({ queryKey: ["sap-marcos", id], queryFn: () => getMarcosSap(id!), enabled: on });
  const acessosQ = useQuery({ queryKey: ["sap-acessos", id], queryFn: () => getAcessosSap(id!), enabled: on });
  const rastreioQ = useQuery({ queryKey: ["sap-rastreio-testes", id], queryFn: () => getTestesRastreioSap(id!), enabled: on });
  const acoesQ = useQuery({ queryKey: ["sap-acoes", id], queryFn: () => getAcoesSap(id!), enabled: on });
  const audQ = useQuery({ queryKey: ["sap-auditoria", id], queryFn: () => getAuditoriasSap(id!), enabled: on });
  const fidQ = useQuery({ queryKey: ["sap-fidelizacao", id], queryFn: () => getFidelizacaoSap(id!), enabled: on });
  const saudeQ = useQuery({ queryKey: ["sap-saude", id], queryFn: () => getSaudeSap(id!), enabled: on && isAdmin });
  const execQ = useQuery({ queryKey: ["sap-execucao", id], queryFn: () => getExecucaoSap(id!), enabled: on });
  const [papel, setPapel] = useState<Papel | "todos">(isAdmin ? "todos" : "clinica");

  const tarefas = useMemo(() => {
    if (!c) return [];
    const dia = diaAtual(c.d0, c.pausas);
    const seg = segundaDe(hoje);
    const concluidos = new Map((marcosQ.data ?? []).map((m) => [m.marco, { concluidoEm: m.concluido_em, evidencia: m.evidencia }]));
    const semanaPrograma = dia === null ? null : Math.floor(Math.max(0, dia) / 7) + 1;
    return tarefasDaSemana({
      hoje,
      d0: c.d0,
      pausas: c.pausas ?? [],
      dia,
      cronograma: c.d0 ? cronogramaComDatas(c.d0, c.pausas ?? [], hoje, concluidos) : [],
      acessos: acessosQ.data ?? null,
      rastreamento: rastreioQ.data
        ? { ...resumoTestes(rastreioQ.data, c.status_categoria_meta, c.rastreamento_conferido_por), recheckVencido: recheckCategoria(c.categoria_verificada_em, hoje).vencido }
        : null,
      acoes: acoesQ.data ?? [],
      saudeLancada: saudeQ.data ? semanaPrograma !== null && saudeQ.data.some((s) => s.semana === semanaPrograma) : null,
      auditoriaLancada: audQ.data ? audQ.data.some((a) => a.semana === seg) : null,
      fidelizacaoLancada: fidQ.data ? fidQ.data.some((f) => f.semana === seg) : null,
      execucaoVencidosSemStatus: execQ.data ? calcularExecucao(execQ.data, dia).vencidosSemStatus : null,
    });
  }, [c, hoje, marcosQ.data, acessosQ.data, rastreioQ.data, acoesQ.data, saudeQ.data, audQ.data, fidQ.data, execQ.data]);

  if (cadQ.isLoading) return <p className="note">Carregando…</p>;
  if (!c) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  if (!c.d0) return <p className="note">Defina o D0 em Programa → Editar cadastro: a lista da semana sai do cronograma, que conta a partir dele.</p>;

  const visiveis = papel === "todos" ? tarefas : tarefas.filter((t) => t.papeis.includes(papel));
  const n = contarPorSituacao(visiveis);
  const papeis: (Papel | "todos")[] = isAdmin ? ["todos", "trafego", "cs", "coordenacao", "clinica"] : ["clinica"];
  const contaPapel = (p: Papel | "todos") => (p === "todos" ? tarefas.length : tarefas.filter((t) => t.papeis.includes(p)).length);
  const dia = diaAtual(c.d0, c.pausas);

  return (
    <Painel icone={CalendarCheck} titulo={`Esta semana${dia !== null ? ` · D${dia} de 90` : ""}`}
      resumo={visiveis.length ? `${n.atrasado} atrasada(s) · ${n.hoje} para hoje · ${n.semana} nos próximos 7 dias` : "Nada vencendo nos próximos 7 dias"}
      ajuda={<>Tudo o que vence nos próximos 7 dias ou já venceu, tirado do cronograma, do checklist de acessos, do rastreamento, das ações combinadas e da rotina semanal. Cada item leva à tela onde se resolve; quando é marcado lá, some daqui.</>}>
      {isAdmin && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por papel">
          {papeis.map((p) => (
            <button key={p} type="button" role="tab" aria-selected={papel === p} onClick={() => setPapel(p)}
              className="min-h-[32px] rounded-full border px-3 text-xs font-medium"
              style={papel === p ? { background: "var(--accent)", color: "white", borderColor: "var(--accent)" } : { borderColor: "var(--border)" }}>
              {p === "todos" ? "Todos" : ROTULO_PAPEL[p]} ({contaPapel(p)})
            </button>
          ))}
        </div>
      )}
      {visiveis.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--good)" }}>Em dia. Nada vence nos próximos 7 dias{papel !== "todos" ? ` para ${ROTULO_PAPEL[papel]}` : ""}.</p>
      ) : (
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
          {visiveis.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Selo cor={COR[t.situacao]}>{rotuloPrazo(t.prazo, hoje)}</Selo>
                  <span className="text-sm font-medium">{t.titulo}</span>
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
                  {dm(t.prazo)} · {t.origem}{isAdmin ? ` · ${t.papeis.map((p) => ROTULO_PAPEL[p]).join(", ")}` : ""}
                </div>
                {t.detalhe && <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{t.detalhe}</div>}
              </div>
              {(isAdmin || t.tela === "/cronograma" || t.tela === "/leitura" || t.tela === "/onboarding" || t.tela === "/rastreamento") && (
                <Link to={`/sap/$clientId${t.tela}` as never} params={{ clientId } as never}
                  className="inline-flex min-h-[32px] items-center rounded-lg border px-3 text-xs font-semibold" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                  Abrir →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}
