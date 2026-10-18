# Baseline de regressão

Os três arquivos `.ts.txt` são cópias exatas de `src/lib/comentarios.ts`, `src/lib/report-metrics.ts` e `src/lib/hub-conteudo.ts` do commit `477eb43` deste repositório. São recursos de teste, não código do aplicativo atual.

`scripts/baseline-477eb43.ts` ajusta somente os imports ao carregar essas cópias em um diretório temporário. Isso mantém a comparação histórica existente e permite executar os testes em checkouts rasos e arquivos ZIP sem depender do histórico Git completo.
