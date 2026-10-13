#!/usr/bin/env bash
set -e

echo ">> Esperando a Postgres en ${DB_HOST:-db}:${DB_PORT:-5432}..."
until pg_isready -h "${DB_HOST:-db}" -p "${DB_PORT:-5432}" -U "${DB_USER:-retiros}" >/dev/null 2>&1; do
  sleep 1
done

echo ">> Migraciones..."
python manage.py migrate --noinput

echo ">> Aplicando políticas RLS..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f retiros/sql/rls_policies.sql

echo ">> Archivos estáticos..."
python manage.py collectstatic --noinput

if [ "${DJANGO_CREATE_SUPERUSER:-0}" = "1" ]; then
  echo ">> Creando superusuario (si no existe)..."
  python manage.py createsuperuser --noinput || true
fi

echo ">> Arrancando: $*"
exec "$@"
