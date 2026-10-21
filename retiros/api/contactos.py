"""
Contactos familiares de un retiro: a quién llamar por cada caminante y cada
servidor, con su documento y su cama para ubicarlo. Es confidencial: solo para
los roles que ven datos sensibles.
"""

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from ..models import Inscripcion, Participacion, Retiro
from .paneles import _contactos, elegir_retiro
from .permisos import permiso, ve_sensibles


def _fila(id, tipo, obj, estado, cancelado):
    persona = obj.persona
    return {
        "id": id,
        "persona_id": persona.pk,
        "persona": persona.nombre,
        "documento": persona.documento_completo,
        "telefono": persona.telefono,
        "tipo": tipo,
        "cama": obj.cama,
        "estado_display": estado,
        "cancelado": cancelado,
        "contactos": _contactos(obj.contacto_emergencia),
    }


@api_view(["GET"])
def contactos(request):
    """Caminantes y servidores de un retiro (?retiro=<id>; si no, el mismo que
    el inicio) con sus familiares de contacto."""
    user = request.user
    ve_caminantes = user.has_perm(permiso(Inscripcion, "view"))
    ve_servidores = user.has_perm(permiso(Participacion, "view"))
    if not (ve_sensibles(request) and user.has_perm(permiso(Retiro, "view"))
            and (ve_caminantes or ve_servidores)):
        raise PermissionDenied()
    retiros, retiro = elegir_retiro(request, timezone.localdate())
    if retiro is None:
        return Response({"retiros": [], "retiro": None})
    filas = []
    if ve_caminantes:
        filas += [
            _fila(i.pk, "Caminante", i, i.get_estado_display(),
                  i.estado == Inscripcion.Estado.CANCELADA)
            for i in retiro.inscripciones.select_related("persona")
        ]
    if ve_servidores:
        filas += [
            _fila(p.pk, p.get_tipo_display(), p, p.get_estado_display(),
                  p.estado == Participacion.Estado.CANCELADO)
            for p in retiro.participaciones.exclude(tipo=Participacion.Tipo.CAMINANTE)
            .select_related("persona")
        ]
    filas.sort(key=lambda f: f["persona"].lower())
    return Response({
        "retiros": [{"id": r.pk, "etiqueta": str(r), "fecha_inicio": r.fecha_inicio}
                    for r in retiros],
        "retiro": {"id": retiro.pk, "etiqueta": str(retiro), "fecha_inicio": retiro.fecha_inicio},
        "filas": filas,
    })
