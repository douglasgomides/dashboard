import { useMemo } from "react";
import { Download } from "lucide-react";
import { gerarQr, qrSvg } from "@/lib/qr";

// QR code do link rastreado, gerado no navegador (src/lib/qr.ts): o endereço não passa por serviço de fora.
// Baixa em PNG (story, post, WhatsApp) ou SVG (gráfica, Canva).
function baixar(nome: string, href: string) {
  const a = document.createElement("a");
  a.href = href; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
}

export function QrLink({ url, nome }: { url: string; nome: string }) {
  const qr = useMemo(() => gerarQr(url), [url]);
  const total = qr.tamanho + 8;
  const caminho = useMemo(() => {
    let d = "";
    qr.modulos.forEach((l, y) => l.forEach((c, x) => { if (c) d += `M${x + 4} ${y + 4}h1v1h-1z`; }));
    return d;
  }, [qr]);
  function png() {
    const lado = 1080, escala = Math.floor(lado / total), margem = Math.floor((lado - escala * total) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = lado; canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, lado, lado);
    ctx.fillStyle = "#000";
    qr.modulos.forEach((l, y) => l.forEach((c, x) => { if (c) ctx.fillRect(margem + (x + 4) * escala, margem + (y + 4) * escala, escala, escala); }));
    baixar(`qr-${nome}.png`, canvas.toDataURL("image/png"));
  }
  function svg() {
    const u = URL.createObjectURL(new Blob([qrSvg(url, 1080)], { type: "image/svg+xml" }));
    baixar(`qr-${nome}.svg`, u);
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  const botao = "inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold";
  const estilo = { background: "var(--surface)", borderColor: "var(--border)" };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <svg role="img" aria-label={`QR code que abre ${url}`} viewBox={`0 0 ${total} ${total}`} width={148} height={148} shapeRendering="crispEdges" className="rounded border" style={{ borderColor: "var(--border)" }}>
        <rect width="100%" height="100%" fill="#fff" />
        <path d={caminho} fill="#000" />
      </svg>
      <div className="flex flex-col gap-2">
        <button type="button" className={botao} style={estilo} onClick={png}><Download size={14} aria-hidden /> Baixar QR (PNG)</button>
        <button type="button" className={botao} style={estilo} onClick={svg}><Download size={14} aria-hidden /> Baixar QR para gráfica (SVG)</button>
      </div>
    </div>
  );
}
