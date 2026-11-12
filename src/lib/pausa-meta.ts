// Pausa da Meta por limite de uso: informação, não erro.
//
// Quando a Meta diz que passamos do limite (cabeçalhos de uso acima de 90% ou códigos 4, 17, 32, 613, 80000...), o Nexo
// para de chamar a Meta por alguns minutos (api/_lib/meta-limite.ts) e a próxima rodada tenta de novo. Se o dado da fonte
// continua em dia (anúncios até ontem, por exemplo), isso não é falha de leitura: gravar a pausa em sync_status.last_error
// acendia "Anúncios: erro" e o item "A sincronização de anúncios está falhando" no banco, que derrubava a nota da clínica
// (Douglas Gomides, 12/11/2026, conta de anúncios final 2463 em 202% do limite, dado completo até 11/11).
//
// Regra única, usada pelos escritores de status (api/_lib/sync-status.ts e api/_lib/anuncios-status.ts) e pela tela:
//   pausa da Meta + dado em dia  -> aviso informativo (sync_status.motivo, dono "meta"), sem last_error
//   pausa da Meta + dado velho   -> erro de verdade (last_error), porque a pausa já custou dado
//   qualquer outro erro          -> não muda
//
// Sem dependências (status-fonte.ts importa este arquivo, então ele não pode importar status-fonte.ts): roda no
// navegador e na função do servidor. A régua de "dado em dia" (dadoEmDiaParaPausa) fica em status-fonte.ts.

/** Frase final da mensagem de pausa. Fica aqui para meta-limite.ts (quem escreve) e o detector (quem lê) não se afastarem. */
export const fraseDePausaMeta = (minutos: number): string =>
  `Chamadas pausadas por cerca de ${minutos} min para não prolongar o bloqueio; a próxima rodada tenta de novo.`;

// "Meta: <motivo>. Chamadas pausadas por cerca de N min para não prolongar o bloqueio; a próxima rodada tenta de novo."
// O motivo nunca tem ponto nem ponto e vírgula (ver descreverCodigo e o texto de uso em meta-limite.ts).
const PAUSA = /Meta: [^.;]+\. Chamadas pausadas por cerca de \d+ min para não prolongar o bloqueio; a próxima rodada tenta de novo\./;
const PAUSA_GLOBAL = new RegExp(PAUSA.source, "g");

/**
 * O texto é só pausa da Meta, sem nenhum outro erro junto? Aceita o prefixo da etapa que a gravou ("posts: ",
 * "Conta final 2463: ") e várias pausas seguidas. Qualquer outro erro no mesmo texto devolve false.
 */
export function ehSoPausaMeta(texto: string | null | undefined): boolean {
  const t = String(texto ?? "");
  if (!PAUSA.test(t)) return false;
  const resto = t
    .replace(PAUSA_GLOBAL, " ")
    // rótulo de etapa ("posts:", "Conta final 2463:", "seguidores:") colado antes da mensagem
    .replace(/[^;|:]{0,60}:/g, " ")
    .replace(/[\s;|,]+/g, "");
  return resto.length === 0;
}

/** Entre vários erros da mesma rodada, o que vale gravar: o primeiro que NÃO é pausa; se só há pausa, o primeiro. */
export function primeiroErroReal(erros: readonly string[]): string | undefined {
  return erros.find((e) => !ehSoPausaMeta(e)) ?? erros[0];
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const diasEntreIso = (hoje: string, dia: string) => Math.round((Date.parse(hoje.slice(0, 10)) - Date.parse(dia.slice(0, 10))) / 86_400_000);

/** Texto curto, em linguagem de gente, que vai para sync_status.motivo (dono "meta"). `hoje` é o dia de Brasília (AAAA-MM-DD). */
export function avisoDePausaMeta(dataAte: string | null | undefined, hoje: string): string {
  let ate = "";
  if (dataAte) {
    const d = dataAte.slice(0, 10);
    const dias = diasEntreIso(hoje, d);
    ate = dias === 0 ? "hoje" : dias === 1 ? "ontem" : ddmm(d);
  }
  return `${ate ? `Atualizado até ${ate} · a` : "A"} Meta pediu uma pausa; a próxima rodada tenta de novo.`;
}

/** Reconhece o aviso gravado por avisoDePausaMeta (para limpar só ele quando a rodada volta ao normal). */
export const MARCA_AVISO_PAUSA_META = /a Meta pediu uma pausa; a próxima rodada tenta de novo\./i;

/** O motivo é só aviso de pausa da Meta (e não de outra conta junto, como pagamento ou campanha parada)? */
export function soAvisoDePausaMeta(motivo: string | null | undefined): boolean {
  const m = String(motivo ?? "").trim();
  return m.length > 0 && m.split(" | ").every((parte) => MARCA_AVISO_PAUSA_META.test(parte));
}
