# Phase 2 — Conferência antes do merge (produção, só leitura)

**Rodado por:** Claude, 09/11/2026, consultas só de leitura (SELECT) pelo conector do Supabase, projeto `cvdnzoqduliopscfsrkc` (autorização do João para leitura em produção).

## Resultado em produção
- `public._migracoes_repo`: **não existe** em produção. O registro do `scripts/banco/aplicar.sh` nunca foi criado lá.
- `supabase_migrations.schema_migrations`: 289 versões; última `20261104231602`; nem `20261106130000` nem `20261109120000` constam (foram/serão aplicadas fora do histórico do Supabase).
- `public.resultados_diarios`: existe (a 20261106130000 já está aplicada em produção, por fora do registro).
- `public.rota_acessos`: não existe (esperado: a migration nova ainda não foi aplicada).

## O que isso significa para o merge (D-15)
- O job `producao` do `banco.yml`, se aprovado, roda `aplicar.sh`: ele **cria** a tabela vazia `public._migracoes_repo` e em seguida **para** pela trava "registro vazio num banco com tabelas" (exit 1, "Nada aplicado"). Ou seja: o merge **não aplica nada em produção** pelo workflow.
- **Recomendação:** não aprovar o job `producao` do `banco.yml` nesta fase (evita criar a tabela de registro sem a conferência + registrar-base). Aplicar `supabase/migrations/20261109120000_rota_acessos.sql` pelo editor SQL do Supabase, como já é feito hoje.
- A edição da guarda do cron em `20261106130000_resultados_diarios.sql` **não precisa** de nada em produção (já aplicada; a mudança só afeta o banco de teste local).
- **Homolog:** não acessível por este conector (o banco de homolog não está na lista de projetos do Supabase visível). A conferência de homolog fica com o job `conferir` do `banco.yml` ou com o João.

## Depois de aplicar a migration (João)
- `select jobname, schedule from cron.job where jobname = 'rota-acessos-limpeza';` → esperado `40 6 * * *`.
- `select to_regclass('public.rota_acessos');` → esperado `rota_acessos`.
