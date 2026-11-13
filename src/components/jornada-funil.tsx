import { Fragment, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, Plug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NxCard, NxTag } from "@/components/nx";
import { CmMetodo, icT } from "@/components/nx/comercial-base";
import { AVISO_JORNADA_PESSOAS, montarFunil, type EtapaFunil, type FunilBanco } from "@/lib/jornada-funil";
import { usePacientesPeriodo } from "@/hooks/use-pacientes-periodo";
import { formatRangeLabel } from "@/lib/date-range";
import { useDiagnosticoComercial } from "@/components/comercial-diagnostico";
import { fmtFracao } from "@/lib/metricas";
import { AVISO_MUDANCA_FUNIL, fmtNdeM } from "@/lib/funil-taxa";
import { NxCabecaDoBloco } from "@/components/nx/cabeca-do-bloco";
import type { CabecaDoBloco } from "@/lib/leitura/cabeca-do-bloco";

// Funil de 7 etapas do período. Etapa sem dado mostra o que falta (integração, dado e onde resolver),
// nunca um zero que parece resultado.

async function lerFunil(clientId: string, de: string, ate: string): Promise<FunilBanco | null> {
  const { data, error } = await (supabase as any).rpc("jornada_funil", { p_client: clientId, p_de: de, p_ate: ate });
  if (error) {
    if (error.code === "PGRST202" || /jornada_funil/.test(error.message ?? "")) return null;
    throw error;
  }
  return (data as FunilBanco | null) ?? null;
}

const COR: Record<EtapaFunil["estado"], string> = { medido: "var(--grad-bar)", zero: "var(--or)", parcial: "var(--or)", sem_integracao: "var(--muted-2)" };
const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (t: number) => fmtFracao(t);
const NOME: Record<string, string> = { alcance: "alcance", engajamento: "engajamento", comentario: "comentário", conversa: "conversa", lead: "lead", agendamento: "agendamento", venda: "venda" };

// Uma etapa: nome, número grande, barra (escala log, como antes) e a explicação curta. O que falta para medir fica
// num "O que falta" recolhido, sem sumir.
function LinhaEtapa({ e, largura }: { e: EtapaFunil; largura: number }) {
  const sem = e.valor == null;
  return (
    <li className={`cm-etapa${e.estado === "sem_integracao" ? " cm-etapa--sem" : ""}`}>
      <div className="cm-barra__linha">
        <span className="cm-barra__rotulo">
          <span className="nx-rank" aria-hidden>{e.n}</span>
          {e.nome}
        </span>
        {sem ? (
          <NxTag tom="g" icone={<Plug size={13} aria-hidden />}>{e.estado === "sem_integracao" ? "Sem integração" : "Não medido"}</NxTag>
        ) : (
          <span className="cm-barra__valor">
            <b>{fmt(e.valor!)}</b>
            <small style={{ color: "var(--muted-ink)" }}>{e.unidade}</small>
          </span>
        )}
      </div>
      {!sem && (
        <span className="cm-trilho" aria-hidden>
          <i style={{ width: `${Math.max(2, largura * 100)}%`, background: COR[e.estado] }} />
        </span>
      )}
      {e.explicacao && <p className="cm-barra__nota" style={{ margin: 0 }}>{e.explicacao}</p>}
      {e.falta && (
        <details className="cm-aviso__mais">
          <summary>O que falta para medir</summary>
          <dl className="grid gap-1 rounded-md p-2 text-xs sm:grid-cols-3" style={{ background: "var(--field)", color: "var(--text-2)" }}>
            <div><dt className="font-semibold" style={{ color: "var(--text)" }}>Integração que falta</dt><dd>{e.falta.integracao}</dd></div>
            <div><dt className="font-semibold" style={{ color: "var(--text)" }}>Dado necessário</dt><dd>{e.falta.dado}</dd></div>
            <div><dt className="font-semibold" style={{ color: "var(--text)" }}>Onde resolver</dt><dd>{e.falta.onde}</dd></div>
          </dl>
        </details>
      )}
    </li>
  );
}

function Passagem({ e }: { e: EtapaFunil }) {
  if (e.semPassagem)
    return (
      <li className="cm-passagem" aria-label={e.semPassagem}>
        <ArrowDown size={13} aria-hidden /> {e.semPassagem}
      </li>
    );
  if (e.taxa == null && !e.fracao) return <li className="cm-passagem cm-passagem--vazia" aria-hidden />;
  return (
    <li className="cm-passagem">
      <ArrowDown size={13} aria-hidden />
      <NxTag tom="b">{e.taxa != null ? pct(e.taxa) : fmtNdeM(e.fracao!)}</NxTag>
      {e.taxa != null ? `passam para ${NOME[e.id] ?? e.id}` : `passam para ${NOME[e.id] ?? e.id} (poucos casos para %)`}
    </li>
  );
}

/**
 * O funil de 7 etapas do período, montado com o que a tela já carrega. Quem mostra o funil (este componente) e quem lê o funil
 * (a leitura da Jornada, 03.1.1) usam esta mesma conta e as mesmas chaves do React Query: nenhuma consulta nova.
 */
