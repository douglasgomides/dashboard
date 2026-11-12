---
quick_id: 261112-jmh
status: complete
date: 2026-11-12
---

# 261112-jmh: Nada cortado, leitura fácil (Carteira e Instagram › Posts)

Two executors in parallel (Tarefa 1 / Tarefa 2), merged into gsd/nexo-v5.

## Tarefa 1: Carteira (e929db6, bd8bff4, f530b92)
- Card is a container (`container-type: inline-size`); breakpoints follow card width: ≥1040 four columns, 900–1039 buttons stacked in the 4th column, 640–899 actions in their own row, <640 one column.
- Health column ≤3 items: status, nota, "N alertas" (details list with the same links). Name ≤2 lines, @ one line with ellipsis + title.
- New e2e `tests/e2e/carteira-sem-corte.spec.ts`: red 9/11 before, green after; with admin-painel 19 passed. Rows 87–113 px (limit 120).
- Molde section "k) Nada cortado".

## Tarefa 2: Instagram › Posts (38fdf56)
- `src/lib/texto-que-cabe.ts`: short numbers ("1,0 mi", "52,9 mil"), dd/mm dates, theme labels with accents (checked against every theme in api/_lib/tema-classifier.ts; DB values unchanged).
- Top 5: 2-line clamp + title; chips 1 line with ellipsis. Ranking: new columns, dd/mm date, tabular-nums, "Sem dado" instead of 0, cards up to 560 px, scroll shadow at 1280. Explorador: short numbers with aria-label/title, one-line date and theme chip.
- New e2e `tests/e2e/posts-sem-corte.spec.ts`: red 9/9 before; with instagram-painel and telas-juntadas 152 passed.
- Heights unchanged: Posts 1207/1288, Destaques 1144/1130 (375x812 / 1440x900).

## Checks
build ok; npm test 189/195 (6 known failures); tsc 4 old errors.

## Open for João
1. "Sem acesso criado" counts in "N alertas" (grey) — keep or drop?
2. Narrow card: "Gerenciar" below "Abrir resultados" — ok?
3. Ranking at 1280 px: Tema e funil chip truncates and the table scrolls sideways (Classificar partly behind the edge) — leaner table at 1280 (funil chip under the date)?
