import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { IconeTabler } from "@/components/icons/tabler";
import { rodarFluxoAteFim } from "@/lib/agentes-data";
import { BotaoCopiar } from "@/components/botao-copiar";
import { ESTADOS_IDEIA, TIPOS_IDEIA, type EstadoIdeia, type IdeiaCampanha } from "@/lib/campanhas-ia";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";
import { NxCard, NxKpi, NxTag } from "./base";
import { NxCarregando, NxErro, NxRecolhido, NxVazio } from "./blocos";
import "@/styles/nexo-agentes.css";

// Planejador da semana, ações da ideia e estratégias da IA no desenho nx, só para o Nexo. O SAP segue com
// planejador-conteudo.tsx e estrategias-ia.tsx (congelados). Mesmas consultas, mesmas chaves do React Query, mesmas
// funções de src/lib e os mesmos textos de ação do original: só o desenho muda.

const db = supabase as any;

// ---------------------------------------------------------------- Estratégias da IA (Campanhas e painel de agentes)

type Ideia = IdeiaCampanha & { id: string; estado: EstadoIdeia; resultado: string | null; criado_em: string };

const FLUXO = { id: "campanhas_estrategia", agente: "growth",
  objetivo: "Cruzar o Brand Brain com os dados da clínica e propor estratégias de campanha, pacotes e abordagens. Nada é enviado nem publicado: a equipe aprova e executa na aba Campanhas." };
const ESFORCO: Record<string, string> = { baixo: "esforço baixo", medio: "esforço médio", alto: "esforço alto" };
const ORDEM: EstadoIdeia[] = ["em_andamento", "aprovada", "proposta", "concluida", "descartada"];

async function lerIdeias(clientId: string): Promise<Ideia[]> {
  const { data, error } = await db.from("campanhas_ideias").select("*").eq("client_id", clientId).order("criado_em", { ascending: false }).limit(80);
  if (error) throw error;
  return (data ?? []) as Ideia[];
}

const gerar = (clientId: string, aoAndar: (t: string) => void) => rodarFluxoAteFim(clientId, FLUXO, aoAndar);

function CartaoEstrategia({ i, podeEditar, onEstado }: { i: Ideia; podeEditar: boolean; onEstado: (estado: EstadoIdeia, resultado?: string) => Promise<void> }) {
  const [salvando, setSalvando] = useState(false);
  const mudar = async (estado: EstadoIdeia) => {
    let resultado: string | undefined;
    if (estado === "concluida") {
      const r = window.prompt("O que aconteceu? (ex.: 14 respostas, 5 agendamentos no CRM)", i.resultado ?? "");
      if (r === null) return;
      resultado = r;
    }
    setSalvando(true);
    try { await onEstado(estado, resultado); } finally { setSalvando(false); }
  };
  return (
    <article className={`nxa-estrategia${i.estado === "descartada" ? " nxa-estrategia--descartada" : ""}`}>
      <div className="nxa-estrategia__topo">
        <NxTag tom="b">{TIPOS_IDEIA[i.tipo] ?? i.tipo}</NxTag>
        {podeEditar ? (
          <select aria-label="Estado da estratégia" value={i.estado} disabled={salvando} onChange={(e) => mudar(e.target.value as EstadoIdeia)} autoComplete="off" className="nxa-campo">
            {(Object.keys(ESTADOS_IDEIA) as EstadoIdeia[]).map((s) => <option key={s} value={s}>{ESTADOS_IDEIA[s]}</option>)}
          </select>
        ) : <NxTag tom={i.estado === "concluida" ? "up" : i.estado === "descartada" ? "g" : "or"}>{ESTADOS_IDEIA[i.estado]}</NxTag>}
      </div>
      <h4 className="nxa-titulo-item">{i.titulo}</h4>
      <p className="nxa-texto">{i.porque}</p>
      <p className="nxa-texto"><b>Para quem:</b> {i.publico}</p>
      {i.oferta && <p className="nxa-texto"><b>{i.tipo === "pacote" ? "O que inclui" : "Proposta"}:</b> {i.oferta}</p>}
      <p className="nxa-faixa">{i.canal} · {ESFORCO[i.esforco] ?? i.esforco} · {i.prazo_dias} dias · medir por: {i.metrica}</p>
      {i.resultado && <p className="nxa-medido"><b>Resultado:</b> {i.resultado}</p>}
      <NxRecolhido titulo="Evidências, passos e mensagem">
        <div className="nxa-secao-corpo">
          {i.evidencias.length > 0 && <ul className="nxa-lista-pontos">{i.evidencias.map((e) => <li key={e}>{e}</li>)}</ul>}
          {i.brain.length > 0 && <p className="nxa-faixa">Brand Brain: {i.brain.map((b) => <code key={b}>{b}</code>)}</p>}
          <ol className="nxa-passos">{i.passos.map((s) => <li key={s}>{s}</li>)}</ol>
          {i.mensagem && (
            <div className="nxa-caixa nxa-caixa--pre">
              <h4>Texto pronto (troque o que está entre colchetes e revise antes de usar)</h4>
              <p><i>{i.mensagem}</i></p>
              <div className="nxa-item__acoes"><BotaoCopiar texto={i.mensagem} rotulo="Copiar texto" /></div>
            </div>
          )}
        </div>
      </NxRecolhido>
    </article>
  );
}

