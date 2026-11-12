// Urgência da Carteira (/admin), Phase 03.1.1.1 (D-07): quem precisa de você hoje, por quê e quem resolve cada problema.
// Módulo puro (sem React, banco ou rede). A urgência é o NÚMERO DE PROBLEMAS ABERTOS, nunca o desempenho: nada aqui ordena,
// compara ou dá posição a uma clínica pelo resultado dela (D-02). A nota que aparece é a SAÚDE DOS DADOS (nota das fontes).
import { FONTES, NOME_FONTE, type FonteId } from "@/lib/status-fonte";
import type { FaixaNota } from "@/lib/nota-fontes";
import { DIAS_SEM_ENTRAR } from "@/lib/carteira-alertas";
import { checarFraseCinco, type Descoberta, type VereditoDaTela, type Veredito } from "@/lib/leitura/cinco-segundos";
import type { BarraDoFato } from "@/lib/leitura/tipos";

export type QuemResolveCarteira = "Cliente" | "Equipe" | "Meta" | "Só acompanhar";
/** Os mesmos tons do chip da equipe (AdmTom). */
export type TomDoAlerta = "ok" | "atencao" | "critico" | "neutro" | "marca";

export interface AlertaDaCarteira {
  chave: string;
  tom: TomDoAlerta;
  texto: string;
  titulo: string;
  quem: QuemResolveCarteira;
  /** O item leva para a seção de acesso da clínica. */
  acesso?: boolean;
}

/** O pedaço da saúde de uma fonte que o alerta lê (SaudeFonte do source-health.tsx tem estes campos). */
export interface SaudeParaAlerta {
  status: { cor: string; rotulo: string; data: string | null; detalhe: string };
  causa: string | null;
}

/** O pedaço de ProblemaFonte (saude-problemas.ts) que diz quem resolve. */
export interface ProblemaParaAlerta {
  id: string;
  clientId: string;
  fonte: string;
  quem: "equipe" | "cliente" | "meta" | "ninguem";
}

export interface ProblemaDadoParaAlerta {
  severidade: "alta" | "media" | "baixa";
  titulo: string;
}

const QUEM_DO_PROBLEMA: Record<ProblemaParaAlerta["quem"], QuemResolveCarteira> = { equipe: "Equipe", cliente: "Cliente", meta: "Meta", ninguem: "Só acompanhar" };
const PESO_TOM: Record<TomDoAlerta, number> = { critico: 3, atencao: 2, neutro: 1, ok: 0, marca: 0 };

const tomDaCor = (cor: string): TomDoAlerta => (cor === "verde" ? "ok" : cor === "amarelo" ? "atencao" : cor === "vermelho" ? "critico" : "neutro");

/**
 * Os alertas de uma clínica: os mesmos que o chip "N alertas" da linha mostra (fonte amarela ou vermelha, dado com erro, sem acesso,
 * não entra), agora cada um com QUEM RESOLVE. Fonte: a do problema da mesma fonte (o do sync primeiro); sem problema achado, fonte
 * vermelha é da Equipe e amarela é só acompanhar. Ordem: o tom pior primeiro (estável).
 */
