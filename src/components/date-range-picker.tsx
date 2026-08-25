import { RANGE_PRESETS, resolveDateRange, type DateRangeState } from "@/lib/date-range";

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeState;
  onChange: (next: DateRangeState) => void;
}) {
  const resolved = resolveDateRange(value);

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
            onChange={(e) => onChange({ ...value, from: e.target.value })}
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
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          />
        </>
      )}
    </div>
  );
}
