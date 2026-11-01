/**
 * LGPD: o que vai para o provedor de IA (terceiro) leva só o necessário. Telefone, e-mail e CPF do paciente não são
 * necessários para escrever uma resposta, classificar um tema ou resumir uma conversa, então saem trocados por
 * marcadores antes do envio. Usado pelo atendente sombra (histórico, mensagem gatilho, exemplos avaliados) e pela
 * proposta de fatos do atendimento.
 *
 * Ordem importa: e-mail primeiro (pode ter dígitos), depois CPF (11 dígitos com ou sem pontuação) e por fim
 * telefone (com ou sem +55, DDD entre parênteses, 8 ou 9 dígitos, separados por espaço, ponto ou hífen).
 */
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const CPF = /(?<!\d)\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}(?!\d)/g;
const TELEFONE = /(?<!\d)(?:\+?\s?55[\s.-]?)?(?:\(?0?\d{2}\)?[\s.-]?)?9?[\s.-]?\d{4}[\s.-]?\d{4}(?!\d)/g;

export function mascararDadosPessoais(texto: string | null | undefined): string {
  if (!texto) return "";
  return String(texto)
    .replace(EMAIL, "[e-mail]")
    .replace(CPF, "[cpf]")
    .replace(TELEFONE, (m) => (m.replace(/\D/g, "").length >= 8 ? "[telefone]" : m));
}
