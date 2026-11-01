// Mensagem de erro para o cliente: nunca o texto técnico do banco ("canceling statement due to statement timeout",
// "permission denied for function ..."). Mensagens nossas, já em português (as RPCs levantam "sem acesso a esta
// clínica", "período inválido"; as telas de cadastro validam em português), passam como estão. O texto técnico vai
// para o console, para quem depura.

type ErroLike = { message?: unknown; code?: unknown } | null | undefined;

const TECNICO =
  /(statement timeout|canceling statement|permission denied|violates|duplicate key|syntax error|relation .* does not exist|function .* does not exist|could not|failed to fetch|networkerror|load failed|fetch failed|jwt|pgrst|unexpected token|internal server error|timeout|econn|\b[45]\d\d\b)/i;

function textoDe(e: unknown): { msg: string; code: string } {
  const x = e as ErroLike;
  const msg = typeof x?.message === "string" ? x.message : typeof e === "string" ? e : "";
  const code = typeof x?.code === "string" ? x.code : "";
  return { msg, code };
}

/**
 * @param oQue o que estava sendo carregado, com artigo ("o funil", "as pessoas", "a conversa"). Sem ele, uma frase geral.
 */
export function mensagemDeErro(e: unknown, oQue?: string): string {
  const { msg, code } = textoDe(e);
  const alvo = oQue ? `carregar ${oQue}` : "concluir agora";
  const fim = " Isso não quer dizer que o número é zero. Tente de novo em instantes.";
  if (/statement timeout|canceling statement|timed? ?out|\b57014\b/i.test(msg) || code === "57014")
    return `Não deu para ${alvo} agora: a consulta demorou demais.${fim}`;
  if (code === "42501" || /permission denied|sem acesso/i.test(msg))
    return /sem acesso/i.test(msg) && !TECNICO.test(msg) ? msg : `Não deu para ${alvo}: este acesso está sem permissão para ver esse dado. Fale com a equipe Doctor Creator.`;
  if (/failed to fetch|networkerror|load failed|fetch failed|econn/i.test(msg))
    return `Não deu para ${alvo}: a conexão com o servidor falhou.${fim}`;
  if (msg && !TECNICO.test(msg) && /[áàâãéêíóôõúç]|\b(não|sem|já|para|com)\b/i.test(msg)) return msg;
  if (msg && typeof console !== "undefined") console.warn("[erro técnico]", msg);
  return `Não deu para ${alvo} por um erro técnico do nosso lado.${fim}`;
}

/**
 * Mensagem de erro para quando a pessoa fez uma ação (salvar, gerar, enviar, conferir), não para leitura de número.
 * Mesmas regras de mensagemDeErro: mensagem nossa em português passa como está; texto técnico vira frase simples e
 * vai para o console.
 */
export function mensagemDeErroAcao(e: unknown, acao = "concluir"): string {
  const { msg, code } = textoDe(e);
  const fim = " Tente de novo em instantes.";
  if (/statement timeout|canceling statement|timed? ?out|\b57014\b/i.test(msg) || code === "57014")
    return `Não deu para ${acao} agora: o servidor demorou demais.${fim}`;
  if (code === "42501" || /permission denied|sem acesso|row-level security/i.test(msg))
    return /sem acesso/i.test(msg) && !TECNICO.test(msg) ? msg : `Não deu para ${acao}: este acesso está sem permissão para isso. Fale com a equipe Doctor Creator.`;
  if (/failed to fetch|networkerror|load failed|fetch failed|econn/i.test(msg))
    return `Não deu para ${acao}: a conexão com o servidor falhou.${fim}`;
  if (msg && !TECNICO.test(msg) && /[áàâãéêíóôõúç]|\b(não|sem|já|para|com)\b/i.test(msg)) return msg;
  if (msg && typeof console !== "undefined") console.warn("[erro técnico]", msg);
  return `Não deu para ${acao} por um erro técnico do nosso lado.${fim}`;
}
