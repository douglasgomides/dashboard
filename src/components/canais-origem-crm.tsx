// "Canais e funis sem origem" (só equipe, D-02): cada canal do Kommo e funil da Clint com leads sem origem, pelo nome
// real. A sugestão pelo nome só aparece escrita; nada vira origem até uma pessoa escolher e apertar Confirmar.
// Nomes vêm do CRM (texto não confiável): sempre renderizados como texto do React, nunca como HTML.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NxCard, NxTag } from "@/components/nx";
import { icT } from "@/components/nx/comercial-base";
import { supabase } from "@/integrations/supabase/client";
import {
  linhasParaConfirmar,
  payloadConfirmar,
  rpcAusente,
  ORIGENS_PERMITIDAS,
  type CanalParaConfirmar,
  type LinhaParaConfirmar,
} from "@/lib/cobertura-crm";

type LeituraCanais = { ausente: true } | { ausente: false; linhas: LinhaParaConfirmar[] };

function useCanais(clientId: string) {
  return useQuery({
    queryKey: ["crm-canais", clientId],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LeituraCanais> => {
      const { data, error } = await (supabase as any).rpc("crm_canais_para_confirmar", { p_client: clientId });
      if (error) {
        if (rpcAusente(error)) return { ausente: true };
        throw new Error(error.message ?? "falha ao ler os canais");
      }
      return { ausente: false, linhas: linhasParaConfirmar((data ?? []) as CanalParaConfirmar[]) };
    },
  });
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

function LinhaCanal({ r, clientId, maior }: { r: LinhaParaConfirmar; clientId: string; maior: number }) {
  const qc = useQueryClient();
  // Começa vazio de propósito: a sugestão nunca é pré-escolhida.
  const [origem, setOrigem] = useState("");
  const [nome, setNome] = useState("");
  const salvar = useMutation({
    mutationFn: async () => {
      const args = payloadConfirmar(r, origem, nome);
      const { data, error } = await (supabase as any).rpc("crm_definir_canal_origem", args);
      if (error) throw new Error(rpcAusente(error) ? "a regra nova ainda não foi aplicada no banco" : (error.message ?? "falha ao salvar"));
      return Number(data ?? 0);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-cobertura", clientId] });
      qc.invalidateQueries({ queryKey: ["crm-canais", clientId] });
    },
  });
  const pct = maior > 0 ? (r.sem_origem_90d / maior) * 100 : 0;
  const idSelect = `origem-${r.chave}`;
  const idNome = `nome-${r.chave}`;
  return (
    <li className="grid min-w-0 gap-2" data-canal={r.chave} style={{ paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
      <div className="nx-hb__linha" style={{ flexWrap: "wrap" }}>
        <span className="min-w-0" style={{ fontWeight: 600, color: "var(--text)", overflowWrap: "anywhere" }}>{r.rotulo}</span>
        <em style={{ whiteSpace: "normal" }}>
          <b style={{ color: "var(--text)" }}>{fmt(r.sem_origem_90d)}</b> sem origem · {fmt(r.leads_90d)} leads em 90 dias
        </em>
      </div>
      <div className="nx-trk" aria-hidden>
        {pct > 0 && <i style={{ width: `${Math.max(2, pct)}%` }} />}
        <u />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
        <span>Hoje: {r.origem_atual ? `${r.origem_atual}${r.conclusivo === false ? " (não diz a origem)" : ""}` : "sem tradução"}</span>
        {r.sugestaoTexto && <NxTag tom="gl">{r.sugestaoTexto}</NxTag>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={idSelect} className="grid gap-1 text-xs" style={{ color: "var(--muted-ink)" }}>
          Origem confirmada
          <select
            id={idSelect}
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
            className="nx-campo"
            style={{ minHeight: 40, minWidth: 200, borderRadius: 10, border: "1px solid var(--control-border)", background: "var(--white)", padding: "0 10px", color: "var(--text)" }}
          >
            <option value="">Escolha a origem</option>
            {ORIGENS_PERMITIDAS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        {r.precisaNome && (
          <label htmlFor={idNome} className="grid gap-1 text-xs" style={{ color: "var(--muted-ink)" }}>
            Nome lido no CRM
            <input
              id={idNome}
              value={nome}
              maxLength={120}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: WhatsApp da recepção"
              style={{ minHeight: 40, minWidth: 200, borderRadius: 10, border: "1px solid var(--control-border)", background: "var(--white)", padding: "0 10px", color: "var(--text)" }}
            />
          </label>
        )}
        <button
          type="button"
          className="ws-action ws-action--primary inline-flex min-h-[40px] items-center"
          disabled={!origem || salvar.isPending}
          onClick={() => salvar.mutate()}
        >
          {salvar.isPending ? "Gravando…" : "Confirmar"}
        </button>
      </div>
      {salvar.isSuccess && <p className="text-sm" role="status" style={{ color: "var(--up-ink)" }}>{fmt(salvar.data)} leads refeitos</p>}
      {salvar.error && <p className="text-sm" role="alert" style={{ color: "var(--dn-ink)" }}>Não gravou: {(salvar.error as Error).message}</p>}
    </li>
  );
}

export function CanaisOrigemCrm({ clientId }: { clientId: string }) {
  const q = useCanais(clientId);
  // Função ainda não existe no banco: a lista fica escondida (o bloco Cobertura já mostra o aviso).
  if (q.data?.ausente) return null;
  const corpo = (() => {
    if (q.isLoading) return <p className="text-sm" style={{ color: "var(--muted-ink)" }}>Lendo os canais…</p>;
    if (q.error) return <p role="alert" className="text-sm" style={{ color: "var(--dn-ink)" }}>Não deu para ler os canais: {(q.error as Error).message}</p>;
    const linhas = q.data && !q.data.ausente ? q.data.linhas : [];
    if (!linhas.length) return <p className="nx-vazio text-sm">Nenhum canal ou funil com lead sem origem.</p>;
    const maior = Math.max(...linhas.map((l) => l.sem_origem_90d));
    return (
      <ul className="grid gap-3.5" aria-label="Canais e funis para confirmar">
        {linhas.map((r) => <LinhaCanal key={r.chave} r={r} clientId={clientId} maior={maior} />)}
      </ul>
    );
  })();
  return (
    <NxCard id="canais-sem-origem" nivel={2} icone={icT("filter")} titulo="Canais e funis sem origem" subtitulo="Escolha a origem pelo nome real; nada muda sem o Confirmar">
      {corpo}
    </NxCard>
  );
}
