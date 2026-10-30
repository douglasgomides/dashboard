// Leitura em uma frase do comparativo da conta de anúncios (este período × o anterior).
//
// Auditoria de 30/10/2026: a Doctor Creator gastou +23% em outubro e teve -78% de conversas, e a frase mandava "ver
// criativos cansados e público". A causa foi outra: em setembro a verba ia para tráfego (que gera conversa por acaso),
// em outubro foi para cadastro (74 leads de formulário). Aqui:
//   - o resultado comparado é o contato gerado (conversa + cadastro), não só a conversa;
//   - quando a divisão da verba entre objetivos muda mais de 30 pontos, a frase diz isso antes de qualquer
//     hipótese sobre o anúncio.
import { GRUPOS, grupoDoObjetivo, type CampanhaCadastro, type Grupo, type LinhaAds } from "@/lib/anuncios-objetivo";

export const MUDANCA_OBJETIVO_PP = 0.3; // 30 pontos percentuais da verba

export interface LadoComparativo {
  gasto: number;
  conversas: number;
  leads: number;
  gastoPorGrupo: Partial<Record<Grupo, number>>;
}

/** Soma um período a partir das linhas diárias e do cadastro das campanhas (mesma regra de grupo da tela). */
export function resumirLado(linhas: LinhaAds[], cadastro: CampanhaCadastro[]): LadoComparativo {
  const obj = new Map(cadastro.map((c) => [c.campaign_id, c.objective]));
  const porCampanha = new Map<string, { g: number; cv: number; ld: number; lc: number }>();
  for (const l of linhas) {
    const a = porCampanha.get(l.campaign_id) ?? { g: 0, cv: 0, ld: 0, lc: 0 };
    a.g += Number(l.spend) || 0;
    a.cv += Number(l.conversations) || 0;
    a.ld += Number(l.leads) || 0;
    a.lc += Number(l.link_clicks) || 0;
    porCampanha.set(l.campaign_id, a);
  }
  const lado: LadoComparativo = { gasto: 0, conversas: 0, leads: 0, gastoPorGrupo: {} };
  for (const [id, a] of porCampanha) {
    const g = grupoDoObjetivo(obj.get(id), a.cv, a.lc);
    lado.gasto += a.g;
    lado.conversas += a.cv;
    lado.leads += a.ld;
    lado.gastoPorGrupo[g] = (lado.gastoPorGrupo[g] ?? 0) + a.g;
  }
  return lado;
}

export interface FatiaObjetivo {
  grupo: Grupo;
  antes: number; // fatia da verba no período anterior (0 a 1)
  agora: number;
}

export interface MudancaObjetivo {
  saiu: FatiaObjetivo | null;
  entrou: FatiaObjetivo | null;
}

/** A divisão da verba entre objetivos mudou mais de 30 pontos em algum grupo? */
export function mudancaDeObjetivo(atual: LadoComparativo, anterior: LadoComparativo): MudancaObjetivo | null {
  if (atual.gasto <= 0 || anterior.gasto <= 0) return null;
  const grupos = new Set([...Object.keys(atual.gastoPorGrupo), ...Object.keys(anterior.gastoPorGrupo)] as Grupo[]);
  const fatias: FatiaObjetivo[] = [...grupos].map((g) => ({
    grupo: g,
    antes: (anterior.gastoPorGrupo[g] ?? 0) / anterior.gasto,
    agora: (atual.gastoPorGrupo[g] ?? 0) / atual.gasto,
  }));
  const maior = Math.max(0, ...fatias.map((f) => Math.abs(f.agora - f.antes)));
  if (maior <= MUDANCA_OBJETIVO_PP) return null;
  const ordenadas = [...fatias].sort((a, b) => a.agora - a.antes - (b.agora - b.antes));
  const primeiro = ordenadas[0];
  const ultimo = ordenadas[ordenadas.length - 1];
  return { saiu: primeiro.agora < primeiro.antes ? primeiro : null, entrou: ultimo.agora > ultimo.antes ? ultimo : null };
}

const pc = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
const fatia = (v: number) => `${Math.round(v * 100)}%`;
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");

function variacao(atual: number, ant: number): number | null {
  if (ant === 0) return null;
  return atual / ant - 1;
}

/** A frase que abre o comparativo. `anterior` null = sem dado do período anterior. */
export function leituraComparativo(atual: LadoComparativo, anterior: LadoComparativo | null): string {
  if (!anterior || anterior.gasto <= 0) return "Sem gasto no período anterior para comparar.";
  const comCadastro = atual.leads > 0 || anterior.leads > 0;
  const rotulo = comCadastro ? "os contatos (conversas e cadastros)" : "as conversas";
  const contatosAt = atual.conversas + atual.leads;
  const contatosAn = anterior.conversas + anterior.leads;
  const mix = mudancaDeObjetivo(atual, anterior);
  if (mix) {
    const partes: string[] = [];
    if (mix.saiu) partes.push(`${GRUPOS[mix.saiu.grupo].nome} caiu de ${fatia(mix.saiu.antes)} para ${fatia(mix.saiu.agora)} do investimento`);
    if (mix.entrou) partes.push(`${GRUPOS[mix.entrou.grupo].nome} subiu de ${fatia(mix.entrou.antes)} para ${fatia(mix.entrou.agora)}`);
    return (
      `A verba mudou de objetivo: ${partes.join(" e ")}. ` +
      "Por isso a diferença de resultado entre os dois períodos mostra a troca de objetivo, não a qualidade do anúncio. " +
      `${comCadastro ? "Contatos (conversas e cadastros)" : "Conversas"}: ${int(contatosAn)} antes e ${int(contatosAt)} agora.`
    );
  }
  const vg = variacao(atual.gasto, anterior.gasto);
  const vc = variacao(contatosAt, contatosAn);
  if (vg == null || vc == null) return `Sem ${comCadastro ? "contatos" : "conversas"} no período anterior para comparar.`;
  if (vg > 0.1 && vc < vg - 0.1)
    return `O investimento subiu ${pc(vg)} e ${rotulo} ${vc >= 0 ? `só ${pc(vc)}` : `caíram ${pc(vc)}`}, com a mesma divisão entre objetivos: o dinheiro a mais rendeu menos. Vale ver se o criativo cansou ou se o público ficou caro.`;
  if (vg < -0.1 && vc > vg + 0.1) return `O investimento caiu ${pc(vg)} e ${rotulo} ${vc >= 0 ? `subiram ${pc(vc)}` : `caíram só ${pc(vc)}`}: a conta ficou mais eficiente.`;
  if (Math.abs(vg) <= 0.1 && vc < -0.15) return `Mesmo investimento (${pc(vg)}) e ${pc(vc)} n${comCadastro ? "os contatos" : "as conversas"}, com a mesma divisão entre objetivos: algo piorou no anúncio ou no público.`;
  return `Investimento ${pc(vg)} e ${rotulo} ${pc(vc)} em relação ao período anterior.`;
}
