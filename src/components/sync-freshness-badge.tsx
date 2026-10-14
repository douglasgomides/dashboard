import { useQuery } from "@tanstack/react-query";
import { statusDoCliente, tomDaFonte, ddmm, diasDeAtraso, type LinhaFonte } from "@/lib/saude-fontes";
import { supabase } from "@/integrations/supabase/client";
import { motivoDaLinha, ROTULO_DONO } from "@/lib/motivos";

// Selo de frescura: "Dados: Instagram até 30/09 · Anúncios até 30/09 · CRM até
// 01/10". A data vem do DADO (RPC client_sync_status, ou a leitura direta das tabelas
// quando a migração ainda não existe), não da última tentativa: tentativa não prova dado novo.
// Cor por fonte: verde <= 1 dia de atraso, amarelo 2-3, vermelho > 3 ou com erro na última tentativa.

const ROTULOS: Record<string, string> = {
  instagram: "Instagram",
  anuncios: "Anúncios",
  crm: "CRM",
  atendimento: "WhatsApp",
};
// Comentários não têm data de dado; só entram se a última tentativa deu erro.
const ORDEM = ["instagram", "anuncios", "crm", "atendimento", "comentarios"];

const COR: Record<string, string> = {
  bom: "var(--good)",
  atencao: "var(--warn, #b7791f)",
  ruim: "var(--danger)",
  neutro: "var(--text-dim)",
};

function tituloDaFonte(l: LinhaFonte): string | undefined {
  const m = motivoDaLinha(l);
  if (!m) return l.last_error ?? undefined;
  return `${ROTULO_DONO[m.dono]}: ${m.texto}`;
}

const PESO: Record<string, number> = { ruim: 3, atencao: 2, neutro: 1, bom: 0 };
const FRASE_TOM: Record<string, string> = { bom: "Dados em dia", atencao: "Dados com atraso", ruim: "Dados parados", neutro: "Dados" };

// compacto: para o cabeçalho do celular. Um ponto com a cor da PIOR fonte e uma
// frase curta; o detalhe por fonte aparece na folha do período.
export function SyncFreshnessBadge({ clientId, compacto = false }: { clientId: string; compacto?: boolean }) {
  const { data } = useQuery({
    queryKey: ["client-sync-status", clientId],
    queryFn: () => statusDoCliente(clientId),
    staleTime: 60_000,
    retry: false,
  });

  const linhas = ORDEM.map((f) => (data ?? []).find((l) => l.fonte === f)).filter(
    (l): l is LinhaFonte => !!l && (!!l.data_ate || (l.fonte === "comentarios" && !!l.last_error)),
  );
  if (linhas.length === 0) return null;

  if (compacto) {
    const pior = linhas.reduce((a, l) => (PESO[tomDaFonte(l)] > PESO[a] ? tomDaFonte(l) : a), "bom" as string);
    const resumo = linhas.map((l) => `${ROTULOS[l.fonte] ?? "Comentários"}${l.data_ate ? ` até ${ddmm(l.data_ate)}` : " (erro)"}`).join(" · ");
    return (
      <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap" style={{ color: "var(--text-dim)" }} title={resumo}>
        <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: COR[pior] }} />
        {FRASE_TOM[pior]}
        <span className="sr-only">: {resumo}</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
      style={{ color: "var(--text-dim)" }}
      title="Até que data cada fonte tem dado, lido do próprio banco. Vermelho: mais de 3 dias parado ou erro na última tentativa."
    >
      <span>Dados:</span>
      {linhas.map((l, i) => (
        <span key={l.fonte} style={{ color: COR[tomDaFonte(l)], fontWeight: 600 }} title={tituloDaFonte(l)}>
          {i > 0 && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>· </span>}
          {ROTULOS[l.fonte] ?? "Comentários"}
          {/* Fonte alimentada à mão (planilha): a data de análise não é "atualizado até", então não aparece. */}
          {l.motivo_dono === "manual" ? " (planilha)" : l.data_ate ? ` até ${ddmm(l.data_ate)}` : ""}
          {tomDaFonte(l) === "ruim" ? (motivoDaLinha(l)?.dono === "nos" || !motivoDaLinha(l) ? " (erro)" : " (ver motivo)") : ""}
        </span>
      ))}
    </span>
  );
}

