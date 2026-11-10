# Phase 3: itens adiados

## tests/e2e/workspace-navigation.spec.ts:137 › home: detailed analyses remain accessible without competing with the first step

- **Registrado em:** 03-06, Task 3 (2026-11-10).
- **Linha de base:** já falhava antes da fase (03-01-SUMMARY.md, lista da linha de base).
- **Onde quebra:** `getByRole("link", { name: /Ver prioridades da equipe/ })` não aparece na home do médico (viewer).
- **Causa:** é conteúdo da home, fora do menu e do sistema visual. Com o Supabase falso do e2e, o período não tem dado para sustentar uma recomendação. O bloco "O que merece atenção nos resultados" mostra então o estado vazio "Sem recomendação para este período", e esse estado não tem o link "Ver prioridades da equipe". O teste espera o link que só vem com uma recomendação.
- **Por que não foi corrigido aqui:** o 03-06 só atualiza o que é expectativa antiga de menu, rótulo ou diálogo. Ajustar o fixture para gerar uma recomendação, ou mudar o estado vazio da home, é trabalho do produto da home.
- **Próximo passo sugerido:** o dono da home decide se o estado vazio deve levar às prioridades da equipe. Se não deve, o teste passa a esperar "Sem recomendação para este período".
