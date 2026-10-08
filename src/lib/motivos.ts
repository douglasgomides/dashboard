// Por que uma fonte está parada, em linguagem de gente, e DE QUEM é a ação.
// Hoje "Anúncios até 04/09" parece falha de sincronização; muitas vezes é pagamento, campanha desligada
// ou acesso revogado do lado do cliente. Este arquivo transforma o que sabemos em uma frase honesta.
import { diasDeAtraso, type LinhaFonte } from "@/lib/saude-fontes";

export type Dono = "cliente" | "meta" | "origem" | "nos";
export type Motivo = { texto: string; dono: Dono };

export const ROTULO_DONO: Record<Dono, string> = {
  cliente: "Do lado do cliente",
  meta: "Instabilidade da Meta",
  origem: "Sem dado novo na origem",
  nos: "Falha nossa",
};

// Cores por dono: só "Falha nossa" é vermelho de verdade; o resto não é culpa do sync.
export const COR_DONO: Record<Dono, string> = {
  cliente: "var(--warn)",
  meta: "var(--s1)",
  origem: "var(--muted)",
  nos: "var(--crit)",
};

const NOME_FONTE: Record<string, string> = { instagram: "Instagram", anuncios: "anúncios", crm: "CRM", atendimento: "WhatsApp", comentarios: "comentários" };

// Traduz o texto de erro bruto da última tentativa.
export function motivoDoErro(fonte: string, erro: string): Motivo | null {
  const e = erro.toLowerCase();
  const nome = NOME_FONTE[fonte] ?? fonte;
  if (/api access blocked|"code":\s*200|"code":\s*190|oauthexception.*(token|session|expired|permission)|access token|session has expired|invalid oauth|error validating/.test(e)) {
    return { texto: `A Meta bloqueou ou venceu o acesso do dashboard ao ${nome} desta conta. O dono da conta precisa autorizar de novo (novo acesso no Business Manager).`, dono: "cliente" };
  }
  if (/service temporarily unavailable|unknown error|"code":\s*(1|2)\b|responded 5\d\d|respondeu 5\d\d|\b50[0-4]\b|bad gateway|timed? ?out|timeout/.test(e) && !/conteudo-ia/.test(e)) {
    return { texto: `A Meta está instável e não entregou os dados de ${nome}. Tentamos de novo na próxima atualização.`, dono: "meta" };
  }
  if (/conteudo-ia/.test(e)) {
    return { texto: "A classificação por IA demorou além do tempo. Os dados de postagem estão em dia; a classificação continua na próxima atualização.", dono: "nos" };
  }
  return null;
}

// Motivo final de uma linha: o que o sync descobriu na origem (motivo gravado) > tradução do erro >
// "sync roda sem erro, mas a origem não tem dado novo" > falha nossa sem causa conhecida.
export function motivoDaLinha(l: LinhaFonte | undefined): Motivo | null {
  if (!l) return null;
  if (l.motivo) return { texto: l.motivo, dono: (l.motivo_dono as Dono) || "cliente" };
  if (l.last_error) {
    const m = motivoDoErro(l.fonte, l.last_error);
    if (m) return m;
    return { texto: `Erro técnico na última atualização: ${l.last_error.replace(/\s+/g, " ").slice(0, 140)}`, dono: "nos" };
  }
  if (l.data_ate && diasDeAtraso(l.data_ate) > 3) {
    const rodouOk = !!l.last_success_at && diasDeAtraso(l.last_success_at.slice(0, 10)) <= 1;
    if (rodouOk || !l.last_attempt_at) {
      const por =
        l.fonte === "anuncios"
          ? "campanha pausada, sem verba ou pagamento pendente"
          : l.fonte === "crm"
            ? "nenhum lead novo entrou no CRM, ou o CRM é lançado à mão"
            : "nenhuma atividade nova na origem";
      return { texto: `A atualização roda sem erro, mas a origem não tem dado novo (provável: ${por}).`, dono: "origem" };
    }
  }
  return null;
}
