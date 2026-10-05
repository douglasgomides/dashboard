import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { aplicarTemaSalvo } from "./hooks/use-theme";
import "./styles.css";

// Antes de montar o React: se o médico escolheu claro e o sistema dele está
// no escuro, sem isto a tela pisca escura por um frame a cada carregamento.
aplicarTemaSalvo();

// Depois de um deploy, uma aba que ficou aberta ainda aponta para arquivos antigos que
// deixaram de existir. Antes o servidor devolvia a página inicial no lugar do arquivo e o
// navegador mostrava "'text/html' is not a valid JavaScript MIME type" (tela em branco).
// O Vite avisa por vite:preloadError: recarregamos UMA vez para pegar a versão nova. A
// marca em sessionStorage evita laço de recarga se o problema for outro.
window.addEventListener("vite:preloadError", (evento) => {
  evento.preventDefault();
  try {
    const ultima = Number(sessionStorage.getItem("recarga-por-deploy") ?? 0);
    if (Date.now() - ultima < 60_000) return;
    sessionStorage.setItem("recarga-por-deploy", String(Date.now()));
  } catch {
    // sessionStorage bloqueado: recarrega mesmo assim, uma vez por evento
  }
  window.location.reload();
});

const rootEl = document.getElementById("root")!;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  const missing = [
    ...(!SUPABASE_URL ? ["VITE_SUPABASE_URL"] : []),
    ...(!SUPABASE_PUBLISHABLE_KEY ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
  ];
  createRoot(rootEl).render(
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Supabase não configurado</h1>
        <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#666" }}>
          Falta configurar no Vercel (Settings → Environment Variables): {missing.join(", ")}.
          Depois de adicionar, faça um redeploy.
        </p>
      </div>
    </div>,
  );
} else {
  const router = getRouter();
  createRoot(rootEl).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
