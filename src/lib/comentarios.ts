// Triagem de comentários antes de virarem dúvida ou ideia. "É pergunta?" (is_question) pega pontuação e
// palavra interrogativa, e deixava passar sorteio, convite para seguir, piada, desabafo, conversa entre
// seguidores e resposta do próprio perfil. A regra completa (com o motivo de cada exclusão) mora em
// lib/voz-do-paciente.ts; aqui ficam os atalhos usados pelas consultas de dados e pelo relatório.

import { analisarVozDoPaciente, triarComentario, type MotivoExclusao } from "@/lib/voz-do-paciente";

export type CategoriaComentario = "pergunta" | "sorteio_ou_convite" | "do_proprio_perfil" | "sem_conteudo";

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

export function categoriaDoComentario(texto: string, autor?: string | null, donos: string[] = []): CategoriaComentario {
  const r = triarComentario(texto, autor, { donos });
  return r.ok ? "pergunta" : CATEGORIA[r.motivo];
}

/** Só as perguntas reais de pacientes (sem ruído e sem a mesma pessoa repetindo). */
export function filtrarPerguntas<T extends { id: string; text: string; author_username?: string | null; like_count?: number | null; instagram_post_id?: string | null }>(
  rows: T[],
  donos: string[] = [],
): T[] {
  return analisarVozDoPaciente(rows, { donos }).mantidos.map((m) => m.comentario);
}
