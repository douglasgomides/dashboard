/** Texto aceito por JSON estrito e jsonb: preserva pares UTF-16 e remove NUL. */
export function textoValido(texto: string): string {
  return texto.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]|\u0000/g,
    (trecho) => trecho.length === 2 ? trecho : trecho === "\0" ? "" : "\uFFFD");
}

/** Mantém o limite em unidades UTF-16 sem separar um emoji no ponto de corte. */
export function limitarTexto(texto: string, limite: number): string {
  const fim = Math.max(0, Math.floor(limite));
  let recorte = texto.slice(0, fim);
  const ultimo = recorte.charCodeAt(recorte.length - 1);
  const seguinte = texto.charCodeAt(fim);
  if (ultimo >= 0xD800 && ultimo <= 0xDBFF && seguinte >= 0xDC00 && seguinte <= 0xDFFF) {
    recorte = recorte.slice(0, -1);
  }
  return textoValido(recorte);
}
