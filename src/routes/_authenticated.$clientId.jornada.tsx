import { useMemo, useState, type ReactNode } from "react";
import { Carregando } from "@/components/sem-fonte";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NxCard, NxTag } from "@/components/nx";
import { CmAviso, CmBarras, CmMetodo, CmRecolhido, icT } from "@/components/nx/comercial-base";
import { PaginaNexo } from "@/components/nx/pagina";
import { NxBlocoDoVerTudo, NxCabecaDoBloco } from "@/components/nx/cabeca-do-bloco";
import { NxDescobertas, NxMaisDescobertas } from "@/components/nx/cinco-segundos";
import { NxChip } from "@/components/nx-chip";
import { NxCarregando, NxErro } from "@/components/nx/blocos";
import { descobertasDaLeitura, periodoDoVerTudo } from "@/lib/leitura/leitura-em-descobertas";
import { visiveisEResto } from "@/lib/leitura/cinco-segundos";
import { cabecaDoChecklist, comAcaoCurta, descobertaDaFaltaDeDado } from "@/lib/leitura/ver-tudo-crm-painel";
import {
  DESCOBERTA_SEM_PESSOA,
  cabecaDaOrigem,
  cabecaDasLimitacoesDaJornada,
  cabecaDoFunilDe7,
  cabecaDosCruzamentos,
  cabecaDosLinksDaJornada,
  cabecaDosPostsQueGeram,
} from "@/lib/leitura/ver-tudo-jornada";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { NxTabela } from "@/components/nx/blocos";
import { NxFunilDesenhado } from "@/components/nx/funil-desenhado";
import { usePublicarContagem } from "@/components/nx/abas-em-pasta";
import { fatosDaJornada } from "@/lib/leitura/fatos-comercial";
import { hojeBrasilia } from "@/lib/status-fonte";
import { daJornada, type EtapaAntes } from "@/lib/funil-desenhado";
import { ChecklistDados, useDiagnosticoComercial } from "@/components/comercial-diagnostico";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { JornadaFunil, useFunilDaJornada } from "@/components/jornada-funil";
import { fmtTaxa } from "@/lib/metricas";
import { ListaLimitacoes } from "@/components/insight-card";

import { ehNegocioProprio } from "@/lib/negocio-proprio";
import { CrmNegocioProprio } from "@/components/crm-negocio-proprio";
import { mensagemDeErro } from "@/lib/erro-amigavel";

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

export const Route = createFileRoute("/_authenticated/$clientId/jornada")({
  component: JornadaPage,
});

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: any; error: { message: string } | null }>;
const brl = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
const pct = (a: number, b: number) => fmtTaxa(a, b);
const quando = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

const ROTULO: Record<string, string> = {
  comentario: "Comentou num post",
  lead_criado: "Virou lead no CRM",
  mensagem_whatsapp: "Chamou no WhatsApp",
  clique_link: "Clicou num link",
};

/** Tabela do detalhe: NxTabela com as mesmas colunas e linhas de antes. A primeira coluna é texto, as outras são números. */
function Tabela({ rotulo, cab, linhas, textoAte = 1 }: { rotulo: string; cab: string[]; linhas: (string | number | ReactNode)[][]; textoAte?: number }) {
  const colunas = cab.map((titulo, j) => ({ chave: `c${j}`, titulo, numerica: j >= textoAte }));
  const registros = linhas.map((l) => Object.fromEntries(l.map((c, j) => [`c${j}`, c])) as Record<string, ReactNode>);
  return <NxTabela rotulo={rotulo} colunas={colunas} linhas={registros} />;
}

/**
 * A faixa "Antes da conversa": as 3 etapas do Instagram (alcance, engajamento, comentário ou direct) com o nome de hoje e o número, ou
 * "Falta dado" listrado. Ficam fora das faixas porque o alcance (centenas de milhares) achataria as 5 etapas do comercial no mínimo
 * mesmo na escala de raiz. A lista completa de 7 etapas, com o que falta para medir, continua nos Detalhes.
 */
