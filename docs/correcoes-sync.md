# Correções de persistência das sincronizações

O sync do Instagram preserva métricas que a Meta não devolveu e informa falhas das subconsultas principais. Valores zero continuam sendo gravados. Patches com conjuntos diferentes de colunas são enviados em lotes separados para o PostgREST não preencher campos ausentes com `null`.

O progresso do histórico só é confirmado depois da persistência de todos os lotes da rodada. Se uma gravação falhar, a resposta também devolve o cursor anterior e `done: false`, permitindo repetir a página. Insights indisponíveis não impedem avançar quando os metadados dos posts foram salvos.

O webhook da Kommo responde 503 quando uma leitura ou gravação necessária falha. Exclusões marcam `removido_na_origem` sem apagar etapa, valor ou desfecho e sem inserir leads vazios. Eventos de status sem valor ou pipeline preservam os campos anteriores. A captura bruta usa um ID determinístico para não duplicar a mesma entrega em reenvios.

## Banco

- `20260930120000_cadastro_campos_legados.sql` registra campos que já eram usados pelo código e por migrações posteriores. `IF NOT EXISTS` preserva estruturas e valores existentes.
- A migração de segurança ignora as tabelas opcionais de importação `_flw_stage` e `_flw_steps` quando não existem. Quando presentes, continua habilitando RLS e revogando acesso.
- A carga inicial de etapas da Kommo só roda se a conexão piloto já existir.

A nova migração antecede arquivos já existentes por necessidade de dependência. Em um projeto Supabase que já tenha aplicado migrações posteriores, conferir o histórico e a prévia antes de aplicar:

```sh
npx supabase migration list
npx supabase db push --include-all --dry-run
```

Nenhuma migração é aplicada automaticamente por estes testes. O teste de banco executa os SQLs ordenados em PostgreSQL descartável, com interfaces mínimas de Auth e Storage. Ele não substitui a validação do histórico de versões pelo CLI nem testa os serviços hospedados do Supabase.

## Verificação local

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm run lint
npm run test:sync
npm run test:migrations
```

O build gera `src/routeTree.gen.ts`, necessário à checagem de tipos em um checkout novo. Os testes de sincronização simulam HTTP e não chamam a Meta, a Kommo ou um banco externo. O teste de migrações verifica também que credenciais não podem ser lidas por `authenticated`, que o bootstrap preserva dados e que a exclusão não gera uma mudança artificial de etapa.
