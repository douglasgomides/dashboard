import { RANGE_PRESETS, resolveDateRange, type DateRangeState } from "@/lib/date-range";

export function rotuloPeriodo(value: DateRangeState): string {
  if (value.preset === "personalizado") {
    const r = resolveDateRange(value);
    const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    return `${dm(r.start)} a ${dm(r.end)}`;
  }
  return RANGE_PRESETS.find((p) => p.value === value.preset)?.label ?? "Período";
}

const CAMPO = "min-h-[44px] rounded-lg border px-3 text-base min-[821px]:min-h-[36px] min-[821px]:rounded-md min-[821px]:px-2 min-[821px]:text-sm";

// variante "lista": usada na folha de baixo do celular — cada período é um botão
// grande (alvo de toque de 44px) em vez de um <select> pequeno.
export function DateRangePicker({
  value,
  onChange,
  variante = "inline",
  inicioDados,
}: {
  value: DateRangeState;
  onChange: (next: DateRangeState) => void;
  variante?: "inline" | "lista";
  /** Primeiro dia com dado da fonte desta tela: períodos que começam bem antes disso não são oferecidos. */
  inicioDados?: string | null;
}) {
  const resolved = resolveDateRange(value);
  // Só oferece período que tem dado (folga de 7 dias); o período atual sempre aparece.
  const presets = RANGE_PRESETS.filter((p) => {
    if (!inicioDados || p.value === value.preset || p.value === "personalizado" || p.value === "mes_atual") return true;
    const ini = resolveDateRange({ preset: p.value }).start;
    const limite = new Date(new Date(inicioDados + "T12:00:00").getTime() - 7 * 86400000).toISOString().slice(0, 10);
    return ini >= limite;
  });

  // O <input type="date"> dispara onChange a cada trecho digitado (ex.: ano 0002 enquanto
  // se escreve 2026), o que mandava uma consulta de dois mil anos e parecia que o filtro
  // não pegava. Só aceita data completa, de 2000 em diante, e mantém from <= to.
  function dataValida(iso: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number(iso.slice(0, 4)) >= 2000;
  }
  function mudarDatas(parcial: { from?: string; to?: string }) {
    const from = parcial.from ?? value.from ?? resolved.start;
    const to = parcial.to ?? value.to ?? resolved.end;
    if (!dataValida(from) || !dataValida(to)) return;
    onChange(from <= to ? { ...value, from, to } : { ...value, from: to, to: from });
  }

  function handlePresetChange(preset: DateRangeState["preset"]) {
    if (preset === "personalizado") {
      // Preenche from/to com o intervalo atual na hora — sem isso os campos
      // ficavam vazios até o usuário preencher os dois, e até lá o filtro
      // continuava caindo no preset anterior por baixo dos panos, dando a
      // impressão de que escolher uma data não fazia nada.
      onChange({ preset, from: resolved.start, to: resolved.end });
    } else {
      onChange({ preset });
    }
  }

  const sobre = (
    <details className="text-[11px] leading-snug" style={{ color: "var(--text-faint)" }}>
      <summary className="flex min-h-[44px] cursor-pointer select-none items-center py-1 min-[821px]:block min-[821px]:min-h-0">Sobre o período</summary>
      Se um período não filtrar ou vier vazio, a conta do Meta pode ter sido conectada ao dashboard há pouco — ainda
      não há histórico completo desse intervalo.
    </details>
  );

  if (variante === "lista") {
    return (
      <div className="flex flex-col gap-2">
        <div role="radiogroup" aria-label="Período" className="grid grid-cols-2 gap-2">
          {presets.map((p) => {
            const sel = value.preset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => handlePresetChange(p.value)}
                className="min-h-[48px] rounded-xl border px-3 text-left text-[15px]"
                style={{
                  borderColor: sel ? "var(--accent)" : "var(--border)",
                  background: sel ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "var(--surface)",
                  fontWeight: sel ? 650 : 400,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {value.preset === "personalizado" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-faint)" }}>
              De
              <input
                type="date"
                value={value.from ?? resolved.start}
                max={value.to ?? resolved.end}
                onChange={(e) => mudarDatas({ from: e.target.value })}
                className={CAMPO}
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-faint)" }}>
              Até
              <input
                type="date"
                value={value.to ?? resolved.end}
                min={value.from ?? resolved.start}
                onChange={(e) => mudarDatas({ to: e.target.value })}
                className={CAMPO}
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              />
            </label>
          </div>
        )}
        {sobre}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium" style={{ color: "var(--text-faint)" }}>
        Período:
      </span>
      <select
        value={value.preset}
        onChange={(e) => handlePresetChange(e.target.value as DateRangeState["preset"])}
        className={CAMPO}
        aria-label="Período"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        {presets.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      {value.preset === "personalizado" && (
        <>
          <input
            type="date"
            value={value.from ?? resolved.start}
            max={value.to ?? resolved.end}
            onChange={(e) => mudarDatas({ from: e.target.value })}
            className={CAMPO}
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            até
          </span>
          <input
            type="date"
            value={value.to ?? resolved.end}
            min={value.from ?? resolved.start}
            onChange={(e) => mudarDatas({ to: e.target.value })}
            className={CAMPO}
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          />
        </>
      )}
    </div>
      {sobre}
    </div>
  );
}
