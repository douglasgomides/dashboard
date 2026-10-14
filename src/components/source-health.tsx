import { tomDaFonte, ddmm, type LinhaFonte } from "@/lib/saude-fontes";
import { motivoDaLinha, ROTULO_DONO, type Dono } from "@/lib/motivos";

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
  cor: string;
  data: string | null; // dd/mm do último dado
  causa: string | null;
  proxima: string | null;
  peso: number; // para ordenar: problema primeiro
}

export function saudeDaFonte(ligado: boolean, l: LinhaFonte | undefined): SaudeFonte {
  if (!ligado) return { estado: "nao_conectada", rotulo: ROTULO_ESTADO.nao_conectada, cor: COR.nao_conectada, data: null, causa: null, proxima: "Conectar em Gerenciar, se o cliente usar esta fonte.", peso: 0 };
  const tom = tomDaFonte(l);
  const m = motivoDaLinha(l);
  const data = l?.data_ate ? ddmm(l.data_ate) : null;
  if (!l || (!l.data_ate && !l.last_error)) return { estado: "sem_dado", rotulo: ROTULO_ESTADO.sem_dado, cor: COR.sem_dado, data: null, causa: "A fonte está ligada, mas nenhum dado chegou ainda.", proxima: PROXIMA.nos, peso: 3 };
  if (tom === "bom" && !l.last_error) return { estado: "atualizada", rotulo: ROTULO_ESTADO.atualizada, cor: COR.atualizada, data, causa: null, proxima: null, peso: 1 };
  if (m) {
    const estado: Estado = m.dono === "nos" ? "erro" : m.dono === "manual" ? "origem" : m.dono;
    return { estado, rotulo: ROTULO_ESTADO[estado], cor: COR[estado], data, causa: m.texto, proxima: PROXIMA[m.dono], peso: estado === "erro" ? 5 : estado === "cliente" ? 4 : 2 };
  }
  // Atrasada (2 a 3 dias) sem causa identificada ainda.
  return { estado: "origem", rotulo: tom === "atencao" ? "Atrasada (2 a 3 dias)" : ROTULO_ESTADO.origem, cor: tom === "atencao" ? "var(--warn)" : COR.origem, data, causa: "Sem causa identificada ainda.", proxima: "Aguardar a próxima atualização; se passar de 3 dias, a causa aparece aqui.", peso: 2 };
}

/** Célula de uma fonte: estado em cima, data, causa e próxima ação em texto curto.
 *  Fonte não conectada aparece em vermelho com "Conectar agora" (quando há link para o cadastro). */
export function CelulaSaude({ s, conectar, opcional }: { s: SaudeFonte; conectar?: React.ReactNode; opcional?: string }) {
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
      <div className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--ink)" }}>
        <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: s.cor }} />
        {s.rotulo}
      </div>
      {s.data && <div style={{ color: "var(--ink-2)" }}>Último dado: {s.data}</div>}
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
