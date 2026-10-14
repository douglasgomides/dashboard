import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { avisosDeCobertura, inicioComDado, dm, type CoberturaFonte } from "@/lib/cobertura";

// Faixa logo abaixo do cabeçalho, em toda tela com período: se alguma fonte não cobre o período
// escolhido, diz de quando a quando há dado e por quê. Oferece "usar só os dias com dado".
export function CoberturaPeriodo({ clientId, start, end, onUsarPeriodo }: { clientId: string; start: string; end: string; onUsarPeriodo: (de: string, ate: string) => void }) {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const fim = end > hoje ? hoje : end;
  const { data } = useQuery({
    queryKey: ["cobertura-periodo", clientId, start, fim],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("cobertura_periodo", { p_client: clientId, p_de: start, p_ate: fim });
      if (error) return [] as CoberturaFonte[];
      return ((data ?? []) as any[]).map((f) => ({ ...f, dias_com_dado: Number(f.dias_com_dado) })) as CoberturaFonte[];
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  const [aberto, setAberto] = useState(false);
  if (!data?.length) return null;
  const avisos = avisosDeCobertura(data, start, fim, hoje);
  if (!avisos.length) return null;
  const grave = avisos.some((a) => a.grave);
  const novoInicio = inicioComDado(data, start);
  const principal = avisos.find((a) => a.fonte === "instagram") ?? avisos[0];
  return (
    <div
      role="status"
      className="mb-4 rounded-xl border px-4 py-3 text-sm"
      style={{ background: grave ? "var(--warn-bg, var(--surface))" : "var(--surface)", borderColor: grave ? "var(--warn-border, var(--warn))" : "var(--border)", color: "var(--ink)" }}
    >
      <div className="flex items-start gap-2">
        <CalendarClock size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: grave ? "var(--warn)" : "var(--muted)" }} />
        <div className="min-w-0 flex-1">
          <p>
            {novoInicio ? (
              <b>Há dado só desde {dm(novoInicio)}. Você escolheu {dm(start)} a {dm(fim)}: os números abaixo cobrem só os dias com dado.</b>
            ) : (
              <b>Você escolheu {dm(start)} a {dm(fim)}, mas nem todo dado cobre esse período.</b>
            )}{" "}
            {principal.rotulo}: {principal.texto}
            {avisos.length > 1 && (
              <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="ml-1 inline-flex items-center gap-0.5 font-semibold" style={{ color: "var(--accent)" }}>
                {aberto ? "Ocultar" : `Ver as ${avisos.length} fontes`} <ChevronDown size={14} aria-hidden style={{ transform: aberto ? "rotate(180deg)" : undefined }} />
              </button>
            )}
          </p>
          {aberto && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5" style={{ color: "var(--ink-2)" }}>
              {avisos.map((a) => (
                <li key={a.fonte}><b style={{ color: "var(--ink)" }}>{a.rotulo}:</b> {a.texto}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
            Totais e comparações valem só para os dias com dado. Não compare com o Instagram/Meta de um período maior.
          </p>
          {novoInicio && (
            <button
              type="button"
              onClick={() => onUsarPeriodo(novoInicio, fim)}
              className="mt-2 inline-flex min-h-[36px] items-center rounded-lg border px-3 text-sm font-semibold"
              style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--surface)" }}
            >
              Usar só o período com dado completo ({dm(novoInicio)} a {dm(fim)})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
