import { useMemo, useRef, useState } from "react";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, PhoneCall, Users } from "lucide-react";
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
import { LeituraDoPeriodo, MetasDoMes } from "@/components/databoard-inteligencia";
import { leituraDoPeriodo } from "@/lib/inteligencia-resultados";

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
function variacao(atual: number | null | undefined, antes: number | null | undefined): { txt: string; curto: string; tom: "up" | "down" | "flat" } | null {
  if (atual == null || antes == null || antes <= 0) return null;
  const pct = Math.round(((atual - antes) / antes) * 100);
  if (pct === 0) return { txt: "igual", curto: "=", tom: "flat" };
  return { txt: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, curto: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, tom: pct > 0 ? "up" : "down" };
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
  const listaRef = useRef<HTMLDivElement>(null);

  const q = usePacientesPeriodo(clientId, start, end);
  const ant = periodoAnterior(start, end);
  const anterior = usePacientesPeriodo(clientId, ant.start, ant.end);
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
    { mandaram_mensagem: d.numeros.mandaram_mensagem?.valor, agendaram: d.numeros.agendaram?.valor, fecharam: d.numeros.fecharam?.valor },
    anterior.data ? { mandaram_mensagem: anterior.data.numeros.mandaram_mensagem?.valor, agendaram: anterior.data.numeros.agendaram?.valor, fecharam: anterior.data.numeros.fecharam?.valor } : null,
  );
  const novas = d.numeros.leads_novos?.valor, antigos = d.numeros.antigos?.valor;
  const rosca = novas != null && antigos != null && novas + antigos > 0
    ? { novas, antigos, pctNovas: Math.round((novas / (novas + antigos)) * 100) } : null;
  const maior = Math.max(1, ...etapas.map((e) => Number(d.numeros[e.chave]?.valor ?? 0)));
  const indisponiveis = CHAVES_NUMEROS.filter((k) => d.numeros[k] && d.numeros[k]!.valor == null);

  return (
    <div className="dbx space-y-4">
      <header className="space-y-1">
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          {formatRangeLabel({ start, end })} · cada número é de pessoas. Toque num número para ver quem são.
        </p>
        {avisoCrmCompartilhado(d) && (
          <p className="text-sm font-medium" style={{ color: "var(--warn, var(--text))" }}>{avisoCrmCompartilhado(d)}</p>
        )}
        {notaCrmPorMedico(d) && (
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>{notaCrmPorMedico(d)}</p>
        )}
        {d.cliente_de_teste && (
          <p className="text-xs" style={{ color: "var(--warn, var(--muted))" }}>
            Clínica de teste: estes números não entram nas somas da carteira.
          </p>
        )}
      </header>

      <ul className="dbx-grid dbx-cards" aria-label="Números do período">
        {METRICAS.filter((k) => d.numeros[k]).map((k) => (
          <MetricaCard key={k} chave={k} numero={d.numeros[k]} periodo={rotuloPeriodo} ativo={aberta === k} onAbrir={() => abrir(k)}
            variacao={variacao(d.numeros[k]?.valor, anterior.data?.numeros[k]?.valor)} />
        ))}
      </ul>

      <div className="dbx-grid dbx-split">
        {etapas.length > 1 && (
          <section className="dbx-card" aria-labelledby="funil-t">
            <h2 id="funil-t" className="dbx-title">Do primeiro contato à venda</h2>
            <p className="dbx-sub">{rotuloPeriodo} · toque numa linha para ver quem são</p>
            <ul className="dbx-rows">
              {etapas.map((e) => {
                const v = Number(d.numeros[e.chave]?.valor ?? 0);
                const dv = variacao(d.numeros[e.chave]?.valor, anterior.data?.numeros[e.chave]?.valor);
                return (
                  <li key={e.chave}>
                    <button type="button" className="dbx-row" onClick={() => abrir(e.chave)} aria-expanded={aberta === e.chave}>
                      <span className="lab">{e.rotulo}</span>
                      <span className="dbx-bar" aria-hidden><i style={{ width: `${Math.max(v > 0 ? 2 : 0, Math.min(100, (v / maior) * 100))}%` }} /></span>
                      <span className="val">{fmt(v)}</span>
                      <span className={`dl ${dv?.tom ?? "flat"}`}>{dv ? dv.curto : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {rosca && (
          <section className="dbx-card" aria-labelledby="rosca-t">
            <h2 id="rosca-t" className="dbx-title">Quem chamou</h2>
            <p className="dbx-sub">{rotuloPeriodo}</p>
            <div className="dbx-donut-wrap">
              <div className="dbx-donut" role="img" aria-label={`${fmt(rosca.novas)} pessoas novas e ${fmt(rosca.antigos)} pacientes antigos`}
                style={{ background: `conic-gradient(var(--dbx-a) 0 ${rosca.pctNovas}%, var(--dbx-b) ${rosca.pctNovas}% 100%)` }}>
                <span>{fmt(rosca.novas + rosca.antigos)}</span>
              </div>
              <ul className="dbx-legend">
                <li><i style={{ background: "var(--dbx-a)" }} />Pessoas novas<b>{fmt(rosca.novas)}</b></li>
                <li><i style={{ background: "var(--dbx-b)" }} />Pacientes antigos<b>{fmt(rosca.antigos)}</b></li>
              </ul>
            </div>
          </section>
        )}
      </div>

      <div className="dbx-grid dbx-split">
        <LeituraDoPeriodo itens={leitura} periodo={rotuloPeriodo} />
        <MetasDoMes clientId={clientId} isAdmin={isAdmin} hoje={hoje} />
      </div>

      {indisponiveis.length > 0 && (
        <details className="text-sm" style={{ color: "var(--text-dim)" }}>
          <summary className="cursor-pointer">Números que não aparecem aqui ({indisponiveis.length})</summary>
          <ul className="mt-2 space-y-2">
            {indisponiveis.map((k) => (
              <li key={k}>
                <b>{TEXTO_NUMERO[k].rotulo}</b>: {textoNaoMedido(d.numeros[k]).toLowerCase()}. {d.numeros[k]?.motivo_sem_dado ?? "A fonte não respondeu."}
                {typeof d.numeros[k]?.o_que_fazer === "string" && <> <b>O que fazer:</b> {d.numeros[k]?.o_que_fazer}</>}
              </li>
            ))}
            {avisoNaoMedido(d) && <li className="text-xs">{avisoNaoMedido(d)}</li>}
          </ul>
        </details>
      )}

      {avisoAgendouMenosQueFechou(d) && (
        <p className="rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--warn-border, var(--border))", background: "var(--surface-2)" }}>
          {avisoAgendouMenosQueFechou(d)}
        </p>
      )}

      {eng && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <span className="font-medium">{TEXTO_NUMERO.engajaram_instagram.rotulo}:</span>
          {eng.valor == null ? (
            <span style={{ color: "var(--text-dim)" }}>sem dado. {eng.motivo_sem_dado}</span>
          ) : (
            <>
              <button type="button" className="font-semibold underline" onClick={() => abrir("engajaram_instagram")} aria-expanded={aberta === "engajaram_instagram"}>
                {pessoas(eng.valor)}
              </button>
              <span style={{ color: "var(--text-dim)" }}>
                {fmt(Number(eng.so_comentaram ?? 0))} só comentaram em post, {fmt(Number(eng.so_story ?? 0))} só reagiram ou responderam story. Não contam como contato.
              </span>
            </>
          )}
          <Ajuda>{TEXTO_NUMERO.engajaram_instagram.fonte}</Ajuda>
        </div>
      )}

      <div ref={listaRef} className="scroll-mt-4">
        {aberta && <ListaDePessoas chave={aberta} dados={d} clientId={clientId} isAdmin={isAdmin} hoje={hoje} onFechar={() => setAberta(null)} />}
      </div>

      <section aria-labelledby="chamar-agora" className="dbx-card space-y-3">
        <header className="flex items-start gap-2">
          <PhoneCall size={18} aria-hidden style={{ color: "var(--accent)" }} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 id="chamar-agora" className="font-semibold">Para chamar agora</h2>
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              Quem já pode voltar pelo procedimento que fez (vence em até {FOLLOW_UP.diasAntesDaRecompra} dias ou já venceu) e quem agendou e, depois de {FOLLOW_UP.diasAgendouSemRetorno} dias, não aparece que foi na consulta nem que fechou.
            </p>
          </div>
          <Ajuda>
            O prazo de volta de cada procedimento está na configuração do Nexo (toxina de 120 a 180 dias, preenchimento de 270 a 365, bioestimulador 365, laser e tecnologias 30, consulta 30, implante hormonal 180). Procedimento sem prazo aparece como "definir prazo" na lista de quem fechou. Olha as vendas dos últimos {DIAS_HISTORICO_RECOMPRA} dias.
          </Ajuda>
        </header>
        {historico.isLoading ? (
          <Carregando texto="Procurando quem já pode voltar…" linhas={2} />
        ) : historico.isError ? (
          <p className="text-sm" role="alert">Não deu para ler as vendas anteriores agora. A lista de quem agendou e sumiu continua abaixo.</p>
        ) : null}
        {chamar.length === 0 && !historico.isLoading ? (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            {d.numeros.fecharam.valor == null && d.numeros.fecharam.motivo_sem_dado
              ? `Sem as vendas, não dá para saber quem volta. ${d.numeros.fecharam.motivo_sem_dado}`
              : "Ninguém para chamar agora."}
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {chamar.slice(0, 100).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.nome ?? "Sem nome no cadastro"}</p>
                  <p className="text-sm" style={{ color: "var(--text-dim)" }}>{c.motivo}.</p>
                </div>
                <span className="text-xs font-medium" style={{ color: c.faltam < 0 ? "var(--danger, var(--accent))" : "var(--text-dim)" }}>
                  {c.tipo === "recompra" ? (c.faltam < 0 ? `atrasado ${-c.faltam} dias` : c.faltam === 0 ? "hoje" : `em ${c.faltam} dias`) : "fazer follow-up"}
                </span>
                {isAdmin && c.conversa_id && <BotaoConversa clientId={clientId} conversaId={c.conversa_id} />}
              </li>
            ))}
          </ul>
        )}
        {chamar.length > 100 && <p className="text-xs" style={{ color: "var(--text-dim)" }}>Mostrando 100 de {fmt(chamar.length)}.</p>}
      </section>
    </div>
  );
}

