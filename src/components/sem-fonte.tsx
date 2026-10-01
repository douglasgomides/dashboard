// Estado "o Hub não tem esse dado": diz o que falta e quem resolve.
export function SemFonte({ titulo, texto, quem }: { titulo: string; texto: string; quem?: string }) {
  return (
    <div className="hempty">
      <h2>{titulo}</h2>
      <p>{texto}</p>
      {quem && (
        <p style={{ marginTop: 8 }}>
          <b>Quem resolve:</b> {quem}
        </p>
      )}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <p style={{ color: "var(--muted)" }}>{texto}</p>;
}

export function ErroCarga({ texto }: { texto: string }) {
  return (
    <div className="hempty">
      <h2>Não foi possível carregar</h2>
      <p>{texto}</p>
    </div>
  );
}

export const SEM_INSTAGRAM = {
  titulo: "Instagram não conectado",
  texto:
    "Este cliente ainda não tem uma conta de Instagram ligada ao Hub, então não há seguidores, posts nem comentários para analisar. Nenhum número é exibido para não passar a impressão de zero.",
  quem: "time Doctor Creator, ligando a conta de Instagram do médico à Business Manager do cliente.",
};
