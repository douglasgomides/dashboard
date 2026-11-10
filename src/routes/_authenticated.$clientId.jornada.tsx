import { useState, type ReactNode } from "react";
import { Carregando } from "@/components/sem-fonte";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NxCard, NxTag } from "@/components/nx";
import { CmAviso, CmBarras, CmKpi, CmMetodo, CmRecolhido, CmTopo, icT } from "@/components/nx/comercial-base";
import { ChecklistDados, FunilOndeQuebra, useDiagnosticoComercial } from "@/components/comercial-diagnostico";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { JornadaFunil } from "@/components/jornada-funil";
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

function Tabela({ cab, linhas }: { cab: string[]; linhas: (string | number | ReactNode)[][] }) {
  return (
    <div className="cm-tabela">
      <table>
        <thead>
          <tr className="text-left">
            {cab.map((c) => (
              <th key={c} className="py-1 pr-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
              {l.map((c, j) => (
                <td key={j} className="py-1.5 pr-3 align-top tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  return (
    <div className="nexo-comercial">
      <CmTopo pergunta="Do post à venda: quem vira lead e onde a jornada quebra?" detalhe={`${rotuloPeriodo} · cada pessoa ligada por telefone, @ do Instagram ou identificador do atendimento`} />

      {!proprio && r && (
        <section className="nx-grade nx-grade--4" aria-label="Números da jornada">
          <CmKpi i={0} icone="users" rotulo="Pessoas identificadas" valor={r.pessoas.toLocaleString("pt-BR")} nota="reconhecidas em mais de um lugar" />
          <CmKpi i={1} icone="message-circle" rotulo="Conversaram no WhatsApp" valor={r.conversaram.toLocaleString("pt-BR")} nota={`${pct(r.conversaram, r.pessoas)} das pessoas`} />
          <CmKpi i={2} icone="filter" rotulo="Viraram lead no CRM" valor={r.viraram_lead.toLocaleString("pt-BR")} nota={`${pct(r.viraram_lead, r.pessoas)} das pessoas`} />
          <CmKpi
            i={3}
            icone="checklist"
            rotulo="Compras confirmadas"
            valor={compraConfiavel ? r.ganhos.toLocaleString("pt-BR") : "Não medido"}
            apagado={!compraConfiavel}
            nota={compraConfiavel ? `${pct(r.ganhos, r.pessoas)} das pessoas${r.receita > 0 ? ` · ${brl(r.receita)}` : ""}` : "Sem venda confirmada para medir"}
          />
        </section>
      )}

      {r && r.leads_total > 0 && (
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
      )}

      {proprio ? (
        <CrmNegocioProprio clientId={clientId} start={start} end={end} />
      ) : (
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
            nele.
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
                cab={["Link", "Tipo", "Cliques", "Conversas", "Leads", "Vendas"]}
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
  );
}
