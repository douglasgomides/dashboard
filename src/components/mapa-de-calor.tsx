import { DIAS_CURTOS } from "@/lib/audiencia";

// Dia da semana x hora, com a cor mais forte onde há mais seguidores online. Horário de Brasília.
// Só tokens do Nexo: rampa de b6 (poucos) a b1 (muitos). As classes ig-mapa-calor moram em src/styles/nexo-instagram.css.
export function MapaDeCalor({ mapa }: { mapa: number[][] }) {
  const valores = mapa.flat();
  const max = Math.max(1, ...valores);
  const min = Math.min(...valores);
  return (
    <>
      <p className="ig-mapa-calor__aviso">Arraste para o lado para ver as 24 horas →</p>
      <div className="ig-mapa-calor__rola">
        <div className="ig-mapa-calor__grade" role="img" aria-label="Mapa de calor: média de seguidores online por dia da semana e por hora, em horário de Brasília. Quanto mais forte a cor, mais gente online.">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="ig-mapa-calor__hora" aria-hidden>
              {h % 3 === 0 ? `${h}h` : ""}
            </span>
          ))}
          {mapa.map((linha, dia) => (
            <LinhaDoMapa key={dia} dia={dia} linha={linha} max={max} min={min} />
          ))}
        </div>
      </div>
    </>
  );
}

function LinhaDoMapa({ dia, linha, max, min }: { dia: number; linha: number[]; max: number; min: number }) {
  return (
    <>
      <span className="ig-mapa-calor__dia" aria-hidden>{DIAS_CURTOS[dia]}</span>
      {linha.map((v, h) => (
        <span
          key={h}
          className="ig-mapa-calor__celula"
          title={`${DIAS_CURTOS[dia]} ${h}h: ${v.toLocaleString("pt-BR")} seguidores online em média`}
          // Escala do menor ao maior valor da semana, para a diferença entre horários aparecer.
          style={{ background: `color-mix(in srgb, var(--b1) ${Math.round(((v - min) / Math.max(1, max - min)) * 100)}%, var(--b6))` }}
        />
      ))}
    </>
  );
}
