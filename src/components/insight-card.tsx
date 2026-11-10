import { Link, useLocation } from "@tanstack/react-router";
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, Gauge, Info } from "lucide-react";
import { NxCard, NxTag, type NxTom } from "@/components/nx/base";
import { NxAviso, NxRecolhido } from "@/components/nx/blocos";
import {
  ROTULO_CONFIANCA,
  ROTULO_IMPACTO,
  ROTULO_RESPONSAVEL,
  ROTULO_TOM,
  type Insight,
  type Limitacao,
  type Tom,
} from "@/lib/insight";

// Peças compartilhadas da "inteligência acionável". Todas as telas usam estas,
// para o usuário aprender a ler um card uma vez só.

export const COR_TOM: Record<
  Tom,
  { cor: string; fundo: string; borda: string }
> = {
  bom: {
    cor: "var(--good-text)",
    fundo: "var(--good-bg)",
    borda: "var(--good-border)",
  },
  atencao: {
    cor: "var(--text)",
    fundo: "var(--warn-bg)",
    borda: "var(--warn-border)",
  },
  ruim: {
    cor: "var(--crit)",
    fundo: "var(--danger-bg)",
    borda: "var(--danger-border)",
  },
};
const ICONE_TOM = { bom: CheckCircle2, atencao: AlertTriangle, ruim: XCircle };

const TOM_NX: Record<Tom, NxTom> = { bom: "up", atencao: "or", ruim: "dn" };

export function SeloStatus({ tom, texto }: { tom: Tom; texto?: string }) {
  const Icon = ICONE_TOM[tom];
  return (
    <NxTag tom={TOM_NX[tom]} icone={<Icon size={12} aria-hidden />}>
      {texto ?? ROTULO_TOM[tom]}
    </NxTag>
  );
}

// Botão de ação: link interno quando há rota, alvo de toque de 44px.
export function BotaoAcao({
  texto,
  rota,
  clientId,
  variante = "primario",
}: {
  texto: string;
  rota?: string;
  clientId?: string;
  variante?: "primario" | "secundario";
}) {
  const local = useLocation();
  const periodo = Object.fromEntries(Object.entries(local.search).filter(([k]) => ["preset", "from", "to"].includes(k)));
  if (!rota) return null;
  return (
    <Link
      search={periodo as any}
      to={rota as any}
      params={clientId ? ({ clientId } as any) : undefined}
      className="nx-botao"
      style={variante === "primario" ? { background: "var(--b1)", borderColor: "var(--b1)", color: "var(--white)" } : undefined}
    >
      {texto} <ArrowRight size={15} aria-hidden />
    </Link>
  );
}

const LINHA = { margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--text-2)" } as const;
const APOIO = { margin: 0, fontSize: 13, lineHeight: "19px", color: "var(--muted-ink)" } as const;

