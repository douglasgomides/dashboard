import { useMemo, useRef, useState } from "react";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, PhoneCall, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Ajuda } from "@/components/visual";
import { Carregando } from "@/components/sem-fonte";
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
  avisoNaoMedido,
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

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

export const Route = createFileRoute("/_authenticated/$clientId/pacientes")({
  component: PacientesDoPeriodo,
});

const fmt = (n: number | null | undefined) => (n == null ? "" : Number(n).toLocaleString("pt-BR"));
const pessoas = (n: number) => `${fmt(n)} ${n === 1 ? "pessoa" : "pessoas"}`;

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

  const q = useQuery({
    queryKey: ["pacientes-periodo", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("pacientes_periodo", { p_client: clientId, p_de: start, p_ate: end });
      if (error) throw new Error(error.message);
      return data as PacientesPeriodo;
    },
    staleTime: 5 * 60_000,
  });
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

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Pacientes do período</h2>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          {formatRangeLabel({ start, end })}. Cada número é de pessoas, não de conversas. Toque num número para ver quem são.
        </p>
        {(d.crm_compartilhado_com?.length ?? 0) > 0 && (
          <p className="text-sm font-medium" style={{ color: "var(--warn, var(--text))" }}>
            O CRM desta clínica é o mesmo de {d.crm_compartilhado_com!.join(", ")}. Os números abaixo são da conta inteira, não só deste médico.
            Para separar, a clínica precisa marcar o médico em cada lead (um campo "Médico" no CRM).
          </p>
        )}
        {avisoNaoMedido(d) && (
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>{avisoNaoMedido(d)}</p>
        )}
        {d.cliente_de_teste && (
          <p className="text-xs" style={{ color: "var(--warn, var(--muted))" }}>
            Clínica de teste: estes números não entram nas somas da carteira.
          </p>
        )}
      </header>

      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8" aria-label="Números do período">
        {CHAVES_NUMEROS.map((k) => (
          <NumeroGrande key={k} chave={k} numero={d.numeros[k]} ativo={aberta === k} onAbrir={() => abrir(k)} />
        ))}
      </ul>

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

      <section aria-labelledby="chamar-agora" className="space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
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

function NumeroGrande({ chave, numero, ativo, onAbrir }: { chave: ChaveNumero; numero: Numero | undefined; ativo: boolean; onAbrir: () => void }) {
  const t = TEXTO_NUMERO[chave];
  const semDado = !numero || numero.valor == null;
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onAbrir}
        disabled={semDado}
        aria-expanded={ativo}
        className="flex h-full w-full flex-col items-start gap-1 rounded-xl border p-3 pr-9 text-left disabled:cursor-default"
        style={{ background: ativo ? "var(--accent-soft)" : "var(--surface)", borderColor: ativo ? "var(--accent)" : "var(--border)" }}
      >
        <span className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>{t.rotulo}</span>
        {semDado ? (
          <>
            <span className="text-base font-semibold" style={{ color: "var(--muted)" }}>Sem dado</span>
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>{numero?.motivo_sem_dado ?? "A fonte não respondeu."}</span>
            {numero?.responsavel && <span className="text-[11px] font-medium" style={{ color: "var(--text-dim)" }}>{ROTULO_RESPONSAVEL[numero.responsavel]}</span>}
          </>
        ) : (
          <>
            <span className="text-3xl font-semibold tabular-nums leading-none">{fmt(numero!.valor)}</span>
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>{legendaDoNumero(chave, numero)}</span>
            {coberturaDoNumero(numero) && <span className="text-[11px] font-medium" style={{ color: "var(--text-dim)" }}>{coberturaDoNumero(numero)}</span>}
            {chave === "fecharam" && avisoCheckout(numero) && <span className="text-[11px] font-medium" style={{ color: "var(--text-dim)" }}>{avisoCheckout(numero)}</span>}
          </>
        )}
      </button>
      <span className="absolute right-1.5 top-1.5">
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
    const vendasCrm = Number(numero.vendas_crm ?? 0);
    if (checkout && vendasCrm > 0) partes.push(`${fmt(vendas - vendasCrm)} vendas pela ${nomeCheckout(numero)} e ${fmt(vendasCrm)} pelo CRM`);
    else partes.push(`${fmt(vendas)} vendas${checkout ? ` pela ${nomeCheckout(numero)}` : ""}`);
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
    <section aria-labelledby="lista-aberta" className="space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--accent)" }}>
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
