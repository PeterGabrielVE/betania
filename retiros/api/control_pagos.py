"""
Control de pagos de un retiro: lo que cada caminante y cada servidor debe
aportar, sus abonos uno por uno, lo pagado y lo que resta. Es la hoja de Excel
"Control de pago servidores" / "Listado de caminantes", pero al día.

Los abonos se registran con /api/pagos/ (el módulo de Pagos); aquí además se
puede cambiar el monto de una persona que no paga la cuota del retiro.
"""

from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from ..acceso import retiros_visibles
from ..models import EstadoPago, Inscripcion, Pago, Participacion, Retiro
from .paneles import _ficha, elegir_retiro
from .permisos import permiso, ve_sensibles


def _abono(p):
    return {
        "id": p.pk,
        "fecha": p.fecha,
        "monto": p.monto,          # en la moneda en que se pagó
        "moneda": p.moneda,
        "monto_base": p.monto_base,  # en la moneda base, para sumar
        "metodo": p.get_metodo_display(),
        "referencia": p.referencia,
        "concepto": p.get_concepto_display(),
    }


def _cuenta(fila, cuota, propia, abonos, cancelado):
    """Agrega a la fila monto, abonos, pagado, resta y estado del pago."""
    pagado = sum((a["monto_base"] for a in abonos), Decimal(0))
    fila.update(
        cuota=cuota,
        cuota_propia=propia,
        abonos=abonos,
        pagado=pagado,
        # Quien canceló ya no debe nada.
        saldo=Decimal(0) if cancelado else max(cuota - pagado, Decimal(0)),
        estado_pago=EstadoPago.de(pagado, cuota),
        cancelado=cancelado,
    )
    return fila


def _totales(filas):
    activas = [f for f in filas if not f["cancelado"]]
    conteo = dict.fromkeys(EstadoPago.values, 0)
    for f in activas:
        conteo[f["estado_pago"]] += 1
    return {
        "personas": len(activas),
        "esperado": sum((f["cuota"] for f in activas), Decimal(0)),
        "pagado": sum((f["pagado"] for f in filas), Decimal(0)),
        "saldo": sum((f["saldo"] for f in activas), Decimal(0)),
        "por_estado_pago": [
            {"valor": v, "etiqueta": e, "total": conteo[v]} for v, e in EstadoPago.choices
        ],
    }


def _caminantes(retiro, sensibles):
    pagos = Pago.objects.order_by("fecha", "pk")
    inscripciones = (
        retiro.inscripciones
        .select_related("persona__pais", "persona__estado", "persona__ciudad")
        .prefetch_related(Prefetch("pagos", queryset=pagos))
        .order_by("persona__nombre")
    )
    filas = []
    for i in inscripciones:
        fila = {
            "id": i.pk,
            "persona_id": i.persona_id,
            "persona": i.persona.nombre,
            "telefono": i.persona.telefono,
            "estado": i.estado,
            "estado_display": i.get_estado_display(),
        }
        if sensibles:
            fila["ficha"] = _ficha(i, retiro)
        filas.append(_cuenta(fila, i.cuota_a_pagar, i.cuota is not None,
                             [_abono(p) for p in i.pagos.all()],
                             i.estado == Inscripcion.Estado.CANCELADA))
    return {"cuota": retiro.cuota, "filas": filas, "totales": _totales(filas)}


def _servidores(retiro):
    # Lo que aporta un servidor son los pagos a su nombre que no son la cuota de
    # un caminante (como en el panel del retiro).
    abonos = {}
    for p in (retiro.pagos.filter(inscripcion__isnull=True, persona__isnull=False)
              .order_by("fecha", "pk")):
        abonos.setdefault(p.persona_id, []).append(_abono(p))
    participaciones = (
        retiro.participaciones.exclude(tipo=Participacion.Tipo.CAMINANTE)
        .select_related("persona").prefetch_related("servicios__area")
        .order_by("persona__nombre")
    )
    filas = []
    for p in participaciones:
        areas = [s.area.nombre for s in p.servicios.all()]
        fila = {
            "id": p.pk,
            "persona_id": p.persona_id,
            "persona": p.persona.nombre,
            "telefono": p.persona.telefono,
            # El "equipo" de la hoja: sus áreas o, si coordina, eso.
            "equipo": ", ".join(areas) or p.get_tipo_display(),
            "estado": p.estado,
            "estado_display": p.get_estado_display(),
        }
        filas.append(_cuenta(fila, p.cuota_a_pagar, p.cuota is not None,
                             abonos.get(p.persona_id, []),
                             p.estado == Participacion.Estado.CANCELADO))
    return {"cuota": retiro.cuota_servidor, "filas": filas, "totales": _totales(filas)}


@api_view(["GET"])
def control_pagos(request):
    """Caminantes y servidores de un retiro (?retiro=<id>; si no, el mismo que
    el inicio) con sus pagos. Hace falta ver los pagos (tesorería,
    coordinación, logística)."""
    user = request.user
    if not (user.has_perm(permiso(Pago, "view")) and user.has_perm(permiso(Retiro, "view"))):
        raise PermissionDenied()
    retiros, retiro = elegir_retiro(request, timezone.localdate())
    if retiro is None:
        return Response({"retiros": [], "retiro": None})
    return Response({
        "retiros": [{"id": r.pk, "etiqueta": str(r), "fecha_inicio": r.fecha_inicio}
                    for r in retiros],
        "retiro": {"id": retiro.pk, "etiqueta": str(retiro), "fecha_inicio": retiro.fecha_inicio},
        "puede_registrar": user.has_perm(permiso(Pago, "add")),
        # Cambiar lo que paga una persona es decisión de quien cobra.
        "puede_cambiar_monto": user.has_perm(permiso(Pago, "add")),
        "caminantes": (_caminantes(retiro, ve_sensibles(request))
                       if user.has_perm(permiso(Inscripcion, "view")) else None),
        "servidores": (_servidores(retiro)
                       if user.has_perm(permiso(Participacion, "view")) else None),
    })


@api_view(["POST"])
def cambiar_monto(request):
    """{"tipo": "caminante" | "servidor", "id": ..., "cuota": 25 | null}. Null
    vuelve a la cuota del retiro."""
    if not request.user.has_perm(permiso(Pago, "add")):
        raise PermissionDenied()
    modelo = {"caminante": Inscripcion, "servidor": Participacion}.get(request.data.get("tipo"))
    if modelo is None:
        return Response({"detail": "Tipo no válido."}, status=400)
    # El RLS limita a lo que el usuario puede ver; además, a sus retiros.
    obj = get_object_or_404(
        modelo.objects.filter(retiro__in=retiros_visibles(request.user)),
        pk=request.data.get("id"),
    )
    valor = request.data.get("cuota")
    try:
        obj.cuota = None if valor in (None, "") else Decimal(str(valor))
    except InvalidOperation:
        return Response({"cuota": ["Escribe un monto."]}, status=400)
    try:
        obj.clean()
    except ValidationError as e:
        return Response(e.message_dict, status=400)
    obj.save(update_fields=["cuota"])
    return Response({"cuota": obj.cuota_a_pagar, "cuota_propia": obj.cuota is not None})
