import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { IconeTabler } from "@/components/icons/tabler";
import { rodarFluxoAteFim } from "@/lib/agentes-data";
import { BotaoCopiar } from "@/components/botao-copiar";
import { ESTADOS_IDEIA, TIPOS_IDEIA, type EstadoIdeia, type IdeiaCampanha } from "@/lib/campanhas-ia";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";
import type { Ideia as IdeiaDeConteudo } from "@/lib/hub-conteudo";
import { publicationUrl } from "@/lib/creative-intelligence/discovery";
import {
  contarStatus,
  ideiaParaPauta,
  montarSemana,
  proximoDiaLivre,
  roteiroCompleto,
  semanaEmTexto,
  seteDias,
  ROTULO_FORMATO,
  ROTULO_OBJETIVO_PAUTA,
  ROTULO_ORIGEM,
  ROTULO_STATUS,
  STATUS,
  type FormatoPauta,
  type NovaPauta,
  type ObjetivoPauta,
  type Pauta,
  type StatusPauta,
} from "@/lib/pauta";
// Só o tipo do hook do planejador (permitido); o desenho do planejador congelado do SAP não entra aqui.
import type { usePautas } from "@/components/planejador-conteudo";
import { NxCard, NxKpi, NxTag, type NxTom } from "./base";
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

// ---------------------------------------------------------------- Planejador da semana e ações da ideia

type Api = ReturnType<typeof usePautas>;

const hojeBr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const TOM_STATUS: Record<StatusPauta, NxTom> = { nova: "g", escolhida: "b", produzida: "b", publicada: "up", medida: "up" };

/** Botões de cada ideia: transformar em pauta, gerar roteiro e adicionar ao plano da semana. */
export function NxAcoesDaIdeia({ ideia, clientId, api, podeEditar }: { ideia: IdeiaDeConteudo; clientId: string; api: Api; podeEditar: boolean }) {
  const [roteiro, setRoteiro] = useState(false);
  const pautas = api.q.data?.pautas ?? [];
  const existente = pautas.find((p) => p.ideia_id === ideia.id);
  const base = ideiaParaPauta(ideia, clientId);
  const texto = roteiroCompleto(existente ?? base);
  const ocupado = api.criar.isPending || api.atualizar.isPending;
  const semTabela = api.q.data?.semTabela;

  function paraSemana() {
    const dia = proximoDiaLivre(pautas, hojeBr());
    if (existente) api.atualizar.mutate({ id: existente.id, campos: { dia, status: existente.status === "nova" ? "escolhida" : existente.status } });
    else api.criar.mutate({ ...base, dia });
  }

  return (
    <div className="nxa-ideia-acoes" data-peca="agentes">
      <div className="nxa-ideia-acoes__botoes">
        {existente ? (
          <NxTag tom={TOM_STATUS[existente.status]} icone={<IconeTabler nome="checklist" tamanho={14} />}>
            Pauta: {ROTULO_STATUS[existente.status].toLowerCase()}
            {existente.dia ? ` · ${existente.dia.slice(8, 10)}/${existente.dia.slice(5, 7)}` : ""}
          </NxTag>
        ) : (
          podeEditar && !semTabela && (
            <button type="button" className="nxa-botao" disabled={ocupado} onClick={() => api.criar.mutate(base)}>
              <IconeTabler nome="checklist" tamanho={18} /> Transformar em pauta
            </button>
          )
        )}
        <button type="button" className="nxa-botao" aria-expanded={roteiro} onClick={() => setRoteiro(!roteiro)}>
          <IconeTabler nome="file-text" tamanho={18} /> {roteiro ? "Esconder roteiro" : "Gerar roteiro"}
        </button>
        {podeEditar && !semTabela && !existente?.dia && (
          <button type="button" className="nxa-botao" disabled={ocupado} onClick={paraSemana}>
            <IconeTabler nome="calendar" tamanho={18} /> Adicionar ao plano da semana
          </button>
        )}
      </div>
      {(api.criar.error || api.atualizar.error) && <p className="nxa-erro" role="alert">{mensagemDeErroAcao(api.criar.error ?? api.atualizar.error)}</p>}
      {roteiro && (
        <div className="nxa-caixa">
          <pre className="nxa-roteiro">{texto}</pre>
          <div className="nxa-item__acoes"><BotaoCopiar texto={texto} rotulo="Copiar roteiro" /></div>
        </div>
      )}
    </div>
  );
}

