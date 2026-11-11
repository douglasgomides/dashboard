import { useMemo, useState, type ReactNode } from "react";
import { Carregando } from "@/components/sem-fonte";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NxCard, NxTag } from "@/components/nx";
import { CmAviso, CmBarras, CmMetodo, CmRecolhido, icT } from "@/components/nx/comercial-base";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { NxTabela } from "@/components/nx/blocos";
import { NxFunil, type NxEtapaFunil } from "@/components/nx/anuncios-graficos";
import { fatosDaJornada } from "@/lib/leitura/fatos-comercial";
import { hojeBrasilia } from "@/lib/status-fonte";
import { fmtNdeM } from "@/lib/funil-taxa";
import { fmtFracao } from "@/lib/metricas";
import { ChecklistDados, FunilOndeQuebra, useDiagnosticoComercial } from "@/components/comercial-diagnostico";
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
  const leituraComErro = !proprio && doFunil.q.isError;
  const carregandoLeitura = !proprio && !leituraComErro && (funilDaJornada == null || resumo.isLoading || diag.isLoading);
  const leitura = <LeituraDaTela fatos={fatos} carregando={carregandoLeitura} erro={leituraComErro ? "A leitura da jornada falhou." : null} />;

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

  // O funil do período em degraus. Etapa sem medida aparece como "Sem dado": o que falta para medir está no funil completo, nos Detalhes.
  const etapas: NxEtapaFunil[] | null = funilDaJornada
    ? funilDaJornada.etapas.map((e) => ({
        rotulo: e.nome,
        valor: e.valor ?? 0,
        texto: e.valor == null ? "Sem dado" : e.valor.toLocaleString("pt-BR"),
        passagem: e.taxa != null ? `${fmtFracao(e.taxa)} passam` : e.fracao ? fmtNdeM(e.fracao) : null,
      }))
    : null;

  // A leitura já diz que os contatos sem pessoa deixam a jornada no escuro (fato "sem-pessoa"): o aviso completo, com o escopo e o
  // porquê, vai para os Detalhes. Sem esse fato na leitura (poucos contatos ou leitura negada), o aviso continua à vista no corpo.
  const leituraCobreOsSoltos = !!fatos?.fatos.some((x) => x.id === "sem-pessoa");
  const avisoDeSoltos =
    r && r.leads_total > 0 ? (
      <div className="nexo-comercial">
        <CmAviso
          tom={fracSolto >= 0.5 ? "critico" : "atencao"}
          titulo={`${pct(r.leads_sem_pessoa, r.leads_total)} dos leads criados no período não estão ligados a nenhuma pessoa`}
          detalhe={
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
          }
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
        !proprio && etapas ? (
          <NxCard id="funil-da-jornada" nivel={2} icone={icT("filter")} titulo="Do alcance à venda" subtitulo={`${funilDaJornada!.medidas} de 7 etapas`}>
            <NxFunil rotulo="Funil da jornada do período" etapas={etapas} />
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
          {leituraCobreOsSoltos && avisoDeSoltos}
          {!proprio && (
            <>
              <JornadaFunil clientId={clientId} start={start} end={end} />

              <NxCard id="onde-quebra" nivel={2} icone={icT("target")} titulo="Onde a jornada quebra" subtitulo={`Do lead à venda · ${rotuloPeriodo}`}>
                {diag.isLoading && <Carregando texto="Calculando onde a jornada quebra…" linhas={2} />}
                {diag.error && (
                  <div role="alert">
                    <p>Não foi possível conferir o diagnóstico comercial. Os resultados não foram considerados zero.</p>
                    <button type="button" className="btn" disabled={diag.isFetching} onClick={() => void diag.refetch()}>
                      Tentar novamente
                    </button>
                  </div>
                )}
                {d && <FunilOndeQuebra funil={d.funil} />}
                {d && (d.limitacoes?.length ?? 0) > 0 && <ListaLimitacoes itens={d.limitacoes} titulo="O que limita esta leitura" />}
              </NxCard>
            </>
          )}

          <NxCard id="jornada-pessoas" nivel={2} icone={icT("users")} titulo="Jornada: do post à venda" subtitulo="O que cruzou e o que ainda está solto, no período escolhido.">
            {resumo.isLoading && <Carregando texto="Ligando post, conversa e venda…" linhas={2} />}
            {resumo.error && <p className="text-sm" role="alert">{mensagemDeErro(resumo.error, "as pessoas do período")}</p>}
            {r && (
              <div className="cm-par cm-par--igual">
                <CmBarras
                  rotulo="Pessoas em cada ponto da jornada"
                  max={Math.max(1, r.pessoas)}
                  itens={[
                    { chave: "pessoas", rotulo: "Pessoas identificadas", valor: r.pessoas, texto: r.pessoas.toLocaleString("pt-BR"), apoio: pct(r.pessoas, r.pessoas) },
                    { chave: "comentaram", rotulo: "Comentaram em posts", valor: r.comentaram, texto: r.comentaram.toLocaleString("pt-BR"), apoio: pct(r.comentaram, r.pessoas) },
                    { chave: "conversaram", rotulo: "Têm conversa no WhatsApp", valor: r.conversaram, texto: r.conversaram.toLocaleString("pt-BR"), apoio: pct(r.conversaram, r.pessoas) },
                    { chave: "lead", rotulo: "Viraram lead no CRM", valor: r.viraram_lead, texto: r.viraram_lead.toLocaleString("pt-BR"), apoio: pct(r.viraram_lead, r.pessoas) },
                    compraConfiavel
                      ? { chave: "compra", rotulo: `Compras confirmadas${r.receita > 0 ? ` · ${brl(r.receita)}` : ""}`, valor: r.ganhos, texto: r.ganhos.toLocaleString("pt-BR"), apoio: pct(r.ganhos, r.pessoas), tom: "up" as const }
                      : { chave: "compra", rotulo: "Compras confirmadas", valor: null, texto: "Não medido", nota: "Sem venda confirmada para medir" },
                  ]}
                />
                <div className="grid content-start gap-2">
                  <h3 className="text-[15px] font-semibold" style={{ margin: 0 }}>Onde as pessoas se cruzam</h3>
                  <ul className="cm-lista">
                    <li><span className="cm-lista__corpo"><span className="cm-lista__sub">Comentaram <b>e</b> viraram lead</span></span><b className="cm-lista__fim text-[17px]">{r.comentaram_e_lead}</b></li>
                    <li><span className="cm-lista__corpo"><span className="cm-lista__sub">Conversaram <b>e</b> viraram lead</span></span><b className="cm-lista__fim text-[17px]">{r.conversaram_e_lead}</b></li>
                    <li><span className="cm-lista__corpo"><span className="cm-lista__sub">Comentaram <b>e</b> conversaram</span></span><b className="cm-lista__fim text-[17px]">{r.comentaram_e_conversaram}</b></li>
                  </ul>
                </div>
              </div>
            )}
            <CmMetodo titulo="O que é uma pessoa aqui">
              <p>
                Uma “pessoa” é alguém que o painel reconheceu em mais de um lugar pelo mesmo telefone ou @. Comentou num post, chamou no WhatsApp e virou lead no CRM:
                aparece uma vez só. Os números são do período escolhido: leads criados no período (sem os removidos no CRM), comentários e conversas que aconteceram
                nele. Cada pessoa é ligada por telefone, @ do Instagram ou identificador do atendimento.
              </p>
            </CmMetodo>
          </NxCard>

          {!proprio && d && (
            <CmRecolhido titulo="O que falta para ligar post, conversa e venda" subtitulo="Checklist de rastreamento: cada item que falta deixa um pedaço da jornada no escuro">
              <ChecklistDados itens={d.checklist} clientId={clientId} compacto />
            </CmRecolhido>
          )}

          {tabelas && (
            <CmRecolhido titulo="Ver dados detalhados" subtitulo="Resultado por origem, posts que geraram gente e links rastreados">
              {r && (r.por_origem?.length ?? 0) > 0 && (
                <NxCard icone={icT("speakerphone")} titulo="Resultado por origem do lead" subtitulo="Origem registrada no CRM. Ganhos e receita só são exibidos como venda quando o diagnóstico comercial confirma o significado da etapa.">
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
