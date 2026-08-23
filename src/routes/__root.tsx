import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext } from "@tanstack/react-router";
import { AuthProvider } from "@/hooks/use-auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold">404</h1>
        <p className="mt-4 text-sm" style={{ color: "var(--text-dim)" }}>
          Página não encontrada.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm" style={{ color: "var(--accent)" }}>
          Voltar pro início
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
