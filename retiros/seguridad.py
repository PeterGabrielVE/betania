"""
Límite de intentos de inicio de sesión (en la app y en el admin de Django).

- Por usuario: LIMITE_POR_USUARIO intentos fallidos en VENTANA lo bloquean
  durante BLOQUEO, aunque el usuario no exista (así no se puede averiguar qué
  usuarios hay).
- Por IP: LIMITE_POR_IP intentos fallidos en VENTANA, contra cualquier usuario,
  bloquean esa IP (frena a quien prueba muchos usuarios).
- Un ingreso correcto borra los fallos de ese usuario.

BloqueoBackend va primero en AUTHENTICATION_BACKENDS: con bloqueo, ni siquiera
se prueba la contraseña.
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.core.exceptions import PermissionDenied
from django.utils import timezone


def _limites():
    return (
        getattr(settings, "LIMITE_INTENTOS_USUARIO", 5),
        getattr(settings, "LIMITE_INTENTOS_IP", 20),
        timedelta(minutes=getattr(settings, "VENTANA_INTENTOS_MINUTOS", 15)),
        timedelta(minutes=getattr(settings, "BLOQUEO_MINUTOS", 15)),
    )


def _normal(usuario):
    return (usuario or "").strip().lower()[:150]


def _ip(request):
    from .auditoria import _ip as ip_de
    return ip_de(request) if request is not None else None


def _fallos(**filtro):
    from .models import IntentoFallido
    ventana = _limites()[2]
    return IntentoFallido.objects.filter(fecha__gte=timezone.now() - ventana, **filtro)


def bloqueo(usuario, request=None):
    """Segundos que faltan para poder intentar de nuevo (0 si no hay bloqueo)."""
    por_usuario, por_ip, _ventana, duracion = _limites()
    ahora = timezone.now()
    restante = timedelta(0)
    for filtro, limite in (({"usuario": _normal(usuario)}, por_usuario),
                           ({"ip": _ip(request)}, por_ip)):
        if not all(filtro.values()):
            continue
        fechas = list(_fallos(**filtro).order_by("-fecha")
                      .values_list("fecha", flat=True)[:limite])
        if len(fechas) >= limite:
            # Cuenta desde el último intento fallido.
            restante = max(restante, fechas[0] + duracion - ahora)
    return max(int(restante.total_seconds()), 0)


def intentos_restantes(usuario):
    return max(_limites()[0] - _fallos(usuario=_normal(usuario)).count(), 0)


def desbloquear(usuario):
    from .models import IntentoFallido
    IntentoFallido.objects.filter(usuario=_normal(usuario)).delete()


def bloqueo_minutos():
    return int(_limites()[3].total_seconds() // 60)


def minutos(segundos):
    """Redondeado hacia arriba, al menos 1."""
    return max(1, -(-segundos // 60))


class BloqueoBackend:
    """Antes que ModelBackend: con bloqueo, corta la autenticación."""

    def authenticate(self, request, username=None, **kwargs):
        if username and bloqueo(username, request):
            raise PermissionDenied("Demasiados intentos.")
        return None

    def get_user(self, user_id):
        # Una sesión abierta sin indicar el backend (login() sin backend,
        # force_login) queda con el primero de la lista, que es este: el
        # usuario se lee igual que en ModelBackend.
        from django.contrib.auth.backends import ModelBackend
        return ModelBackend().get_user(user_id)


def _fallo(sender, credentials, request=None, **kwargs):
    from .auditoria import registrar
    from .models import Auditoria, IntentoFallido

    usuario = _normal(credentials.get("username"))
    # Ya bloqueado: no se alarga el bloqueo con cada reintento.
    if not usuario or bloqueo(usuario, request):
        return
    IntentoFallido.objects.create(usuario=usuario, ip=_ip(request))
    IntentoFallido.objects.filter(fecha__lt=timezone.now() - timedelta(days=2)).delete()
    if bloqueo(usuario, request):
        registrar(Auditoria.Accion.BLOQUEO, request=request, nombre_usuario=usuario,
                  cambios={"usuario": {"etiqueta": "Usuario bloqueado", "antes": None,
                                       "despues": usuario}})


def _ingreso(sender, request, user, **kwargs):
    desbloquear(user.get_username())


def conectar():
    """Lo llama RetirosConfig.ready()."""
    user_login_failed.connect(_fallo, dispatch_uid="seguridad_fallo")
    user_logged_in.connect(_ingreso, dispatch_uid="seguridad_ingreso")
