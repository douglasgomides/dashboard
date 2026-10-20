#!/usr/bin/env bash
# Aplica no banco ($DB_URL) as migrações do repositório que ainda não constam em public._migracoes_repo, uma por
# transação, em ordem. BASELINE=1 só registra todas como aplicadas (usar uma vez, depois de a conferência provar
# que o banco já é igual ao repositório). Nunca imprime a URL nem dados.
set -euo pipefail
: "${DB_URL:?Defina DB_URL}"
cd "$(dirname "$0")/../.."
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
psql "$DB_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
create table if not exists public._migracoes_repo (
  arquivo text primary key,
  versao text not null,
  aplicada_em timestamptz not null default now()
);
alter table public._migracoes_repo enable row level security;
revoke all on public._migracoes_repo from public, anon, authenticated;
SQL
# Trava: registro vazio num banco que já tem tabelas significa que a base nunca foi registrada. Aplicar tudo de novo
# seria perigoso; só a conferência + registrar-base (BASELINE=1) destravam. Banco vazio (homolog novo) segue normal.
registradas=$(psql "$DB_URL" -tA -c "select count(*) from public._migracoes_repo")
tabelas=$(psql "$DB_URL" -tA -c "select count(*) from pg_tables where schemaname = 'public' and tablename <> '_migracoes_repo'")
if [ "$registradas" = "0" ] && [ "$tabelas" != "0" ] && [ "${BASELINE:-0}" != "1" ]; then
  echo "Banco com $tabelas tabelas e nenhuma migração registrada: rode a conferência e depois registrar-base. Nada aplicado." >&2
  exit 1
fi
aplicadas=0
for f in supabase/migrations/*.sql; do
  arq=$(basename "$f"); versao=${arq%%_*}
  # O nome entra literal no SQL (psql -c não interpola variáveis): só letras minúsculas, dígitos, _ e .sql.
  if ! [[ "$arq" =~ ^[0-9]+_[a-z0-9_]+\.sql$ ]]; then echo "Nome de migração fora do padrão: $arq" >&2; exit 1; fi
  if [ "$(psql "$DB_URL" -tA -v ON_ERROR_STOP=1 -c "select 1 from public._migracoes_repo where arquivo = '$arq'")" = "1" ]; then continue; fi
  registro="insert into public._migracoes_repo(arquivo, versao) values ('$arq', '$versao')"
  if [ "${BASELINE:-0}" = "1" ]; then
    psql "$DB_URL" -q -v ON_ERROR_STOP=1 -c "$registro"
    continue
  fi
  echo "Aplicando $arq"
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 --single-transaction \
    -c "set local lock_timeout = '10s'; set local statement_timeout = '120s';" \
    -f "$f" \
    -c "$registro"
  aplicadas=$((aplicadas + 1))
done
echo "Migrações aplicadas: $aplicadas"
