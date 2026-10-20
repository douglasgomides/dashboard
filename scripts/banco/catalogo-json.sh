#!/usr/bin/env bash
# Impressão digital do esquema de um banco real ($DB_URL) em JSON, no mesmo formato de remontar.ts. Só metadados.
set -euo pipefail
: "${DB_URL:?Defina DB_URL}"
cd "$(dirname "$0")"
psql "$DB_URL" -qtA -v ON_ERROR_STOP=1 -c "set default_transaction_read_only = on" \
  -c "select coalesce(json_agg(json_build_object('tipo', tipo, 'nome', nome, 'assinatura', assinatura)), '[]') from ($(grep -v '^--' catalogo.sql | sed 's/;\s*$//')) x"
