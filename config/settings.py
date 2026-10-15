import os
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

_CLAVE_DEV = "dev-inseguro-cambia-esto"
DEBUG = os.environ.get("DEBUG", "0") == "1"
SECRET_KEY = os.environ.get("SECRET_KEY", _CLAVE_DEV)
if not DEBUG and SECRET_KEY == _CLAVE_DEV:
    raise ImproperlyConfigured("Con DEBUG=0 hay que definir un SECRET_KEY propio.")
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
CSRF_TRUSTED_ORIGINS = [
    o for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if o
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "import_export",
    "rest_framework",
    "retiros",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Fija el contexto de RLS por petición. Debe ir DESPUÉS de Authentication.
    "retiros.middleware.RLSContextMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]

WSGI_APPLICATION = "config.wsgi.application"

# conn_max_age=0: conexión nueva por petición, para que el SET de contexto RLS
# no se filtre entre peticiones distintas.
DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get("DATABASE_URL", "postgres://retiros:retiros@db:5432/retiros"),
        conn_max_age=0,
    )
}

# Los permisos de coordinación y logística salen de sus roles (retiros/acceso.py).
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "retiros.acceso.RolBackend",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": f"django.contrib.auth.password_validation.{nombre}"}
    for nombre in (
        "UserAttributeSimilarityValidator", "MinimumLengthValidator",
        "CommonPasswordValidator", "NumericPasswordValidator",
    )
]
# A dónde manda @login_required: la pantalla de acceso del frontend.
LOGIN_URL = "/signin"

# Detrás de HTTPS (producción): las cookies de sesión y CSRF solo viajan cifradas.
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = os.environ.get("HTTPS", "0") == "1"

LANGUAGE_CODE = "es"
TIME_ZONE = os.environ.get("TIME_ZONE", "America/Caracas")
USE_I18N = True
USE_TZ = True

# Moneda base: VES, USD o EUR (retiros.models.Moneda). En ella van las cuotas y
# los totales; los pagos y gastos en otra moneda se convierten con su tasa.
MONEDA = os.environ.get("MONEDA", "USD")
# De dónde sale la tasa oficial del BCV (recurso: "dolares" o "euros").
TASAS_BCV_URL = os.environ.get(
    "TASAS_BCV_URL", "https://ve.dolarapi.com/v1/{recurso}/oficial"
)
# Formato regional con que el frontend muestra montos y fechas.
REGION = os.environ.get("REGION", "es-VE")

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Frontend React compilado (frontend/dist). WhiteNoise sirve sus archivos desde la
# raíz (/assets, /images...) y config.urls devuelve su index.html.
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
if FRONTEND_DIST.exists():
    WHITENOISE_ROOT = FRONTEND_DIST

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# API del frontend: misma sesión que el admin, siempre autenticada.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "COERCE_DECIMAL_TO_STRING": False,
}