function AntesDaConversa({ etapas }: { etapas: EtapaAntes[] }) {
  return (
    <div className="nx-funil-d__antes">
      <p className="nx-funil-d__antes-titulo">Antes da conversa</p>
      <ul className="nx-funil-d__antes-lista" aria-label="Antes da conversa" tabIndex={0}>
        {etapas.map((e) => (
          <li key={e.id} className="nx-funil-d__chip" data-falta={e.valor == null ? "" : undefined} title={e.motivo ?? undefined}>
            <span>{e.nome}</span>
            <b>{e.texto}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function JornadaPage() {
  const { clientId } = Route.useParams();
  const [q, setQ] = useState("");
  const [pessoa, setPessoa] = useState<string | null>(null);
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  const proprio = ehNegocioProprio(clientId);
  const diag = useDiagnosticoComercial(clientId, start, end, !proprio);
  // O funil de 7 etapas: a mesma conta e as mesmas consultas que JornadaFunil usa (React Query junta as duas).
  const doFunil = useFunilDaJornada(clientId, start, end, !proprio);
  const hoje = hojeBrasilia();

  const resumo = useQuery({
    queryKey: ["jornada", clientId, start, end],
    queryFn: async () => {
      // Versão com período (só leads criados no período e sem os removidos no CRM de origem).
      const { data, error } = await rpc("jornada_resumo", {
        p_client: clientId,
        p_de: start,
        p_ate: end,
      });
      if (error) throw new Error(error.message);
      // A função devolve um objeto; se vier lista (ou nada), trata como "sem resumo" em vez de quebrar a tela.
      const obj = Array.isArray(data) ? data[0] : data;
      return obj && typeof obj === "object" && "leads_total" in obj ? (obj as any) : null;
    },
  });
  const busca = useQuery({
    queryKey: ["jornada-busca", clientId, q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await rpc("buscar_pessoas", {
        p_client: clientId,
        p_q: q.trim(),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });
  const detalhe = useQuery({
    queryKey: ["jornada-pessoa", pessoa],
    enabled: !!pessoa,
    queryFn: async () => {
      const { data, error } = await rpc("jornada_pessoa", { p_pessoa: pessoa });
      if (error) throw new Error(error.message);
      return data as any;
    },
  });

  const r = resumo.data;
  const compra = diag.data?.funil.passos.find((p) => p.id === "compraram");
  const compraConfiavel = diag.data?.dados.escopo === "periodo" && compra?.valor != null && compra.confiavel;
  const d = diag.data;
  const tabelas = r && ((r.por_origem?.length ?? 0) > 0 || (r.posts?.length ?? 0) > 0 || (r.links?.length ?? 0) > 0);
  const rotuloPeriodo = formatRangeLabel({ start, end });
  const fracSolto = r && r.leads_total > 0 ? r.leads_sem_pessoa / r.leads_total : 0;

  // Leitura da jornada: calculada na hora, só do que a tela já carregou (sem consulta nova, sem IA). Só contagens entram.
  const funilDaJornada = doFunil.funil;
  const fatos = useMemo(
    () =>
      !proprio && funilDaJornada
        ? fatosDaJornada({
            de: start,
            ate: end,
            hoje,
            funil: funilDaJornada,
            resumo: r ? { leads_total: Number(r.leads_total), leads_sem_pessoa: Number(r.leads_sem_pessoa) } : null,
            limitacoes: d?.limitacoes,
          })
        : null,
    [proprio, funilDaJornada, start, end, hoje, r, d?.limitacoes],
  );
  // O funil desenhado (Conversou · Virou lead · Atendido · Agendou · Fechou) e a faixa "Antes da conversa": a mesma conta do funil de
  // 7 etapas, com o diagnóstico que a tela já carrega (mesma chave de React Query, nenhuma consulta nova).
  const desenho = useMemo(() => (funilDaJornada ? daJornada({ funil: funilDaJornada, comercial: d ?? null }) : null), [funilDaJornada, d]);

  // Contagem em cinza das abas Funil e Jornada (D-07): as pessoas que viraram lead no período. Só vale quando a etapa conta pessoas
  // (pacientes_periodo respondeu); com cards do CRM, ou sem dado, a aba mostra "—". Carregando: undefined; zero vira null (nunca "0").
  const leadDoFunil = funilDaJornada?.etapas.find((e) => e.id === "lead")?.valor ?? null;
  usePublicarContagem({
    clientId,
    de: start,
    ate: end,
    rota: "/_authenticated/$clientId/jornada",
    valor: proprio ? null : doFunil.q.isLoading || (doFunil.pacientes.isLoading && !doFunil.pacientes.isError) ? undefined : doFunil.pac && leadDoFunil ? leadDoFunil : null,
  });

  const leituraComErro = !proprio && doFunil.q.isError;
  const carregandoLeitura = !proprio && !leituraComErro && (funilDaJornada == null || resumo.isLoading || diag.isLoading);

  const cabecalho = {
    tela: "jornada" as const,
    titulo: "Jornada comercial",
    pergunta: "Quantas pessoas chegam até a venda e onde se perdem?",
    decisao: "D1" as const,
    meta: <span>{rotuloPeriodo}</span>,
  };

  // Os 4 cartões do topo (D-07): os mesmos números dos cartões de antes. Sem venda confirmada vira "Sem dado" listrado.
  const cartoes: [ReactNode, ReactNode, ReactNode, ReactNode] | undefined =
    !proprio && r
      ? [
          <NxCartaoNumero key="pessoas" icone="users" titulo="Pessoas identificadas" subtitulo="no período" valor={Number(r.pessoas).toLocaleString("pt-BR")} legenda="reconhecidas em mais de um lugar" />,
          <NxCartaoNumero key="conversaram" icone="message-circle" titulo="Conversaram no WhatsApp" subtitulo={`${pct(r.conversaram, r.pessoas)} das pessoas`} valor={Number(r.conversaram).toLocaleString("pt-BR")} legenda="pessoas" />,
          <NxCartaoNumero key="lead" icone="filter" titulo="Viraram lead no CRM" subtitulo={`${pct(r.viraram_lead, r.pessoas)} das pessoas`} valor={Number(r.viraram_lead).toLocaleString("pt-BR")} legenda="pessoas" />,
          <NxCartaoNumero
            key="compras"
            icone="checklist"
            titulo="Compras confirmadas"
            subtitulo={compraConfiavel ? `${pct(r.ganhos, r.pessoas)} das pessoas${r.receita > 0 ? ` · ${brl(r.receita)}` : ""}` : undefined}
            valor={compraConfiavel ? Number(r.ganhos).toLocaleString("pt-BR") : null}
            semMedida={!compraConfiavel}
            legenda={compraConfiavel ? "pessoas" : "Sem venda confirmada para medir"}
          />,
        ]
      : undefined;

  // quick-ver-tudo-abas (João 13/11/2026): a "Leitura do período" saiu da aba. O que ela dizia e a aba ainda não mostra (o funil desenhado,
  // a faixa "Antes da conversa" e os 4 cartões) virou descoberta: no máximo 3 à vista, no lugar da leitura, e o resto no começo dos
  // Detalhes. A maior perda já está no funil desenhado e não volta. Leitura negada: UMA descoberta "Falta dado" com o passo para resolver.
  const textoDoTopo = [
    ...(desenho?.funil.etapas ?? []).map((e) => `${e.nome} ${e.texto} ${e.passagem?.taxa != null ? `${Math.round(e.passagem.taxa * 100)}%` : ""}`),
    desenho?.funil.maiorPerda?.texto ?? "",
    ...(desenho?.antes ?? []).map((e) => `${e.nome} ${e.texto}`),
    r ? `${r.pessoas} ${r.conversaram} ${r.viraram_lead} ${compraConfiavel ? r.ganhos : ""}` : "",
  ];
  const daLeitura = proprio ? [] : descobertasDaLeitura({ fatos, descobertas: [], jaDitos: ["maior-perda"], textoDoTopo });
  const faltaDeDado = proprio || carregandoLeitura || leituraComErro ? null : descobertaDaFaltaDeDado(fatos, false);
  const { visiveis: descobertasAVista, resto: descobertasDoDetalhe } = visiveisEResto((faltaDeDado ? [faltaDeDado] : daLeitura).map(comAcaoCurta));
  const leitura = proprio ? null : carregandoLeitura ? (
    <NxCarregando texto="Lendo a jornada…" linhas={2} />
  ) : leituraComErro ? (
    <NxErro texto="Não deu para ler a jornada agora." onTentar={() => void doFunil.q.refetch()} />
  ) : descobertasAVista.length ? (
    <NxDescobertas titulo="O que fazer com isso" itens={descobertasAVista} clientId={clientId} />
  ) : null;
  const periodoDaLeitura = periodoDoVerTudo(fatos);

  // A descoberta à vista já diz que os contatos sem pessoa deixam a jornada no escuro: nos Detalhes fica só o porquê (sem repetir o número).
  // Sem essa descoberta à vista (poucos contatos ou leitura negada), o aviso completo continua à vista no corpo.
  const leituraCobreOsSoltos = descobertasAVista.some((x) => x.id === DESCOBERTA_SEM_PESSOA);
  const porqueDosSoltos =
    r && r.leads_total > 0 ? (
            <>
              {r.escopo && (
                <p style={{ margin: "0 0 6px" }}>
                  Escopo: {r.leads_total.toLocaleString("pt-BR")} leads criados de {rotuloPeriodo}. A base inteira tem {Number(r.escopo.leads_base_toda).toLocaleString("pt-BR")} leads
                  ativos
                  {Number(r.escopo.leads_removidos_na_origem) > 0 ? ` e ${Number(r.escopo.leads_removidos_na_origem).toLocaleString("pt-BR")} removidos no CRM (não entram)` : ""}. O Comercial
                  mostra a base inteira e só os leads com etapa conhecida, por isso o número lá é diferente.
                </p>
              )}
              <p style={{ margin: 0 }}>
                Sem telefone, @ ou conversa guardada não dá para ligar. O painel só liga quando o telefone, o @ ou o identificador da conversa (sessionId do WTS)
                batem exatamente, nunca por nome parecido. Quanto mais conversas puxadas, mais ligam.
              </p>
            </>
    ) : null;
  const avisoDeSoltos =
    r && r.leads_total > 0 ? (
      <div className="nexo-comercial">
        <CmAviso
          tom={fracSolto >= 0.5 ? "critico" : "atencao"}
          titulo={`${pct(r.leads_sem_pessoa, r.leads_total)} dos leads criados no período não estão ligados a nenhuma pessoa`}
          detalhe={porqueDosSoltos}
        >
          ({r.leads_sem_pessoa.toLocaleString("pt-BR")} de {r.leads_total.toLocaleString("pt-BR")}): a jornada deles fica no escuro.
        </CmAviso>
      </div>
    ) : null;

  return (
    <PaginaNexo
      {...cabecalho}
      leitura={leitura}
      cartoes={cartoes}
      principal={
        !proprio && desenho ? (
          <NxCard id="funil-da-jornada" nivel={2} icone={icT("filter")} titulo="Do alcance à venda" subtitulo={`${funilDaJornada!.medidas} de 7 etapas · toque numa etapa`}>
            <NxFunilDesenhado titulo="Funil da jornada do período" funil={desenho.funil} antes={<AntesDaConversa etapas={desenho.antes} />} />
          </NxCard>
        ) : undefined
      }
      corpo={
        proprio || (avisoDeSoltos && !leituraCobreOsSoltos) ? (
          <>
            {!leituraCobreOsSoltos && avisoDeSoltos}
            {proprio && (
              <div className="nexo-comercial">
                <CrmNegocioProprio clientId={clientId} start={start} end={end} />
              </div>
            )}
          </>
        ) : undefined
      }
      detalhe={
        <div className="nexo-comercial">
          {!proprio && (
            <p className="nx-ver-tudo__periodo" data-peca="periodo-do-ver-tudo">
              {periodoDaLeitura && <span>{periodoDaLeitura}</span>}
              <NxChip tipo="sem-selo" />
            </p>
          )}
          <NxMaisDescobertas itens={descobertasDoDetalhe} clientId={clientId} />
          {leituraCobreOsSoltos && porqueDosSoltos && (
            <CmMetodo titulo="Por que um contato fica sem pessoa">{porqueDosSoltos}</CmMetodo>
          )}
          {!proprio && (
            <>
              <JornadaFunil clientId={clientId} start={start} end={end} semMaiorQueda cabeca={cabecaDoFunilDe7} />

              {/* "Onde a jornada quebra" saiu: as etapas do CRM, a maior perda e o "N de M" são o funil desenhado do topo e a parte No CRM
                  do Funil. O que limita a leitura fica, com a resposta em cima. */}
              {diag.isLoading && <Carregando texto="Calculando onde a jornada quebra…" linhas={2} />}
              {diag.error && (
                <div role="alert">
                  <p>Não foi possível conferir o diagnóstico comercial. Os resultados não foram considerados zero.</p>
                  <button type="button" className="btn" disabled={diag.isFetching} onClick={() => void diag.refetch()}>
                    Tentar novamente
                  </button>
                </div>
              )}
              {d && (d.limitacoes?.length ?? 0) > 0 && (
                <NxBlocoDoVerTudo id="onde-quebra" cabeca={cabecaDasLimitacoesDaJornada(d.limitacoes.length)}>
                  <ListaLimitacoes itens={d.limitacoes} titulo="O que limita esta leitura" />
                </NxBlocoDoVerTudo>
              )}
            </>
          )}

          {/* Pessoas, conversaram, viraram lead e compras já são os 4 cartões do topo: aqui só onde as pessoas se cruzam. */}
          <NxBlocoDoVerTudo id="jornada-pessoas" rotulo="Jornada: do post à venda" cabeca={resumo.isLoading ? cabecaDosCruzamentos(null) : cabecaDosCruzamentos(r ?? null)}>
            {resumo.isLoading && <Carregando texto="Ligando post, conversa e venda…" linhas={2} />}
            {resumo.error && <p className="text-sm" role="alert">{mensagemDeErro(resumo.error, "as pessoas do período")}</p>}
            {r && (
              <CmBarras
                rotulo="Onde as pessoas se cruzam"
                max={Math.max(1, r.pessoas)}
                itens={[
                  { chave: "comentaram", rotulo: "Comentaram em posts", valor: r.comentaram, texto: r.comentaram.toLocaleString("pt-BR"), apoio: pct(r.comentaram, r.pessoas) },
                  { chave: "conversaram_e_lead", rotulo: "Conversaram e viraram lead", valor: r.conversaram_e_lead, texto: r.conversaram_e_lead.toLocaleString("pt-BR"), apoio: pct(r.conversaram_e_lead, r.pessoas) },
                  { chave: "comentaram_e_lead", rotulo: "Comentaram e viraram lead", valor: r.comentaram_e_lead, texto: r.comentaram_e_lead.toLocaleString("pt-BR"), apoio: pct(r.comentaram_e_lead, r.pessoas) },
                  { chave: "comentaram_e_conversaram", rotulo: "Comentaram e conversaram", valor: r.comentaram_e_conversaram, texto: r.comentaram_e_conversaram.toLocaleString("pt-BR"), apoio: pct(r.comentaram_e_conversaram, r.pessoas) },
                ]}
              />
            )}
            <CmMetodo titulo="O que é uma pessoa aqui">
              <p>
                Uma “pessoa” é alguém que o painel reconheceu em mais de um lugar pelo mesmo telefone ou @. Comentou num post, chamou no WhatsApp e virou lead no CRM:
                aparece uma vez só. Os números são do período escolhido: leads criados no período (sem os removidos no CRM), comentários e conversas que aconteceram
                nele. Cada pessoa é ligada por telefone, @ do Instagram ou identificador do atendimento. A porcentagem de cada barra é sobre as pessoas identificadas
                (o cartão do topo).
              </p>
            </CmMetodo>
          </NxBlocoDoVerTudo>

          {!proprio && d && (
            <CmRecolhido titulo="O que falta para ligar post, conversa e venda" subtitulo="Checklist de rastreamento: cada item que falta deixa um pedaço da jornada no escuro">
              <NxCabecaDoBloco cabeca={cabecaDoChecklist(d.checklist.map((i) => i.status))} />
              <ChecklistDados itens={d.checklist} clientId={clientId} compacto />
            </CmRecolhido>
          )}

          {tabelas && (
            <CmRecolhido titulo="Ver dados detalhados" subtitulo="Resultado por origem, posts que geraram gente e links rastreados">
              {r && (r.por_origem?.length ?? 0) > 0 && (
                <NxCard icone={icT("speakerphone")} titulo="Resultado por origem do lead" subtitulo="Origem registrada no CRM. Ganhos e receita só são exibidos como venda quando o diagnóstico comercial confirma o significado da etapa.">
                  <NxCabecaDoBloco cabeca={cabecaDaOrigem(r.por_origem.map((o: any) => ({ o: String(o.o), leads: Number(o.leads) || 0, ganhos: Number(o.ganhos) || 0 })), !!compraConfiavel)} />
                  <Tabela
                    rotulo="Resultado por origem do lead"
                    cab={["Origem", "Leads", "Vendas", "Conversão", "Receita"]}
                    linhas={r.por_origem.map((o: any) => [
                      o.o,
                      o.leads,
                      compraConfiavel ? o.ganhos : "—",
                      compraConfiavel ? pct(o.ganhos, o.leads) : "—",
                      compraConfiavel && o.receita > 0 ? brl(o.receita) : "—",
                    ])}
                  />
                </NxCard>
              )}
              {r && (r.posts?.length ?? 0) > 0 && (
                <NxCard icone={icT("brand-instagram")} titulo="Posts que geraram gente de verdade" subtitulo="Quem comentou no post e depois virou lead ou comprou.">
                  <NxCabecaDoBloco cabeca={cabecaDosPostsQueGeram(r.posts)} />
                  <Tabela
                    rotulo="Posts que geraram gente de verdade"
                    cab={["Post", "Comentaristas", "Viraram lead", "Compraram", "Receita"]}
                    linhas={r.posts.map((p: any) => [
                      <a key={p.id} href={p.permalink ?? "#"} target="_blank" rel="noreferrer" className="underline">
                        {(p.legenda || "(sem legenda)").slice(0, 70)}
                      </a>,
                      p.comentaristas,
                      p.viraram_lead,
                      compraConfiavel ? p.ganhos : "—",
                      compraConfiavel && p.receita > 0 ? brl(p.receita) : "—",
                    ])}
                  />
                </NxCard>
              )}
              {r && (r.links?.length ?? 0) > 0 && (
                <NxCard icone={icT("link")} titulo="Links rastreados" subtitulo="Clique → conversa → lead → venda, pelo código que vai na mensagem.">
                  <NxCabecaDoBloco cabeca={cabecaDosLinksDaJornada(r.links)} />
                  <Tabela
                    rotulo="Links rastreados"
                    cab={["Link", "Tipo", "Cliques", "Conversas", "Leads", "Vendas"]}
                    textoAte={2}
                    linhas={r.links.map((l: any) => [l.titulo ?? l.short_url, l.tipo, l.cliques_total ?? 0, l.conversas, l.viraram_lead, compraConfiavel ? l.ganhos : "—"])}
                  />
                </NxCard>
              )}
            </CmRecolhido>
          )}

          <NxCard id="linha-tempo" nivel={2} icone={icT("search")} titulo="Linha do tempo de uma pessoa" subtitulo="Busque por nome, @ do Instagram ou os 4+ últimos dígitos do telefone.">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, @ ou telefone" aria-label="Buscar pessoa por nome, @ ou telefone" className="cm-busca" />
            {(busca.data?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {busca.data?.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPessoa(p.id)}
                    aria-pressed={p.id === pessoa}
                    className="min-h-[44px] max-w-full truncate rounded-xl border px-3 py-1 text-left text-sm font-medium"
                    style={{ borderColor: p.id === pessoa ? "var(--b2)" : "var(--line-2)", background: p.id === pessoa ? "var(--b6)" : "var(--white)" }}
                  >
                    {p.nome ?? p.ig_username ?? "Sem nome"} {p.telefone_final ? `· ${p.telefone_final}` : ""} {p.ig_username ? `· @${p.ig_username}` : ""}
                  </button>
                ))}
              </div>
            )}
            {detalhe.data && (
              <div className="nx-abre space-y-2">
                <div className="text-[15px] font-semibold">{detalhe.data.pessoa?.nome ?? "Sem nome"}</div>
                <ol className="space-y-1.5 border-l-2 pl-3" style={{ borderColor: "var(--b4)" }}>
                  {detalhe.data.linha.map((e: any, i: number) => (
                    <li key={i} className="text-sm">
                      <span className="text-xs font-semibold" style={{ color: "var(--muted-ink)" }}>
                        {quando(e.quando)}{" "}
                      </span>
                      {ROTULO[e.tipo] ?? e.tipo}
                      {e.legenda ? <span style={{ color: "var(--muted-ink)" }}> — “{e.legenda}”</span> : e.detalhe ? <span style={{ color: "var(--muted-ink)" }}> — {e.detalhe}</span> : null}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-1.5">
                  {detalhe.data.leads.map((l: any, i: number) => (
                    <NxTag key={i} tom={l.resultado === "won" ? "up" : l.resultado === "lost" ? "dn" : "g"}>
                      {l.resultado === "won" ? "Comprou" : l.resultado === "lost" ? "Perdido" : l.resultado === "closed" ? "Encerrado sem resultado" : "Em aberto"}
                      {l.valor > 0 ? ` · ${brl(Number(l.valor))}` : ""}
                      {l.origem ? ` · ${l.origem}` : ""}
                    </NxTag>
                  ))}
                  {(detalhe.data.conversas?.length ?? 0) > 0 && <NxTag tom="b">{detalhe.data.conversas.length} conversa(s) no WhatsApp</NxTag>}
                </div>
              </div>
            )}
          </NxCard>
        </div>
      }
    />
  );
}
