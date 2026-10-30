// QR code sem dependência e sem serviço de fora (o link da clínica não sai do navegador). Modo byte, correção média (M),
// versões 1 a 6: até 106 caracteres, o bastante para "https://<domínio>/r/<nome>". Segue a norma ISO/IEC 18004;
// conferido módulo a módulo contra outra implementação em scripts/test-qr.ts.

// Por versão: códigos de correção por bloco e quantidade de dados em cada bloco.
const BLOCOS_M: Record<number, { ec: number; dados: number[] }> = {
  1: { ec: 10, dados: [16] },
  2: { ec: 16, dados: [28] },
  3: { ec: 26, dados: [44] },
  4: { ec: 18, dados: [32, 32] },
  5: { ec: 24, dados: [43, 43] },
  6: { ec: 16, dados: [27, 27, 27, 27] },
};
const ALINHAMENTO: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}
function divisorRS(grau: number): number[] {
  const r = new Array<number>(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < grau; j++) {
      r[j] = gfMul(r[j], raiz);
      if (j + 1 < grau) r[j] ^= r[j + 1];
    }
    raiz = gfMul(raiz, 0x02);
  }
  return r;
}
function restoRS(dados: number[], divisor: number[]): number[] {
  const r = divisor.map(() => 0);
  for (const b of dados) {
    const fator = b ^ (r.shift() as number);
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, fator); });
  }
  return r;
}

export interface MatrizQr { tamanho: number; versao: number; mascara: number; modulos: boolean[][] }

/** Monta o QR. `mascara` fixa só serve para o teste comparar com outra implementação; sem ela escolhe a melhor. */
export function gerarQr(texto: string, mascaraFixa?: number): MatrizQr {
  const bytes = [...new TextEncoder().encode(texto)];
  const versao = [1, 2, 3, 4, 5, 6].find((v) => BLOCOS_M[v].dados.reduce((a, b) => a + b, 0) * 8 >= 4 + 8 + bytes.length * 8);
  if (!versao) throw new Error("Texto longo demais para o QR code");
  const { ec, dados: tamanhos } = BLOCOS_M[versao];
  const capacidade = tamanhos.reduce((a, b) => a + b, 0) * 8;

  // Bits: modo byte (0100), quantidade (8 bits), os bytes, fim (até 4 zeros), completa o byte, preenchimento EC/11.
  const bits: number[] = [];
  const poe = (valor: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  poe(0b0100, 4); poe(bytes.length, 8);
  for (const b of bytes) poe(b, 8);
  poe(0, Math.min(4, capacidade - bits.length));
  poe(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < capacidade; p ^= 0xec ^ 0x11) poe(p, 8);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) cw.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Blocos, correção e intercalação.
  const divisor = divisorRS(ec);
  const blocos: number[][] = [];
  let k = 0;
  for (const t of tamanhos) { blocos.push(cw.slice(k, k + t)); k += t; }
  const correcoes = blocos.map((b) => restoRS(b, divisor));
  const final: number[] = [];
  for (let i = 0; i < Math.max(...tamanhos); i++) for (const b of blocos) if (i < b.length) final.push(b[i]);
  for (let i = 0; i < ec; i++) for (const c of correcoes) final.push(c[i]);

  const n = 17 + 4 * versao;
  const mod = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fixo = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const marca = (x: number, y: number, escuro: boolean) => { mod[y][x] = escuro; fixo[y][x] = true; };

  // Faixas de sincronia, localizadores, alinhamento.
  for (let i = 0; i < n; i++) { marca(6, i, i % 2 === 0); marca(i, 6, i % 2 === 0); }
  const localizador = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      marca(x, y, d !== 2 && d !== 4);
    }
  };
  localizador(3, 3); localizador(n - 4, 3); localizador(3, n - 4);
  const pos = ALINHAMENTO[versao];
  for (const a of pos) for (const b of pos) {
    if ((a === 6 && b === 6) || (a === 6 && b === pos[pos.length - 1]) || (a === pos[pos.length - 1] && b === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) marca(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formato = (mascara: number) => {
    const d = (0 << 3) | mascara; // correção M = 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const f = ((d << 10) | r) ^ 0x5412;
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) marca(8, i, bit(i));
    marca(8, 7, bit(6)); marca(8, 8, bit(7)); marca(7, 8, bit(8));
    for (let i = 9; i < 15; i++) marca(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) marca(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) marca(8, n - 15 + i, bit(i));
    marca(8, n - 8, true);
  };
  formato(0); // reserva a área antes de colocar os dados

  // Dados em zigue-zague, de baixo para cima, duas colunas por vez (a coluna 6 é da sincronia).
  let i = 0;
  for (let dir = n - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
      const x = dir - j, y = ((dir + 1) & 2) === 0 ? n - 1 - v : v;
      if (!fixo[y][x] && i < final.length * 8) { mod[y][x] = ((final[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }

  const inverte = (m: number) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (fixo[y][x]) continue;
      const c = [(x + y) % 2, y % 2, x % 3, (x + y) % 3, (Math.floor(x / 3) + Math.floor(y / 2)) % 2,
        ((x * y) % 2) + ((x * y) % 3), (((x * y) % 2) + ((x * y) % 3)) % 2, (((x + y) % 2) + ((x * y) % 3)) % 2][m];
      if (c === 0) mod[y][x] = !mod[y][x];
    }
  };
  let mascara = mascaraFixa ?? 0;
  if (mascaraFixa === undefined) {
    let melhor = Infinity;
    for (let m = 0; m < 8; m++) {
      inverte(m); formato(m);
      const p = penalidade(mod);
      if (p < melhor) { melhor = p; mascara = m; }
      inverte(m);
    }
  }
  inverte(mascara); formato(mascara);
  return { tamanho: n, versao, mascara, modulos: mod };
}

function penalidade(m: boolean[][]): number {
  const n = m.length;
  let p = 0, escuros = 0;
  const linha = (get: (i: number) => boolean) => {
    let corrida = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) { corrida++; continue; }
      if (corrida >= 5) p += corrida - 2;
      corrida = 1;
    }
    // Padrão parecido com o localizador (1:1:3:1:1 com 4 claros de um lado).
    const s = Array.from({ length: n }, (_, i) => (get(i) ? "1" : "0")).join("");
    for (const pad of ["10111010000", "00001011101"]) for (let k = s.indexOf(pad); k >= 0; k = s.indexOf(pad, k + 1)) p += 40;
  };
  for (let y = 0; y < n; y++) linha((x) => m[y][x]);
  for (let x = 0; x < n; x++) linha((y) => m[y][x]);
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  for (const l of m) for (const c of l) if (c) escuros++;
  p += Math.floor(Math.abs(escuros * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

/** SVG do QR (com margem branca de 4 módulos), pronto para baixar ou imprimir. */
export function qrSvg(texto: string, tamanhoPx = 640): string {
  const { tamanho, modulos } = gerarQr(texto);
  const total = tamanho + 8;
  let caminho = "";
  modulos.forEach((l, y) => l.forEach((c, x) => { if (c) caminho += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${tamanhoPx}" height="${tamanhoPx}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${caminho}" fill="#000"/></svg>`;
}
