import { useMemo, useRef, useState } from "react";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Ajuda } from "@/components/visual";
import { Carregando } from "@/components/sem-fonte";
import { usePacientesPeriodo } from "@/hooks/use-pacientes-periodo";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { hojeBrasilia } from "@/lib/status-fonte";
import { fmtBRL } from "@/lib/format";
import { DIAS_HISTORICO_RECOMPRA, FOLLOW_UP } from "@/lib/config/recompra";
import {
  CHAVES_NUMEROS,
  ROTULO_CANAL,
  ROTULO_FONTE,
  ROTULO_ORIGEM,
  ROTULO_RESPONSAVEL,
  TEXTO_NUMERO,
  dataBr,
  emQuePe,
  fonteDoNumero,
  legendaDoNumero,
  coberturaDoNumero,
  avisoCrmCompartilhado,
  avisoNaoMedido,
  avisoTelaHonesta,
  avisoAgendouMenosQueFechou,
  textoNaoMedido,
  notaCrmPorMedico,
  nomeCheckout,
  oQue,
  textoReembolsos,
  textoRenovacoes,
  avisoCheckout,
  vemDoCheckout,
  paraChamarAgora,
  recompraDe,
  rotuloRecompra,
  type ChaveNumero,
  type ItemPessoa,
  type Numero,
  type PacientesPeriodo,
  type VendaHistorico,
} from "@/lib/pacientes";

import "@/styles/databoard.css";
import { MetasDoMes } from "@/components/databoard-inteligencia";
import { NxCard, NxLinhaTempo, NxPizza, NxTag } from "@/components/nx";
import { CmAviso, CmBarras, CmKpi, CmLeitura, CmMetodo, CmRecolhido, CmTopo, icT, type CmVariacao } from "@/components/nx/comercial-base";
import type { NomeIcone } from "@/lib/registro-de-telas";
import { leituraDoPeriodo } from "@/lib/inteligencia-resultados";
import { Minigrafico } from "@/components/databoard-evolucao";
import { CAMPOS_DIARIOS, useResultadosDiarios, type CampoDiario, type LinhaDiaria } from "@/hooks/use-resultados-diarios";

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

export const Route = createFileRoute("/_authenticated/$clientId/pacientes")({
  component: PacientesDoPeriodo,
});

const METRICAS = ["mandaram_mensagem", "agendaram", "fecharam", "compareceram"] as const;

const fmt = (n: number | null | undefined) => (n == null ? "" : Number(n).toLocaleString("pt-BR"));
const pessoas = (n: number) => `${fmt(n)} ${n === 1 ? "pessoa" : "pessoas"}`;

/** Período anterior de mesmo tamanho, colado no início do atual. */
function periodoAnterior(start: string, end: string) {
  const dias = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
  const fim = somaDias(start, -1);
  return { start: somaDias(fim, -(dias - 1)), end: fim };
}

/** Variação contra o período anterior: só quando os dois lados foram medidos e o anterior não é zero. */
type Variacao = { pct: number; tom: "up" | "down" | "flat" };
function variacao(atual: number | null | undefined, antes: number | null | undefined): Variacao | null {
  if (atual == null || antes == null || antes <= 0) return null;
  const pct = Math.round(((atual - antes) / antes) * 100);
  return { pct, tom: pct === 0 ? "flat" : pct > 0 ? "up" : "down" };
}

/** A mesma variação no formato da etiqueta do painel (seta na forma, não só na cor). */
function paraCm(v: Variacao | null | undefined): CmVariacao | null {
  if (!v) return null;
  if (v.tom === "flat") return { direcao: "igual", texto: "igual", contexto: "vs. período anterior" };
  return { direcao: v.tom === "up" ? "cima" : "baixo", texto: `${v.pct > 0 ? "+" : "−"}${Math.abs(v.pct)}%`, contexto: "vs. período anterior", bom: v.tom === "up" };
}

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function diasEntre(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1;
}