function MetricaCard({ chave, numero, periodo, ativo, onAbrir, variacao: dv }: { chave: ChaveNumero; numero: Numero | undefined; periodo: string; ativo: boolean; onAbrir: () => void; variacao?: { txt: string; tom: "up" | "down" | "flat" } | null }) {
  const t = TEXTO_NUMERO[chave];
  const semDado = !numero || numero.valor == null;
  return (
    <li className="relative">
      <button type="button" className="dbx-card" onClick={onAbrir} disabled={semDado} aria-expanded={ativo}>
        <span className="dbx-head">
          <span>
            <span className="dbx-title block">{t.rotulo}</span>
            <span className="dbx-sub block">{periodo}</span>
          </span>
        </span>
        {semDado ? (
          <>
            <span className="dbx-big mute block">{textoNaoMedido(numero)}</span>
            <span className="dbx-note block">{numero?.motivo_sem_dado ?? "A fonte não respondeu."}</span>
          </>
        ) : (
          <>
            <span className="dbx-big block">{fmt(numero!.valor)}</span>
            {dv ? (
              <span className={`dbx-delta dbx-${dv.tom}`}><b>{dv.txt}</b> vs período anterior</span>
            ) : (
              <span className="dbx-delta dbx-flat">{legendaDoNumero(chave, numero)}</span>
            )}
            {coberturaDoNumero(numero) && <span className="dbx-note block">{coberturaDoNumero(numero)}</span>}
            {chave === "fecharam" && avisoCheckout(numero) && <span className="dbx-note block">{avisoCheckout(numero)}</span>}
          </>
        )}
      </button>
      <span className="absolute right-3 top-3">
        <Ajuda>{fonteDoNumero(chave, numero)}</Ajuda>
      </span>
    </li>
  );
}

