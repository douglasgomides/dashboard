import { type LinhaFonte } from "@/lib/saude-fontes";
import { motivoDaLinha, statusDaLinha, ROTULO_DONO, type Dono } from "@/lib/motivos";
import { VAR_COR, type CorStatus, type StatusFonte } from "@/lib/status-fonte";
import { AlertOctagon, CheckCircle2, Clock, MinusCircle } from "lucide-react";

// Saúde de uma fonte em quatro respostas: estado, data do último dado,
// causa identificada e próxima ação possível. As regras de estado e de causa
// são as mesmas de antes (tomDaFonte e motivoDaLinha); aqui só se organiza.

export type Estado = "atualizada" | "cliente" | "origem" | "meta" | "erro" | "nao_conectada" | "sem_dado";

export const ROTULO_ESTADO: Record<Estado, string> = {
  atualizada: "Fonte atualizada",
  cliente: ROTULO_DONO.cliente,
  origem: ROTULO_DONO.origem,
  meta: ROTULO_DONO.meta,
  erro: "Erro",
  nao_conectada: "Fonte não conectada",
  sem_dado: "Sem dado ainda",
};

const COR: Record<Estado, string> = {
  atualizada: "var(--good)",
  cliente: "var(--warn)",
  origem: "var(--muted)",
  meta: "var(--s1)",
  erro: "var(--crit)",
  nao_conectada: "var(--muted)",
  sem_dado: "var(--muted)",
};

const PROXIMA: Record<Exclude<Dono, never>, string> = {
  cliente: "Avisar o cliente: a ação é dele (acesso, pagamento ou campanha). Reenviar o pedido de autorização se for acesso.",
  origem: "Confirmar com o cliente se pausou a campanha ou se o CRM é lançado à mão. Sem ação técnica.",
  meta: "Aguardar a próxima atualização automática. Se passar de 2 dias, abrir chamado na Meta.",
  nos: "Equipe Doctor Creator: rodar a sincronização desta fonte e olhar o erro.",
  manual: "Fonte lançada à mão (planilha): atualizar a planilha ou liberar o acesso à origem.",
};

export interface SaudeFonte {
  estado: Estado;
  rotulo: string;
  cor: string; // variável CSS da cor do status (regra única de status-fonte.ts)
  status: StatusFonte;
  data: string | null; // dd/mm do último dado
  causa: string | null;
  proxima: string | null;
  peso: number; // para ordenar: problema primeiro
}

/** Saúde de uma fonte. A COR vem só de statusDaLinha (dias sem dado / erro); o motivo e o dono viram texto. */
export function saudeDaFonte(cadastro: boolean, l: LinhaFonte | undefined, naoUsa = false): SaudeFonte {
  const st = statusDaLinha(l, cadastro, naoUsa);
  const cor = VAR_COR[st.cor];
  if (!st.ligado) return { estado: "nao_conectada", rotulo: st.rotulo, cor, status: st, data: null, causa: null, proxima: st.naoUsa ? null : "Conectar em Gerenciar, se o cliente usar esta fonte.", peso: 0 };
  const m = motivoDaLinha(l);
  const peso = st.peso * 2 + (m?.dono === "nos" ? 1 : 0);
  if (st.dias == null) return { estado: l?.last_error ? "erro" : "sem_dado", rotulo: st.rotulo, cor, status: st, data: null, causa: m?.texto ?? "A fonte está ligada, mas nenhum dado chegou ainda.", proxima: PROXIMA[m?.dono ?? "nos"], peso };
  if (st.cor === "verde") return { estado: "atualizada", rotulo: st.rotulo, cor, status: st, data: st.data, causa: null, proxima: null, peso };
  const estado: Estado = st.rotulo === "Erro" ? "erro" : m ? (m.dono === "nos" ? "erro" : m.dono === "manual" ? "origem" : (m.dono as Estado)) : "origem";
  return {
    estado,
    rotulo: st.rotulo,
    cor,
    status: st,
    data: st.data,
    causa: m?.texto ?? (st.cor === "amarelo" ? "Sem causa identificada ainda." : "Sem dado novo e sem causa registrada."),
    proxima: m ? PROXIMA[m.dono] ?? PROXIMA.origem : st.cor === "amarelo" ? "Aguardar a próxima atualização; se passar de 3 dias, vira vermelho." : PROXIMA.nos,
    peso,
  };
}

const ICONE: Record<CorStatus, typeof CheckCircle2> = { verde: CheckCircle2, amarelo: Clock, vermelho: AlertOctagon, cinza: MinusCircle };

/** Ícone + cor do status: toda data aparece com um dos dois juntos. */
export function SeloStatus({ st, texto }: { st: StatusFonte; texto?: string }) {
  const I = ICONE[st.cor];
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: VAR_COR[st.cor] }}>
      <I size={14} aria-hidden className="shrink-0" />
      {texto ?? st.rotulo}
    </span>
  );
}

/** Célula de uma fonte: estado em cima, data, causa e próxima ação em texto curto.
 *  Fonte não conectada aparece em vermelho com "Conectar agora" (quando há link para o cadastro). */
export function CelulaSaude({ s, conectar, opcional }: { s: SaudeFonte; conectar?: React.ReactNode; opcional?: string }) {
  if (s.estado === "nao_conectada" && s.status.naoUsa) {
    return (
      <div className="min-w-[150px] text-[13px] leading-snug" style={{ color: "var(--muted)" }}>
        <SeloStatus st={s.status} />
        <div className="text-xs">Marcado como intencional</div>
      </div>
    );
  }
  if (s.estado === "nao_conectada" && opcional) {
    return (
      <div className="min-w-[150px] text-[13px] leading-snug" style={{ color: "var(--muted)" }}>
        <div className="font-semibold">Não usa (opcional)</div>
        <div className="text-xs">{opcional}</div>
      </div>
    );
  }
  if (s.estado === "nao_conectada") {
    return (
      <div className="min-w-[150px] space-y-1.5 text-[13px] leading-snug">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide" style={{ background: "color-mix(in srgb, var(--crit) 16%, transparent)", color: "var(--crit)" }}>
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--crit)" }} /> Não conectado
        </span>
        {conectar}
      </div>
    );
  }
  return (
    <div className="min-w-[150px] space-y-0.5 text-[13px] leading-snug">
      <SeloStatus st={s.status} />
      {s.data && (
        <div className="font-medium" style={{ color: s.cor }}>
          {s.status.detalhe}
        </div>
      )}
      {s.causa && (
        <div className="line-clamp-2" style={{ color: "var(--ink-2)" }} title={s.causa}>
          {s.causa}
        </div>
      )}
      {s.proxima && (
        <div className="line-clamp-2" style={{ color: "var(--muted)" }} title={s.proxima}>
          → {s.proxima}
        </div>
      )}
    </div>
  );
}