export function useFunilDaJornada(clientId: string, start: string, end: string, enabled = true) {
  const q = useQuery({ queryKey: ["jornada-funil", clientId, start, end], queryFn: () => lerFunil(clientId, start, end), staleTime: 5 * 60_000, retry: false, enabled });
  const diagnostico = useDiagnosticoComercial(clientId, start, end, enabled);
  // Pessoas novas e agendados com a regra da tela Pacientes do período (mesma consulta em cache). Se ela falhar, as
  // etapas mostram os cards do CRM, com esse nome.
  const pacientes = usePacientesPeriodo(clientId, start, end, enabled);
  const pac = pacientes.isError ? null : pacientes.data;
  const funil = useMemo(
    () => (q.data !== undefined && pac !== undefined ? montarFunil(q.data, diagnostico.data?.dados.escopo === "periodo" ? diagnostico.data.funil : null, pac) : null),
    [q.data, pac, diagnostico.data],
  );
  return { q, pacientes, pac, funil };
}

export function JornadaFunil({
  clientId,
  start,
  end,
  cabeca,
  semMaiorQueda = false,
}: {
  clientId: string;
  start: string;
  end: string;
  /** A resposta do bloco (quick-ver-tudo-abas): UMA frase da regra da tela, com o número em destaque, antes da prova. */
  cabeca?: (funil: NonNullable<ReturnType<typeof useFunilDaJornada>["funil"]>) => CabecaDoBloco;
  /** A maior queda do comercial já está no funil desenhado do topo da aba: não repete aqui. */
  semMaiorQueda?: boolean;
}) {
  const { q, pacientes, pac, funil } = useFunilDaJornada(clientId, start, end);
  const compartilhado = pac?.crm_compartilhado_com ?? [];
  // Barras em escala log: alcance (centenas de milhares) e venda (unidades) no mesmo eixo.
  const maxLog = funil ? Math.max(1, ...funil.etapas.map((e) => (e.valor ? Math.log10(e.valor + 1) : 0))) : 1;
  const semNada = funil && funil.medidas === 0;

  return (
    <NxCard id="funil-jornada" nivel={2} icone={icT("filter")} titulo="Funil do período: do alcance à venda" subtitulo={`7 etapas · ${formatRangeLabel({ start, end })}${funil ? ` · ${funil.medidas} de 7 com dado` : ""}`}>
      {(q.isLoading || (pacientes.isLoading && !pacientes.isError)) && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg" style={{ background: "var(--field)" }} />)}
        </div>
      )}
      {q.error && (
        <p className="flex items-start gap-2 text-sm" style={{ color: "var(--crit)" }}>
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" /> Não consegui montar o funil agora. Tente de novo em instantes.
        </p>
      )}
      {funil && (
        <>
          {cabeca && <NxCabecaDoBloco cabeca={cabeca(funil)} />}
          {compartilhado.length > 0 && (
            <p className="cm-aviso cm-aviso--critico" style={{ margin: 0 }}>
              O CRM desta clínica é o mesmo de {compartilhado.join(", ")}. Os números do CRM abaixo são da conta inteira, não só deste médico.
            </p>
          )}
          {semNada ? (
            <p className="nx-vazio text-sm" style={{ margin: 0 }}>Nenhuma etapa pode ser medida ainda: cada uma abaixo diz qual integração falta e qual dado seria necessário.</p>
          ) : ((funil.maiorQueda && !semMaiorQueda) || funil.receita > 0) && (
            <div className="nx-aviso">
              <span className="nx-tile nx-tile--suave" aria-hidden>{icT("bulb")}</span>
              <span>
                {funil.maiorQueda && !semMaiorQueda && <>Maior queda no comercial: de <strong>{NOME[funil.maiorQueda.de]}</strong> para <strong>{NOME[funil.maiorQueda.para]}</strong> ({pct(funil.maiorQueda.taxa)} passam).</>}
                {funil.receita > 0 && `${funil.maiorQueda && !semMaiorQueda ? " " : ""}Receita registrada: ${funil.receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}.`}
              </span>
            </div>
          )}
          <ol className="cm-etapas">
            {funil.etapas.map((e) => (
              <Fragment key={e.id}>
                {e.n > 1 && <Passagem e={e} />}
                <LinhaEtapa e={e} largura={e.valor ? Math.log10(e.valor + 1) / maxLog : 0} />
              </Fragment>
            ))}
          </ol>
          <CmMetodo>
            {!semNada && (
              <p>
                A porcentagem entre etapas só aparece quando as duas são medidas e a etapa de base tem casos suficientes. O funil não é uma fila única: lead de
                formulário, por exemplo, não passa pelo WhatsApp. As barras usam escala logarítmica, para o alcance e a venda caberem no mesmo eixo.
              </p>
            )}
            <p>{AVISO_MUDANCA_FUNIL}</p>
            {pac && <p>{AVISO_JORNADA_PESSOAS}</p>}
          </CmMetodo>
        </>
      )}
    </NxCard>
  );
}