/** Soma dia a dia de cada número. null = o histórico não cobre pelo menos 80% dos dias (não dá para comparar). */
function somaDiaria(linhas: LinhaDiaria[], dias: number): Record<CampoDiario, number | null> {
  const out = {} as Record<CampoDiario, number | null>;
  for (const k of CAMPOS_DIARIOS) {
    const med = linhas.filter((l) => l[k] != null);
    out[k] = med.length >= Math.ceil(dias * 0.8) ? med.reduce((s, l) => s + Number(l[k]), 0) : null;
  }
  return out;
}

function somaDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function PacientesDoPeriodo() {
  const { clientId } = Route.useParams();
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  const { isAdmin } = useAuth();
  const hoje = hojeBrasilia();
  const [aberta, setAberta] = useState<ChaveNumero | null>(null);
  const [chamarTodos, setChamarTodos] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);

  const q = usePacientesPeriodo(clientId, start, end);
  // O dia de hoje ainda não está fechado no histórico: compara só dias fechados, com o mesmo número de dias nos dois lados.
  const fimFechado = end >= hoje ? somaDias(hoje, -1) : end;
  const ant = periodoAnterior(start, fimFechado);
  // A comparação com o período anterior vem do histórico diário (instantâneo e igual nos dois lados). A conta pesada
  // de pessoas únicas do período anterior estourava o limite de 8 s do banco nas clínicas grandes.
  const diario = useResultadosDiarios(clientId, start, end);
  const diarioAnterior = useResultadosDiarios(clientId, ant.start, ant.end);
  const dias = diasEntre(start, fimFechado);
  const somaAtual = somaDiaria((diario.data ?? []).filter((l) => l.dia <= fimFechado), dias);
  const somaAntes = somaDiaria(diarioAnterior.data ?? [], dias);
  const historico = useQuery({
    queryKey: ["pacientes-vendas", clientId, hoje],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("pacientes_vendas", {
        p_client: clientId,
        p_de: somaDias(hoje, -DIAS_HISTORICO_RECOMPRA),
        p_ate: hoje,
      });
      if (error) throw new Error(error.message);
      return data as { total: number; itens: VendaHistorico[] };
    },
    staleTime: 10 * 60_000,
  });

  const chamar = useMemo(
    () => (q.data ? paraChamarAgora(historico.data?.itens ?? [], q.data.listas.agendaram.itens, hoje) : []),
    [q.data, historico.data, hoje],
  );

  function abrir(k: ChaveNumero) {
    setAberta((atual) => (atual === k ? null : k));
    requestAnimationFrame(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  if (q.isLoading) return <Carregando texto="Contando as pessoas do período…" linhas={4} />;
  if (q.isError || !q.data)
    return (
      <div role="alert" className="space-y-3 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold">Não foi possível carregar os pacientes do período</h2>
        <p className="text-sm">A consulta falhou. Isso não quer dizer que ninguém entrou em contato.</p>
        <button type="button" className="ws-action ws-action--secondary" disabled={q.isFetching} onClick={() => void q.refetch()}>
          Tentar novamente
        </button>
      </div>
    );

  const d = q.data;
  const eng = d.numeros.engajaram_instagram;
  const etapas = [
    { chave: "mandaram_mensagem" as const, rotulo: "Chamaram" },
    { chave: "negociacao" as const, rotulo: "Em negociação" },
    { chave: "agendaram" as const, rotulo: "Agendaram" },
    { chave: "compareceram" as const, rotulo: "Foram na consulta" },
    { chave: "fecharam" as const, rotulo: "Fecharam" },
  ].filter((e) => d.numeros[e.chave]?.valor != null);
  const rotuloPeriodo = formatRangeLabel({ start, end });
  const leitura = leituraDoPeriodo(
    { mandaram_mensagem: somaAtual.mandaram_mensagem, agendaram: somaAtual.agendaram, fecharam: somaAtual.fecharam },
    { mandaram_mensagem: somaAntes.mandaram_mensagem, agendaram: somaAntes.agendaram, fecharam: somaAntes.fecharam },
  );

  const novas = d.numeros.leads_novos?.valor, antigos = d.numeros.antigos?.valor;
  const rosca = novas != null && antigos != null && novas + antigos > 0
    ? { novas, antigos, pctNovas: Math.round((novas / (novas + antigos)) * 100) } : null;
  const maior = Math.max(1, ...etapas.map((e) => Number(d.numeros[e.chave]?.valor ?? 0)));
  const indisponiveis = CHAVES_NUMEROS.filter((k) => d.numeros[k] && d.numeros[k]!.valor == null);

  const ICONE: Partial<Record<ChaveNumero, NomeIcone>> = { mandaram_mensagem: "message-circle", agendaram: "calendar", fecharam: "checklist", compareceram: "stethoscope" };
  const linhasDia = (diario.data ?? []).filter((l) => l.mandaram_mensagem != null || l.agendaram != null);
  const avisosLeitura = [avisoAgendouMenosQueFechou(d), eng].filter(Boolean).length;

  return (
    <div className="nexo-comercial">
      <CmTopo
        pergunta="Quantas pessoas chamaram, agendaram e fecharam?"
        detalhe={`${rotuloPeriodo} · cada número é de pessoas. Toque num número para ver quem são.`}
      />

      {(avisoCrmCompartilhado(d) || d.cliente_de_teste || notaCrmPorMedico(d)) && (
        <div className="cm-avisos">
          {avisoCrmCompartilhado(d) && <CmAviso tom="critico">{avisoCrmCompartilhado(d)}</CmAviso>}
          {d.cliente_de_teste && <CmAviso tom="atencao">Clínica de teste: estes números não entram nas somas da carteira.</CmAviso>}
          {notaCrmPorMedico(d) && <CmAviso>{notaCrmPorMedico(d)}</CmAviso>}
        </div>
      )}

      <section className="nx-grade nx-grade--4" aria-label="Números do período">
        {METRICAS.filter((k) => d.numeros[k]).map((k, i) => (
          <MetricaCard
            key={k}
            i={i}
            chave={k}
            icone={ICONE[k] ?? "users"}
            numero={d.numeros[k]}
            ativo={aberta === k}
            onAbrir={() => abrir(k)}
            serie={(diario.data ?? []).map((l) => l[k as CampoDiario] ?? null)}
            variacao={variacao(somaAtual[k as CampoDiario], somaAntes[k as CampoDiario])}
          />
        ))}
      </section>

      <div ref={listaRef} className="scroll-mt-4" hidden={!aberta}>
        {aberta && <ListaDePessoas chave={aberta} dados={d} clientId={clientId} isAdmin={isAdmin} hoje={hoje} onFechar={() => setAberta(null)} />}
      </div>

      {(etapas.length > 1 || rosca) && (
        <div className={etapas.length > 1 && rosca ? "cm-par" : ""}>
          {etapas.length > 1 && (
            <NxCard id="funil" nivel={2} icone={icT("filter")} titulo="Do primeiro contato à venda" subtitulo={`${rotuloPeriodo} · toque numa linha para ver quem são`}>
              <CmBarras
                rotulo="Pessoas em cada etapa"
                aberta={aberta}
                onAbrir={(k) => abrir(k as ChaveNumero)}
                max={maior}
                itens={etapas.map((e) => {
                  const v = Number(d.numeros[e.chave]?.valor ?? 0);
                  return { chave: e.chave, rotulo: e.rotulo, valor: v, texto: fmt(v), variacao: paraCm(variacao(somaAtual[e.chave as CampoDiario], somaAntes[e.chave as CampoDiario])) };
                })}
              />
            </NxCard>
          )}
          {rosca && (
            <NxCard id="rosca" nivel={2} icone={icT("users")} titulo="Quem chamou" subtitulo={`${rotuloPeriodo} · ${fmt(rosca.novas + rosca.antigos)} pessoas`}>
              <NxPizza
                rotulo="Quem chamou"
                fatias={[
                  { rotulo: `Pessoas novas · ${fmt(rosca.novas)}`, valor: rosca.novas, cor: "var(--b1)" },
                  { rotulo: `Pacientes antigos · ${fmt(rosca.antigos)}`, valor: rosca.antigos, cor: "var(--b4)" },
                ]}
              />
            </NxCard>
          )}
        </div>
      )}

      {(leitura.length > 0 || isAdmin) && (
        <div className={leitura.length > 0 ? "cm-par cm-par--igual" : ""}>
          <CmLeitura id="leitura" titulo="O que mudou" subtitulo={`${rotuloPeriodo}, comparado ao período anterior`} itens={leitura.map((l) => ({ texto: l.texto, tom: l.tom === "info" ? "flat" : l.tom }))} />
          <MetasDoMes clientId={clientId} isAdmin={isAdmin} hoje={hoje} />
        </div>
      )}
      {leitura.length === 0 && !isAdmin && <MetasDoMes clientId={clientId} isAdmin={isAdmin} hoje={hoje} />}

      {linhasDia.length >= 3 && (
        <NxCard id="evolucao" nivel={2} icone={icT("chart-bar")} titulo="Evolução por dia" subtitulo={`${rotuloPeriodo} · pessoas que chamaram (eixo da esquerda) e agendamentos (eixo da direita)`}>
          <NxLinhaTempo
            rotulo="Pessoas que chamaram e agendamentos por dia"
            datas={linhasDia.map((l) => l.dia)}
            series={[
              { rotulo: "Chamaram", valores: linhasDia.map((l) => l.mandaram_mensagem ?? 0), cor: "var(--b1)", area: true },
              { rotulo: "Agendaram", valores: linhasDia.map((l) => l.agendaram ?? 0), cor: "var(--or)", eixo: "dir" },
            ]}
            formatarData={dataCurta}
            formatarValor={(n) => fmt(Math.round(n))}
          />
          <CmMetodo>
            <p>Cada ponto conta as pessoas daquele dia. A soma dos dias pode ser maior que o número do cartão, porque quem chamou em dois dias conta uma vez só no período.</p>
          </CmMetodo>
        </NxCard>
      )}

      <NxCard
        id="chamar-agora"
        nivel={2}
        icone={icT("message-circle")}
        titulo="Para chamar agora"
        subtitulo={`Quem já pode voltar pelo procedimento que fez e quem agendou e sumiu${chamar.length ? ` · ${fmt(chamar.length)} ${chamar.length === 1 ? "pessoa" : "pessoas"}` : ""}`}
        acao={
          <Ajuda>
            O prazo de volta de cada procedimento está na configuração do Nexo (toxina de 120 a 180 dias, preenchimento de 270 a 365, bioestimulador 365, laser e tecnologias 30, consulta 30, implante hormonal 180). Procedimento sem prazo aparece como "definir prazo" na lista de quem fechou. Olha as vendas dos últimos {DIAS_HISTORICO_RECOMPRA} dias.
          </Ajuda>
        }
      >
        <p className="cm-topo__detalhe" style={{ margin: 0 }}>
          Vence em até {FOLLOW_UP.diasAntesDaRecompra} dias (ou já venceu) o prazo de voltar, ou agendou e, depois de {FOLLOW_UP.diasAgendouSemRetorno} dias, não aparece que foi na consulta nem que fechou.
        </p>
        {historico.isLoading ? (
          <Carregando texto="Procurando quem já pode voltar…" linhas={2} />
        ) : historico.isError ? (
          <p className="text-sm" role="alert">Não deu para ler as vendas anteriores agora. A lista de quem agendou e sumiu continua abaixo.</p>
        ) : null}
        {chamar.length === 0 && !historico.isLoading ? (
          <p className="nx-vazio text-sm">
            {d.numeros.fecharam.valor == null && d.numeros.fecharam.motivo_sem_dado
              ? `Sem as vendas, não dá para saber quem volta. ${d.numeros.fecharam.motivo_sem_dado}`
              : "Ninguém para chamar agora."}
          </p>
        ) : (
          <ul className="cm-lista">
            {chamar.slice(0, chamarTodos ? 100 : 8).map((c) => (
              <li key={c.id}>
                <span className="cm-lista__corpo">
                  <span className="cm-lista__titulo">{c.nome ?? "Sem nome no cadastro"}</span>
                  <span className="cm-lista__sub">{c.motivo}.</span>
                </span>
                <span className="cm-lista__fim">
                  <NxTag tom={c.tipo === "recompra" ? (c.faltam < 0 ? "dn" : "or") : "b"}>
                    {c.tipo === "recompra" ? (c.faltam < 0 ? `atrasado ${-c.faltam} dias` : c.faltam === 0 ? "hoje" : `em ${c.faltam} dias`) : "fazer follow-up"}
                  </NxTag>
                  {isAdmin && c.conversa_id && <BotaoConversa clientId={clientId} conversaId={c.conversa_id} />}
                </span>
              </li>
            ))}
          </ul>
        )}
        {chamar.length > 8 && (
          <button type="button" className="nx-botao" style={{ justifySelf: "start" }} onClick={() => setChamarTodos(!chamarTodos)}>
            {chamarTodos ? "Mostrar só os 8 primeiros" : `Ver todos (${fmt(Math.min(chamar.length, 100))}${chamar.length > 100 ? " de " + fmt(chamar.length) : ""})`}
          </button>
        )}
      </NxCard>

      {indisponiveis.length > 0 && (
        <CmRecolhido titulo={`Números que não aparecem aqui (${indisponiveis.length})`} subtitulo="O que não é medido nesta clínica, por quê e o que fazer">
          <ul className="cm-lista">
            {indisponiveis.map((k) => (
              <li key={k}>
                <span className="cm-lista__corpo">
                  <span className="cm-lista__titulo">{TEXTO_NUMERO[k].rotulo}: {textoNaoMedido(d.numeros[k]).toLowerCase()}</span>
                  <span className="cm-lista__sub">
                    {d.numeros[k]?.motivo_sem_dado ?? "A fonte não respondeu."}
                    {typeof d.numeros[k]?.o_que_fazer === "string" && <> <b>O que fazer:</b> {d.numeros[k]?.o_que_fazer}</>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {avisoNaoMedido(d) && <p className="text-xs">{avisoNaoMedido(d)}</p>}
        </CmRecolhido>
      )}

      {avisosLeitura > 0 && (
        <CmRecolhido titulo={`Avisos sobre a leitura dos números (${avisosLeitura})`} subtitulo="Regras diferentes entre os números e o que não conta como contato">
          {avisoAgendouMenosQueFechou(d) && <CmAviso tom="atencao">{avisoAgendouMenosQueFechou(d)}</CmAviso>}
          {eng && (
            <div className="cm-aviso">
              <span className="cm-aviso__ic" aria-hidden>i</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <b>{TEXTO_NUMERO.engajaram_instagram.rotulo}:</b>
                {eng.valor == null ? (
                  <span>sem dado. {eng.motivo_sem_dado}</span>
                ) : (
                  <>
                    <button type="button" className="font-semibold underline" onClick={() => abrir("engajaram_instagram")} aria-expanded={aberta === "engajaram_instagram"}>
                      {pessoas(eng.valor)}
                    </button>
                    <span>
                      {fmt(Number(eng.so_comentaram ?? 0))} só comentaram em post, {fmt(Number(eng.so_story ?? 0))} só reagiram ou responderam story. Não contam como contato.
                    </span>
                  </>
                )}
                <Ajuda>{TEXTO_NUMERO.engajaram_instagram.fonte}</Ajuda>
              </div>
            </div>
          )}
        </CmRecolhido>
      )}
    </div>
  );
}

function MetricaCard({ chave, numero, icone, ativo, onAbrir, serie, variacao: dv, i }: { chave: ChaveNumero; numero: Numero | undefined; icone: NomeIcone; ativo: boolean; onAbrir: () => void; serie?: (number | null)[]; variacao?: Variacao | null; i: number }) {
  const t = TEXTO_NUMERO[chave];
  const semDado = !numero || numero.valor == null;
  const notas = semDado
    ? [numero?.motivo_sem_dado ?? "A fonte não respondeu."]
    : [dv ? null : legendaDoNumero(chave, numero), coberturaDoNumero(numero), chave === "fecharam" ? avisoCheckout(numero) : null].filter(Boolean);
  return (
    <CmKpi
      i={i}
      icone={icone}
      rotulo={t.rotulo}
      valor={semDado ? textoNaoMedido(numero) : fmt(numero!.valor)}
      apagado={semDado}
      variacao={semDado ? null : paraCm(dv)}
      nota={notas.length ? notas.join(" · ") : undefined}
      info={<Ajuda>{fonteDoNumero(chave, numero)}</Ajuda>}
      onAbrir={semDado ? undefined : onAbrir}
      aberto={ativo}
      rotuloAbrir={`${t.rotulo}: ${fmt(numero?.valor)}. Ver quem são`}
      extra={!semDado && serie ? <Minigrafico pontos={serie} /> : undefined}
    />
  );
}
function BotaoConversa({ clientId, conversaId }: { clientId: string; conversaId: string }) {
  return (
    <Link
      to="/$clientId/atendimento"
      params={{ clientId }}
      search={{ aba: "conversas", conversa: conversaId } as never}
      className="nx-botao"
      style={{ minHeight: 36, padding: "0 12px", fontSize: 13 }}
    >
      <MessageCircle size={14} aria-hidden /> Abrir conversa
    </Link>
  );
}

/** Uma linha de resumo acima da lista: de onde vieram ou como se dividem. */
function Divisao({ chave, numero, dados }: { chave: ChaveNumero; numero: Numero; dados: PacientesPeriodo }) {
  const partes: string[] = [];
  const obj = (k: string) => (numero[k] ?? {}) as Record<string, number>;
  if (chave === "mandaram_mensagem") {
    const c = obj("por_canal");
    partes.push(`WhatsApp: ${fmt(c.whatsapp ?? 0)}`, `Instagram Direct: ${fmt(c.instagram ?? 0)}`);
    if (c.outro) partes.push(`outros canais: ${fmt(c.outro)}`);
  } else if (chave === "leads_novos") {
    const o = obj("por_origem");
    for (const [k, rot] of Object.entries(ROTULO_ORIGEM)) if (o[k]) partes.push(`${rot}: ${fmt(o[k])}`);
    if (Number(numero.origem_pela_conversa ?? 0) > 0) partes.push(`${fmt(Number(numero.origem_pela_conversa))} com a origem lida na conversa`);
  } else if (chave === "abordados") {
    if (!dados.tem_funil_prospeccao) partes.push("A clínica não usa funil de prospecção ativa no CRM");
    else partes.push(`responderam: ${fmt(Number(numero.responderam ?? 0))}`, `agendaram: ${fmt(Number(numero.agendaram ?? 0))}`, `fecharam: ${fmt(Number(numero.fecharam ?? 0))}`);
  } else if (chave === "antigos") {
    const f = obj("por_fonte");
    if (f.crm_antes) partes.push(`${fmt(f.crm_antes)} já estavam no CRM antes`);
    if (f.crm_origem) partes.push(`${fmt(f.crm_origem)} o CRM marca como paciente antigo`);
    if (f.conversa) partes.push(`${fmt(f.conversa)} a conversa diz que já é paciente`);
  } else if (chave === "agendaram" || chave === "negociacao") {
    const f = obj("por_fonte");
    partes.push(`pelo CRM: ${fmt(f.crm ?? 0)}`, `pela conversa: ${fmt(f.conversa ?? 0)}`, `nos dois: ${fmt(f.crm_e_conversa ?? 0)}`);
  } else if (chave === "fecharam") {
    const vendas = Number(numero.vendas ?? 0), semValor = Number(numero.sem_valor ?? 0);
    const checkout = vemDoCheckout(numero);
    // Venda conta pessoas (o número grande); os cards ganhos (orçamentos) ficam como informação secundária.
    if (!checkout && numero.ja_no_crm != null && Number(numero.ja_no_crm) > 0)
      partes.push(`${fmt(Number(numero.ja_no_crm))} já eram pacientes ou já estavam no CRM antes do período`);
    const vendasCrm = Number(numero.vendas_crm ?? 0);
    if (checkout && vendasCrm > 0) partes.push(`${fmt(vendas - vendasCrm)} vendas pela ${nomeCheckout(numero)} e ${fmt(vendasCrm)} pelo CRM`);
    else partes.push(checkout ? `${fmt(vendas)} vendas pela ${nomeCheckout(numero)}` : `${fmt(vendas)} ${vendas === 1 ? "orçamento ganho" : "orçamentos ganhos"} no CRM (quem fechou mais de um conta uma vez)`);
    if (checkout && Number(numero.em_protesto ?? 0) > 0) partes.push(`${fmt(Number(numero.em_protesto))} em protesto (contam como venda, como na ${nomeCheckout(numero)})`);
    // Com metade ou mais das vendas sem valor, a soma engana (HOMS: 100 vendas, só 1 com valor, "total R$ 86").
    if (vendas > 0 && semValor * 2 >= vendas) partes.push(`só ${fmt(vendas - semValor)} com valor ${checkout ? "no checkout" : "no CRM"}, então o total não aparece`);
    else {
      partes.push(`total ${fmtBRL(Number(numero.valor_total ?? 0))}`);
      if (semValor > 0) partes.push(`${fmt(semValor)} sem valor ${checkout ? "no checkout" : "no CRM"}`);
    }
    const reembolsos = textoReembolsos(numero, fmtBRL);
    if (reembolsos) partes.push(reembolsos);
    const renovacoes = textoRenovacoes(numero, fmtBRL);
    if (renovacoes) partes.push(renovacoes);
    if (Number(numero.ganho_prospeccao_sem_valor ?? 0) > 0)
      partes.push(`${fmt(Number(numero.ganho_prospeccao_sem_valor))} "ganhos" sem valor da prospecção contados como resposta, não como venda`);
  } else if (chave === "engajaram_instagram") {
    partes.push(`só comentaram: ${fmt(Number(numero.so_comentaram ?? 0))}`, `só reagiram ou responderam story: ${fmt(Number(numero.so_story ?? 0))}`);
  }
  if (!partes.length) return null;
  return <p className="text-sm" style={{ color: "var(--muted-ink)", margin: "2px 0 0" }}>{partes.join(" · ")}</p>;
}

function ListaDePessoas({
  chave, dados, clientId, isAdmin, hoje, onFechar,
}: { chave: ChaveNumero; dados: PacientesPeriodo; clientId: string; isAdmin: boolean; hoje: string; onFechar: () => void }) {
  const lista = dados.listas[chave];
  const numero = dados.numeros[chave];
  const t = TEXTO_NUMERO[chave];
  return (
    <section aria-labelledby="lista-aberta" className="nx-card nx-sobe cm-lista-aberta">
      <header className="flex items-start gap-3">
        <span className="nx-tile" aria-hidden><Users size={17} strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="lista-aberta" className="text-[18px] font-semibold leading-6">
            {t.rotulo}: {chave === "fecharam" ? pessoas(Number(numero.valor ?? 0)) : pessoas(lista.total)}
          </h2>
          <Divisao chave={chave} numero={numero} dados={dados} />
        </div>
        <button type="button" className="nx-botao" style={{ minHeight: 40 }} onClick={onFechar}>Fechar</button>
      </header>
      {lista.itens.length === 0 ? (
        <p className="nx-vazio text-sm">Ninguém neste período.</p>
      ) : (
        <ul className="cm-lista">
          {lista.itens.map((i, idx) => (
            <LinhaPessoa key={`${i.id}:${idx}`} chave={chave} item={i} clientId={clientId} isAdmin={isAdmin} hoje={hoje} />
          ))}
        </ul>
      )}
      {lista.total > lista.itens.length && (
        <p className="text-xs" style={{ color: "var(--muted-ink)", margin: 0 }}>Mostrando as {fmt(lista.itens.length)} mais recentes de {fmt(lista.total)}.</p>
      )}
    </section>
  );
}

function LinhaPessoa({ chave, item, clientId, isAdmin, hoje }: { chave: ChaveNumero; item: ItemPessoa; clientId: string; isAdmin: boolean; hoje: string }) {
  const pe = emQuePe(item);
  const que = oQue(item);
  const detalhes: string[] = [];
  if (item.canal) detalhes.push(ROTULO_CANAL[item.canal] ?? item.canal);
  if (chave === "leads_novos" && item.origem) detalhes.push(`veio de: ${ROTULO_ORIGEM[item.origem] ?? item.origem}${item.origem_fonte === "conversa" ? " (lido na conversa)" : ""}`);
  if (chave === "engajaram_instagram") detalhes.push(item.tipo === "comentou" ? "comentou em post" : "reagiu ou respondeu story");
  if (chave === "abordados") detalhes.push(item.fechou ? "fechou" : item.agendou ? "agendou" : item.respondeu ? "respondeu" : "ainda não respondeu");
  if (chave === "antigos" && item.fontes?.length) detalhes.push(`como sabemos: ${item.fontes.map((f) => ROTULO_FONTE[f] ?? f).join(", ")}`);
  if ((chave === "agendaram" || chave === "negociacao") && item.fonte) detalhes.push(`fonte: ${ROTULO_FONTE[item.fonte] ?? item.fonte}`);
  if (chave === "agendaram" && item.agendou_em) {
    detalhes.push(`agendou em ${dataBr(item.agendou_em)}`);
    if (item.compareceu_depois) detalhes.push("foi na consulta");
    else if (item.fechou_depois) detalhes.push("fechou");
  }
  let recompra: string | null = null;
  if (chave === "fecharam") {
    if (item.valor != null && Number(item.valor) > 0) detalhes.push(fmtBRL(Number(item.valor)));
    else detalhes.push(item.fonte === "checkout" ? "sem valor no checkout" : "sem valor no CRM");
    if (item.data) detalhes.push(`em ${dataBr(item.data)}`);
    if (item.data) recompra = rotuloRecompra(recompraDe({ data: item.data, procedimento: item.procedimento ?? null, interesse: item.leitura?.interesse ?? null, funil: item.funil ?? null }, undefined, hoje));
  } else if (item.data && chave !== "agendaram") {
    detalhes.push(dataBr(item.data));
  }
  return (
    <li>
      <div className="cm-lista__corpo">
        <p className="cm-lista__titulo" style={{ margin: 0 }}>
          {item.nome ?? "Sem nome no cadastro"}
          {que && <span style={{ color: "var(--muted-ink)", fontWeight: 500 }}>{chave === "fecharam" ? ": fechou " : ": "}{que}</span>}
        </p>
        <p className="cm-lista__sub" style={{ margin: 0 }}>
          {[pe && chave !== "fecharam" ? pe : null, ...detalhes].filter(Boolean).join(" · ")}
        </p>
        {recompra && <p className="text-xs font-semibold" style={{ color: "var(--b1)", margin: 0 }}>{recompra}</p>}
      </div>
      {isAdmin && item.conversa_id && <BotaoConversa clientId={clientId} conversaId={item.conversa_id} />}
    </li>
  );
}
