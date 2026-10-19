# --- Etapa 1: compila el frontend React (queda en /frontend/dist) ---
FROM node:24-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Etapa 2: Django, que sirve también el frontend compilado ---
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Dependencias de sistema:
#  - WeasyPrint necesita pango/cairo/gdk-pixbuf y tipografías (para el PDF).
#  - postgresql-client aporta psql/pg_isready (para el entrypoint).
#  - tesseract-ocr con el idioma español: leer planillas (retiros/ocr).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libcairo2 \
        libffi8 fonts-dejavu-core postgresql-client \
        tesseract-ocr tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend /frontend/dist ./frontend/dist
RUN chmod +x entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
# PORT lo fija el hosting (Railway, Render...); en un servidor propio, 8000.
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-3}"]