export function NxEstrategias({ clientId, podeEditar, mostrarExecutar = true }: { clientId: string; podeEditar: boolean; mostrarExecutar?: boolean }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["campanhas-ideias", clientId], queryFn: () => lerIdeias(clientId) });
  const [andamento, setAndamento] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  async function pedir() {
    setErro(null);
    try {
      const e = await gerar(clientId, setAndamento);
      if (e) setErro(e);
    } catch (e) {
      setErro(mensagemDeErroAcao(e));
    } finally {
      setAndamento(null);
      await qc.invalidateQueries({ queryKey: ["campanhas-ideias", clientId] });
      await qc.invalidateQueries({ queryKey: ["agentes-trabalho", clientId] });
    }
  }
  async function decidir(id: string, estado: EstadoIdeia, resultado?: string) {
    setErro(null);
    const { error } = await db.rpc("campanha_ideia_decidir", { p_id: id, p_estado: estado, p_resultado: resultado ?? null });
    if (error) setErro(mensagemDeErroAcao(error));
    await qc.invalidateQueries({ queryKey: ["campanhas-ideias", clientId] });
    await qc.invalidateQueries({ queryKey: ["agentes-trabalho", clientId] });
  }

  const todas = [...(q.data ?? [])].sort((a, b) => ORDEM.indexOf(a.estado) - ORDEM.indexOf(b.estado));
  const visiveis = verTodas ? todas : todas.filter((i) => i.estado !== "descartada" && i.estado !== "concluida");
  const escondidas = todas.length - visiveis.length;
  const abertas = todas.filter((i) => i.estado !== "descartada" && i.estado !== "concluida").length;
  const emAndamento = todas.filter((i) => i.estado === "em_andamento").length;

  const botaoGerar = isAdmin && mostrarExecutar ? (
    <button type="button" className="nxa-botao nxa-botao--primario" disabled={!!andamento} onClick={pedir}>
      <IconeTabler nome="bulb" tamanho={18} /> {andamento ? "Gerando…" : todas.length ? "Gerar novas estratégias" : "Gerar estratégias"}
    </button>
  ) : undefined;

  return (
    <NxCard
      id="camp-ia"
      titulo="Estratégias da IA, cruzando o Brand Brain com os dados"
      icone={<IconeTabler nome="bulb" tamanho={18} />}
      acao={botaoGerar}
      className={`nxa-estrategias${mostrarExecutar ? "" : " nx-card--plano"}`}
    >
      <div data-peca="agentes" className="nxa-secao-corpo">
        {q.isSuccess && (
          <div className="nxa-kpis">
            <NxKpi icone={<IconeTabler nome="target" tamanho={16} />} rotulo="Estratégias abertas" valor={abertas} />
            <NxKpi icone={<IconeTabler nome="checklist" tamanho={16} />} rotulo="Em andamento" valor={emAndamento} />
          </div>
        )}
        <NxRecolhido titulo="Como funciona" resumo="O que o agente lê e quem executa">
          <p className="nxa-texto">Pacotes e programas de cuidado, captação, anúncios, conteúdo, reativação, retorno, abordagens de atendimento e parcerias. Cada ideia cita o dado e o item do Brain que a sustentam. Sem preço, desconto ou promessa de resultado (CFM); quem executa é a equipe.</p>
        </NxRecolhido>
        {andamento && <p className="nxa-nota" aria-live="polite">{andamento}</p>}
        {erro && <p className="nxa-erro" role="alert">{erro}</p>}
        {q.isLoading ? <NxCarregando /> : q.isError ? <NxErro texto="Não foi possível carregar as estratégias." onTentar={() => void q.refetch()} /> : visiveis.length === 0 ? (
          todas.length
            ? <NxVazio titulo="Nenhuma estratégia aberta" falta="todas as estratégias foram concluídas ou descartadas" passo="peça novas estratégias à equipe Doctor Creator" quem="equipe_hub" />
            : <NxVazio titulo="Ainda sem estratégias" falta={isAdmin ? "o agente ainda não gerou estratégias; ele lê o Brand Brain aprovado, as conversas, o CRM, o Instagram e os anúncios" : "a equipe Doctor Creator ainda não gerou estratégias para esta clínica"} passo={isAdmin ? "use Gerar estratégias" : "peça à equipe Doctor Creator para gerar as primeiras"} quem="equipe_hub" />
        ) : (
          <div className="nxa-grade">
            {visiveis.map((i) => <CartaoEstrategia key={i.id} i={i} podeEditar={podeEditar} onEstado={(e, r) => decidir(i.id, e, r)} />)}
          </div>
        )}
        {escondidas > 0 && <button type="button" className="nxa-link" onClick={() => setVerTodas(!verTodas)}>{verTodas ? "Esconder concluídas e descartadas" : `Ver ${escondidas} concluída${escondidas === 1 ? "" : "s"} ou descartada${escondidas === 1 ? "" : "s"}`}</button>}
      </div>
    </NxCard>
  );
}
