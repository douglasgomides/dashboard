// Selos do diagnóstico de anúncios: o veredito oficial (os seis do diagnóstico
// original, com as mesmas cores e ícones) e os selos extras ao lado dele.
import { Rocket, Scissors, TrendingDown, PauseCircle, CheckCircle2, HelpCircle, Flame, Activity, Users, EyeOff, Scale, type LucideIcon } from "lucide-react";
import { Selo } from "@/components/visual";
import { EXPLICA_SELO, EXPLICA_VEREDITO, type SeloCampanha, type Veredito } from "@/lib/anuncios-objetivo";

export const COR_VEREDITO: Record<Veredito, string> = {
  Escalar: "var(--good)",
  Cortar: "var(--crit)",
  "Atrai mas não converte": "var(--warn)",
  "Sem tração": "var(--warn)",
  Manter: "var(--text-dim)",
  "Volume insuficiente": "var(--muted)",
};

export const ICONE_VEREDITO: Record<Veredito, LucideIcon> = {
  Escalar: Rocket,
  Cortar: Scissors,
  "Atrai mas não converte": TrendingDown,
  "Sem tração": PauseCircle,
  Manter: CheckCircle2,
  "Volume insuficiente": HelpCircle,
};

export function SeloVeredito({ v }: { v: Veredito }) {
  const Icon = ICONE_VEREDITO[v];
  return (
    <Selo cor={COR_VEREDITO[v]} titulo={EXPLICA_VEREDITO[v]}>
      <Icon size={12} aria-hidden />
      {v}
    </Selo>
  );
}

export const COR_SELO: Record<SeloCampanha, string> = {
  "Criativo cansando": "var(--warn)",
  "Atenção caindo": "var(--warn)",
  "Revisar público": "var(--warn)",
  "Resultado não medido": "var(--muted)",
  "Comparada com a conta": "var(--s7)",
};
const ICONE_SELO: Record<SeloCampanha, LucideIcon> = {
  "Criativo cansando": Flame,
  "Atenção caindo": Activity,
  "Revisar público": Users,
  "Resultado não medido": EyeOff,
  "Comparada com a conta": Scale,
};

/** Selo extra: não é veredito, é um sinal ao lado dele (contorno tracejado para não confundir). */
export function SeloExtra({ s }: { s: SeloCampanha }) {
  const Icon = ICONE_SELO[s];
  const cor = COR_SELO[s];
  return (
    <span
      title={EXPLICA_SELO[s]}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium"
      style={{ borderColor: cor === "var(--muted)" ? "var(--border)" : cor, color: cor === "var(--muted)" ? "var(--text-dim)" : cor }}
    >
      <Icon size={11} aria-hidden />
      {s}
    </span>
  );
}
