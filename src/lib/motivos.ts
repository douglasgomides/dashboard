// Por que uma fonte está parada, em linguagem de gente, e DE QUEM é a ação.
// Hoje "Anúncios até 04/09" parece falha de sincronização; muitas vezes é pagamento, campanha desligada
// ou acesso revogado do lado do cliente. Este arquivo transforma o que sabemos em uma frase honesta.
import { atrasoDaFonte, diasDeAtraso, type LinhaFonte } from "@/lib/saude-fontes";
import { statusDaFonte, type StatusFonte } from "@/lib/status-fonte";

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Anúncios lançados à mão na planilha: sem tentativa automática e sem motivo gravado (mesma regra de ehPlanilha). */
function ehPlanilhaDeAnuncios(l: LinhaFonte): boolean {
  return l.fonte === "anuncios" && !l.last_attempt_at && !l.motivo && !!l.data_ate;
}

export type Dono = "cliente" | "meta" | "origem" | "nos" | "manual";
export type Motivo = { texto: string; dono: Dono };

export const ROTULO_DONO: Record<Dono, string> = {
  cliente: "Do lado do cliente",
  meta: "Instabilidade da Meta",
  origem: "Sem dado novo na origem",
  nos: "Falha nossa",
  manual: "Planilha manual",
};

// Cores por dono: só "Falha nossa" é vermelho de verdade; o resto não é culpa do sync.
export const COR_DONO: Record<Dono, string> = {
  cliente: "var(--warn)",
  meta: "var(--s1)",
  origem: "var(--muted)",
  nos: "var(--crit)",
  manual: "var(--muted)",
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
  if (l.last_error) {
    const traduzido = motivoDoErro(l.fonte, l.last_error);
    return traduzido ?? { texto: `Erro técnico na última atualização: ${l.last_error.replace(/\s+/g, " ").slice(0, 140)}`, dono: "nos" };
  }
  if (l.motivo) return { texto: l.motivo, dono: (l.motivo_dono as Dono) || "cliente" };
  // Planilha não tem atualização automática: dizer "a atualização roda sem erro" seria falso (auditoria 01/11/2026).
  if (ehPlanilhaDeAnuncios(l) && atrasoDaFonte(l) > 3)
    return { texto: `Planilha lançada à mão: último lançamento em ${dataBr(l.data_ate!)}. O dado novo depende de a equipe lançar a planilha.`, dono: "manual" };
  if (l.data_ate && atrasoDaFonte(l) > 3) {
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

/** Status da fonte (regra única de status-fonte.ts) com o motivo em linguagem de gente. */
export function statusDaLinha(l: LinhaFonte | undefined, cadastro: boolean, naoUsa = false): StatusFonte {
  const m = motivoDaLinha(l);
  return statusDaFonte({ fonte: l?.fonte ?? null, ultimo_sucesso: l?.last_success_at ?? null, cadastro, data_ate: l?.data_ate ?? null, last_error: l?.last_error ?? null, motivo: m?.texto ?? null, motivo_dono: l?.motivo_dono ?? null, naoUsa });
}
