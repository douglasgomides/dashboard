import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Painel } from "@/components/visual";
import {
  qualidadeComercialSchema,
  eventosComerciaisSchema,
  saudeFonteComercial,
  PROVEDORES,
  EVENTOS_COMERCIAIS,
} from "@/lib/jornada-comercial";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;
const dataHora = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Indisponível";
const nome = (p: string) => PROVEDORES[p] ?? p;
const dim = { color: "var(--text-dim)" };
const caixa = { borderColor: "var(--border)", background: "var(--surface)" };

/** A chave descarta paginação/detalhe ao mudar de clínica ou período. */
export function JornadaComercial(props: {
  clientId: string;
  start: string;
  end: string;
}) {
  return (
    <LeituraComercial
      key={`${props.clientId}:${props.start}:${props.end}`}
      {...props}
    />
  );
}

function LeituraComercial({
  clientId,
  start,
  end,
}: {
  clientId: string;
  start: string;
  end: string;
}) {
  const [offset, setOffset] = useState(0);
  const [lead, setLead] = useState<string | null>(null);
  const detalheRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (lead) detalheRef.current?.focus();
  }, [lead]);
  const leitura = useQuery({
    queryKey: ["jornada-qualidade", clientId, start, end, offset],
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await rpc("jornada_qualidade", {
        p_client: clientId,
        p_de: start,
        p_ate: end,
        p_offset: offset,
      });
      if (r.error)
        throw new Error(
          "Não foi possível conferir a jornada comercial. Verifique o acesso e a migração deste ambiente.",
        );
      const parsed = qualidadeComercialSchema.safeParse(r.data);
      if (!parsed.success)
        throw new Error(
          "A fonte não devolveu o contrato de qualidade esperado. Os dados não foram considerados válidos.",
        );
      return parsed.data;
    },
  });
  const detalhe = useQuery({
    queryKey: ["jornada-eventos-comerciais", clientId, lead],
    enabled: !!lead,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await rpc("jornada_eventos_comerciais", {
        p_client: clientId,
        p_lead: lead,
      });
      if (r.error)
        throw new Error("Não foi possível conferir os eventos deste registro.");
      if (r.data === null)
        throw new Error("Registro indisponível nesta clínica.");
      return eventosComerciaisSchema.parse(r.data);
    },
  });
  const r = leitura.data;
  return (
    <section aria-label="Inteligência comercial 360" className="space-y-4">
      <Painel
        icone={ShieldCheck}
        titulo="Inteligência comercial · qualidade da jornada"
        resumo="Da entrada no CRM aos resultados observados, com evidência e origem de cada vínculo."
      >
        {leitura.isPending && (
          <p role="status">Conferindo fontes e associações…</p>
        )}
        {leitura.isError && (
          <div role="alert" className="text-sm">
            <p>{leitura.error.message}</p>
            <button
              className="mt-2 min-h-[44px] underline"
              onClick={() => void leitura.refetch()}
            >
              Tentar novamente
            </button>
          </div>
        )}
        {r && (
          <>
            <p className="mb-3 max-w-4xl text-sm" style={dim}>
              Registros com entrada de {start.split("-").reverse().join("/")} a{" "}
              {end.split("-").reverse().join("/")}. Conversas e desfechos
              mostram o estado observado na base atual. Uma oportunidade não
              equivale a uma pessoa única.
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Registros no CRM", r.resumo.registros_crm],
                ["Com conversa verificada", r.resumo.com_conversa_verificada],
                ["Com saída observada", r.resumo.com_saida_observada],
                ["Sem origem informada", r.resumo.sem_origem],
              ].map(([titulo, valor]) => (
                <div
                  key={titulo}
                  className="rounded-lg border p-3"
                  style={caixa}
                >
                  <div className="text-2xl font-semibold tabular-nums">
                    {Number(valor).toLocaleString("pt-BR")}
                  </div>
                  <p className="text-sm" style={dim}>
                    {titulo}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-lg border p-3" style={caixa}>
                <b>{r.resumo.sinal_agendamento_crm} com etapa de agendamento</b>
                <p style={dim}>
                  Sinal do CRM mapeado pela equipe; confirmação pela agenda
                  pendente.
                </p>
              </div>
              <div className="rounded-lg border p-3" style={caixa}>
                <b>{r.resumo.negocios_ganhos} negócios ganhos no CRM</b>
                <p style={dim}>
                  {r.resumo.valor_negocios_ganhos === null
                    ? "Valor indisponível"
                    : r.resumo.valor_negocios_ganhos.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}{" "}
                  · {r.resumo.ganhos_sem_valor} sem valor. Não representa
                  pagamento recebido.
                </p>
              </div>
              <div className="rounded-lg border p-3" style={caixa}>
                <b>Comparecimento e receita: indisponíveis</b>
                <p style={dim}>
                  Aguardam integração administrativa com agenda e financeiro.
                  Ausência de dados não significa zero.
                </p>
              </div>
            </div>
            {(r.conversas.conflitos > 0 ||
              r.conversas.vinculos_invalidos > 0) && (
              <p
                role="status"
                className="mt-3 rounded-lg border p-3 text-sm"
                style={{
                  borderColor: "var(--warn-border)",
                  background: "var(--warn-bg)",
                }}
              >
                {r.conversas.conflitos} vínculo(s) em conflito e{" "}
                {r.conversas.vinculos_invalidos} com evidência desatualizada, na
                base inteira da clínica. Não entram nas contagens verificadas.
              </p>
            )}
            <details className="mt-3 text-sm">
              <summary className="min-h-[44px] cursor-pointer content-center font-medium">
                Como os dados foram associados
              </summary>
              <ul className="list-disc space-y-1 pl-5" style={dim}>
                {r.limitacoes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </Painel>
      {r && (
        <>
          <Painel
            icone={Link2}
            titulo="Qualidade por fonte"
            resumo="Histórico preservado, rastreamento e lacunas de preenchimento. Sincronizar com sucesso não comprova completude."
          >
            {!r.fontes.length && (
              <p className="text-sm" style={dim}>
                Nenhuma conexão de CRM cadastrada nesta clínica.
              </p>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              {r.fontes.map((f) => (
                <div
                  key={f.conexao_id}
                  className="rounded-lg border p-3 text-sm"
                  style={caixa}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <b>{nome(f.provider)}</b>
                    <span style={dim}>{saudeFonteComercial(f)}</span>
                  </div>
                  <p className="mt-1" style={dim}>
                    Conexão {f.conexao_id.slice(0, 8)} ·{" "}
                    {f.registros_historicos.toLocaleString("pt-BR")} registros
                    históricos
                  </p>
                  <p style={dim}>
                    Primeira entrada informada: {dataHora(f.historico_desde)}
                  </p>
                  <p style={dim}>
                    Última gravação: {dataHora(f.ultima_gravacao)}
                  </p>
                  <p style={dim}>
                    Sucesso do CRM no cliente:{" "}
                    {dataHora(f.ultimo_sucesso_compartilhado)} · não certifica
                    esta conexão.
                  </p>
                  <p className="mt-2">
                    {f.sem_origem} sem origem · {f.sem_data_origem} sem data de
                    entrada · carga histórica{" "}
                    {f.backfill_concluido === null
                      ? "não comprovada"
                      : f.backfill_concluido
                        ? "marcada como concluída na fonte"
                        : "em andamento"}
                    .
                  </p>
                </div>
              ))}
            </div>
            {r.por_fonte.length > 0 && (
              <div
                className="mt-4 overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Qualidade por fonte no período"
              >
                <table className="w-full text-left text-sm">
                  <caption className="mb-2 text-left" style={dim}>
                    Coorte selecionada · registros de cada fonte
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Fonte",
                        "Registros",
                        "Sem origem",
                        "Sem etapa mapeada",
                        "Conversa verificada",
                        "Só identidade legada",
                      ].map((x) => (
                        <th key={x} className="p-2 font-medium">
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.por_fonte.map((f) => (
                      <tr
                        key={f.provider}
                        className="border-t"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {[
                          nome(f.provider),
                          f.registros,
                          f.sem_origem,
                          f.sem_etapa_mapeada,
                          f.com_conversa_verificada,
                          f.somente_identidade_legada,
                        ].map((x, i) => (
                          <td key={i} className="p-2 tabular-nums">
                            {x}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs" style={dim}>
              {r.conversas.sessoes_sem_provedor} sessões históricas sem provedor
              identificado na base inteira. Serão conferidas em novas
              sincronizações; não recebem vínculo verificado apenas por
              telefone.
            </p>
          </Painel>
          <Painel
            icone={Link2}
            titulo="Rastreabilidade por registro"
            resumo="Abra os eventos administrativos sem expor nomes, telefones ou conteúdo das conversas."
          >
            {!r.registros.length && (
              <p className="text-sm" style={dim}>
                Nenhum registro do CRM neste período.
              </p>
            )}
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {r.registros.map((x) => (
                <li
                  key={x.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div>
                    <b>
                      {nome(x.provider)} · registro {x.id.slice(0, 8)}
                    </b>
                    <p style={dim}>
                      {x.origem_crm} · {x.etapa ?? "Sem etapa mapeada"} ·{" "}
                      {x.conversas_verificadas > 0
                        ? `${x.conversas_verificadas} conversa(s) com vínculo verificado`
                        : x.identidade_legada
                          ? "Identidade legada; conversa não verificada"
                          : "Conversa não atribuída"}
                    </p>
                  </div>
                  <button
                    className="min-h-[44px] underline"
                    aria-label={`Ver eventos do registro ${x.id.slice(0, 8)}`}
                    onClick={() => setLead(x.id)}
                  >
                    Ver eventos
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between gap-2 text-sm">
              <button
                disabled={offset === 0}
                className="min-h-[44px] disabled:opacity-40"
                onClick={() => {
                  setOffset(Math.max(0, offset - 20));
                  setLead(null);
                }}
              >
                Anterior
              </button>
              <span style={dim}>
                {r.paginacao.total ? offset + 1 : 0}–
                {Math.min(offset + 20, r.paginacao.total)} de{" "}
                {r.paginacao.total}
              </span>
              <button
                disabled={offset + 20 >= r.paginacao.total}
                className="min-h-[44px] disabled:opacity-40"
                onClick={() => {
                  setOffset(offset + 20);
                  setLead(null);
                }}
              >
                Próximos
              </button>
            </div>
            {lead && (
              <div
                className="mt-4 rounded-lg border p-4"
                style={caixa}
                aria-label="Eventos comerciais do registro"
                role="region"
                tabIndex={-1}
                ref={detalheRef}
              >
                <div className="flex justify-between gap-2">
                  <h3 className="font-semibold">
                    Eventos do registro {lead.slice(0, 8)}
                  </h3>
                  <button
                    className="min-h-[44px] text-sm underline"
                    onClick={() => setLead(null)}
                  >
                    Fechar eventos
                  </button>
                </div>
                {detalhe.isPending && <p role="status">Conferindo eventos…</p>}
                {detalhe.isError && (
                  <p role="alert" className="text-sm">
                    {detalhe.error instanceof Error
                      ? detalhe.error.message
                      : "Eventos indisponíveis"}
                  </p>
                )}
                {detalhe.data && (
                  <>
                    <p className="mb-2 text-xs" style={dim}>
                      Origem declarada no CRM:{" "}
                      {detalhe.data.origem_crm ?? "Não atribuída"}. Não comprova
                      origem de campanha.
                    </p>
                    <ol className="space-y-3">
                      {detalhe.data.eventos.map((e) => (
                        <li
                          key={e.chave}
                          className="border-l-2 pl-3 text-sm"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <b>{EVENTOS_COMERCIAIS[e.tipo] ?? e.tipo}</b> ·{" "}
                          {e.certeza === "verificado"
                            ? "Verificado na fonte"
                            : "Data estimada"}
                          <p style={dim}>
                            {dataHora(e.ocorreu_em)} · {e.fonte} ·{" "}
                            {e.associacao}
                          </p>
                          <p style={dim}>{e.observacao}</p>
                        </li>
                      ))}
                    </ol>
                    {detalhe.data.limitado && (
                      <p className="mt-2 text-xs">
                        Exibindo os primeiros 200 de{" "}
                        {detalhe.data.total_eventos} eventos. Histórico não foi
                        descartado.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </Painel>
        </>
      )}
    </section>
  );
}