// Linha 2 do cabeçalho do cliente: disponibilidade de cada fonte, com data exata
// do último DADO (não da última sincronização) e uma frase que diz o que isso
// significa. Fonte não conectada aparece como tal, em vez de sumir.

type Disp = { fonte: string; rotulo: string; tom: "bom" | "atencao" | "ruim" | "neutro"; texto: string; detalhe: string };

function descrever(rotulo: string, l: LinhaFonte | undefined, conectada: boolean | undefined): Disp {
  const fonte = l?.fonte ?? rotulo;
  if (conectada === false) return { fonte, rotulo, tom: "neutro", texto: "não conectado", detalhe: `${rotulo} não está conectado a este cliente.` };
  if (!l || !l.data_ate) {
    if (l?.last_error) return { fonte, rotulo, tom: "ruim", texto: "erro", detalhe: tituloDaFonte(l) ?? "A última tentativa de buscar dados falhou." };
    return { fonte, rotulo, tom: "neutro", texto: "sem dado", detalhe: `Nenhum dado de ${rotulo} encontrado ainda.` };
  }
  const atraso = diasDeAtraso(l.data_ate);
  const tom = tomDaFonte(l);
  const m = motivoDaLinha(l);
  const texto = tom === "bom" ? `até ${ddmm(l.data_ate)}` : `até ${ddmm(l.data_ate)} · ${atraso} dias sem dado novo`;
  const detalhe = [
    `Último dado disponível: ${l.data_ate.split("-").reverse().join("/")}.`,
    tom === "bom" ? "Em dia (a Meta fecha os números de ontem e hoje ao longo do dia)." : null,
    m ? `${ROTULO_DONO[m.dono]}: ${m.texto}` : l.last_error ? `Erro na última tentativa: ${l.last_error}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { fonte, rotulo, tom, texto, detalhe };
}

export function DisponibilidadeFontes({ clientId, fontes }: { clientId: string; fontes: { tem_instagram: boolean; tem_anuncios: boolean; tem_crm: boolean; tem_atendimento: boolean } | null | undefined }) {
  const { data } = useQuery({ queryKey: ["client-sync-status", clientId], queryFn: () => statusDoCliente(clientId), staleTime: 60_000, retry: false });
  const { data: ultimoComentario } = useQuery({
    queryKey: ["ultimo-comentario", clientId],
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data: d } = await (supabase as any).from("instagram_comments").select("commented_at").eq("client_id", clientId).order("commented_at", { ascending: false }).limit(1);
      return (d?.[0]?.commented_at as string | undefined)?.slice(0, 10) ?? null;
    },
  });
  const linha = (f: string) => (data ?? []).find((l) => l.fonte === f);
  const com = linha("comentarios");
  const itens: Disp[] = [
    descrever("Instagram", linha("instagram"), fontes?.tem_instagram),
    descrever("Anúncios", linha("anuncios"), fontes?.tem_anuncios),
    descrever("CRM", linha("crm"), fontes?.tem_crm),
    descrever("WhatsApp", linha("atendimento"), fontes?.tem_atendimento),
    descrever("Comentários", com?.last_error ? com : ultimoComentario ? { ...(com ?? { fonte: "comentarios", last_attempt_at: null, last_success_at: null, last_error: null, last_rows: null }), data_ate: ultimoComentario } as LinhaFonte : undefined, fontes?.tem_instagram),
  ];
  return (
    <ul className="fontes-linha" aria-label="Disponibilidade dos dados por fonte">
      {itens.map((d) => (
        <li key={d.rotulo} title={d.detalhe} data-tom={d.tom}>
          <span aria-hidden className="fontes-ponto" style={{ background: COR[d.tom] }} />
          <b>{d.rotulo}</b> <span>{d.texto}</span>
          <span className="sr-only">. {d.detalhe}</span>
        </li>
      ))}
    </ul>
  );
}
