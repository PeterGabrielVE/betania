"""Opciones de los filtros de la pantalla de auditoría."""

from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from ..models import Auditoria
from .modulos import titulo_modelo
from .permisos import permiso


@api_view(["GET"])
def opciones(request):
    """Las acciones y los módulos que aparecen en la auditoría."""
    if not request.user.has_perm(permiso(Auditoria, "view")):
        raise PermissionDenied()
    modelos = (Auditoria.objects.exclude(modelo="").order_by()
               .values_list("modelo", flat=True).distinct())
    return Response({
        "acciones": [{"valor": v, "etiqueta": e} for v, e in Auditoria.Accion.choices],
        "modulos": sorted(({"valor": m, "etiqueta": titulo_modelo(m)} for m in modelos),
                          key=lambda o: o["etiqueta"]),
    })
