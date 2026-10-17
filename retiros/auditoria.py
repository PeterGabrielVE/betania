"""
Auditoría automática (modelo Auditoria): cada alta, cambio o baja de los
módulos, los permisos que se dan o quitan a un rol, y los ingresos y salidas.

- Quién y desde dónde: AuditoriaMiddleware guarda el usuario y la IP de la
  petición; fuera de una petición (comandos) queda como "Sistema".
- Qué cambió: antes y después de cada campo. Los datos confidenciales (salud,
  contactos, familia) y la contraseña no se copian: solo se anota que cambiaron.
- Excepción: no se registra cuando un super administrador (superusuario o rol
  de alcance global) entra o sale del sistema. Sí sus cambios a los datos, y
  todos los intentos fallidos de ingreso.

sin_auditar() la apaga en un bloque (p. ej. al cargar la demo).
"""

import contextvars
import datetime
from contextlib import contextmanager
from decimal import Decimal

from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.db.models import ForeignKey
from django.db.models.signals import m2m_changed, post_delete, post_save, pre_save
from django.utils import timezone

_contexto = contextvars.ContextVar("auditoria", default={"usuario": None, "ip": None,
                                                          "activa": True})

# Ni se audita a sí misma ni las preferencias de pantalla de cada usuario.
EXCLUIDOS = {"auditoria", "preferencias", "fotopersona"}
# Campos cuyo valor no se copia: solo se anota que cambiaron.
CONFIDENCIALES = {"datos_sensibles", "salud_alimentacion", "contacto_emergencia", "password"}
# Campos que cambian solos y no dicen nada.
IGNORADOS = {"last_login", "creado", "monto_base"}


# --------------------------------------------------------------------------- #
# Contexto de la petición
# --------------------------------------------------------------------------- #
def _ip(request):
    """La IP de quien hace la petición. X-Forwarded-For lo puede inventar
    cualquiera: solo se usa detrás de un proxy de confianza (PROXY_CONFIABLE)."""
    if settings.PROXY_CONFIABLE:
        reenviada = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
        if reenviada:
            return reenviada
    return request.META.get("REMOTE_ADDR") or None


