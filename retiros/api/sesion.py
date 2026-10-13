"""Sesión. Son vistas Django normales: el CsrfViewMiddleware las protege."""

import json

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST


def _usuario_json(user):
    if not user.is_authenticated:
        return {"autenticado": False}
    return {
        "autenticado": True,
        "username": user.get_username(),
        "nombre": user.get_full_name() or user.get_username(),
        "email": user.email,
        "es_staff": user.is_staff,
        "es_superusuario": user.is_superuser,
        # Con qué moneda y formato regional muestra el frontend montos y fechas.
        "moneda": settings.MONEDA,
        "region": settings.REGION,
    }


@require_GET
@ensure_csrf_cookie
def sesion(request):
    """Usuario actual. También deja la cookie CSRF que el frontend reenvía."""
    return JsonResponse(_usuario_json(request.user))


@require_POST
def iniciar_sesion(request):
    try:
        datos = json.loads(request.body or b"{}")
    except ValueError:
        return JsonResponse({"detail": "JSON inválido."}, status=400)
    user = authenticate(
        request, username=datos.get("username", ""), password=datos.get("password", "")
    )
    if user is None:
        return JsonResponse({"detail": "Usuario o contraseña incorrectos."}, status=400)
    login(request, user)
    return JsonResponse(_usuario_json(user))


@require_POST
def cerrar_sesion(request):
    logout(request)
    return JsonResponse({"autenticado": False})
