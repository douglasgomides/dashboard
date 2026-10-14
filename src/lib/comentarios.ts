// Triagem de comentários antes de virarem dúvida ou ideia.
//
// Convivem aqui DUAS regras, e as duas ficam disponíveis:
//
// 1) Detecção original (commit 477eb43), restaurada sem nenhuma mudança: `categoriaDoComentario`,
//    `filtrarPerguntasOriginal` e `perguntasDaDeteccaoOriginal`. Fica todo comentário marcado como
//    pergunta (is_question, que o sync marca por pontuação ou palavra interrogativa). Só saem os casos
//    óbvios: menos de 6 letras/números, resposta do próprio perfil e 13 padrões de sorteio/convite.
//    "Na dúvida, o comentário fica."
//
// 2) Triagem nova (lib/voz-do-paciente.ts): `categoriaDaTriagem`, `filtrarPerguntasTriagem`. Tira também
//    spam, piada, desabafo, conversa entre seguidores, só @, profissionais de saúde e a mesma pessoa
//    repetindo. "Na dúvida, o comentário sai e fica listado com o motivo."
//
// `filtrarPerguntas` continua com a triagem nova porque é o que `getPatientQuestionsPeriodo` (Relatório e
// PDF) usa hoje; trocar aqui mudaria os números desses relatórios. Quem precisa da regra original chama
// `filtrarPerguntasOriginal` (a tela Dúvidas, camada "Todas as perguntas detectadas", e a tela Ideias,
// ideias "regra original").

import { analisarVozDoPaciente, triarComentario, type MotivoExclusao } from "@/lib/voz-do-paciente";

// ---------------------------------------------------------------------------------------------
// 1) Detecção original (477eb43): código idêntico ao baseline.
// ---------------------------------------------------------------------------------------------

const DIACRITICOS = new RegExp("[̀-ͯ]", "g");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(DIACRITICOS, "");

export type CategoriaComentario = "pergunta" | "sorteio_ou_convite" | "do_proprio_perfil" | "sem_conteudo";

const SORTEIO_OU_CONVITE: RegExp[] = [
  /\bsorteio\b/,
  /\bconcorr(e|endo|er)\b/,
  /\bparticip(ar|ando|e)\b.*\b(sorteio|promo)/,
  /\bja (me )?segue\b/,
  /\bme segue\b/,
  /\bme segu(e|a) la\b/,
  /\bnao te vi por la\b/,
  /\bsegue (a|o) (pagina|perfil|conta)\b/,
  /\bmarque? (um|uma|\d+|tres|dois|duas) (amig|pessoa)/,
  /\blink (na|da) bio\b/,
  /\bcupom\b/,
  /\bchama no (direct|dm|whats)/,
  /\bmanda (um )?(direct|dm)\b/,
];

/** Regra original (477eb43). Na dúvida, o comentário fica como "pergunta". */
export function categoriaDoComentario(texto: string, autor?: string | null, donos: string[] = []): CategoriaComentario {
  const t = norm(texto).replace(/\s+/g, " ").trim();
  const semEmoji = t.replace(/[^a-z0-9?]/g, "");
  if (semEmoji.length < 6) return "sem_conteudo";
  if (autor && donos.some((d) => d && norm(d) === norm(autor))) return "do_proprio_perfil";
  if (SORTEIO_OU_CONVITE.some((r) => r.test(t))) return "sorteio_ou_convite";
  return "pergunta";
}

/** Regra original (477eb43): o `filtrarPerguntas` do baseline, sem mudança. */
export function filtrarPerguntasOriginal<T extends { text: string; author_username?: string | null }>(rows: T[], donos: string[] = []): T[] {
  return rows.filter((q) => categoriaDoComentario(q.text, q.author_username, donos) === "pergunta");
}

/**
 * A lista que a tela Dúvidas mostrava no baseline: só comentários com `is_question = true` (a consulta
 * do baseline já filtrava assim no banco), depois `filtrarPerguntasOriginal`. Linhas sem o campo
 * `is_question` são tratadas como já filtradas pela consulta.
 */
export function perguntasDaDeteccaoOriginal<T extends { text: string; author_username?: string | null; is_question?: boolean | null }>(
  rows: T[],
  donos: string[] = [],
): T[] {
  return filtrarPerguntasOriginal(
    rows.filter((r) => r.is_question === undefined || r.is_question === true),
    donos,
  );
}

// ---------------------------------------------------------------------------------------------
// 2) Triagem nova (voz do paciente), com nomes novos.
// ---------------------------------------------------------------------------------------------

const CATEGORIA: Record<MotivoExclusao, CategoriaComentario> = {
  vazio_ou_curto: "sem_conteudo",
  so_emoji: "sem_conteudo",
  so_mencao: "sem_conteudo",
  spam_ou_promocao: "sorteio_ou_convite",
  do_proprio_perfil: "do_proprio_perfil",
  profissional_de_saude: "sem_conteudo",
  conversa_entre_seguidores: "sem_conteudo",
  pergunta_para_seguidores: "sem_conteudo",
  piada_ou_ironia: "sem_conteudo",
  sem_pergunta: "sem_conteudo",
  repetido: "sem_conteudo",
};

/** Triagem nova: categoria a partir de `triarComentario` (voz do paciente). */
export function categoriaDaTriagem(texto: string, autor?: string | null, donos: string[] = []): CategoriaComentario {
  const r = triarComentario(texto, autor, { donos });
  return r.ok ? "pergunta" : CATEGORIA[r.motivo];
}

/** Triagem nova: só as perguntas reais de pacientes (sem ruído e sem a mesma pessoa repetindo). */
export function filtrarPerguntasTriagem<T extends { id: string; text: string; author_username?: string | null; like_count?: number | null; instagram_post_id?: string | null }>(
  rows: T[],
  donos: string[] = [],
): T[] {
  return analisarVozDoPaciente(rows, { donos }).mantidos.map((m) => m.comentario);
}

/**
 * Usado por `getPatientQuestions` e `getPatientQuestionsPeriodo` (Relatório e PDF). Mantém a triagem
 * nova para não mudar os números desses relatórios; a regra original está em `filtrarPerguntasOriginal`.
 */
export const filtrarPerguntas = filtrarPerguntasTriagem;
