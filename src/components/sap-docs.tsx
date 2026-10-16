import { Fragment } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { DOC, DOCS, dividirCodigos, type DocSap } from "@/lib/sap-docs";

/** Código pequeno e cinza ao lado do nome. */
function Cod({ c }: { c: string }) {
  return <span className="ml-0.5 text-[0.75em] tabular-nums" style={{ color: "var(--muted)" }}>{c}</span>;
}

function clientIdDaUrl(pathname: string): string | null {
  return /^\/sap\/([0-9a-f-]{36})/.exec(pathname)?.[1] ?? null;
}

/** Nome clicável de um documento (Drive ↗ ou tela do Hub), com o código ao lado. */
export function DocLink({ d, secao, soCodigo = false }: { d: DocSap; secao?: string; soCodigo?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const clientId = clientIdDaUrl(pathname);
  const rotulo = soCodigo ? <span className="tabular-nums">{d.codigo}{secao ? ` ${secao}` : ""}</span> : <>{d.nome}{secao ? ` ${secao}` : ""}</>;
  const estilo = { color: "inherit", textDecorationColor: "color-mix(in srgb, var(--accent) 60%, transparent)" } as const;
  const conteudo = d.url ? (
    <a href={d.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2" style={estilo} title={d.serve}>
      {rotulo}<ExternalLink size={11} aria-label="abre no Drive" className="ml-0.5 inline align-baseline" />
    </a>
  ) : d.tela && clientId ? (
    <Link to={`/sap/$clientId${d.tela === "/painel" ? "/painel" : d.tela}` as never} params={{ clientId } as never} className="underline decoration-dotted underline-offset-2" style={estilo} title={d.serve}>{rotulo}</Link>
  ) : (
    <span title={d.serve}>{rotulo}</span>
  );
  return <>{conteudo}{!soCodigo && <Cod c={d.codigo} />}</>;
}

/** Texto da interface com cada código trocado pelo nome clicável. Entre parênteses, mostra só o código, já linkado. */
export function TextoComCodigos({ texto }: { texto: string | null | undefined }) {
  if (!texto) return null;
  const partes = dividirCodigos(texto);
  return (
    <>
      {partes.map((p, i) => {
        if ("texto" in p) return <Fragment key={i}>{p.texto}</Fragment>;
        const d = DOC.get(p.codigo)!;
        if (p.entreParenteses) return <Fragment key={i}>(<DocLink d={d} secao={p.secao} soCodigo />)</Fragment>;
        return <DocLink key={i} d={d} secao={p.secao} />;
      })}
    </>
  );
}

/** Tela "Documentos do SAP": todos os códigos com nome, para que serve e link. */
export function DocumentosDoSap() {
  const grupos: { titulo: string; tipo: DocSap["tipo"]; ajuda: string }[] = [
    { titulo: "Documentos do programa", tipo: "documento", ajuda: "Modelos na pasta \"Sistema de Aquisição v2\" do Drive. A cópia de cada clínica fica na pasta dela." },
    { titulo: "Vazamentos da Leitura da semana (V1 a V20)", tipo: "vazamento", ajuda: "Cada código é um problema do funil com a ação de cada lado." },
    { titulo: "Itens do checklist de acessos", tipo: "acesso", ajuda: "A = Meta, B = Google, C = Site, D = Agenda e atendimento." },
  ];
  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ color: "var(--text-dim)" }}>
        Todo código que aparece no sistema está aqui. Na interface, o nome aparece clicável e o código fica pequeno ao lado.
      </p>
      {grupos.map((g) => (
        <section key={g.tipo}>
          <h2 className="text-base font-semibold">{g.titulo}</h2>
          <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>{g.ajuda}</p>
          <ul className="divide-y rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            {DOCS.filter((d) => d.tipo === g.tipo).map((d) => (
              <li key={d.codigo} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                <span className="w-12 shrink-0 tabular-nums text-xs" style={{ color: "var(--muted)" }}>{d.codigo}</span>
                <span className="min-w-[180px] flex-1 font-medium">{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">{d.nome} <ExternalLink size={11} aria-label="abre no Drive" className="inline" /></a> : d.nome}</span>
                <span className="basis-full text-xs sm:basis-auto sm:flex-[2]" style={{ color: "var(--text-dim)" }}>{d.serve}{!d.url && !d.tela ? " · sem link" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
