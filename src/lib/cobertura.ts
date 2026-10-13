// Período pedido x dado disponível, por fonte. Regra: nunca mostrar "90 dias" com menos dado
// sem dizer, na própria tela, de quando a quando há dado e por quê.

export interface CoberturaFonte {
  fonte: "instagram" | "seguidores" | "posts" | "anuncios" | "crm" | "whatsapp" | string;
  rotulo: string;
  diaria: boolean;
  primeiro_geral: string | null;
  ultimo_geral: string | null;
  dias_com_dado: number;
}

export interface AvisoCobertura {
  fonte: string;
  rotulo: string;
  texto: string;
  grave: boolean; // falta mais de 30% do período
  de: string | null; // primeiro dia com dado dentro do período
}

const DIA = 86400000;
const t = (d: string) => new Date(d.slice(0, 10) + "T12:00:00Z").getTime();
const dias = (a: string, b: string) => Math.round((t(b) - t(a)) / DIA) + 1;
export const dm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");

const POR_QUE: Record<string, string> = {
  instagram: "o painel só guardou o histórico diário deste perfil a partir dessa data",
  seguidores: "a Meta só libera “seguidores ganhos por dia” dos últimos 30 dias; o que é mais antigo do que o painel guardou não dá para buscar",
  anuncios: "não há registro de anúncio antes disso (conta ligada depois ou sem campanha rodando)",
  crm: "o CRM só tem leads a partir dessa data",
  whatsapp: "o WhatsApp só foi ligado ao painel nessa data",
  posts: "não há post publicado antes disso",
};

/** Avisos para o período [inicio, fim]. `hoje` limita o fim (período no futuro não conta). */
export function avisosDeCobertura(fs: CoberturaFonte[], inicio: string, fim: string, hoje: string): AvisoCobertura[] {
  const ate = fim > hoje ? hoje : fim;
  const total = dias(inicio, ate);
  const out: AvisoCobertura[] = [];
  for (const f of fs) {
    if (!f.primeiro_geral || !f.ultimo_geral) continue;
    const partes: string[] = [];
    let grave = false;
    const deNoPeriodo = f.primeiro_geral > inicio ? f.primeiro_geral : inicio;
    if (f.diaria) {
      const faltam = total - f.dias_com_dado;
      if (faltam >= 3) {
        grave = faltam / total > 0.3;
        partes.push(`${f.dias_com_dado} de ${total} dias têm dado${f.dias_com_dado ? ` (${dm(deNoPeriodo)} a ${dm(f.ultimo_geral < ate ? f.ultimo_geral : ate)})` : ""}`);
        if (f.primeiro_geral > inicio) partes.push(POR_QUE[f.fonte] ?? "não há dado antes disso");
      }
    } else if (f.primeiro_geral > inicio) {
      const cobertos = dias(f.primeiro_geral, ate);
      if (total - cobertos >= 3) {
        grave = (total - cobertos) / total > 0.3;
        partes.push(`só há dado a partir de ${dm(f.primeiro_geral)} (${Math.max(0, cobertos)} de ${total} dias)`);
        partes.push(POR_QUE[f.fonte] ?? "não há dado antes disso");
      }
    }
    // Parou de atualizar (fora o dia de hoje/ontem, que ainda fecham).
    const atraso = dias(f.ultimo_geral, ate) - 1;
    if (f.ultimo_geral < ate && atraso >= 3 && f.fonte !== "posts" && f.fonte !== "seguidores") {
      grave = true;
      partes.push(`o último dado é de ${dm(f.ultimo_geral)}: a fonte parou de atualizar`);
    }
    if (partes.length) out.push({ fonte: f.fonte, rotulo: f.rotulo, texto: partes.join("; ") + ".", grave, de: f.dias_com_dado || !f.diaria ? deNoPeriodo : null });
  }
  return out;
}

/** Primeiro dia em que o alcance do Instagram está completo dentro do período (para "usar só os dias com dado"). */
export function inicioComDado(fs: CoberturaFonte[], inicio: string): string | null {
  const ig = fs.find((f) => f.fonte === "instagram");
  return ig?.primeiro_geral && ig.primeiro_geral > inicio ? ig.primeiro_geral : null;
}
