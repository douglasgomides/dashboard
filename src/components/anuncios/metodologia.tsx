// Camada 3 da tela Anúncios: metodologia e critérios, recolhida por padrão.
// Tudo o que decide um veredito está aqui, com os números deste período, para
// que a tela e o veredito nunca discordem.
import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { fmtBRL } from "@/lib/format";
import {
  GRUPOS,
  ORDEM_VEREDITO,
  ORDEM_SELOS,
  EXPLICA_VEREDITO,
  EXPLICA_SELO,
  MIN_IMPRESSOES,
  MIN_GASTO,
  MIN_CAMPANHAS_REGUA,
  MIN_IMPRESSOES_METADE,
  MIN_IMPRESSOES_TAXA,
  ESCALAR,
  CORTAR,
  QUEDA_CTR,
  QUEDA_ATENCAO,
  PASSO_ORCAMENTO,
  MIN_RESULTADOS,
  CTR_TRAFEGO_MERCADO,
  TRAFEGO_WHATS_MIN_CONVERSAS,
  TRAFEGO_WHATS_CONVERSAS_POR_CLIQUE,
  unidade,
  type DiagnosticoAds,
} from "@/lib/anuncios-objetivo";
import { BENCHMARKS } from "@/lib/benchmarks";
import { SeloVeredito, SeloExtra } from "@/components/anuncios/veredito";

