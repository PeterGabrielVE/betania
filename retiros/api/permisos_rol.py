"""
Los permisos de un rol, como una tabla: una fila por módulo (los de MODULOS) y
una columna por acción (ver, agregar, cambiar, eliminar).

Quien no es superusuario solo puede dar permisos que él mismo tiene: así nadie
se sube de nivel creando o editando un rol.
"""

from django.contrib.auth.models import Permission
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from ..models import Rol
from .modulos import MODULOS
from .permisos import permiso

ACCIONES = [("view", "Ver"), ("add", "Agregar"), ("change", "Cambiar"), ("delete", "Eliminar")]


def _modulos():
    """Un módulo por modelo, en el orden del menú: (grupo, título, model_name)."""
    vistos, filas = set(), []
    for m in MODULOS:
        nombre = m.modelo._meta.model_name
        if nombre not in vistos:
            vistos.add(nombre)
            filas.append((m.grupo, m.titulo, nombre))
    return filas


def _permisos_de_la_app():
    return {p.codename: p for p in Permission.objects.filter(content_type__app_label="retiros")}


@api_view(["GET", "PUT"])
def permisos_rol(request, pk):
    """GET: la tabla de permisos del rol. PUT {"permisos": ["view_pago", ...]}:
    los deja exactamente así."""
    user = request.user
    if not user.has_perm(permiso(Rol, "view")):
        raise PermissionDenied()
    rol = get_object_or_404(Rol, pk=pk)
    existentes = _permisos_de_la_app()
    modulos = _modulos()
    validos = {f"{a}_{m}" for _g, _t, m in modulos for a, _ in ACCIONES} & existentes.keys()
    actuales = set(rol.permisos.values_list("codename", flat=True))

    if request.method == "PUT":
        if not user.has_perm(permiso(Rol, "change")):
            raise PermissionDenied()
        pedidos = request.data.get("permisos")
        if not isinstance(pedidos, list):
            return Response({"detail": "Envía la lista de permisos."}, status=400)
        nuevos = {str(p) for p in pedidos} & validos
        if not user.is_superuser:
            propios = {p.split(".", 1)[1] for p in user.get_all_permissions()
                       if p.startswith("retiros.")}
            ajenos = (nuevos - actuales) - propios
            if ajenos:
                return Response({"detail": (
                    "Solo puedes dar permisos que tú tienes. Te faltan: "
                    + ", ".join(sorted(ajenos)) + "."
                )}, status=403)
        with transaction.atomic():
            # Los que no son de esta tabla (otros modelos) se conservan.
            rol.permisos.set([existentes[c] for c in nuevos]
                             + list(rol.permisos.exclude(codename__in=validos)))
        actuales = set(rol.permisos.values_list("codename", flat=True))

    grupos = {}
    for grupo, titulo, modelo in modulos:
        grupos.setdefault(grupo, []).append({
            "modelo": modelo,
            "titulo": titulo,
            # None: esa acción no existe para el módulo.
            "acciones": {a: (f"{a}_{modelo}" in actuales if f"{a}_{modelo}" in validos else None)
                         for a, _ in ACCIONES},
        })
    return Response({
        "rol": {
            "id": rol.pk, "nombre": rol.nombre, "descripcion": rol.descripcion,
            "ambito": rol.ambito, "ambito_display": rol.get_ambito_display(),
            "ve_datos_sensibles": rol.ve_datos_sensibles, "sistema": rol.sistema,
            "asignaciones": rol.asignaciones.count(),
        },
        "acciones": [{"valor": a, "etiqueta": e} for a, e in ACCIONES],
        "grupos": [{"grupo": g, "modulos": filas} for g, filas in grupos.items()],
        "puede_cambiar": user.has_perm(permiso(Rol, "change")),
    })
