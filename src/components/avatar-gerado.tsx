import { useId } from "react";
import { tracosDoAvatar } from "@/lib/avatar-gerado";

// Avatar 3D próprio da pessoa sem foto (03-UI-SPEC §Avatares, D-01). Reescrita em TypeScript da função avatar() da
// prancha aprovada: os traços saem só do nome (tracosDoAvatar), então o mesmo nome dá o mesmo personagem em qualquer tela.
// Nunca renderiza imagem raster: foto de pessoa da equipe fica fora deste componente, e paciente nunca vira foto.
// Os ids dos degradês vêm de useId (a prancha usava um contador global, que colide quando há vários avatares na tela).

// Pares claro/escuro de pele e cores de cabelo da prancha (desenho do personagem, não cor de interface).
const PELES: [string, string][] = [
  ["#FFE0C7", "#F2B48C"],
  ["#F6C9A4", "#D99566"],
  ["#E2A577", "#B8733F"],
  ["#C98A5B", "#97592E"],
  ["#8D5A3B", "#5E3720"],
];
const CABELOS = ["#2B1B12", "#4A2E1C", "#7A4A26", "#C68A3E", "#1B1B22", "#9A5B3A"];
// A primeira camisa é --b2; a segunda é branca com gravata escura; as outras seguem os tokens do sistema.
const CAMISAS = ["var(--b2)", "#FFFFFF", "#2B2B2D", "var(--or)", "var(--up)", "var(--dn)"];

export function AvatarGerado({ nome, tamanho = 40 }: { nome: string; tamanho?: number }) {
  // ":r1:" ou "«r1»" (conforme a versão do React) não serve de pedaço de url(#...): fica só o que é seguro.
  const id = `av${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const t = tracosDoAvatar(nome);
  const [pele, peleEscura] = PELES[t.pele];
  const cabelo = CABELOS[t.corDoCabelo];
  const camisa = CAMISAS[t.camisa];
  const estilo = t.estiloDoCabelo;
  const raio = Math.round(tamanho * 0.28);

  return (
    <svg
      className="nx-avatar"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 100 100"
      style={{ borderRadius: raio }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--b4)" }} />
          <stop offset="1" style={{ stopColor: "var(--b2)" }} />
        </linearGradient>
        <radialGradient id={`${id}s`} cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".35" stopColor={pele} />
          <stop offset="1" stopColor={peleEscura} />
        </radialGradient>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: camisa }} />
          <stop offset="1" style={{ stopColor: camisa, stopOpacity: 0.82 }} />
        </linearGradient>
        <radialGradient id={`${id}e`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#5A3A28" />
          <stop offset="1" stopColor="#1E120B" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id}b)`} />
      <ellipse cx="50" cy="104" rx="38" ry="22" fill={`url(#${id}c)`} />
      {t.camisa === 1 && <path d="M50 84l-4 16h8z" fill="#2B2B2D" />}
      <rect x="43" y="68" width="14" height="14" rx="6" fill={peleEscura} />
      {estilo === 3 && (
        <path d="M22 46c0-20 12-29 28-29s28 9 28 29v24c0 6-6 8-10 8h-36c-4 0-10-2-10-8z" fill={cabelo} />
      )}
      {estilo === 4 && <circle cx="50" cy="16" r="10" fill={cabelo} />}
      <ellipse cx="26.5" cy="52" rx="5" ry="7" fill={peleEscura} />
      <ellipse cx="73.5" cy="52" rx="5" ry="7" fill={peleEscura} />
      <ellipse cx="50" cy="49" rx="24" ry="27" fill={`url(#${id}s)`} />
      {estilo === 0 && (
        <path d="M27 40c-1-14 8-22 23-22s24 8 23 22c-4-6-10-9-16-9c-6 0-6 5-14 5c-6 0-11 1-16 4z" fill={cabelo} />
      )}
      {estilo === 1 && (
        <path d="M26 44c-2-17 9-26 24-26c16 0 26 9 24 26c-2-4-4-7-7-8c-8-2-14-1-22-6c-3 5-11 8-19 14z" fill={cabelo} />
      )}
      {estilo === 2 && (
        <>
          <path d="M28 38c0-12 9-19 22-19s22 7 22 19c-6-4-14-6-22-6s-16 2-22 6z" fill={cabelo} />
          <circle cx="50" cy="20" r="5" fill={cabelo} />
        </>
      )}
      {estilo === 3 && (
        <path d="M27 42c0-14 10-22 23-22c14 0 23 8 23 22c-6-8-15-12-23-12c-4 4-14 9-23 12z" fill={cabelo} />
      )}
      {estilo === 4 && (
        <path d="M27 42c0-15 10-23 23-23s23 8 23 23c-5-7-12-10-23-10s-18 3-23 10z" fill={cabelo} />
      )}
      <path d="M36 42q4-3 8 0M56 42q4-3 8 0" stroke={cabelo} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="40" cy="51" rx="4.3" ry="5" fill="#fff" />
      <ellipse cx="60" cy="51" rx="4.3" ry="5" fill="#fff" />
      <circle cx="40.6" cy="51.6" r="3" fill={`url(#${id}e)`} />
      <circle cx="60.6" cy="51.6" r="3" fill={`url(#${id}e)`} />
      <circle cx="41.6" cy="50.2" r="1" fill="#fff" />
      <circle cx="61.6" cy="50.2" r="1" fill="#fff" />
      <ellipse cx="33" cy="60" rx="4.5" ry="2.6" fill="#F28C8C" opacity=".35" />
      <ellipse cx="67" cy="60" rx="4.5" ry="2.6" fill="#F28C8C" opacity=".35" />
      <path d="M48 56q2 3 4 0" stroke={peleEscura} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path
        d={`M42 64q8 ${estilo >= 3 ? 7 : 6} 16 0q-8 3-16 0z`}
        fill="#fff"
        stroke="#9C4A3A"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {t.oculos && (
        <g fill="none" stroke="#2B2B2D" strokeWidth="2">
          <circle cx="40" cy="50" r="7" fill="rgba(255,255,255,.25)" />
          <circle cx="60" cy="50" r="7" fill="rgba(255,255,255,.25)" />
          <path d="M47 50h6" />
        </g>
      )}
      <ellipse cx="44" cy="32" rx="9" ry="4" fill="#fff" opacity=".12" />
    </svg>
  );
}
