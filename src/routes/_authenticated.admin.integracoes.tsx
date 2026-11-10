import { useId, useState, type CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, ChevronDown, ChevronRight, Clock, HelpCircle, Plug } from "lucide-react";
import { CATEGORIAS, CONECTORES, NOME_ESTADO, type Categoria, type Conector, type EstadoCliente } from "@/lib/conectores";
import { getMapaConexoes, type LinhaConexao } from "@/lib/conectores-data";
import { NxAlertaCurto, NxComoCalcula, NxTopo } from "@/components/nx/anuncios-graficos";
import { AdmChip, AdmContador, AdmContadores, type AdmTom } from "@/components/nx/admin-base";

// Integration Core: o catálogo de conexões do Hub e o estado real de cada cliente. "Planejado" quer dizer que o
// conector ainda não existe: aparece para orientar, nunca como disponível.
export const Route = createFileRoute("/_authenticated/admin/integracoes")({
  component: Integracoes,
});

const TOM: Record<EstadoCliente, AdmTom> = { conectado: "ok", atrasado: "atencao", erro: "critico", sem_registro: "neutro", nao_conectado: "neutro" };
const data = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");

function Integracoes() {
  const mapa = useQuery({ queryKey: ["mapa-conexoes"], queryFn: getMapaConexoes, staleTime: 60_000, retry: false });
  const categorias = Object.keys(CATEGORIAS) as Categoria[];
  // Contagem dos cartões do topo: as mesmas linhas que cada conector mostra (só clientes ligados).
  const ligadas = mapa.data ? CONECTORES.filter((c) => c.estado === "disponivel").flatMap((c) => (mapa.data?.[c.id] ?? []).filter((l) => l.estado !== "nao_conectado")) : [];
  const conta = (e: EstadoCliente) => ligadas.filter((l) => l.estado === e).length;
  const disponiveis = CONECTORES.filter((c) => c.estado === "disponivel").length;
  const planejados = CONECTORES.length - disponiveis;
  const pronto = !!mapa.data;
  const v = (n: number) => (pronto ? n : "…");

  return (
    <div className="adm adm-integracoes">
      <NxTopo
        pergunta="Cada conexão está funcionando? O que está em dia, o que deu erro e o que parou de sincronizar."
        acao={
          <Link to="/assistentes-ia" className="adm-btn">
            <Bot aria-hidden /> Assistentes de IA (MCP)
          </Link>
        }
      />
      <NxComoCalcula titulo="De onde vem o estado e o que é planejado">
        <p>
          Todas as conexões do Nexo num lugar só, com o estado real de cada cliente (lido das contas ligadas e da última sincronização). "Planejado" é
          conector que ainda não existe: está aqui para orientar, não para ligar.
        </p>
        <p>
          <b>Assistentes de IA · Doctor Creator MCP</b> (só leitura): conectar Claude ou ChatGPT ao Hub, ver acessos concedidos e revogar.
        </p>
      </NxComoCalcula>

      {mapa.isLoading ? (
        <p role="status" className="adm-vazio adm-lista-card">Carregando integrações…</p>
      ) : mapa.isError ? (
        <div role="alert" className="nx-alerta-curto">
          <span className="nx-alerta-curto__ic" aria-hidden>
            <AlertTriangle size={16} />
          </span>
          <div className="nx-alerta-curto__corpo">
            <p className="nx-alerta-curto__titulo">Não foi possível carregar as integrações.</p>
          </div>
          <div className="nx-alerta-curto__acao">
            <button type="button" className="adm-btn" onClick={() => void mapa.refetch()}>Tentar novamente</button>
          </div>
        </div>
      ) : (
        <>
          <AdmContadores rotulo="Resumo das conexões">
            <AdmContador i={0} icone={<CheckCircle2 />} rotulo="Em dia" valor={v(conta("conectado"))} nota="Conexões sincronizando" tom={conta("conectado") ? "ok" : "neutro"} />
            <AdmContador i={1} icone={<AlertTriangle />} rotulo="Com erro" valor={v(conta("erro"))} nota="A última sincronização falhou" tom={conta("erro") ? "critico" : "ok"} />
            <AdmContador i={2} icone={<Clock />} rotulo="Desatualizadas" valor={v(conta("atrasado"))} nota="Sem sincronizar há dias" tom={conta("atrasado") ? "atencao" : "ok"} />
            <AdmContador i={3} icone={<HelpCircle />} rotulo="Sem registro" valor={v(conta("sem_registro"))} nota="Ligadas, nunca sincronizaram" tom="neutro" />
            <AdmContador i={4} icone={<Plug />} rotulo="Conectores" valor={disponiveis} nota={`${planejados} planejados, ainda não disponíveis`} tom="marca" />
          </AdmContadores>
          {(conta("erro") > 0 || conta("atrasado") > 0) && (
            <NxAlertaCurto tom={conta("erro") ? "critico" : "atencao"} titulo={`${conta("erro") + conta("atrasado")} ${conta("erro") + conta("atrasado") === 1 ? "conexão precisa" : "conexões precisam"} de você`} passo="Abra o conector marcado abaixo, veja o cliente e corrija em Configurar." />
          )}
          {categorias.map((cat) => {
            const lista = CONECTORES.filter((c) => c.categoria === cat);
            if (!lista.length) return null;
            return (
              <section key={cat} aria-labelledby={`cat-${cat}`} className="adm-categoria">
                <h2 id={`cat-${cat}`}>{CATEGORIAS[cat]}</h2>
                <div className="adm-lista-card">
                  <ul className="adm-itens">
                    {lista.map((c, i) => (
                      <CardConector key={c.id} c={c} linhas={mapa.data?.[c.id] ?? []} i={i} />
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function CardConector({ c, linhas, i }: { c: Conector; linhas: LinhaConexao[]; i: number }) {
  const [aberto, setAberto] = useState(false);
  const listaId = useId();
  const ligados = linhas.filter((l) => l.estado !== "nao_conectado");
  const conta = (e: EstadoCliente) => ligados.filter((l) => l.estado === e).length;
  const problemas = conta("erro") + conta("atrasado");
  const planejado = c.estado === "planejado";
  return (
    <li className={`adm-item${conta("erro") ? " adm-item--critico" : conta("atrasado") ? " adm-item--atencao" : ""}`} style={{ "--i": Math.min(i, 12) } as CSSProperties}>
      <div className="adm-item__corpo">
        <p className="adm-item__titulo">{c.nome}</p>
        <p className="adm-item__mais">
          {c.alimenta} · {c.autenticacao}
        </p>
        {c.observacao && <p className="adm-item__mais">{c.observacao}</p>}
        {c.estado === "disponivel" && ligados.length > 0 && (
          <div>
            <button type="button" className="adm-abrir" aria-label={`Ver clientes de ${c.nome}`} aria-controls={aberto ? listaId : undefined} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
              {aberto ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />} {problemas ? `Ver clientes · ${problemas} para corrigir` : "Ver clientes"}
            </button>
            {aberto && (
              <ul id={listaId} className="adm-conector__clientes">
                {ligados
                  .sort((a, b) => ordem(a.estado) - ordem(b.estado))
                  .map((l) => (
                    <li key={l.clientId} className="adm-conector__cli">
                      <span>
                        {l.cliente}
                        {l.detalhe ? <small> · {l.detalhe}</small> : null}
                      </span>
                      <AdmChip tom={TOM[l.estado]}>{NOME_ESTADO[l.estado]}</AdmChip>
                      <small>último sucesso {data(l.ultimoSucesso)}</small>
                      {(l.estado === "erro" || l.estado === "atrasado") && (
                        <Link to="/admin/$clientId" params={{ clientId: l.clientId }} className="adm-btn adm-btn--mini">
                          Configurar <ArrowRight aria-hidden />
                        </Link>
                      )}
                      {l.estado === "erro" && l.erro && <span className="adm-conector__erro">{l.erro.slice(0, 200)}</span>}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="adm-item__fim">
        {planejado ? (
          <AdmChip tom="neutro" semIcone>Planejado · ainda não disponível</AdmChip>
        ) : ligados.length === 0 ? (
          <AdmChip tom="neutro" semIcone>Nenhum cliente</AdmChip>
        ) : (
          <div className="adm-chips" style={{ justifyContent: "flex-end" }}>
            <AdmChip tom="marca" semIcone>{ligados.length} cliente(s)</AdmChip>
            {conta("conectado") > 0 && <AdmChip tom="ok">{conta("conectado")} em dia</AdmChip>}
            {conta("erro") > 0 && <AdmChip tom="critico">{conta("erro")} com erro</AdmChip>}
            {conta("atrasado") > 0 && <AdmChip tom="atencao">{conta("atrasado")} desatualizada(s)</AdmChip>}
            {conta("sem_registro") > 0 && <AdmChip tom="neutro">{conta("sem_registro")} sem registro</AdmChip>}
          </div>
        )}
      </div>
    </li>
  );
}

const ordem = (e: EstadoCliente) => ({ erro: 0, atrasado: 1, sem_registro: 2, conectado: 3, nao_conectado: 4 })[e];