/** Card de um insight: título, evidência e quem resolve sempre visíveis; regra, risco, fonte e etapas recolhidos. */
export function InsightCard({
  insight: i,
  clientId,
  aberto = false,
  compacto = false,
}: {
  insight: Insight;
  clientId?: string;
  aberto?: boolean;
  compacto?: boolean;
}) {
  const temDetalhe = !!(i.motivoConfianca || i.risco || i.regra || i.fonte || i.etapas?.length || (compacto && i.diagnostico));
  return (
    <div data-peca="insight" style={{ minWidth: 0 }}>
      <NxCard
        titulo={i.titulo}
        acao={
          <>
            <SeloStatus tom={i.tom} />
            <NxTag tom="b" icone={<Gauge size={12} aria-hidden />}>
              {ROTULO_CONFIANCA[i.confianca]}
            </NxTag>
            <NxTag tom="g">{ROTULO_IMPACTO[i.impacto]}</NxTag>
          </>
        }
      >
        {!compacto && <p style={LINHA}>{i.diagnostico}</p>}
        <div style={{ ...LINHA, background: "var(--field)", borderRadius: 12, padding: "10px 12px" }}>
          <b style={{ color: "var(--text)" }}>Evidência: </b>
          <span className="tabular-nums">{i.evidencia}</span>
        </div>
        <p style={APOIO}>
          Quem resolve: <b>{ROTULO_RESPONSAVEL[i.responsavel]}</b>
        </p>
        {i.acao && (
          <div style={{ display: "grid", gap: 6 }}>
            <p style={{ ...LINHA, color: "var(--text)", fontWeight: 600 }}>
              <span style={{ ...APOIO, display: "block", textTransform: "uppercase", letterSpacing: ".04em" }}>O que fazer</span>
              {i.acao.texto}
            </p>
            {i.impactoTexto && <p style={APOIO}>Resultado esperado: {i.impactoTexto}</p>}
            {i.acao.rota && (
              <div>
                <BotaoAcao texto={i.acao.botao ?? "Abrir"} rota={i.acao.rota} clientId={clientId} variante="secundario" />
              </div>
            )}
          </div>
        )}
        {temDetalhe && (
          <NxRecolhido titulo="Regra, limitações e fonte" aberto={aberto}>
            <dl style={{ ...LINHA, display: "grid", gap: 8, margin: 0 }}>
              {compacto && (
                <div>
                  <dt><b>Por que aconteceu</b></dt>
                  <dd style={{ margin: 0 }}>{i.diagnostico}</dd>
                </div>
              )}
              {i.motivoConfianca && (
                <div>
                  <dt><b>Por que essa confiança</b></dt>
                  <dd style={{ margin: 0 }}>{i.motivoConfianca}</dd>
                </div>
              )}
              {i.risco && (
                <div>
                  <dt><b>Limitação</b></dt>
                  <dd style={{ margin: 0 }}>{i.risco}</dd>
                </div>
              )}
              {i.regra && (
                <div>
                  <dt><b>Regra</b></dt>
                  <dd style={{ margin: 0 }}>{i.regra}</dd>
                </div>
              )}
              {i.fonte && (
                <div>
                  <dt><b>Fonte</b></dt>
                  <dd style={{ margin: 0 }}>{i.fonte}</dd>
                </div>
              )}
              {!!i.etapas?.length && (
                <div>
                  <dt><b>Etapas</b></dt>
                  <dd style={{ margin: 0 }}>
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                      {i.etapas.map((e, k) => (
                        <li key={k}>{e}</li>
                      ))}
                    </ol>
                  </dd>
                </div>
              )}
            </dl>
          </NxRecolhido>
        )}
      </NxCard>
    </div>
  );
}

/** Lista "dados incompletos": sempre no fim da tela, nunca escondida. */
export function ListaLimitacoes({
  itens,
  titulo = "O que o painel ainda não consegue dizer",
}: {
  itens: Limitacao[];
  titulo?: string;
}) {
  if (itens.length === 0) return null;
  return (
    <NxCard rotulo={titulo} titulo={titulo}>
      <ul className="nx-lista">
        {itens.map((l) => (
          <li key={l.id}>
            <NxAviso tom="atencao" titulo={l.texto}>
              {`Quem resolve: ${ROTULO_RESPONSAVEL[l.resolve]}${l.comoResolver ? ` · ${l.comoResolver}` : ""}`}
            </NxAviso>
          </li>
        ))}
      </ul>
    </NxCard>
  );
}

/** Explicação de uma métrica em linguagem simples, abre no toque. */
export function OQueE({ children }: { children: React.ReactNode }) {
  return (
    <details style={{ fontSize: 13, color: "var(--muted-ink)" }}>
      <summary style={{ display: "inline-flex", minHeight: 44, cursor: "pointer", listStyle: "none", alignItems: "center", gap: 4, color: "var(--muted-ink)" }}>
        <Info size={12} aria-hidden /> O que é isso?
      </summary>
      <p style={{ margin: "4px 0 0", lineHeight: "19px" }}>{children}</p>
    </details>
  );
}
