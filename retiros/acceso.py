"""
Qué puede hacer cada rol. Un usuario que no es superusuario entra con su cuenta
(auth.User) enlazada a un Usuario (Usuario.cuenta) y obtiene los permisos de sus
AsignacionRol; no hace falta darle permisos uno por uno en el admin.

    Coordinación (de parroquia o de retiro): ve todo el retiro, incluidos datos
        confidenciales y finanzas; registra pagos y gastos y edita caminantes,
        equipo y charlas.
    Logística: ve lo mismo que coordinación; edita caminantes y equipo, pero los
        pagos y gastos solo los consulta.

Los demás roles siguen usando los permisos normales de Django (usuario o grupo).
"""

from django.contrib.auth.backends import BaseBackend

from .models import Rol

# De mayor a menor alcance: con varias asignaciones, la primera fija el contexto RLS.
PRIORIDAD = [
    Rol.SUPER_ADMIN, Rol.ADMIN_DIOCESANO, Rol.COORD_PARROQUIA, Rol.COORD_RETIRO,
    Rol.LOGISTICA, Rol.TESORERIA, Rol.SECRETARIA, Rol.SERVIDOR,
]

_VER = [
    "diocesis", "parroquia", "tiporetiro", "areaservicio", "persona", "retiro", "charla",
    "inscripcion", "participacion", "asignacionservicio", "pago", "gasto",
]
_EQUIPO = ["persona", "inscripcion", "participacion", "asignacionservicio"]


def _perms(acciones, modelos):
    return {f"retiros.{a}_{m}" for a in acciones for m in modelos}


_COORDINACION = (
    _perms(["view"], _VER)
    | _perms(["add", "change", "delete"], [*_EQUIPO, "charla", "pago", "gasto"])
    | _perms(["change"], ["retiro"])
)

PERMISOS_ROL = {
    Rol.COORD_PARROQUIA: _COORDINACION | _perms(["add"], ["retiro"]),
    Rol.COORD_RETIRO: _COORDINACION,
    Rol.LOGISTICA: _perms(["view"], _VER) | _perms(["add", "change"], _EQUIPO),
}


def asignaciones(user):
    """AsignacionRol del usuario, de mayor a menor alcance (vacío si no tiene)."""
    if not user or not user.is_authenticated or not user.is_active:
        return []
    usuario = getattr(user, "usuario_retiros", None)
    if usuario is None or not usuario.activo:
        return []
    roles = list(usuario.roles.all())
    return sorted(roles, key=lambda a: PRIORIDAD.index(a.rol))


class RolBackend(BaseBackend):
    """Permisos de Django que salen de los roles (ver PERMISOS_ROL)."""

    def get_all_permissions(self, user_obj, obj=None):
        if obj is not None:
            return set()
        if not hasattr(user_obj, "_permisos_rol"):
            user_obj._permisos_rol = set().union(
                *(PERMISOS_ROL.get(a.rol, set()) for a in asignaciones(user_obj))
            )
        return user_obj._permisos_rol
