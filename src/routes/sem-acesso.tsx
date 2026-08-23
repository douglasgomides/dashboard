import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sem-acesso")({
  component: NoAccessPage,
});

function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-lg font-semibold">Nenhum cliente vinculado</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
          Seu usuário ainda não está em <code>client_members</code> para nenhum cliente.
          Peça pra um admin te adicionar.
        </p>
      </div>
    </div>
  );
}