class AuditoriaMiddleware:
    """Guarda quién hace la petición. Va después de AuthenticationMiddleware."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        token = _contexto.set({
            "usuario": user if user and user.is_authenticated else None,
            "ip": _ip(request),
            "activa": True,
        })
        try:
            return self.get_response(request)
        finally:
            _contexto.reset(token)


@contextmanager
def sin_auditar():
    """Para cargas masivas (la demo): no deja registro."""
    token = _contexto.set({**_contexto.get(), "activa": False})
    try:
        yield
    finally:
        _contexto.reset(token)


def es_super_admin(user):
    """Superusuario o con un rol de alcance global."""
    from .acceso import asignaciones
    from .models import Rol

    return bool(user) and (user.is_superuser or any(
        a.rol.ambito == Rol.Ambito.GLOBAL for a in asignaciones(user)))


def _nombre(user):
    """"Ana Pérez (ana.perez)": la persona y la cuenta con que entró."""
    if not user:
        return ""
    usuario = getattr(user, "usuario_retiros", None)
    nombre = str(usuario.persona) if usuario is not None else user.get_full_name()
    return f"{nombre} ({user.get_username()})" if nombre else user.get_username()


# --------------------------------------------------------------------------- #
# Qué se guarda
# --------------------------------------------------------------------------- #
def _auditable(sender):
    if sender is get_user_model():
        return True
    meta = getattr(sender, "_meta", None)
    return (meta is not None and meta.app_label == "retiros"
            and meta.model_name not in EXCLUIDOS
            # Los modelos "históricos" de las migraciones no son las clases reales.
            and apps.get_model("retiros", meta.model_name) is sender)


def _campos(obj):
    return [f for f in obj._meta.concrete_fields
            if not f.primary_key and f.name not in IGNORADOS]


def _simple(valor):
    if isinstance(valor, (datetime.date, datetime.datetime)):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (str, int, float, bool, dict, list)) or valor is None:
        return valor
    return str(valor)


def _valor(obj, campo):
    """Lo legible de un campo: la opción por su nombre, la relación por su texto."""
    crudo = campo.value_from_object(obj)
    if crudo in (None, ""):
        return None
    if isinstance(campo, ForeignKey):
        try:
            return str(getattr(obj, campo.name))
        except Exception:  # noqa: BLE001 - ya no existe
            return str(crudo)
    if campo.choices:
        return str(dict(campo.flatchoices).get(crudo, crudo))
    if campo.name == "foto_actualizada":
        return "Foto del " + timezone.localtime(crudo).strftime("%d/%m/%Y %H:%M")
    return _simple(crudo)


def _etiqueta(campo):
    from .api.modulos import ETIQUETAS

    return ETIQUETAS.get(campo.name) or str(campo.verbose_name).capitalize()


def _diferencias(antes, despues):
    cambios = {}
    for campo in _campos(despues):
        viejo = campo.value_from_object(antes) if antes is not None else None
        nuevo = campo.value_from_object(despues)
        if antes is not None and viejo == nuevo:
            continue
        if antes is None and nuevo in (None, "", {}, []):
            continue  # al crear, solo lo que trae
        if campo.name in CONFIDENCIALES:
            cambios[campo.name] = {"etiqueta": _etiqueta(campo), "confidencial": True}
            continue
        cambios[campo.name] = {
            "etiqueta": _etiqueta(campo),
            "antes": _valor(antes, campo) if antes is not None else None,
            "despues": _valor(despues, campo),
        }
    return cambios


def _parroquia_id(obj):
    """De qué parroquia es lo afectado (para que cada quien vea lo suyo)."""
    try:
        if getattr(obj, "parroquia_id", None):
            return obj.parroquia_id
        if getattr(obj, "retiro_id", None):
            return obj.retiro.parroquia_id
        if getattr(obj, "participacion_id", None):
            return obj.participacion.retiro.parroquia_id
        if getattr(obj, "persona_id", None):
            return obj.persona.parroquia_id
        usuario = getattr(obj, "usuario_retiros", None)
        if usuario is not None:
            return usuario.persona.parroquia_id
    except Exception:  # noqa: BLE001 - lo relacionado ya no existe
        return None
    return None


def registrar(accion, obj=None, cambios=None, usuario=None, request=None,
              nombre_usuario="", parroquia_id=None):
    from .models import Auditoria

    ctx = _contexto.get()
    if not ctx["activa"]:
        return
    usuario = usuario or ctx["usuario"]
    Auditoria.objects.create(
        usuario_id=getattr(usuario, "pk", None),
        usuario_nombre=nombre_usuario or _nombre(usuario) or "Sistema",
        accion=accion,
        modelo=obj._meta.model_name if obj is not None else "",
        objeto_id=str(obj.pk) if obj is not None else "",
        objeto=str(obj)[:255] if obj is not None else "",
        cambios=cambios or {},
        ip=_ip(request) if request is not None else ctx["ip"],
        parroquia_id=parroquia_id or (_parroquia_id(obj) if obj is not None else None),
    )


# --------------------------------------------------------------------------- #
# Señales
# --------------------------------------------------------------------------- #
def _antes_de_guardar(sender, instance, raw=False, **kwargs):
    if raw or not _auditable(sender) or instance._state.adding or not instance.pk:
        return
    instance._auditoria_antes = sender._base_manager.filter(pk=instance.pk).first()


def _al_guardar(sender, instance, created, raw=False, **kwargs):
    from .models import Auditoria

    if raw or not _auditable(sender) or not _contexto.get()["activa"]:
        return
    antes = None if created else getattr(instance, "_auditoria_antes", None)
    cambios = _diferencias(antes, instance)
    if not created and not cambios:
        return
    registrar(Auditoria.Accion.CREAR if created else Auditoria.Accion.CAMBIAR,
              instance, cambios)


def _al_eliminar(sender, instance, **kwargs):
    from .models import Auditoria

    if _auditable(sender):
        registrar(Auditoria.Accion.ELIMINAR, instance)


def _permisos_del_rol(sender, instance, action, pk_set, **kwargs):
    """Permisos que se dan o quitan a un rol (Rol.permisos)."""
    from django.contrib.auth.models import Permission

    from .models import Auditoria, Rol

    if not isinstance(instance, Rol) or action not in ("post_add", "post_remove"):
        return
    nombres = sorted(str(p.name) for p in Permission.objects.filter(pk__in=pk_set or []))
    if not nombres:
        return
    lista = ", ".join(nombres)
    registrar(Auditoria.Accion.CAMBIAR, instance, {"permisos": {
        "etiqueta": "Permisos",
        "antes": lista if action == "post_remove" else None,
        "despues": lista if action == "post_add" else None,
        "detalle": "quitados" if action == "post_remove" else "agregados",
    }})


def _ingreso(sender, request, user, **kwargs):
    from .models import Auditoria

    if not es_super_admin(user):
        registrar(Auditoria.Accion.INGRESO, usuario=user, request=request,
                  parroquia_id=_parroquia_id(user))


def _salida(sender, request, user, **kwargs):
    from .models import Auditoria

    if user is not None and not es_super_admin(user):
        registrar(Auditoria.Accion.SALIDA, usuario=user, request=request,
                  parroquia_id=_parroquia_id(user))


def _ingreso_fallido(sender, credentials, request=None, **kwargs):
    from .models import Auditoria

    # Solo el nombre de usuario que se intentó (la clave nunca se guarda).
    intentado = str(credentials.get("username", ""))[:150]
    registrar(Auditoria.Accion.INGRESO_FALLIDO, request=request,
              nombre_usuario=intentado or "(sin usuario)",
              cambios={"usuario": {"etiqueta": "Usuario intentado", "antes": None,
                                   "despues": intentado}})


def conectar():
    """Lo llama RetirosConfig.ready()."""
    pre_save.connect(_antes_de_guardar, dispatch_uid="auditoria_pre_save")
    post_save.connect(_al_guardar, dispatch_uid="auditoria_post_save")
    post_delete.connect(_al_eliminar, dispatch_uid="auditoria_post_delete")
    from .models import Rol

    m2m_changed.connect(_permisos_del_rol, sender=Rol.permisos.through,
                        dispatch_uid="auditoria_permisos_rol")
    user_logged_in.connect(_ingreso, dispatch_uid="auditoria_ingreso")
    user_logged_out.connect(_salida, dispatch_uid="auditoria_salida")
    user_login_failed.connect(_ingreso_fallido, dispatch_uid="auditoria_ingreso_fallido")

