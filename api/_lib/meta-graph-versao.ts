/**
 * Versão única da Graph API da Meta. O código pedia v21 e v23 em lugares diferentes, e a Meta já respondia tudo na
 * v26 por troca automática (cabeçalho "auto-upgraded to v26.0", auditoria de 30/10/2026). Trocar aqui troca em todos.
 */
export const META_GRAPH_VERSAO = process.env.META_GRAPH_VERSION || "v26.0";
export const META_GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_VERSAO}`;