const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const porCem = (v: number | null) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} de cada 100`);
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function Sec({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="mt-1.5 space-y-1.5 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
        {children}
      </div>
    </section>
  );
}

function Tabela({ cab, linhas }: { cab: string[]; linhas: React.ReactNode[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[520px] border-collapse text-xs">
        <thead>
          <tr>
            {cab.map((c) => (
              <th key={c} className="border-b px-2 py-1.5 text-left font-semibold" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              {l.map((c, j) => (
                <td key={j} className="border-b px-2 py-1.5 align-top tabular-nums" style={{ borderColor: "var(--border)" }}>
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

export function MetodologiaAnuncios({ d, abertoInicial = false }: { d: DiagnosticoAds; abertoInicial?: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const r = d.reguaConta;

  // Painel original "Por objetivo da campanha": uma linha por objetivo bruto da Meta.
  const porBruto = new Map<string, { gasto: number; campanhas: number; conversas: number }>();
  for (const c of d.campanhas) {
    const k = c.objetivo ?? "(sem objetivo)";
    const a = porBruto.get(k) ?? { gasto: 0, campanhas: 0, conversas: 0 };
    a.gasto += c.gasto;
    a.campanhas += 1;
    a.conversas += c.conversas;
    porBruto.set(k, a);
  }
  const brutos = [...porBruto.entries()].sort((a, b) => b[1].gasto - a[1].gasto);

  const mudou = d.campanhas.filter((c) => c.vereditoContaToda !== c.vereditoOficial);
  const contar = (f: (c: (typeof d.campanhas)[number]) => string) => {
    const m = new Map<string, number>();
    for (const c of d.campanhas) m.set(f(c), (m.get(f(c)) ?? 0) + 1);
    return ORDEM_VEREDITO.filter((v) => m.get(v)).map((v) => `${v}: ${m.get(v)}`).join(" · ");
  };
  const custoContaAntigo = d.conversas > 0 ? d.gasto / d.conversas : null;

  return (
    <section className="rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setAberto((x) => !x)}
        aria-expanded={aberto}
        className="flex min-h-[44px] w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
      >
        <BookOpen size={16} aria-hidden style={{ color: "var(--accent)" }} />
        <span className="flex-1">Metodologia e critérios</span>
        <span className="text-xs font-normal" style={{ color: "var(--text-dim)" }}>
          regras, réguas deste período, dados completos
        </span>
        <ChevronDown size={16} aria-hidden style={{ transform: aberto ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>
      {aberto && (
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "var(--border)" }}>
          <Sec titulo="1. Como cada campanha recebe o veredito">
            <p>
              São os seis vereditos do diagnóstico original, nesta ordem de regras. O que mudou é <b>com quem</b> a campanha é comparada
              (item 2).
            </p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>
                <b>Volume insuficiente</b>: menos de {int(MIN_IMPRESSOES)} aparições ou menos de {fmtBRL(MIN_GASTO)} no período (mesmos limites do
                diagnóstico original). Não recebe veredito de mentira.
              </li>
              <li>
                <b>Régua</b>: se o objetivo da campanha tem {MIN_CAMPANHAS_REGUA} ou mais campanhas com volume e resultado medido, a régua é a
                campanha típica (mediana) <b>do mesmo objetivo</b>, no resultado do objetivo (conversa, lead, clique no link, mil aparições, visita à
                página). Senão (poucas campanhas, objetivo sem régua ou resultado não medido), volta a régua original: <b>custo por conversa</b>{" "}
                contra a campanha típica <b>da conta toda</b> (campanhas com {int(MIN_IMPRESSOES)}+ aparições), com o selo "Comparada com a conta".
              </li>
              <li>
                Nenhum resultado na régua: se os cliques no link por aparição estão no nível ou acima do típico, <b>Atrai mas não converte</b>; senão,{" "}
                <b>Sem tração</b>. O típico é a mediana do mesmo objetivo (em tráfego sem {MIN_CAMPANHAS_REGUA} campanhas, a referência de mercado de{" "}
                {porCem(CTR_TRAFEGO_MERCADO)}, {BENCHMARKS.ctrTrafego.fonte}) ou, na régua da conta, a mediana da conta.
              </li>
              <li>
                Custo ≤ {num(ESCALAR)}x a típica: <b>Escalar</b>. Custo ≥ {num(CORTAR)}x: <b>Cortar</b> (a Meta trata 2x como sinal de anúncio
                esgotado). Entre os dois: <b>Manter</b>.
              </li>
            </ol>
            <div className="mt-2 flex flex-col gap-1.5">
              {ORDEM_VEREDITO.map((v) => (
                <div key={v} className="flex flex-wrap items-start gap-2">
                  <SeloVeredito v={v} />
                  <span className="min-w-0 flex-1">{EXPLICA_VEREDITO[v]}</span>
                </div>
              ))}
            </div>
          </Sec>

          <Sec titulo="2. Selos ao lado do veredito (não mudam o veredito)">
            <div className="flex flex-col gap-1.5">
              {ORDEM_SELOS.map((s) => (
                <div key={s} className="flex flex-wrap items-start gap-2">
                  <SeloExtra s={s} />
                  <span className="min-w-0 flex-1">{EXPLICA_SELO[s]}</span>
                </div>
              ))}
            </div>
            <p>
              Cansaço e atenção comparam a 1ª com a 2ª metade do período; cada metade precisa de {int(MIN_IMPRESSOES_METADE)}+ aparições. Criativo
              cansando: queda de {Math.round((1 - QUEDA_CTR) * 100)}% ou mais. Atenção caindo: queda de {Math.round((1 - QUEDA_ATENCAO) * 100)}% ou
              mais com custo entre 1x e {num(CORTAR)}x a típica.
            </p>
          </Sec>

          <Sec titulo="3. Réguas usadas neste período (as mesmas dos vereditos)">
            <Tabela
              cab={["Objetivo", "Na Meta", "Campanhas com volume", "Campanha típica", "Atenção típica", "Julga por"]}
              linhas={[
                ...d.grupos.map((g) => [
                  GRUPOS[g.grupo].nome,
                  <span key="b" className="font-mono text-[11px]">
                    {g.objetivosBrutos.join(", ")}
                  </span>,
                  int(g.campanhasComVolume),
                  g.medianaCusto != null ? unidade(g.grupo, g.medianaCusto) : "—",
                  porCem(g.ctrReferencia),
                  g.medianaCusto != null ? "mesmo objetivo" : "conta toda (conversa)",
                ]),
                [
                  <b key="c">Conta toda (régua original)</b>,
                  "todos",
                  `${int(r.campanhas)} com conversa e ${int(MIN_IMPRESSOES)}+ aparições`,
                  r.custoPorConversa != null ? `${fmtBRL(r.custoPorConversa)} por conversa` : "—",
                  porCem(r.ctrLink),
                  "campanhas com o selo “Comparada com a conta”",
                ],
              ]}
            />
            <p>
              <b>Régua da tela original:</b> o painel antigo mostrava "Régua: mediana da conta, {r.custoPorConversaTelaAntiga != null ? fmtBRL(r.custoPorConversaTelaAntiga) : "—"}{" "}
              por conversa", calculada na tela como a mediana "de cima" de <b>todas</b> as campanhas com conversa, sem filtro de volume. O veredito
              antigo, no banco, usava só as campanhas com {int(MIN_IMPRESSOES)}+ aparições ({r.custoPorConversa != null ? fmtBRL(r.custoPorConversa) : "—"}). Os dois
              números podiam discordar; aqui a régua mostrada é sempre a usada no veredito.
            </p>
          </Sec>

          <Sec titulo="4. Regra original × regra atual">
            <p>
              <b>Original</b> (diagnóstico de 08/09/2026): toda campanha julgada pelo custo por <b>conversa</b> contra a mediana da conta inteira;
              atenção medida com todos os cliques (inclui curtida e clique na foto). <b>Atual</b>: mesmos seis vereditos e mesmos limites, mas cada
              campanha é comparada com as do <b>mesmo objetivo</b>, no resultado desse objetivo; atenção medida só com clique no link.
            </p>
            <p>
              <b>Por quê:</b> campanha de tráfego, alcance ou engajamento não é feita para abrir conversa. Pela regra original ela saía "Sem
              tração" ou "Atrai mas não converte" por definição e era somada ao desperdício, mesmo entregando os cliques ou as aparições que
              prometia (e tráfego é a maior parte da verba da maioria dos clientes). Quando o objetivo tem poucas campanhas, não há com quem
              comparar dentro dele, e a regra original volta a valer, com aviso.
            </p>
            <p>
              Neste período: <b>atual</b> {contar((c) => c.vereditoOficial) || "—"}. <b>Pela regra original</b> {contar((c) => c.vereditoContaToda) || "—"}.{" "}
              {mudou.length} de {d.campanhas.length} campanhas mudam de veredito.
            </p>
            {mudou.length > 0 && (
              <Tabela
                cab={["Campanha", "Objetivo", "Investido", "Regra original", "Atual"]}
                linhas={mudou.map((c) => [
                  <span key="n" className="block max-w-[220px] truncate" title={c.campanha}>
                    {c.campanha}
                  </span>,
                  GRUPOS[c.grupo].curto,
                  fmtBRL(c.gasto),
                  <SeloVeredito key="a" v={c.vereditoContaToda} />,
                  <SeloVeredito key="b" v={c.vereditoOficial} />,
                ])}
              />
            )}
          </Sec>

          <Sec titulo="5. Por objetivo da Meta (nome bruto, como no painel original)">
            <Tabela
              cab={["Objetivo na Meta", "Investido", "% da verba", "Campanhas", "Conversas", "Custo por conversa"]}
              linhas={brutos.map(([o, a]) => [
                <span key="o" className="font-mono text-[11px]">
                  {o}
                </span>,
                fmtBRL(a.gasto),
                `${d.gasto > 0 ? Math.round((a.gasto / d.gasto) * 100) : 0}%`,
                int(a.campanhas),
                int(a.conversas),
                a.conversas > 0 ? fmtBRL(a.gasto / a.conversas) : "—",
              ])}
            />
            <p>
              O objetivo escolhido ao subir a campanha muda o custo por conversa mais do que qualquer outro ajuste. Agrupamento em objetivos:
              OUTCOME_ENGAGEMENT com 3+ conversas conta como mensagem (no modelo novo da Meta, campanha de WhatsApp pode subir como engajamento);
              LINK_CLICKS/OUTCOME_TRAFFIC com {TRAFEGO_WHATS_MIN_CONVERSAS}+ conversas e {Math.round(TRAFEGO_WHATS_CONVERSAS_POR_CLIQUE * 100)}+ conversas a
              cada 100 cliques é tráfego para o WhatsApp e conta como mensagem. Em cadastro, o resultado é o maior entre leads e conversas (sem somar).
            </p>
          </Sec>

          <Sec titulo="6. Números do topo">
            <p>
              <b>Investido</b> = soma do gasto. <b>Conversas iniciadas</b> = soma das conversas de todas as campanhas. <b>Custo por conversa</b> = gasto
              das campanhas de mensagem ÷ conversas delas. Pela conta original (toda a verba ÷ todas as conversas) daria{" "}
              {custoContaAntigo != null ? fmtBRL(custoContaAntigo) : "—"}, número inflado pela verba de outros objetivos. <b>Aparições</b> = soma das
              impressões; custo a cada mil = gasto ÷ aparições × 1000. <b>Cliques no link</b> = soma; custo por clique = gasto ÷ cliques no link (a
              tela original dividia por todos os cliques, sob o rótulo "cliques no link"). <b>Cliques a cada 100 aparições</b> = cliques no link ÷
              aparições × 100 (a original usava todos os cliques; esse dado não é lido aqui).
            </p>
            <p>
              Taxa de cliques da campanha: sempre mostrada; abaixo de {int(MIN_IMPRESSOES_TAXA)} aparições vem marcada como amostra pequena e a confiança
              do veredito fica baixa.
            </p>
          </Sec>

          <Sec titulo="7. Alertas de verba">
            <p>
              <b>Alerta desta tela</b>: gasto das campanhas marcadas "Atrai mas não converte" ou "Sem tração" ({fmtBRL(d.desperdicioSemResultado)}), em R$ e em %
              da verba, como no diagnóstico original, agora com os vereditos por objetivo. <b>"Verba que não entregou" (Resumo, Leitura e relatório)</b>:
              marcadas "Cortar" mais as sem resultado do objetivo ({fmtBRL(d.desperdicio)}); não conta campanha de resultado não medido nem campanha
              comparada com a conta que entregou o resultado do próprio objetivo.
            </p>
          </Sec>

          <Sec titulo="8. Confiança, risco e plano de ação">
            <p>
              <b>Confiança</b>: baixa abaixo do volume mínimo de resultados ({Object.entries(MIN_RESULTADOS)
                .filter(([g]) => g !== "outro")
                .map(([g, v]) => `${GRUPOS[g as keyof typeof GRUPOS].curto} ${v}`)
                .join(", ")}
              ), com menos de {int(MIN_IMPRESSOES_TAXA)} aparições, com volume insuficiente ou resultado não medido; alta com 3x o mínimo, mas fica em
              média se a régua tem menos de 5 campanhas ou é a da conta.
            </p>
            <p>
              <b>Risco de mexer</b>: alto se é a campanha que mais traz conversas (10+ e 20%+ delas) ou se concentra 25%+ da verba; baixo abaixo de 8%
              da verba; médio no resto.
            </p>
            <p>
              <b>"Se eu tivesse que agir hoje"</b>: até 3 ações. (A) Entre objetivos, quando a conversa de um objetivo com 15%+ da verba custa 1,5x ou
              mais que a do objetivo mais barato (com 10+ conversas). (B) Marcadas "Cortar" (sem "Revisar público") e "Sem tração": pausar, ou
              reduzir {Math.round(PASSO_ORCAMENTO * 100)}% se o risco é alto, passando a verba para a melhor "Escalar" (senão "Manter") do mesmo objetivo
              — ou da conta, pela conversa, se foi comparada com a conta. (C) "Escalar" sem criativo cansando: +{Math.round(PASSO_ORCAMENTO * 100)}%.
              (D) "Atrai mas não converte", "Revisar público", "Criativo cansando" ou "Atenção caindo" com 8%+ da verba. Mudanças sempre de 20% por
              vez, porque mais que isso reinicia o aprendizado da Meta.
            </p>
          </Sec>

          <Sec titulo="9. Fontes de dados">
            <p>
              Tabelas <code>meta_ads_daily</code> (gasto, aparições, cliques no link, conversas, leads e visitas à página por dia e campanha) e{" "}
              <code>meta_ads_campaigns</code> (nome, objetivo, link e miniatura), lidas direto e somadas por campanha no período. O gráfico diário vem
              da função <code>ads_por_dia</code>. O sync com a Meta roda todo dia. A "1ª metade" do período vai até a véspera do dia do meio; a 2ª,
              do dia do meio até o fim.
            </p>
            <p>
              <b>Alcance não é somado de propósito</b>: somar o alcance de cada dia conta a mesma pessoa várias vezes e o número viraria uma versão
              inflada das aparições. Pelo mesmo motivo a frequência média do dia não vira frequência do período.
            </p>
          </Sec>
        </div>
      )}
    </section>
  );
}
