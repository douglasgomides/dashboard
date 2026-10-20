#!/usr/bin/env bash
# Aplica no banco ($DB_URL) as migrações do repositório que ainda não constam em public._migracoes_repo, uma por
# transação, em ordem. BASELINE=1 só registra todas como aplicadas (usar uma vez, depois de a conferência provar
# que o banco já é igual ao repositório). Nunca imprime a URL nem dados.
set -euo pipefail
: "${DB_URL:?Defina DB_URL}"
cd "$(dirname "$0")/../.."
psql "$DB_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
create table if not exists public._migracoes_repo (
  arquivo text primary key,
  versao text not null,
  aplicada_em timestamptz not null default now()
);
alter table public._migracoes_repo enable row level security;
revoke all on public._migracoes_repo from public, anon, authenticated;
SQL
aplicadas=0
for f in supabase/migrations/*.sql; do
  arq=$(basename "$f"); versao=${arq%%_*}
  if [ "$(psql "$DB_URL" -tA -v a="$arq" -c "select 1 from public._migracoes_repo where arquivo = :'a'" 2>/dev/null || true)" = "1" ]; then continue; fi
  if [ "${BASELINE:-0}" = "1" ]; then
    psql "$DB_URL" -q -v ON_ERROR_STOP=1 -v a="$arq" -v v="$versao" -c "insert into public._migracoes_repo(arquivo, versao) values (:'a', :'v')"
    continue
  fi
  echo "Aplicando $arq"
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 --single-transaction -v a="$arq" -v v="$versao" \
    -c "set local lock_timeout = '10s'; set local statement_timeout = '120s';" \
    -f "$f" \
    -c "insert into public._migracoes_repo(arquivo, versao) values (:'a', :'v')"
  aplicadas=$((aplicadas + 1))
done
echo "Migrações aplicadas: $aplicadas"
