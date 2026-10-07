import { DIAS_CURTOS } from "@/lib/audiencia";

// Dia da semana x hora, com a cor mais forte onde há mais seguidores online. Horário de Brasília.
export function MapaDeCalor({ mapa }: { mapa: number[][] }) {
  const valores = mapa.flat();
  const max = Math.max(1, ...valores);
  const min = Math.min(...valores);
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 560, display: "grid", gridTemplateColumns: "40px repeat(24, 1fr)", gap: 2, fontSize: 10.5, color: "var(--muted)" }}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} style={{ textAlign: "center" }}>
            {h % 3 === 0 ? `${h}h` : ""}
          </span>
        ))}
        {mapa.map((linha, dia) => (
          <FragmentoLinha key={dia} dia={dia} linha={linha} max={max} min={min} />
        ))}
      </div>
    </div>
  );
}

function FragmentoLinha({ dia, linha, max, min }: { dia: number; linha: number[]; max: number; min: number }) {
  return (
    <>
      <span style={{ alignSelf: "center" }}>{DIAS_CURTOS[dia]}</span>
      {linha.map((v, h) => (
        <span
          key={h}
          title={`${DIAS_CURTOS[dia]} ${h}h: ${v.toLocaleString("pt-BR")} seguidores online em média`}
          style={{
            height: 22,
            borderRadius: 3,
            // Escala do menor ao maior valor da semana, para a diferença entre horários aparecer.
            background: `color-mix(in srgb, var(--accent) ${Math.round(((v - min) / Math.max(1, max - min)) * 100)}%, var(--surface-2))`,
          }}
        />
      ))}
    </>
  );
}