export function alertasDaClinica(x: {
  saude: Record<FonteId, SaudeParaAlerta> | null | undefined;
  problemas: readonly ProblemaParaAlerta[];
  qualidade: readonly ProblemaDadoParaAlerta[] | undefined;
  fatoAcesso: { fato: string; dias: number | null };
  ultimoAcesso: string | null;
}): AlertaDaCarteira[] {
  const alertas: AlertaDaCarteira[] = [];
  if (x.saude) {
    for (const f of FONTES) {
      const s = x.saude[f];
      if (s.status.cor !== "vermelho" && s.status.cor !== "amarelo") continue;
      const daFonte = x.problemas.filter((p) => p.fonte === f);
      const problema = daFonte.find((p) => !p.id.includes(":q:")) ?? daFonte[0];
      const quem: QuemResolveCarteira = problema ? QUEM_DO_PROBLEMA[problema.quem] : s.status.cor === "vermelho" ? "Equipe" : "Só acompanhar";
      alertas.push({
        chave: f,
        tom: tomDaCor(s.status.cor),
        texto: `${NOME_FONTE[f]}: ${s.status.rotulo.toLowerCase()}`,
        titulo: `${s.status.data ? s.status.detalhe : "sem dado gravado"}${s.causa ? ` · ${s.causa}` : ""}`,
        quem,
      });
    }
  }
  if (x.qualidade?.length) {
    const altas = x.qualidade.filter((p) => p.severidade === "alta").length;
    alertas.push({
      chave: "dado",
      tom: altas ? "critico" : "atencao",
      texto: `${x.qualidade.length} ${x.qualidade.length === 1 ? "dado com erro" : "dados com erro"}${altas ? ` · ${altas} afeta${altas === 1 ? "" : "m"} a leitura` : ""}`,
      titulo: x.qualidade.map((p) => p.titulo).join("\n"),
      quem: "Equipe",
    });
  }
  if (x.fatoAcesso.fato === "sem_acesso") {
    alertas.push({ chave: "acesso", tom: "neutro", texto: "Sem acesso criado · dar acesso", titulo: "A equipe ainda não criou o acesso de ninguém da clínica.", quem: "Equipe", acesso: true });
  }
  if (x.fatoAcesso.fato === "nao_entra") {
    alertas.push({
      chave: "acesso",
      tom: "atencao",
      texto: `Não entra há ${x.fatoAcesso.dias} dias`,
      titulo: x.ultimoAcesso ? `Último acesso de alguém da clínica: ${x.ultimoAcesso}` : "Acesso criado e nunca usado",
      quem: "Cliente",
      acesso: true,
    });
  }
  return alertas
    .map((a, i) => ({ a, i }))
    .sort((p, q) => PESO_TOM[q.a.tom] - PESO_TOM[p.a.tom] || p.i - q.i)
    .map(({ a }) => a);
}

// ---------- ordem por urgência ----------

export interface LinhaDeUrgencia {
  nome: string;
  alertas: readonly unknown[];
  /** Nota das fontes (saúde dos dados), 0 a 100; null = sem nota. */
  nota: number | null;
}

/**
 * Mais problemas abertos primeiro; empate, a nota das fontes mais baixa (sem nota por último); empate, o nome. Nunca olha resultado da
 * clínica: é urgência, não desempenho (D-02).
 */
