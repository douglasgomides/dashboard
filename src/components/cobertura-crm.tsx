// Bloco "Cobertura" de Configurar CRM > Guia (só equipe, D-06): uma barra por medida, "N de M" e quem fecha cada lacuna.
// Enquanto a função crm_cobertura (plano 07) não existe no banco, mostra o aviso de falta de dado e nenhum número.
import { useQuery } from "@tanstack/react-query";
import { NxCard, NxTag, type NxTom } from "@/components/nx";
import { icT } from "@/components/nx/comercial-base";
import { supabase } from "@/integrations/supabase/client";
import { getClientFontes } from "@/lib/client-data";
import { statusDoCliente } from "@/lib/saude-fontes";
import { FONTES, type FonteId } from "@/lib/status-fonte";
import {
  AVISO_SEM_REGRA,
  montarCobertura,
  rpcAusente,
  type DadosCobertura,
  type FonteDaCobertura,
  type LinhaCobertura,
  type Quem,
} from "@/lib/cobertura-crm";

export type LeituraCobertura = { ausente: true } | { ausente: false; dados: DadosCobertura };

/** Uma leitura por abertura da tela; a lista de canais usa a mesma chave para saber se a regra já existe. */
export function useCoberturaCrm(clientId: string, ativo: boolean) {
  return useQuery({
    queryKey: ["crm-cobertura", clientId],
    enabled: ativo,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LeituraCobertura> => {
      const { data, error } = await (supabase as any).rpc("crm_cobertura", { p_client: clientId });
      if (error) {
        if (rpcAusente(error)) return { ausente: true };
        throw new Error(error.message ?? "falha ao ler a cobertura");
      }
      const dados = (Array.isArray(data) ? data[0] : data) as DadosCobertura | null;
      if (!dados) throw new Error("a função não devolveu dado");
      return { ausente: false, dados };
    },
  });
}

const FLAG: Record<FonteId, "tem_crm" | "tem_atendimento" | "tem_instagram" | "tem_anuncios"> = {
  crm: "tem_crm",
  atendimento: "tem_atendimento",
  instagram: "tem_instagram",
  anuncios: "tem_anuncios",
};

function useFontesDaCobertura(clientId: string, ativo: boolean) {
  return useQuery({
    queryKey: ["crm-cobertura-fontes", clientId],
    enabled: ativo,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FonteDaCobertura[]> => {
      const [flags, linhas] = await Promise.all([getClientFontes(clientId), statusDoCliente(clientId)]);
      return FONTES.map((fonte) => {
        const l = linhas.find((x) => x.fonte === fonte);
        return {
          fonte,
          cadastro: !!(flags as Record<string, boolean> | null)?.[FLAG[fonte]],
          data_ate: l?.data_ate ?? null,
          last_error: l?.last_error ?? null,
          last_success_at: l?.last_success_at ?? null,
          motivo: l?.motivo ?? null,
          motivo_dono: l?.motivo_dono ?? null,
        };
      });
    },
  });
}

const TOM_QUEM: Record<Quem, NxTom> = { Cliente: "or", Equipe: "b", "Nós": "dn" };
const COR_ESTADO: Record<LinhaCobertura["estado"], string> = {
  completo: "var(--up)",
  parcial: "var(--b2)",
  falta: "var(--dn)",
  nao_se_aplica: "var(--muted-2)",
};

function Linha({ l, i }: { l: LinhaCobertura; i: number }) {
  return (
    <li className="nx-hb" data-cobertura={l.id} style={{ paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
      <div className="nx-hb__linha">
        <span style={{ fontWeight: 600, color: "var(--text)" }}>
          <i aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: COR_ESTADO[l.estado], flex: "none" }} />
          {l.rotulo}
        </span>
        <em style={{ fontWeight: 700, color: "var(--text)" }}>{l.resumo}</em>
      </div>
      {l.pct != null && (
        <div
          className="nx-trk"
          role="progressbar"
          aria-label={`${l.rotulo}: ${l.resumo}`}
          aria-valuemin={0}
          aria-valuemax={l.m ?? 0}
          aria-valuenow={l.n ?? 0}
        >
          {l.pct > 0 && <i style={{ width: `${Math.max(2, l.pct)}%`, background: l.estado === "completo" ? "var(--up)" : undefined, ["--i" as string]: i }} />}
          <u />
        </div>
      )}
      {l.lacunas.length > 0 && (
        <ul className="grid gap-1.5" aria-label={`Lacunas de ${l.rotulo}`}>
          {l.lacunas.map((x) => (
            <li key={x.texto} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: "var(--text-2)" }}>
              <NxTag tom={TOM_QUEM[x.quem]}>{x.quem}</NxTag>
              <span>{x.texto}</span>
              <span style={{ color: "var(--muted-ink)" }}>→ {x.oQueFazer}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Contagem({ linhas }: { linhas: LinhaCobertura[] }) {
  const todas = linhas.flatMap((l) => l.lacunas);
  const medidas = linhas.filter((l) => l.estado === "completo").length;
  const aplicaveis = linhas.filter((l) => l.estado !== "nao_se_aplica").length;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Lacunas por quem resolve">
      <NxTag tom="up">
        {medidas} de {aplicaveis} completas
      </NxTag>
      {(["Cliente", "Equipe", "Nós"] as const).map((q) => (
        <NxTag key={q} tom={TOM_QUEM[q]}>
          {q} · {todas.filter((x) => x.quem === q).length}
        </NxTag>
      ))}
    </div>
  );
}

export function CoberturaCrm({ clientId }: { clientId: string }) {
  const cob = useCoberturaCrm(clientId, true);
  const fontes = useFontesDaCobertura(clientId, !!cob.data && !cob.data.ausente);
  const corpo = (() => {
    if (cob.isLoading) return <p className="text-sm" style={{ color: "var(--muted-ink)" }}>Lendo a cobertura…</p>;
    if (cob.error) return <p role="alert" className="text-sm" style={{ color: "var(--dn-ink)" }}>Não deu para ler a cobertura: {(cob.error as Error).message}</p>;
    if (!cob.data || cob.data.ausente) return <p className="nx-vazio text-sm" data-cobertura-aguardando>{AVISO_SEM_REGRA}</p>;
    if (fontes.isLoading) return <p className="text-sm" style={{ color: "var(--muted-ink)" }}>Lendo as fontes…</p>;
    // Fontes que não deu para ler não viram "não ligada": a linha some e o erro aparece.
    const linhas = montarCobertura(cob.data.dados, fontes.data ?? []).filter((l) => !!fontes.data || l.id !== "fontes");
    return (
      <div className="grid gap-4">
        <Contagem linhas={linhas} />
        {fontes.error && <p role="alert" className="text-sm" style={{ color: "var(--dn-ink)" }}>Não deu para ler as fontes: {(fontes.error as Error).message}</p>}
        <ul className="grid gap-3.5" aria-label="Cobertura por medida">
          {linhas.map((l, i) => <Linha key={l.id} l={l} i={i} />)}
        </ul>
      </div>
    );
  })();
  return (
    <NxCard id="cobertura" nivel={2} icone={icT("checklist")} titulo="Cobertura" subtitulo="Quanto de cada número está medido e quem fecha cada lacuna">
      {corpo}
    </NxCard>
  );
}
