"""Sesión. Son vistas Django normales: el CsrfViewMiddleware las protege."""

import json

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from ..acceso import asignaciones, retiros_visibles
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
        "nombre": _nombre(user),
        # Su ficha de persona (si la cuenta es de un Usuario) y sus roles, para
        # el menú del usuario.
        "persona": _persona(user),
        "roles": _roles(user),
        "email": user.email,
        "es_staff": user.is_staff,
        "es_superusuario": user.is_superuser,
        # Con qué moneda y formato regional muestra el frontend montos y fechas.
        "moneda": settings.MONEDA,
        "region": settings.REGION,
        "monedas": [{"valor": v, "etiqueta": e} for v, e in Moneda.choices],
        "preferencias": _preferencias_json(user),
    }


def _usuario_de(user):
    return getattr(user, "usuario_retiros", None)


def _nombre(user):
    usuario = _usuario_de(user)
    if usuario is not None:
        return str(usuario.persona)
    return user.get_full_name() or user.get_username()


def _persona(user):
    usuario = _usuario_de(user)
    if usuario is None:
        return None
    return {"id": usuario.persona_id, "nombre": str(usuario.persona)}


def _roles(user):
    """"Coordinador de logística · Emaús hombres #12"…"""
    if user.is_superuser:
        return ["Superusuario (todo el sistema)"]
    return [
        f"{a.rol} · {a.retiro or a.parroquia or a.diocesis or 'Todo el sistema'}"
        for a in asignaciones(user)
    ]


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
        return JsonResponse({"detail": "Inicia sesión."}, status=401)
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


# --------------------------------------------------------------------------- #
# Mi cuenta: lo que cada usuario cambia de sí mismo
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "PATCH"])
def cuenta(request):
    """GET: sus datos y roles. PATCH {"email"}: cambia su correo."""
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Inicia sesión."}, status=401)
    if request.method == "PATCH":
        try:
            datos = json.loads(request.body or b"{}")
        except ValueError:
            return JsonResponse({"detail": "JSON inválido."}, status=400)
        email = str(datos.get("email", user.email) or "").strip()
        try:
            validate_email(email) if email else None
        except ValidationError:
            return JsonResponse({"email": ["Escribe un correo válido."]}, status=400)
        user.email = email
        user.save(update_fields=["email"])
    usuario = _usuario_de(user)
    return JsonResponse({
        "username": user.get_username(),
        "nombre": _nombre(user),
        "email": user.email,
        "persona": _persona(user),
        "roles": _roles(user),
        "ultimo_acceso": user.last_login.isoformat() if user.last_login else None,
        "creada": user.date_joined.isoformat(),
        "activo": usuario.activo if usuario is not None else True,
    })


@require_POST
def cambiar_clave(request):
    """{"actual", "nueva"}: cambia su contraseña sin cerrar la sesión."""
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Inicia sesión."}, status=401)
    try:
        datos = json.loads(request.body or b"{}")
    except ValueError:
        return JsonResponse({"detail": "JSON inválido."}, status=400)
    actual, nueva = str(datos.get("actual") or ""), str(datos.get("nueva") or "")
    if not user.check_password(actual):
        return JsonResponse({"actual": ["La contraseña actual no es correcta."]}, status=400)
    if nueva == actual:
        return JsonResponse({"nueva": ["La nueva debe ser distinta de la actual."]}, status=400)
    try:
        validate_password(nueva, user)
    except ValidationError as e:
        return JsonResponse({"nueva": list(e.messages)}, status=400)
    user.set_password(nueva)
    user.save(update_fields=["password"])
    update_session_auth_hash(request, user)  # que no lo saque de la sesión
    return JsonResponse({"detail": "Contraseña cambiada."})