export function ordenarPorUrgencia<T extends LinhaDeUrgencia>(linhas: readonly T[]): T[] {
  return [...linhas].sort(
    (a, b) => b.alertas.length - a.alertas.length || (a.nota ?? 101) - (b.nota ?? 101) || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

// ---------- faixas de cor pela nota das fontes ----------

export type CorDaClinica = "vermelho" | "amarelo" | "verde" | "sem-nota";
export type FiltroDeCor = "todas" | "vermelho" | "amarelo" | "sem-nota";

/** As faixas que a nota das fontes já tem: ruim é vermelho, atenção é amarelo, boa é verde; sem nota fica de fora. */
export function corDaClinica(faixa: FaixaNota | null | undefined): CorDaClinica {
  return faixa === "ruim" ? "vermelho" : faixa === "atencao" ? "amarelo" : faixa === "boa" ? "verde" : "sem-nota";
}

export function casaFiltroDeCor(filtro: FiltroDeCor, cor: CorDaClinica): boolean {
  return filtro === "todas" || filtro === cor;
}

// ---------- veredito ----------

export interface LinhaDaCarteira extends LinhaDeUrgencia {
  id: string;
  /** Só a clínica que a Carteira cobra (ativa e fora do negócio próprio) entra na conta do veredito e dos números. */
  entra: boolean;
  faixa: FaixaNota | null;
  alertas: readonly AlertaDaCarteira[];
}

const problemasTxt = (n: number) => `${n} ${n === 1 ? "problema aberto" : "problemas abertos"}`;

/** "Comece pela X: N problemas abertos, nota das fontes N." sempre em até 90 caracteres: o nome encurta antes de a frase passar. */
function apoioDaPrimeira(primeira: LinhaDaCarteira): string {
  const resto = `: ${problemasTxt(primeira.alertas.length)}${primeira.nota != null ? `, nota das fontes ${primeira.nota}` : ""}.`;
  const prefixo = "Comece pela ";
  const folga = 90 - prefixo.length - resto.length;
  let nome = primeira.nome.trim();
  if (nome.length > folga) {
    const ate = nome.slice(0, Math.max(1, folga - 1));
    const espaco = ate.lastIndexOf(" ");
    nome = `${(espaco > 0 ? ate.slice(0, espaco) : ate).replace(/[\s,;:—-]+$/, "")}…`;
  }
  return `${prefixo}${nome}${resto}`;
}

/**
 * O veredito da Carteira: quantas clínicas precisam de você hoje (clínica com pelo menos um alerta, a mesma lista do chip "N alertas")
 * e por qual começar (a primeira da urgência). Frases passam em checarFraseCinco: "N clínicas precisam de você" não compara ninguém.
 */
export function vereditoDaCarteira(linhas: readonly LinhaDaCarteira[]): Veredito {
  const dentro = ordenarPorUrgencia(linhas.filter((l) => l.entra));
  if (dentro.length === 0) {
    return {
      tipo: "sem_leitura",
      motivo: "nenhuma clínica ativa na carteira.",
      passo: { frase: "Cadastrar a primeira clínica pelo SAP.", verbo: "conferir", quem: "equipe_hub", rotuloQuem: "Equipe Doctor Creator" },
    };
  }
  const precisam = dentro.filter((l) => l.alertas.length > 0);
  if (precisam.length === 0) {
    const v: VereditoDaTela = {
      tipo: "veredito",
      palavra: "Bom",
      tom: "bom",
      frase: [{ texto: "Nenhuma clínica", enfase: "bom" }, { texto: " com problema aberto hoje" }],
    };
    return v;
  }
  const n = precisam.length;
  const v: VereditoDaTela = {
    tipo: "veredito",
    palavra: "Atenção",
    tom: "atencao",
    frase: [{ texto: `${n} ${n === 1 ? "clínica" : "clínicas"}`, enfase: "numero" }, { texto: n === 1 ? " precisa de você hoje" : " precisam de você hoje" }],
    apoio: apoioDaPrimeira(precisam[0]),
  };
  return v;
}

/** Pronta para o teste: todas as frases do veredito passam na guarda (tamanho, jargão, comparação, promessa). */
export function problemasDeTextoDoVeredito(v: Veredito): string[] {
  if (v.tipo !== "veredito") return [];
  return [...checarFraseCinco(v.frase.map((p) => p.texto).join("")), ...(v.apoio ? checarFraseCinco(v.apoio) : [])];
}

// ---------- os 3 números ----------

export interface NumerosDaCarteira {
  /** Clínicas que a Carteira cobra (as do veredito). */
  total: number;
  problemasAbertos: number;
  porQuem: Record<QuemResolveCarteira, number>;
  /** Clínicas na faixa Ruim da nota das fontes (vermelho). */
  acaoHoje: number;
  comNota: number;
  semNota: number;
  /** Não há histórico da carteira para comparar com a semana passada: a tela diz "Falta dado: sem histórico", nunca um 0%. */
  vsSemanaPassada: null;
}

export function numerosDaCarteira(linhas: readonly LinhaDaCarteira[]): NumerosDaCarteira {
  const dentro = linhas.filter((l) => l.entra);
  const porQuem: Record<QuemResolveCarteira, number> = { Equipe: 0, Cliente: 0, Meta: 0, "Só acompanhar": 0 };
  for (const l of dentro) for (const a of l.alertas) porQuem[a.quem] += 1;
  const comNota = dentro.filter((l) => l.nota != null).length;
  return {
    total: dentro.length,
    problemasAbertos: dentro.reduce((n, l) => n + l.alertas.length, 0),
    porQuem,
    acaoHoje: dentro.filter((l) => l.faixa === "ruim").length,
    comNota,
    semNota: dentro.length - comNota,
    vsSemanaPassada: null,
  };
}

// ---------- descobertas (só urgência) ----------

const ehFonte = (a: AlertaDaCarteira) => (FONTES as string[]).includes(a.chave);
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const razao = (parte: number, todo: number) => (todo > 0 ? Math.max(0, Math.min(1, parte / todo)) : 0);

/**
 * De 0 a 4 descobertas de URGÊNCIA da carteira, em ordem de impacto: fontes paradas, o que a equipe resolve, médico que não entra,
 * clínicas sem nota. Nunca nomeia uma clínica por render melhor ou pior que outras (D-02): só fala de problema aberto e de quem resolve.
 * Toda ação só navega ou abre um lugar da própria tela (`local`); nada é enviado nem gravado (D-04).
 */
export function descobertasDaCarteira(linhas: readonly LinhaDaCarteira[]): Descoberta[] {
  const dentro = linhas.filter((l) => l.entra);
  const n = numerosDaCarteira(linhas);
  const lista: Descoberta[] = [];

  const paradas = dentro.map((l) => l.alertas.filter((a) => ehFonte(a) && a.tom === "critico").length);
  const atrasadas = dentro.map((l) => l.alertas.filter((a) => ehFonte(a) && a.tom === "atencao").length);
  const nParadas = paradas.reduce((x, y) => x + y, 0);
  const nAtrasadas = atrasadas.reduce((x, y) => x + y, 0);
  const clinicasComParada = paradas.filter((x) => x > 0).length;
  if (nParadas > 0) {
    const maior = Math.max(nParadas, nAtrasadas);
    lista.push({
      id: "carteira-fontes-paradas",
      tom: "ruim",
      selo: "Fonte parada",
      frase: `${nParadas} ${plural(nParadas, "fonte parada", "fontes paradas")} ou com erro na carteira`,
      quem: "Equipe",
      impacto: `em ${clinicasComParada} ${plural(clinicasComParada, "clínica", "clínicas")}`,
      acao: { rotulo: "Abrir o diagnóstico das fontes", local: "abrir-diagnostico" },
      porque: {
        titulo: "Fontes com problema agora:",
        barras: [
          { rotulo: "Paradas ou com erro", exibicao: `${nParadas}`, fracao: razao(nParadas, maior) },
          { rotulo: "Atrasadas", exibicao: `${nAtrasadas}`, fracao: razao(nAtrasadas, maior) },
        ],
        obs: "Parada: mais de 3 dias sem dado ou erro na atualização.",
      },
    });
  }

  if (n.problemasAbertos > 0 && n.porQuem.Equipe > 0) {
    const outros = n.porQuem.Meta + n.porQuem["Só acompanhar"];
    lista.push({
      id: "carteira-com-a-equipe",
      tom: "atencao",
      selo: "Com a equipe",
      frase: `A equipe resolve ${n.porQuem.Equipe} dos ${n.problemasAbertos} ${plural(n.problemasAbertos, "problema", "problemas")}`,
      quem: "Equipe",
      impacto: `${n.porQuem.Equipe} de ${n.problemasAbertos} ${plural(n.problemasAbertos, "problema", "problemas")}`,
      acao: { rotulo: "Abrir a primeira clínica", local: "abrir-primeira" },
      porque: {
        titulo: "Problemas abertos por quem resolve:",
        barras: [
          { rotulo: "Equipe", exibicao: `${n.porQuem.Equipe}`, fracao: razao(n.porQuem.Equipe, n.problemasAbertos) },
          { rotulo: "Cliente", exibicao: `${n.porQuem.Cliente}`, fracao: razao(n.porQuem.Cliente, n.problemasAbertos) },
          { rotulo: "Meta e só acompanhar", exibicao: `${outros}`, fracao: razao(outros, n.problemasAbertos) },
        ],
      },
    });
  }

  const naoEntra = dentro.filter((l) => l.alertas.some((a) => a.chave === "acesso" && a.tom === "atencao")).length;
  if (naoEntra > 0) {
    lista.push({
      id: "carteira-medico-nao-entra",
      tom: "atencao",
      selo: "Médico parado",
      frase: `${naoEntra} ${plural(naoEntra, "clínica", "clínicas")}: o médico não entra há mais de ${DIAS_SEM_ENTRAR} dias`,
      quem: "Cliente",
      impacto: `mais de ${DIAS_SEM_ENTRAR} dias`,
      acao: { rotulo: "Ver quem não entra", local: "filtrar-nao-entra" },
      porque: {
        titulo: "Clínicas que cobram contato:",
        barras: [
          { rotulo: "Médico não entra", exibicao: `${naoEntra} de ${n.total}`, fracao: razao(naoEntra, n.total) },
          { rotulo: "Demais clínicas", exibicao: `${n.total - naoEntra}`, fracao: razao(n.total - naoEntra, n.total) },
        ],
        obs: "Conta a última vez que alguém da clínica abriu o painel.",
      },
    });
  }

  if (n.semNota > 0) {
    lista.push({
      id: "carteira-sem-nota",
      tom: "atencao",
      selo: "Para ligar",
      frase: `${n.semNota} ${plural(n.semNota, "clínica ainda sem nota", "clínicas ainda sem nota")}`,
      quem: "Equipe",
      impacto: `${n.semNota} de ${n.total} ${plural(n.total, "clínica", "clínicas")}`,
      acao: { rotulo: "Ver só as sem nota", local: "filtrar-sem-nota" },
      porque: {
        titulo: "A nota das fontes precisa de fonte ligada:",
        barras: [
          { rotulo: "Com nota", exibicao: `${n.comNota} de ${n.total}`, fracao: razao(n.comNota, n.total) },
          { rotulo: "Sem nota", exibicao: `${n.semNota} de ${n.total}`, fracao: razao(n.semNota, n.total) },
        ],
        obs: "Sem fonte ligada, a clínica fica sem nota das fontes.",
      },
    });
  }
  return lista;
}
