"""
Qué puede hacer cada usuario. Un usuario que no es superusuario entra con su
cuenta (auth.User) enlazada a un Usuario (Usuario.cuenta) y obtiene los permisos
de los roles que tiene asignados (AsignacionRol -> Rol.permisos). Los roles y sus
permisos se crean y cambian desde la pantalla Roles y permisos; los iniciales
están en roles.py.

El ámbito del rol (global, diócesis, parroquia, retiro) decide además qué filas
ve (RLS, ver middleware.py) y qué filtros quedan fijos (ambito_fijo).
"""

from django.contrib.auth.backends import BaseBackend
from django.contrib.auth.models import Permission
from django.db.models import Prefetch

from .models import Retiro, Rol


def asignaciones(user):
    """AsignacionRol del usuario, de mayor a menor alcance (vacío si no tiene)."""
    if not user or not user.is_authenticated or not user.is_active:
        return []
    usuario = getattr(user, "usuario_retiros", None)
    if usuario is None or not usuario.activo:
        return []
    if not hasattr(usuario, "_asignaciones"):
        roles = usuario.roles.select_related("rol").prefetch_related(Prefetch(
            "rol__permisos", queryset=Permission.objects.select_related("content_type"),
            to_attr="_permisos"))
        usuario._asignaciones = sorted(roles, key=_alcance)
    return usuario._asignaciones


def _alcance(asignacion):
    """Para ordenar de mayor a menor alcance: global, diócesis, parroquia, retiro."""
    ambito = asignacion.rol.ambito
    if ambito == Rol.Ambito.PARROQUIA_O_RETIRO:
        ambito = Rol.Ambito.RETIRO if asignacion.retiro_id else Rol.Ambito.PARROQUIA
    return Rol.ORDEN_AMBITO.index(ambito)


def ambito_fijo(user):
    """La parroquia y el tipo de retiro a los que el rol limita al usuario:
    {"parroquia": Parroquia, "tipo": TipoRetiro} (cada uno solo si está fijo).

    Un rol de parroquia tiene fija su parroquia; uno de retiro, además, el tipo
    de ese retiro. Con varios roles solo se fija lo que todos comparten; los
    roles globales o diocesanos no tienen nada fijo."""
    if not hasattr(user, "_ambito_fijo"):
        user._ambito_fijo = _calcular_ambito(user)
    return user._ambito_fijo


def _calcular_ambito(user):
    asigs = asignaciones(user)
    if (not asigs or user.is_superuser
            or any(a.rol.ambito in (Rol.Ambito.GLOBAL, Rol.Ambito.DIOCESIS) for a in asigs)):
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


def retiros_visibles(user):
    """Los retiros que el usuario ve: los de la parroquia y el tipo que fija su
    rol (el RLS ya limita la parroquia; esto suma el tipo de retiro)."""
    ambito = ambito_fijo(user)
    return Retiro.objects.filter(**{n: obj.pk for n, obj in ambito.items()})


def permisos_de(asignacion):
    """"retiros.view_pago"... del rol de una asignación."""
    return {f"{p.content_type.app_label}.{p.codename}" for p in asignacion.rol._permisos}


def ve_datos_sensibles(user):
    return user.is_superuser or any(a.rol.ve_datos_sensibles for a in asignaciones(user))


def ve_finanzas(user):
    return user.is_superuser or any(
        {"retiros.view_pago", "retiros.view_gasto"} & permisos_de(a) for a in asignaciones(user))


class RolBackend(BaseBackend):
    """Permisos de Django que salen de los roles del usuario (Rol.permisos)."""

    def get_all_permissions(self, user_obj, obj=None):
        if obj is not None:
            return set()
        if not hasattr(user_obj, "_permisos_rol"):
            user_obj._permisos_rol = set().union(
                *(permisos_de(a) for a in asignaciones(user_obj))
            )
        return user_obj._permisos_rol
