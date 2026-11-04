import { useQuery } from "@tanstack/react-query";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Carregando, ResumoExecutivo } from "@/components/sem-fonte";
import { fmtNum } from "@/lib/format";

// Atendimento medido pelas conversas que chegam ao Nexo (RPC atendimento_conversas), para quem não usa a WTS
// (ex.: Kommo). O Kommo entrega a hora de cada mensagem da equipe, mas não o texto nem quem respondeu: dá para medir
// a rapidez, não a qualidade da conversa nem a equipe por pessoa.

type Canal = {
  canal: string;
  conversas: number;
  avaliaveis: number;
  sem_resposta_equipe: number;
  sem_resposta: number;
  so_robo: number;
  mediana_seg: number | null;
  mediana_horario_seg: number | null;
  mediana_fora_seg: number | null;
  ate_5min: number;
  ate_30min: number;
  ate_1h: number;
  no_horario: number;
};
type Hora = { hora: number; conversas: number; mediana_seg: number | null; sem_resposta_equipe: number };
type Dia = { dia: string; conversas: number; mediana_seg: number | null };
type Resultado = {
  conversas: number;
  provider: string | null;
  por_canal: Canal[];
  por_hora_whatsapp: Hora[];
  por_dia: Dia[];
  equipe_com_texto: boolean;
};

async function lerAtendimentoConversas(clientId: string, de: string, ate: string): Promise<Resultado | null> {
  const { data, error } = await (supabase as any).rpc("atendimento_conversas", { p_client_id: clientId, p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return (data as Resultado | null) ?? null;
}

const NOME_CANAL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram Direct" };

function dur(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || !Number.isFinite(Number(seg))) return "—";
  const s = Math.max(0, Math.trunc(Number(seg)));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function pct(a: number, b: number): string {
  if (!b) return "—";
  return `${Math.round((a / b) * 100)}%`;
}

function Kpi({ label, value, hint, alerta }: { label: string; value: string; hint?: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: alerta ? "var(--warn)" : "var(--border)" }}>
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: alerta ? "var(--warn)" : "var(--text)" }}>{value}</div>
      {hint && <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>{hint}</div>}
    </div>
  );
}

function CanalBloco({ c }: { c: Canal }) {
  const nome = NOME_CANAL[c.canal] ?? c.canal;
  const respondidas = c.conversas - c.sem_resposta_equipe;
  const semResp = c.avaliaveis ? c.sem_resposta_equipe / c.avaliaveis : 0;
  return (
    <section className="space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{nome}</h3>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          {fmtNum(c.conversas)} conversas em que a paciente escreveu pedindo resposta
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="1ª resposta da equipe" value={dur(c.mediana_seg)} hint={`metade respondida em até esse tempo (${fmtNum(respondidas)} respondidas)`} alerta={(c.mediana_seg ?? 0) > 3600} />
        <Kpi label="Respondidas em até 5 min" value={pct(c.ate_5min, c.conversas)} hint={`${fmtNum(c.ate_5min)} conversas · até 1 hora: ${pct(c.ate_1h, c.conversas)}`} />
        <Kpi
          label="Sem resposta da equipe"
          value={pct(c.sem_resposta_equipe, c.avaliaveis)}
          hint={`${fmtNum(c.sem_resposta_equipe)} conversas; ${fmtNum(c.so_robo)} só com o robô`}
          alerta={semResp > 0.2}
        />
        <Kpi label="Dentro × fora do horário" value={`${dur(c.mediana_horario_seg)} · ${dur(c.mediana_fora_seg)}`} hint={`seg a sex, 8h às 18h × resto · ${fmtNum(c.no_horario)} chegaram no horário`} />
      </div>
    </section>
  );
}

