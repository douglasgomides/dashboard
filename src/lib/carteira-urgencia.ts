// Urgência da Carteira (/admin), Phase 03.1.1.1 (D-07): quem precisa de você hoje, por quê e quem resolve cada problema.
// Módulo puro (sem React, banco ou rede). A urgência é o NÚMERO DE PROBLEMAS ABERTOS, nunca o desempenho: nada aqui ordena,
// compara ou dá posição a uma clínica pelo resultado dela (D-02). A nota que aparece é a SAÚDE DOS DADOS (nota das fontes).
import { FONTES, NOME_FONTE, type FonteId } from "@/lib/status-fonte";
import type { FaixaNota } from "@/lib/nota-fontes";
import { checarFraseCinco, type VereditoDaTela, type Veredito } from "@/lib/leitura/cinco-segundos";

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