function BotaoConversa({ clientId, conversaId }: { clientId: string; conversaId: string }) {
  return (
    <Link
      to="/$clientId/atendimento"
      params={{ clientId }}
      search={{ aba: "conversas", conversa: conversaId } as never}
      className="ws-action ws-action--secondary inline-flex items-center gap-1 text-xs"
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
  return <p className="text-sm" style={{ color: "var(--text-dim)" }}>{partes.join(" · ")}</p>;
}

function ListaDePessoas({
  chave, dados, clientId, isAdmin, hoje, onFechar,
}: { chave: ChaveNumero; dados: PacientesPeriodo; clientId: string; isAdmin: boolean; hoje: string; onFechar: () => void }) {
  const lista = dados.listas[chave];
  const numero = dados.numeros[chave];
  const t = TEXTO_NUMERO[chave];
  return (
    <section aria-labelledby="lista-aberta" className="dbx-card space-y-3" style={{ borderColor: "var(--accent)" }}>
      <header className="flex items-start gap-2">
        <Users size={18} aria-hidden style={{ color: "var(--accent)" }} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="lista-aberta" className="font-semibold">
            {t.rotulo}: {chave === "fecharam" ? pessoas(Number(numero.valor ?? 0)) : pessoas(lista.total)}
          </h2>
          <Divisao chave={chave} numero={numero} dados={dados} />
        </div>
        <button type="button" className="ws-action ws-action--secondary text-xs" onClick={onFechar}>Fechar</button>
      </header>
      {lista.itens.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Ninguém neste período.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {lista.itens.map((i, idx) => (
            <LinhaPessoa key={`${i.id}:${idx}`} chave={chave} item={i} clientId={clientId} isAdmin={isAdmin} hoje={hoje} />
          ))}
        </ul>
      )}
      {lista.total > lista.itens.length && (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>Mostrando as {fmt(lista.itens.length)} mais recentes de {fmt(lista.total)}.</p>
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
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {item.nome ?? "Sem nome no cadastro"}
          {que && <span className="font-normal" style={{ color: "var(--text-dim)" }}>{chave === "fecharam" ? ": fechou " : ": "}{que}</span>}
        </p>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          {[pe && chave !== "fecharam" ? pe : null, ...detalhes].filter(Boolean).join(" · ")}
        </p>
        {recompra && <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>{recompra}</p>}
      </div>
      {isAdmin && item.conversa_id && <BotaoConversa clientId={clientId} conversaId={item.conversa_id} />}
    </li>
  );
}
