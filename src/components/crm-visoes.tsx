import { useQuery } from "@tanstack/react-query";
import { Boxes, History, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Painel } from "@/components/visual";
import { AMOSTRA_MIN_COORTE, lerVisoes, leituraDoEstoque } from "@/lib/crm-visoes";
import { somarDias } from "@/lib/sap-metas";

const fmtN = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const th = "py-1 pr-3 font-medium";
const td = "py-1.5 pr-3 text-right tabular-nums";

async function getVisoes(clientId: string, de: string, ate: string) {
  const { data, error } = await (supabase as any).rpc("crm_visoes_comerciais", { p_client_id: clientId, p_from: de, p_to: ate });
  if (error) throw error;
  return lerVisoes(data);
}

/** Coorte por semana de entrada, estoque de leads abertos por etapa e idade, e movimentos da semana. */
export function VisoesComerciais({ clientId, start, end }: { clientId: string; start: string; end: string }) {
  const q = useQuery({ queryKey: ["crm-visoes", clientId, start, end], queryFn: () => getVisoes(clientId, start, end.slice(0, 10)), retry: false });
  if (q.isLoading) return <p className="note">Carregando coortes e estoque…</p>;
  if (q.isError) return <p className="note">Não foi possível ler as coortes e o estoque agora.</p>;
  const v = q.data;
  if (!v || !v.temCrm) return null;
  const leitura = leituraDoEstoque(v);

  return (
    <div className="space-y-4">
      <Painel
        icone={Users}
        titulo="Coorte: os leads de cada semana, hoje"
        resumo="Quem entrou em cada semana e até onde chegou"
        ajuda={<>Cada linha são os leads que entraram naquela semana e a etapa em que estão hoje. Semanas recentes ainda não tiveram tempo de andar. A taxa só aparece com {AMOSTRA_MIN_COORTE} leads ou mais na semana. Listas antigas importadas ficam de fora.</>}
      >
        {!v.coortes.length ? (
          <p className="note" style={{ margin: 0 }}>Nenhum lead entrou no período.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                  <th className={th}>Semana de entrada</th>
                  <th className={`${th} text-right`}>Leads</th>
                  <th className={`${th} text-right`}>Atendidos</th>
                  <th className={`${th} text-right`}>Agendaram</th>
                  <th className={`${th} text-right`}>Compraram</th>
                  <th className={`${th} text-right`}>Perdidos</th>
                  <th className={`${th} text-right`}>Ainda abertos</th>
                </tr>
              </thead>
              <tbody>
                {v.coortes.map((c) => (
                  <tr key={c.semana} className="border-t" style={{ borderColor: "var(--border)", color: c.pouca ? "var(--text-dim)" : undefined }}>
                    <td className="py-1.5 pr-3">{ddmm(c.semana)} a {ddmm(somarDias(c.semana, 6))}</td>
                    <td className={td}>{fmtN(c.leads)}</td>
                    <td className={td}>{fmtN(c.atendidos)} <span className="text-xs" style={{ color: "var(--muted)" }}>{pct(c.taxaAtendimento)}</span></td>
                    <td className={td}>{fmtN(c.agendados)} <span className="text-xs" style={{ color: "var(--muted)" }}>{pct(c.taxaAgendamento)}</span></td>
                    <td className={td}>{fmtN(c.ganhos)} <span className="text-xs" style={{ color: "var(--muted)" }}>{pct(c.taxaGanho)}</span></td>
                    <td className={td}>{fmtN(c.perdidos)}</td>
                    <td className={td}>{fmtN(c.abertos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <Painel
        icone={Boxes}
        titulo="Estoque de leads abertos"
        resumo={`${fmtN(v.abertos)} abertos hoje, por etapa e por quanto tempo estão no CRM`}
        ajuda={<>Leads que não foram marcados como ganhos nem perdidos, contados pela data em que entraram. Lead aberto há mais de 30 dias quase nunca é oportunidade viva: trabalhe numa reativação ou encerre como perdido.</>}
      >
        {leitura && <p className="mt-1 text-sm">{leitura}</p>}
        {!v.estoque.length ? (
          <p className="note" style={{ margin: 0 }}>Nenhum lead aberto.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                  <th className={th}>Etapa</th>
                  <th className={`${th} text-right`}>Abertos</th>
                  <th className={`${th} text-right`}>Até 3 dias</th>
                  <th className={`${th} text-right`}>4 a 7</th>
                  <th className={`${th} text-right`}>8 a 30</th>
                  <th className={`${th} text-right`}>Mais de 30</th>
                </tr>
              </thead>
              <tbody>
                {v.estoque.slice(0, 15).map((e) => (
                  <tr key={`${e.funil}|${e.etapa}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-3">
                      {e.etapa}
                      <span className="ml-1 text-xs" style={{ color: "var(--muted)" }}>
                        {[e.funil, e.entrada ? "1ª etapa" : null, e.consulta ? "consulta" : null].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className={`${td} font-semibold`}>{fmtN(e.total)}</td>
                    <td className={td}>{fmtN(e.ate_3)}</td>
                    <td className={td}>{fmtN(e.de_4_a_7)}</td>
                    <td className={td} style={{ color: e.de_8_a_30 && e.entrada ? "var(--warn)" : undefined }}>{fmtN(e.de_8_a_30)}</td>
                    <td className={td} style={{ color: e.mais_30 ? "var(--crit)" : undefined }}>{fmtN(e.mais_30)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {v.estoque.length > 15 && <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Mostrando as 15 etapas com mais leads de {v.estoque.length}.</p>}
          </div>
        )}
      </Painel>

      <Painel
        icone={History}
        titulo="Movimentos no CRM"
        resumo="Mudanças de etapa, agendamentos, vendas e perdas por semana"
        ajuda={<>Gravado a cada mudança que chega do CRM. Não existe histórico de antes do início da gravação; a hora é a da sincronização (no Kommo, na hora).</>}
      >
        {!v.eventosDesde ? (
          <p className="note" style={{ margin: 0 }}>O histórico de movimentos começa a ser gravado agora. As primeiras semanas aparecem aqui conforme a equipe mexe nos leads.</p>
        ) : !v.movimentos.length ? (
          <p className="note" style={{ margin: 0 }}>Nenhum movimento no período. Histórico gravado desde {ddmm(v.eventosDesde.slice(0, 10))}.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                  <th className={th}>Semana</th>
                  <th className={`${th} text-right`}>Leads mexidos</th>
                  <th className={`${th} text-right`}>Mudanças de etapa</th>
                  <th className={`${th} text-right`}>Agendaram</th>
                  <th className={`${th} text-right`}>Vendas</th>
                  <th className={`${th} text-right`}>Perdas</th>
                </tr>
              </thead>
              <tbody>
                {v.movimentos.map((m) => (
                  <tr key={m.semana} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-3">{ddmm(m.semana)} a {ddmm(somarDias(m.semana, 6))}</td>
                    <td className={td}>{fmtN(m.leads_mexidos)}</td>
                    <td className={td}>{fmtN(m.mudancas)}</td>
                    <td className={td}>{fmtN(m.agendaram)}</td>
                    <td className={td}>{fmtN(m.ganhos)}</td>
                    <td className={td}>{fmtN(m.perdas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Histórico gravado desde {ddmm(v.eventosDesde.slice(0, 10))}.</p>
          </div>
        )}
      </Painel>
    </div>
  );
}
