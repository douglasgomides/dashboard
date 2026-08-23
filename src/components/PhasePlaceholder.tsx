export function PhasePlaceholder({
  phase,
  title,
  description,
}: {
  phase: string;
  title: string;
  description: string;
}) {
  return (
    <div
      className="rounded-xl border border-dashed p-8 text-center"
      style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
    >
      <div className="text-xs font-mono uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {phase}
      </div>
      <h2 className="mt-2 text-base font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm">{description}</p>
    </div>
  );
}
