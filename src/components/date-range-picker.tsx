import { RANGE_PRESETS, resolveDateRange, type DateRangeState } from "@/lib/date-range";

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeState;
  onChange: (next: DateRangeState) => void;
}) {
  const resolved = resolveDateRange(value);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.preset}
        onChange={(e) => onChange({ ...value, preset: e.target.value as DateRangeState["preset"] })}
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
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          />
        </>
      )}
    </div>
  );
}
