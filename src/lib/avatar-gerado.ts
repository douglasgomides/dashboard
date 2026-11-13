// Avatar gerado da pessoa sem foto (03-UI-SPEC §Avatares).
// Regra pura, sem React: o mesmo nome sempre vira o mesmo personagem, em qualquer
// tela e em qualquer sessão, porque os traços saem só de um hash do nome.
// Não se infere gênero pelo nome: o hash apenas sorteia os traços.

export type TracosAvatar = {
  /** 0 a 4: índice do tom de pele (cada um com par claro e escuro). */
  pele: number;
  /** 0 a 5: índice da cor do cabelo. */
  corDoCabelo: number;
  /** 0 a 4: índice do desenho do cabelo. */
  estiloDoCabelo: number;
  /** 0 a 5: índice da camisa (0 é --b2; 1 é branca com gravata escura). */
  camisa: number;
  /** Óculos em cerca de 25% dos nomes. */
  oculos: boolean;
};

/**
 * Semente do avatar: sem espaços nas pontas, em minúsculas e sem acento.
 * Assim "José" e " jose " dão o mesmo personagem.
 */
export function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** FNV-1a de 32 bits, igual ao da prancha aprovada (mesma base e mesmo primo multiplicador). */
export function hashFnv1a(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Traços do personagem, lidos de faixas diferentes de bits do hash
 * (os mesmos deslocamentos da função avatar() da prancha).
 */
export function tracosDoAvatar(nome: string): TracosAvatar {
  const h = hashFnv1a(normalizarNome(nome));
  return {
    pele: h % 5,
    corDoCabelo: (h >>> 3) % 6,
    camisa: (h >>> 6) % 6,
    estiloDoCabelo: (h >>> 9) % 5,
    oculos: (h >>> 12) % 4 === 0,
  };
}
