"""Sesión. Son vistas Django normales: el CsrfViewMiddleware las protege."""

import json

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from ..acceso import retiros_visibles
from ..models import Moneda, Preferencias, Retiro
from ..tasas import TasaNoDisponible, tasa_bcv
from .permisos import permiso


def _preferencias_json(user):
    """La edición y la moneda que el usuario eligió en el encabezado.

    `moneda_vista` es en la que se muestran los montos y `factor`, por cuánto
    multiplicar un monto en la moneda base para verlo en ella. Si no hay tasa
    del BCV, los montos se siguen mostrando en la moneda base."""
    pref = Preferencias.objects.filter(cuenta=user).select_related("retiro__tipo").first()
    retiro = None
    if (pref and pref.retiro_id and user.has_perm(permiso(Retiro, "view"))
            and retiros_visibles(user).filter(pk=pref.retiro_id).exists()):
        retiro = {"id": pref.retiro_id, "etiqueta": str(pref.retiro)}
    moneda = (pref.moneda if pref else "") or settings.MONEDA
    vista, factor, aviso = moneda, 1, ""
    if moneda != settings.MONEDA:
        try:
            factor = float(tasa_bcv(moneda))
        except TasaNoDisponible:
            vista = settings.MONEDA
            aviso = (f"No se pudo consultar la tasa del BCV: los montos se muestran en "
                     f"{settings.MONEDA}.")
    return {
        "retiro": retiro,
        "moneda": moneda,
        "moneda_vista": vista,
        "factor": factor,
        "aviso": aviso,
    }


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
        "monedas": [{"valor": v, "etiqueta": e} for v, e in Moneda.choices],
        "preferencias": _preferencias_json(user),
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


@require_http_methods(["PATCH"])
def preferencias(request):
    """Cambia la edición y/o la moneda preferidas: {"retiro": id | null,
    "moneda": "VES" | "USD" | "EUR" | ""}. Devuelve la sesión actualizada."""
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Inicia sesión."}, status=403)
    try:
        datos = json.loads(request.body or b"{}")
    except ValueError:
        return JsonResponse({"detail": "JSON inválido."}, status=400)
    pref, _ = Preferencias.objects.get_or_create(cuenta=request.user)
    if "retiro" in datos:
        retiro = datos["retiro"] or None
        if retiro is not None and not (
            request.user.has_perm(permiso(Retiro, "view"))
            and retiros_visibles(request.user).filter(pk=retiro).exists()
        ):
            return JsonResponse({"retiro": ["Esa edición no existe o no puedes verla."]},
                                status=400)
        pref.retiro_id = retiro
    if "moneda" in datos:
        if datos["moneda"] not in ("", *Moneda.values):
            return JsonResponse({"moneda": ["Moneda no válida."]}, status=400)
        pref.moneda = datos["moneda"]
    pref.save()
    return JsonResponse(_usuario_json(request.user))


@require_POST
def cerrar_sesion(request):
    logout(request)
    return JsonResponse({"autenticado": False})
