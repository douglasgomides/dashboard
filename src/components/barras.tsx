import { fmtPct } from "@/lib/audiencia";

// Duas séries lado a lado por categoria (ex.: % dos seguidores x % do alcance por faixa etária).
// Desenho com tokens do Nexo (rampa b1 a b5): sem biblioteca de gráfico e sem cartão próprio; quem usa põe dentro de NxCard.
// As classes ig-pareadas moram em src/styles/nexo-instagram.css.
export function BarrasPareadas({
  categorias,
  a,
  b,
  nomeA,
  nomeB,
}: {
  categorias: string[];
  a: number[];
  b: number[];
  nomeA: string;
  nomeB: string;
}) {
  const max = Math.max(1, ...a, ...b);
  return (
    <div className="ig-pareadas" role="group" aria-label={`${nomeA} e ${nomeB} por faixa etária, em porcentagem`}>
      <div className="ig-pareadas__leg">
        <span><i className="ig-pareadas__a" aria-hidden />{nomeA}</span>
        <span><i className="ig-pareadas__b" aria-hidden />{nomeB}</span>
      </div>
      <div className="ig-pareadas__linhas">
        {categorias.map((c, i) => (
          <div key={c} className="ig-pareadas__linha">
            <span className="ig-pareadas__faixa">{c}</span>
            <span className="ig-pareadas__pares">
              {[
                { v: a[i], nome: nomeA, classe: "ig-pareadas__a" },
                { v: b[i], nome: nomeB, classe: "ig-pareadas__b" },
              ].map((s) => (
                <span key={s.nome} className="ig-pareadas__par" title={`${c}: ${s.nome} ${fmtPct(s.v, 1)}`}>
                  <i className={s.classe} aria-hidden style={{ width: `${Math.max(1, (s.v / max) * 100)}%` }} />
                  <span>{fmtPct(s.v, s.v < 10 ? 1 : 0)}</span>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
