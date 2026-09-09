import { useState } from "react";

/**
 * Foto do cliente, com iniciais como reserva.
 *
 * A reserva não é enfeite: a maioria dos clientes não vai ter foto no dia em
 * que isso subir, e um ícone genérico de pessoa deixaria todos idênticos.
 * Iniciais sobre cor derivada do nome mantêm cada um distinguível na lista.
 *
 * A cor sai do próprio nome (mesmo nome, mesma cor, sempre) e usa só o matiz:
 * saturação e luminosidade fixas garantem contraste com o texto branco em
 * qualquer letra, sem sorteio que às vezes sai ilegível.
 */
function corDoNome(nome: string): string {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 42%)`;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function ClientAvatar({
  nome,
  url,
  tamanho = 36,
}: {
  nome: string;
  url?: string | null;
  tamanho?: number;
}) {
  // A URL do storage pode 404 depois de uma troca, ou a CDN pode falhar.
  // Sem isto sobraria um ícone de imagem quebrada no cabeçalho.
  const [quebrou, setQuebrou] = useState(false);
  const mostrarFoto = url && !quebrou;

  return mostrarFoto ? (
    <img
      src={url}
      alt={nome}
      width={tamanho}
      height={tamanho}
      onError={() => setQuebrou(true)}
      className="shrink-0 rounded-full object-cover"
      style={{ width: tamanho, height: tamanho, border: "1px solid var(--border)" }}
    />
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: tamanho,
        height: tamanho,
        background: corDoNome(nome || "?"),
        fontSize: Math.max(10, Math.round(tamanho * 0.38)),
      }}
    >
      {iniciais(nome || "?")}
    </span>
  );
}
