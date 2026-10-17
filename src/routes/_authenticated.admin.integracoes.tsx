import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CATEGORIAS, CONECTORES, NOME_ESTADO, type Categoria, type Conector, type EstadoCliente } from "@/lib/conectores";
import { getMapaConexoes, type LinhaConexao } from "@/lib/conectores-data";

// Integration Core: o catálogo de conexões do Hub e o estado real de cada cliente. "Planejado" quer dizer que o
// conector ainda não existe: aparece para orientar, nunca como disponível.
export const Route = createFileRoute("/_authenticated/admin/integracoes")({
  component: Integracoes,
});

const caixa = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const dim = { color: "var(--text-dim)" } as const;
const COR: Record<EstadoCliente, string> = { conectado: "var(--good)", atrasado: "var(--warn)", erro: "var(--crit)", sem_registro: "var(--muted)", nao_conectado: "var(--muted)" };
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function Integracoes() {
  const mapa = useQuery({ queryKey: ["mapa-conexoes"], queryFn: getMapaConexoes, staleTime: 60_000 });
  const categorias = Object.keys(CATEGORIAS) as Categoria[];
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm" style={dim}>
        Todas as conexões do Hub num lugar só, com o estado real de cada cliente (lido das contas ligadas e da última
        sincronização). "Planejado" é conector que ainda não existe: está aqui para orientar, não para ligar.
      </p>
      {mapa.isLoading ? <p className="note">Carregando…</p> : mapa.isError ? (
        <p className="note" style={{ color: "var(--crit)" }}>Não foi possível carregar: {(mapa.error as Error).message}</p>
      ) : categorias.map((cat) => {
        const lista = CONECTORES.filter((c) => c.categoria === cat);
        if (!lista.length) return null;
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`} className="space-y-2">
            <h2 id={`cat-${cat}`} className="font-medium">{CATEGORIAS[cat]}</h2>
            <ul className="space-y-2">
              {lista.map((c) => <CardConector key={c.id} c={c} linhas={mapa.data?.[c.id] ?? []} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function CardConector({ c, linhas }: { c: Conector; linhas: LinhaConexao[] }) {
  const [aberto, setAberto] = useState(false);
  const ligados = linhas.filter((l) => l.estado !== "nao_conectado");
  const conta = (e: EstadoCliente) => ligados.filter((l) => l.estado === e).length;
  const problemas = conta("erro") + conta("atrasado");
  return (
    <li className="rounded-xl border p-4" style={caixa}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-[220px] flex-1">
          <div className="font-medium">{c.nome}</div>
          <div className="text-xs" style={dim}>{c.alimenta} · {c.autenticacao}</div>
          {c.observacao && <div className="mt-1 text-xs" style={dim}>{c.observacao}</div>}
        </div>
        {c.estado === "planejado" ? (
          <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--border)", ...dim }}>Planejado · ainda não disponível</span>
        ) : (
          <span className="text-sm">
            {ligados.length} cliente(s){" "}
            {problemas > 0 && <span style={{ color: "var(--crit)" }}>· {problemas} com problema</span>}
          </span>
        )}
      </div>
      {c.estado === "disponivel" && ligados.length > 0 && (
        <>
          <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs underline" style={dim} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
            {aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Ver clientes
          </button>
          {aberto && (
            <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--border)" }}>
              {ligados.sort((a, b) => ordem(a.estado) - ordem(b.estado)).map((l) => (
                <li key={l.clientId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                  <span className="min-w-[180px] flex-1">{l.cliente}{l.detalhe ? <span style={dim}> · {l.detalhe}</span> : null}</span>
                  <span style={{ color: COR[l.estado] }}>{NOME_ESTADO[l.estado]}</span>
                  <span className="text-xs" style={dim}>último sucesso {data(l.ultimoSucesso)}</span>
                  {l.estado === "erro" && l.erro && <span className="w-full text-xs" style={{ color: "var(--crit)" }}>{l.erro.slice(0, 200)}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

const ordem = (e: EstadoCliente) => ({ erro: 0, atrasado: 1, sem_registro: 2, conectado: 3, nao_conectado: 4 })[e];
