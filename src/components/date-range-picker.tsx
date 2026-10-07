import { RANGE_PRESETS, resolveDateRange, type DateRangeState } from "@/lib/date-range";

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeState;
  onChange: (next: DateRangeState) => void;
}) {
  const resolved = resolveDateRange(value);

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

  return (
    <div className="flex flex-col gap-1">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium" style={{ color: "var(--text-faint)" }}>
        Período:
      </span>
      <select
        value={value.preset}
        onChange={(e) => handlePresetChange(e.target.value as DateRangeState["preset"])}
        className="rounded-md border px-2 py-1.5 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        {RANGE_PRESETS.map((p) => (
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
            className="rounded-md border px-2 py-1.5 text-sm"
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
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          />
        </>
      )}
    </div>
      <details className="text-[11px] leading-snug" style={{ color: "var(--text-faint)" }}>
        <summary className="cursor-pointer select-none py-1">Sobre o período</summary>
        Se um período não filtrar ou vier vazio, a conta do Meta pode ter sido conectada ao dashboard há pouco — ainda
        não há histórico completo desse intervalo.
      </details>
    </div>
  );
}
