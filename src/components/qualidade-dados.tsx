import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getQualidadeDados, getCrmBaseViva, type ProblemaDado } from "@/lib/client-data";
import { ROTULO_RESPONSAVEL, type Responsavel } from "@/lib/insight";
import { fmtTaxa } from "@/lib/metricas";
import { causaHonesta } from "@/lib/qualidade-insights";
import { NxCard, NxTag } from "@/components/nx/base";
import { NxAviso, NxTabela } from "@/components/nx/blocos";
import { NxCabecaDoBloco } from "@/components/nx/cabeca-do-bloco";
import type { CabecaDoBloco } from "@/lib/leitura/cabeca-do-bloco";

// "Dado com erro": o que está entrando errado na origem (CRM, Instagram, anúncios),
// a causa provável e o que fazer para corrigir. Regras fixas no banco (qualidade_dados).

const NOTA = { margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--muted-ink)" } as const;

const FONTE: Record<string, string> = { crm: "CRM", instagram: "Instagram", anuncios: "Anúncios", atendimento: "WhatsApp", comentarios: "Comentários" };

export function useQualidadeDados(clientId: string) {
  return useQuery({ queryKey: ["qualidade-dados", clientId], queryFn: () => getQualidadeDados(clientId), staleTime: 10 * 60_000, retry: false });
}

/** Um problema de dado: crítico quando afeta a leitura, atenção nos demais. A causa, a correção e o que fica distorcido ficam em "Entender". */
function Item({ p }: { p: ProblemaDado }) {
  const alta = p.severidade === "alta";
  const detalhe = (
    <dl className="space-y-2">
      <div>
        <dt><b>O que os dados mostram</b></dt>
        <dd>{p.evidencia}</dd>
      </div>
      <div>
        <dt><b>Causa provável</b></dt>
        <dd>{causaHonesta(p)} (hipótese da regra: confirme com a equipe)</dd>
      </div>
      <div>
        <dt><b>Como corrigir</b></dt>
        <dd>{p.correcao}</dd>
        <dd>
          Quem corrige: <b>{ROTULO_RESPONSAVEL[p.responsavel as Responsavel] ?? p.responsavel}</b>
        </dd>
      </div>
      <div>
        <dt><b>O que fica distorcido até corrigir</b></dt>
        <dd>{p.afeta}</dd>
      </div>
    </dl>
  );
  return (
    <li>
      <NxAviso tom={alta ? "critico" : "atencao"} titulo={p.titulo} detalhe={detalhe}>
        {`(${FONTE[p.fonte] ?? p.fonte} · ${alta ? "afeta a leitura" : "atenção"})`}
      </NxAviso>
    </li>
  );
}

/** Lista de problemas de dado. `fonte` filtra (ex.: só CRM na tela Comercial). */
export function QualidadeDados({ clientId, fonte, titulo = "Dados com erro na origem", compacto = false }: { clientId: string; fonte?: string; titulo?: string; compacto?: boolean }) {
  const { data } = useQualidadeDados(clientId);
  const [todos, setTodos] = useState(false);
  const itens = (data ?? []).filter((p) => !fonte || p.fonte === fonte).sort((a, b) => (a.severidade === b.severidade ? 0 : a.severidade === "alta" ? -1 : 1));
  if (itens.length === 0) return null;
  const altas = itens.filter((p) => p.severidade === "alta").length;
  const visiveis = compacto && !todos ? itens.slice(0, 2) : itens;
  return (
    <NxCard
      rotulo={titulo}
      titulo={titulo}
      subtitulo={`${itens.length} ${itens.length === 1 ? "problema" : "problemas"}${altas ? ` · ${altas} afeta${altas === 1 ? "" : "m"} a leitura` : ""}`}
    >
      <p style={NOTA}>
        A sincronização roda sozinha todo dia. Estes problemas estão no dado que entra (CRM, Instagram, anúncios) e distorcem os números até serem corrigidos na origem.
      </p>
      <ul className="nx-lista">
        {visiveis.map((p) => (
          <Item key={p.id} p={p} />
        ))}
      </ul>
      {compacto && itens.length > 2 && (
        <button type="button" onClick={() => setTodos(!todos)} className="ws-action ws-action--secondary">
          {todos ? "Mostrar menos" : `Ver os ${itens.length} problemas`}
        </button>
      )}
      {itens.some((p) => p.fonte === "crm") && (
        <Link to="/$clientId/crm-guia" params={{ clientId }} className="ws-action ws-action--secondary">
          Abrir o guia passo a passo para organizar o CRM →
        </Link>
      )}
    </NxCard>
  );
}

/** Converte cada problema em recomendação operacional (entra em Oportunidades e no Início): causa como hipótese. */
export { problemasParaInsights } from "@/lib/qualidade-insights";

/** Base viva x parada: quantos leads em aberto de fato estão em movimento. */
export function BaseVivaCrm({ clientId, cabeca }: { clientId: string; cabeca?: (b: { abertos: number; vivos_30d: number; parados_90d: number }) => CabecaDoBloco }) {
  const { data: b } = useQuery({ queryKey: ["crm-base-viva", clientId], queryFn: () => getCrmBaseViva(clientId), staleTime: 10 * 60_000, retry: false });
  if (!b) return null;
  const pct = (x: number) => fmtTaxa(x, b.abertos);
  const fmt = (x: number) => x.toLocaleString("pt-BR");
  const meio = Math.max(0, b.abertos - b.vivos_30d - b.parados_90d);
  const partes: { rot: string; v: number; tom: "up" | "or" | "dn" }[] = [
    { rot: "Em movimento (últimos 30 dias)", v: b.vivos_30d, tom: "up" },
    { rot: "Sem movimento de 30 a 90 dias", v: meio, tom: "or" },
    { rot: "Parados há 90+ dias", v: b.parados_90d, tom: "dn" },
  ];
  return (
    <NxCard rotulo="Base viva do CRM" titulo="Leads em aberto: quantos estão vivos">
      {cabeca && <NxCabecaDoBloco cabeca={cabeca(b)} />}
      <p style={NOTA}>
        Dos <b>{fmt(b.abertos)}</b> leads em aberto no CRM, <b>{fmt(b.vivos_30d)}</b> ({pct(b.vivos_30d)}) tiveram alguma movimentação nos últimos 30 dias.
        {b.parados_90d > 0 && <> <b>{fmt(b.parados_90d)}</b> ({pct(b.parados_90d)}) estão parados há mais de 90 dias: é estoque, não fila de atendimento.</>}
      </p>
      <NxTabela
        rotulo="Leads em aberto por tempo sem movimento"
        colunas={[
          { chave: "faixa", titulo: "Faixa" },
          { chave: "leads", titulo: "Leads", numerica: true },
          { chave: "parte", titulo: "Do total", numerica: true },
        ]}
        linhas={partes.map((p) => ({
          faixa: <NxTag tom={p.tom}>{p.rot}</NxTag>,
          leads: fmt(p.v),
          parte: pct(p.v),
        }))}
        chaveDaLinha={(_, k) => k}
      />
      <p style={NOTA}>
        Os números de “base” mais abaixo continuam contando todos os leads (a definição não mudou). Para ler o funil de hoje, olhe os do período. Movimentação = última atualização do lead no CRM; uma edição em massa (importação, troca de etapa em lote) conta como movimento. Como corrigir: no CRM, mover os parados para “perdido” com o motivo, ou para um funil de reativação.
      </p>
    </NxCard>
  );
}
