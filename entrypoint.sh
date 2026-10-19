#!/usr/bin/env bash
set -e

# Migraciones, datos base y políticas RLS van con DATABASE_URL_ADMIN (dueño de
# las tablas) si está; la app corre con DATABASE_URL, que en producción debe ser
# un rol sin privilegios para que el RLS filtre (ver README, "Railway").
URL_ADMIN="${DATABASE_URL_ADMIN:-$DATABASE_URL}"
como_admin() { DATABASE_URL="$URL_ADMIN" "$@"; }

echo ">> Esperando a Postgres..."
until pg_isready -d "$URL_ADMIN" >/dev/null 2>&1; do
  sleep 1
done

echo ">> Migraciones..."
como_admin python manage.py migrate --noinput

echo ">> Países, estados y ciudades..."
como_admin python manage.py sembrar_geografia

echo ">> Áreas de servicio..."
como_admin python manage.py sembrar_areas

echo ">> Aplicando políticas RLS..."
psql "$URL_ADMIN" -v ON_ERROR_STOP=1 -f retiros/sql/rls_policies.sql

echo ">> Archivos estáticos..."
python manage.py collectstatic --noinput

if [ "${DJANGO_CREATE_SUPERUSER:-0}" = "1" ]; then
  if como_admin python manage.py shell -v0 -c "import os, sys; from django.contrib.auth import get_user_model; sys.exit(get_user_model().objects.filter(username=os.environ.get('DJANGO_SUPERUSER_USERNAME', '')).exists())"; then
    echo ">> Creando superusuario..."
    como_admin python manage.py createsuperuser --noinput || true
  else
    echo ">> El superusuario ya existe."
  fi
fi

echo ">> Arrancando: $*"
exec "$@"