function Sel<T extends string>({ rotulo, valor, opcoes, onChange, disabled }: { rotulo: string; valor: T; opcoes: { v: T; r: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <select aria-label={rotulo} title={rotulo} value={valor} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} autoComplete="off" className="nxa-campo">
      {opcoes.map((o) => (
        <option key={o.v} value={o.v}>{o.r}</option>
      ))}
    </select>
  );
}

function NxPautaDoDia({ p, dias, api, podeEditar }: { p: Pauta; dias: { data: string; rotulo: string }[]; api: Api; podeEditar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const muda = (campos: Partial<Pauta>) => api.atualizar.mutate({ id: p.id, campos });
  const referencia = publicationUrl(p.origem_texto, "instagram") ?? publicationUrl(p.origem_texto, "tiktok");
  const doRadar = p.ideia_id?.startsWith("radar:") === true;
  const orientacao = doRadar ? [`Pauta: ${p.titulo}`, `Objetivo: ${ROTULO_OBJETIVO_PAUTA[p.objetivo]}`, p.motivo, ...p.roteiro, p.aviso].filter(Boolean).join("\n\n") : roteiroCompleto(p);
  const opDias = [{ v: "", r: "Sem dia" }, ...dias.map((d) => ({ v: d.data, r: d.rotulo })), ...(p.dia && !dias.some((d) => d.data === p.dia) ? [{ v: p.dia, r: `${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}` }] : [])];
  return (
    <li className={`nxa-pauta nxa-pauta--${p.status}`}>
      <p className="nxa-pauta__titulo">{p.titulo}</p>
      <p className="nxa-nota">
        {doRadar ? "Referência do Radar" : ROTULO_ORIGEM[p.origem_tipo]} · objetivo: {ROTULO_OBJETIVO_PAUTA[p.objetivo].toLowerCase()}
      </p>
      <div className="nxa-pauta__selects">
        <Sel rotulo="Status" valor={p.status} disabled={!podeEditar} onChange={(v) => muda({ status: v })} opcoes={STATUS.map((s) => ({ v: s, r: ROTULO_STATUS[s] }))} />
        <Sel rotulo="Dia" valor={(p.dia ?? "") as string} disabled={!podeEditar} onChange={(v) => muda({ dia: v || null })} opcoes={opDias} />
        <Sel rotulo="Formato" valor={p.formato} disabled={!podeEditar} onChange={(v) => muda({ formato: v })} opcoes={(Object.keys(ROTULO_FORMATO) as FormatoPauta[]).map((f) => ({ v: f, r: ROTULO_FORMATO[f] }))} />
        <Sel rotulo="Objetivo previsto" valor={p.objetivo} disabled={!podeEditar} onChange={(v) => muda({ objetivo: v })} opcoes={(Object.keys(ROTULO_OBJETIVO_PAUTA) as ObjetivoPauta[]).map((o) => ({ v: o, r: ROTULO_OBJETIVO_PAUTA[o] }))} />
      </div>
      <div className="nxa-pauta__rodape">
        <button type="button" className="nxa-link" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
          {aberto ? "Fechar" : doRadar ? "Motivo e orientação" : "Motivo e roteiro"}
        </button>
        {podeEditar && (
          <button type="button" aria-label="Remover pauta" title="Remover pauta" className="nxa-botao nxa-botao--discreto" onClick={() => confirm(`Remover a pauta “${p.titulo}”?`) && api.apagar.mutate(p.id)}>
            <IconeTabler nome="x" tamanho={16} />
          </button>
        )}
      </div>
      {aberto && (
        <div className="nxa-secao-corpo">
          {p.motivo && <p className="nxa-texto"><b>Motivo:</b> {p.motivo}</p>}
          {p.origem_texto && <p className="nxa-texto"><b>Originou de:</b> {referencia ? <a className="nxa-link" href={referencia} target="_blank" rel="noopener noreferrer">Conferir referência original</a> : p.origem_texto}</p>}
          <pre className="nxa-caixa nxa-roteiro">{orientacao}</pre>
          <div className="nxa-item__acoes"><BotaoCopiar texto={orientacao} rotulo={doRadar ? "Copiar orientação" : "Copiar roteiro"} /></div>
        </div>
      )}
    </li>
  );
}

function NxNovaPauta({ clientId, api }: { clientId: string; api: Api }) {
  const [titulo, setTitulo] = useState("");
  const [formato, setFormato] = useState<FormatoPauta>("reels");
  const [objetivo, setObjetivo] = useState<ObjetivoPauta>("alcance");
  return (
    <form
      className="nxa-nova-pauta"
      onSubmit={(e) => {
        e.preventDefault();
        if (!titulo.trim()) return;
        const nova: NovaPauta = { client_id: clientId, ideia_id: null, titulo: titulo.trim(), formato, objetivo, status: "nova", motivo: null, origem_tipo: "manual", origem_texto: null, gancho: null, roteiro: [], cta: null, aviso: null, dia: null, post_id: null };
        api.criar.mutate(nova, { onSuccess: () => setTitulo("") });
      }}
    >
      <label className="nxa-etiqueta nxa-etiqueta--cresce">
        Nova pauta (à mão)
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoComplete="off" placeholder="Ex.: 3 sinais de que a pele precisa de avaliação" className="nxa-campo" />
      </label>
      <Sel rotulo="Formato" valor={formato} onChange={setFormato} opcoes={(Object.keys(ROTULO_FORMATO) as FormatoPauta[]).map((f) => ({ v: f, r: ROTULO_FORMATO[f] }))} />
      <Sel rotulo="Objetivo previsto" valor={objetivo} onChange={setObjetivo} opcoes={(Object.keys(ROTULO_OBJETIVO_PAUTA) as ObjetivoPauta[]).map((o) => ({ v: o, r: ROTULO_OBJETIVO_PAUTA[o] }))} />
      <button type="submit" className="nxa-botao nxa-botao--primario" disabled={api.criar.isPending || !titulo.trim()}>
        <IconeTabler nome="checklist" tamanho={18} /> Adicionar
      </button>
    </form>
  );
}

/** Plano da semana editável: 7 dias, pautas sem dia, filtros por status e contagem por formato. */
export function NxPlanejadorSemana({ clientId, api, podeEditar }: { clientId: string; api: Api; podeEditar: boolean }) {
  const [filtro, setFiltro] = useState<StatusPauta | "todas">("todas");
  const hoje = hojeBr();
  const dias = useMemo(() => seteDias(hoje), [hoje]);
  const todas = api.q.data?.pautas ?? [];
  const pautas = filtro === "todas" ? todas : todas.filter((p) => p.status === filtro);
  const semana = montarSemana(pautas, hoje);
  const cont = contarStatus(todas);
  const naSemana = semana.dias.reduce((soma, d) => soma + d.pautas.length, 0);

  return (
    <NxCard
      nivel={2}
      rotulo="Planejador da semana"
      titulo="Planejador da semana"
      subtitulo={<>Pautas salvas a partir das ideias (ou criadas à mão). Mude o dia, o formato, o objetivo e o status em cada cartão.{!podeEditar && " Seu acesso é de leitura: só a equipe responsável altera."}</>}
      icone={<IconeTabler nome="calendar" tamanho={18} />}
      acao={todas.length > 0 ? <BotaoCopiar texto={semanaEmTexto(todas, hoje)} rotulo="Copiar plano da semana" /> : undefined}
    >
      <div data-peca="agentes" className="nxa-secao-corpo">
        {api.q.isLoading && <NxCarregando texto="Lendo as pautas…" linhas={2} />}
        {api.q.error && <NxErro texto="Não consegui ler as pautas agora. Atualize a página." onTentar={() => void api.q.refetch()} />}
        {api.q.data?.semTabela && <NxVazio titulo="Planejador ainda não ativado" falta="o planejador ainda não foi ativado neste banco" passo="peça à equipe Doctor Creator para ativar o planejador" quem="equipe_hub" />}

        {api.q.data && !api.q.data.semTabela && (
          <>
            <div className="nxa-kpis">
              <NxKpi icone={<IconeTabler nome="checklist" tamanho={16} />} rotulo="Pautas no plano" valor={todas.length} />
              <NxKpi icone={<IconeTabler nome="calendar" tamanho={16} />} rotulo="Nesta semana" valor={naSemana} nota={semana.formatos.map((f) => `${f.n} ${ROTULO_FORMATO[f.formato].toLowerCase()}`).join(" · ")} />
              <NxKpi icone={<IconeTabler nome="inbox" tamanho={16} />} rotulo="Sem dia" valor={semana.semDia.length} />
            </div>
            <div className="nxa-chips">
              {(["todas", ...STATUS] as const).map((s) => (
                <button key={s} type="button" className="nxa-chip" aria-pressed={filtro === s} onClick={() => setFiltro(s)}>
                  {s === "todas" ? `Todas (${todas.length})` : `${ROTULO_STATUS[s]} (${cont[s]})`}
                </button>
              ))}
            </div>

            {todas.length === 0 ? (
              <NxVazio titulo="Nenhuma pauta ainda" falta={`nenhuma pauta salva; leve um conteúdo de “Revisar roteiros” ao planejador ou escolha uma sugestão em “Encontrar ideias”${podeEditar ? ", ou crie uma à mão abaixo" : ""}`} passo="leve um roteiro ao planejador" quem="social_media" />
            ) : (
              <div className="nxa-semana">
                {semana.dias.map((d) => (
                  <div key={d.data} className={`nxa-dia${d.data === hoje ? " nxa-dia--hoje" : ""}`}>
                    <h3 className="nxa-dia__titulo">{d.rotulo}{d.data === hoje ? " (hoje)" : ""}</h3>
                    {d.pautas.length ? (
                      <ul className="nxa-pautas">{d.pautas.map((p) => <NxPautaDoDia key={p.id} p={p} dias={dias} api={api} podeEditar={podeEditar} />)}</ul>
                    ) : (
                      <p className="nxa-nota">Livre</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {semana.semDia.length > 0 && (
              <div className="nxa-sem-dia">
                <h3>Sem dia ({semana.semDia.length})</h3>
                <ul className="nxa-pautas nxa-grade">{semana.semDia.map((p) => <NxPautaDoDia key={p.id} p={p} dias={dias} api={api} podeEditar={podeEditar} />)}</ul>
              </div>
            )}
            {semana.foraDaSemana.length > 0 && (
              <NxRecolhido titulo={`Fora desta semana (${semana.foraDaSemana.length})`}>
                <ul className="nxa-pautas nxa-grade">{semana.foraDaSemana.map((p) => <NxPautaDoDia key={p.id} p={p} dias={dias} api={api} podeEditar={podeEditar} />)}</ul>
              </NxRecolhido>
            )}
            {(api.atualizar.error || api.apagar.error) && <p className="nxa-erro" role="alert">{mensagemDeErroAcao(api.atualizar.error ?? api.apagar.error)}</p>}
            {podeEditar && <NxNovaPauta clientId={clientId} api={api} />}
          </>
        )}
      </div>
    </NxCard>
  );
}
