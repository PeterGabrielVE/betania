#!/usr/bin/env bash
set -e

echo ">> Esperando a Postgres en ${DB_HOST:-db}:${DB_PORT:-5432}..."
until pg_isready -h "${DB_HOST:-db}" -p "${DB_PORT:-5432}" -U "${DB_USER:-retiros}" >/dev/null 2>&1; do
  sleep 1
done

echo ">> Migraciones..."
python manage.py migrate --noinput

echo ">> Países, estados y ciudades..."
python manage.py sembrar_geografia

echo ">> Áreas de servicio..."
python manage.py sembrar_areas

echo ">> Aplicando políticas RLS..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f retiros/sql/rls_policies.sql

echo ">> Archivos estáticos..."
python manage.py collectstatic --noinput

if [ "${DJANGO_CREATE_SUPERUSER:-0}" = "1" ]; then
  if python manage.py shell -v0 -c "import os, sys; from django.contrib.auth import get_user_model; sys.exit(get_user_model().objects.filter(username=os.environ.get('DJANGO_SUPERUSER_USERNAME', '')).exists())"; then
    echo ">> Creando superusuario..."
    python manage.py createsuperuser --noinput || true
  else
    echo ">> El superusuario ya existe."
  fi
fi

echo ">> Arrancando: $*"
exec "$@"
