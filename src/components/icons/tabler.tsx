import type { NomeIcone } from "@/lib/registro-de-telas";

// Ícones Tabler, estilo outline (opção B do 03-UI-SPEC: SVG inline, nenhuma dependência nova).
// Caminhos copiados dos arquivos oficiais em https://github.com/tabler/tabler-icons, pasta icons/outline/{nome}.svg
// (baixados em 2026-11-09, todos responderam 200). Licença MIT, Copyright (c) 2020-2026 Paweł Kuna.
// Só os <path> com traço; nenhum script, nenhum atributo de evento.
// Ícone novo: copiar os "d" do arquivo oficial, acrescentar o nome em NomeIcone (registro-de-telas.ts) e aqui.
export const ICONES_TABLER: Record<NomeIcone, readonly string[]> = {
  "arrow-right": ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"],
  "brand-instagram": ["M3 7a4 4 0 0 1 4 -4h10a4 4 0 0 1 4 4v10a4 4 0 0 1 -4 4h-10a4 4 0 0 1 -4 -4l0 -10", "M8.5 12a3.5 3.5 0 1 0 7 0a3.5 3.5 0 0 0 -7 0", "M17 7v.01"],
  "briefcase": ["M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9", "M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2", "M12 12l0 .01", "M3 13a20 20 0 0 0 18 0"],
  "bulb": ["M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7", "M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3", "M9.7 17l4.6 0"],
  "calendar": ["M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12", "M16 3v4", "M8 3v4", "M4 11h16"],
  "chart-bar": ["M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6", "M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10", "M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14", "M4 20h14"],
  "checklist": ["M9.615 20h-2.615a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8", "M14 19l2 2l4 -4", "M9 8h4", "M9 12h2"],
  "chevron-down": ["M6 9l6 6l6 -6"],
  "chevron-left": ["M15 6l-6 6l6 6"],
  "chevron-right": ["M9 6l6 6l-6 6"],
  "file-text": ["M14 3v4a1 1 0 0 0 1 1h4", "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2", "M9 9l1 0", "M9 13l6 0", "M9 17l6 0"],
  "filter": ["M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227"],
  "inbox": ["M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12", "M4 13h3l3 3h4l3 -3h3"],
  "layout-dashboard": ["M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1", "M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1", "M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1", "M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1"],
  "link": ["M9 15l6 -6", "M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464", "M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"],
  "logout": ["M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2", "M9 12h12l-3 -3", "M18 15l3 -3"],
  "menu-2": ["M4 6l16 0", "M4 12l16 0", "M4 18l16 0"],
  "message-circle": ["M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1"],
  "plug": ["M9.785 6l8.215 8.215l-2.054 2.054a5.81 5.81 0 1 1 -8.215 -8.215l2.054 -2.054", "M4 20l3.5 -3.5", "M15 4l-3.5 3.5", "M20 9l-3.5 3.5"],
  "robot": ["M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4", "M12 2v2", "M9 12v9", "M15 12v9", "M5 16l4 -2", "M15 14l4 2", "M9 18h6", "M10 8v.01", "M14 8v.01"],
  "search": ["M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6"],
  "settings": ["M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065", "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"],
  "shield-check": ["M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06", "M15 19l2 2l4 -4"],
  "shield-off": ["M17.67 17.667a12 12 0 0 1 -5.67 3.333a12 12 0 0 1 -8.5 -15c.794 .036 1.583 -.006 2.357 -.124m3.128 -.926a11.997 11.997 0 0 0 3.015 -1.95a12 12 0 0 0 8.5 3a12 12 0 0 1 -1.116 9.376", "M3 3l18 18"],
  "snowflake": ["M10 4l2 1l2 -1", "M12 2v6.5l3 1.72", "M17.928 6.268l.134 2.232l1.866 1.232", "M20.66 7l-5.629 3.25l.01 3.458", "M19.928 14.268l-1.866 1.232l-.134 2.232", "M20.66 17l-5.629 -3.25l-2.99 1.738", "M14 20l-2 -1l-2 1", "M12 22v-6.5l-3 -1.72", "M6.072 17.732l-.134 -2.232l-1.866 -1.232", "M3.34 17l5.629 -3.25l-.01 -3.458", "M4.072 9.732l1.866 -1.232l.134 -2.232", "M3.34 7l5.629 3.25l2.99 -1.738"],
  "speakerphone": ["M18 8a3 3 0 0 1 0 6", "M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5", "M12 8l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"],
  "stethoscope": ["M6 4h-1a2 2 0 0 0 -2 2v3.5a5.5 5.5 0 0 0 11 0v-3.5a2 2 0 0 0 -2 -2h-1", "M8 15a6 6 0 1 0 12 0v-3", "M11 3v2", "M6 3v2", "M18 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
  "target": ["M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M7 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0", "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"],
  "users": ["M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2", "M16 3.13a4 4 0 0 1 0 7.75", "M21 21v-2a4 4 0 0 0 -3 -3.85"],
  "x": ["M18 6l-12 12", "M6 6l12 12"],
};

export interface IconeTablerProps {
  nome: NomeIcone;
  /** 16 dentro de chip e campo, 20 padrão (menu, botões), 24 em grade. */
  tamanho?: number;
  /** Traço do Tabler no Nexo: 1,5 (1,7 no tile de 28 px). */
  traco?: number;
  className?: string;
}

/** Sempre decorativo (aria-hidden): o texto ao lado é o nome acessível; ícone sozinho leva aria-label no botão. */
export function IconeTabler({ nome, tamanho = 20, traco = 1.5, className }: IconeTablerProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {ICONES_TABLER[nome].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