export function AtendimentoConversas({ clientId, start, end, periodLabel, vazio }: { clientId: string; start: string; end: string; periodLabel: string; vazio: React.ReactNode }) {
  const q = useQuery({
    queryKey: ["atendimento-conversas", clientId, start, end],
    queryFn: () => lerAtendimentoConversas(clientId, start, end),
    staleTime: 5 * 60_000,
  });
  if (q.isLoading) return <Carregando texto="Lendo as conversas…" />;
  if (q.isError) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-semibold">Não foi possível ler as conversas</h2>
        <p className="text-sm">A consulta falhou. Isso não significa que não houve atendimento.</p>
        <button type="button" className="ws-action ws-action--secondary" disabled={q.isFetching} onClick={() => void q.refetch()}>Tentar novamente</button>
      </div>
    );
  }
  const r = q.data;
  if (!r || !r.conversas) return <>{vazio}</>;

  const wa = r.por_canal.find((c) => c.canal === "whatsapp");
  const ig = r.por_canal.find((c) => c.canal === "instagram");
  const crm = r.provider === "kommo" ? "Kommo" : r.provider ?? "CRM";
  const serie = (r.por_dia ?? []).map((d) => ({
    dia: String(d.dia).slice(5),
    conversas: d.conversas,
    espera: d.mediana_seg == null ? null : Math.round(d.mediana_seg / 60),
  }));
  const horas = (r.por_hora_whatsapp ?? []).map((h) => ({
    hora: `${String(h.hora).padStart(2, "0")}h`,
    conversas: h.conversas,
    espera: h.mediana_seg == null ? null : Math.round(h.mediana_seg / 60),
  }));
  const pior = [...(r.por_hora_whatsapp ?? [])].filter((h) => h.conversas >= 20 && h.mediana_seg != null).sort((a, b) => (b.mediana_seg ?? 0) - (a.mediana_seg ?? 0))[0];

  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ color: "var(--text-dim)" }}>
        Atendimento pelas conversas do {crm} · {periodLabel}
      </p>

      <ResumoExecutivo
        tom={(wa?.mediana_seg ?? 0) > 3600 || (wa && wa.avaliaveis && wa.sem_resposta_equipe / wa.avaliaveis > 0.2) ? "atencao" : "bom"}
        frases={[
          wa
            ? `WhatsApp: metade das pacientes recebe a 1ª resposta da equipe em até ${dur(wa.mediana_seg)}; ${pct(wa.ate_5min, wa.conversas)} em até 5 minutos.`
            : "",
          wa ? `${fmtNum(wa.sem_resposta_equipe)} conversas do WhatsApp (${pct(wa.sem_resposta_equipe, wa.avaliaveis)}) ficaram sem resposta da equipe.` : "",
          pior ? `O horário mais lento no WhatsApp é ${String(pior.hora).padStart(2, "0")}h: a resposta leva ${dur(pior.mediana_seg)} na mediana.` : "",
          ig ? `Instagram Direct: ${pct(ig.sem_resposta_equipe, ig.avaliaveis)} sem resposta registrada da equipe (leia o aviso abaixo).` : "",
        ]}
      />

      {wa && <CanalBloco c={wa} />}
      {ig && <CanalBloco c={ig} />}

      {horas.length > 0 && (
        <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="mb-3 text-sm font-semibold">WhatsApp por hora em que a paciente escreveu</div>
          <div className="grafico-caixa" style={{ height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={horas}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="hora" tick={{ fontSize: 11, fill: "var(--text-dim)" }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--text-dim)" }} width={40} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--text-dim)" }} unit="min" width={52} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="conversas" name="Conversas" fill="var(--accent)" />
                <Line yAxisId="right" dataKey="espera" name="1ª resposta (mediana, min)" stroke="var(--warn)" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {serie.length > 1 && (
        <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="mb-3 text-sm font-semibold">Conversas por dia e 1ª resposta da equipe</div>
          <div className="grafico-caixa" style={{ height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "var(--text-dim)" }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--text-dim)" }} width={40} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--text-dim)" }} unit="min" width={52} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="conversas" name="Conversas" fill="var(--accent)" />
                <Line yAxisId="right" dataKey="espera" name="1ª resposta (mediana, min)" stroke="var(--warn)" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-xl border p-4 text-sm" style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
        <p>
          <strong style={{ color: "var(--text)" }}>Como é medido:</strong> conta a conversa em que a paciente escreveu algo
          que pede resposta (emoji solto, reação e aviso de menção no story ficam de fora). A 1ª resposta é a primeira
          mensagem da equipe depois disso; a do robô é contada à parte. Conversas abertas há menos de 2 horas não entram em
          “sem resposta”.
        </p>
        {!r.equipe_com_texto && (
          <p>
            O {crm} entrega a hora de cada mensagem da equipe, mas não o texto nem quem respondeu. Por isso esta tela mede
            a rapidez; a nota da conversa e o desempenho por secretária não estão disponíveis.
          </p>
        )}
        {ig && (
          <p>
            <strong style={{ color: "var(--text)" }}>Instagram Direct:</strong> resposta dada pelo aplicativo do Instagram,
            fora do {crm}, pode não chegar ao Nexo. Confira algumas conversas sem resposta no {crm} antes de cobrar a equipe
            por esse número.
          </p>
        )}
      </div>
    </div>
  );
}
