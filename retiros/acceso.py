"""
Qué puede hacer cada rol. Un usuario que no es superusuario entra con su cuenta
(auth.User) enlazada a un Usuario (Usuario.cuenta) y obtiene los permisos de sus
AsignacionRol; no hace falta darle permisos uno por uno en el admin.

    Coordinación (de parroquia o de retiro): ve todo el retiro, incluidos datos
        confidenciales y finanzas; registra pagos y gastos y edita caminantes,
        equipo, charlas y tareas.
    Logística: ve lo mismo que coordinación; edita caminantes, equipo y tareas, pero los
        pagos y gastos solo los consulta.

Los demás roles siguen usando los permisos normales de Django (usuario o grupo).
"""

from django.contrib.auth.backends import BaseBackend

from .models import Retiro, Rol

# De mayor a menor alcance: con varias asignaciones, la primera fija el contexto RLS.
PRIORIDAD = [
    Rol.SUPER_ADMIN, Rol.ADMIN_DIOCESANO, Rol.COORD_PARROQUIA, Rol.COORD_RETIRO,
    Rol.LOGISTICA, Rol.TESORERIA, Rol.SECRETARIA, Rol.SERVIDOR,
]

_VER = [
    "diocesis", "parroquia", "tiporetiro", "areaservicio", "persona", "retiro", "charla",
    "inscripcion", "participacion", "asignacionservicio", "pago", "gasto", "tarea",
]
_EQUIPO = ["persona", "inscripcion", "participacion", "asignacionservicio", "tarea"]


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
    Rol.LOGISTICA: (
        _perms(["view"], _VER) | _perms(["add", "change"], _EQUIPO)
        | _perms(["delete"], ["tarea"])
    ),
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


def ambito_fijo(user):
    """La parroquia y el tipo de retiro a los que el rol limita al usuario:
    {"parroquia": Parroquia, "tipo": TipoRetiro} (cada uno solo si está fijo).

    Un coordinador de parroquia tiene fija su parroquia; uno de retiro o de
    logística, además, el tipo de ese retiro. Con varios roles solo se fija lo
    que todos comparten; los roles globales o diocesanos no tienen nada fijo."""
    if not hasattr(user, "_ambito_fijo"):
        user._ambito_fijo = _calcular_ambito(user)
    return user._ambito_fijo


def _calcular_ambito(user):
    asigs = asignaciones(user)
    if (not asigs or user.is_superuser
            or any(a.rol in (Rol.SUPER_ADMIN, Rol.ADMIN_DIOCESANO) for a in asigs)):
        return {}
    retiros = {
        r.pk: r for r in Retiro.objects.select_related("parroquia", "tipo")
        .filter(pk__in=[a.retiro_id for a in asigs if a.retiro_id])
    }
    parroquias, tipos = {}, {}
    for a in asigs:
        retiro = retiros.get(a.retiro_id)
        parroquia = a.parroquia if a.parroquia_id else retiro and retiro.parroquia
        parroquias[parroquia and parroquia.pk] = parroquia
        tipos[retiro and retiro.tipo_id] = retiro and retiro.tipo
    ambito = {}
    if len(parroquias) == 1 and None not in parroquias:
        ambito["parroquia"] = next(iter(parroquias.values()))
    if len(tipos) == 1 and None not in tipos:
        ambito["tipo"] = next(iter(tipos.values()))
    return ambito


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
