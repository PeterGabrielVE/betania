"""
Vistas de solo lectura que juntan información de varios módulos: el resumen de
la página de inicio y el panel de un retiro.

El RLS limita las filas a lo que el usuario puede ver; aquí además se omite cada
sección si falta el permiso 'view' de su modelo.
"""

from django.db.models import Count, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from ..models import (
    Charla, EstadoPago, Gasto, Inscripcion, Pago, Participacion, Persona, Retiro,
)
from .modulos import INSCRITAS
from .permisos import permiso


def _ve(user, modelo):
    return user.has_perm(permiso(modelo, "view"))


# Todos los totales van en la moneda base (ver Movimiento.monto_base).
def _total(queryset):
    return queryset.aggregate(t=Sum("monto_base"))["t"] or 0


def _por_opcion(queryset, campo, opciones):
    """Total por cada opción de un campo (concepto, categoría...)."""
    totales = dict(queryset.values_list(campo).annotate(t=Sum("monto_base")))
    return [
        {"valor": valor, "etiqueta": etiqueta, "total": totales.get(valor, 0)}
        for valor, etiqueta in opciones
    ]


def _retiro_json(r):
    return {
        "id": r.pk, "etiqueta": str(r), "fecha_inicio": r.fecha_inicio,
        "fecha_fin": r.fecha_fin, "cupo": r.cupo, "inscritos": r.inscritos,
        "estado": r.estado, "estado_display": r.get_estado_display(),
    }


@api_view(["GET"])
def resumen(request):
    hoy = timezone.localdate()
    por_estado = dict(
        Inscripcion.objects.values_list("estado").annotate(total=Count("id"))
    )
    proximos = (
        Retiro.objects.select_related("tipo")
        .annotate(inscritos=Count("inscripciones", filter=INSCRITAS))
        .filter(fecha_fin__gte=hoy).order_by("fecha_inicio")[:5]
    )
    # El RLS oculta pagos/gastos a roles sin acceso a finanzas: verán 0.
    ingresos = _total(Pago.objects)
    egresos = _total(Gasto.objects)
    return Response({
        "personas": Persona.objects.count(),
        "retiros": Retiro.objects.count(),
        "retiros_activos": Retiro.objects.exclude(estado=Retiro.Estado.FINALIZADO).count(),
        "inscripciones": sum(por_estado.values()),
        "inscripciones_por_estado": [
            {"estado": valor, "etiqueta": etiqueta, "total": por_estado.get(valor, 0)}
            for valor, etiqueta in Inscripcion.Estado.choices
        ],
        "ingresos": ingresos,
        "egresos": egresos,
        "balance": ingresos - egresos,
        "proximos_retiros": [_retiro_json(r) for r in proximos],
    })


# --------------------------------------------------------------------------- #
# Panel de un retiro
# --------------------------------------------------------------------------- #
def _caminantes(retiro, con_pagos):
    inscripciones = (
        retiro.inscripciones.select_related("persona", "padrino")
        .order_by("persona__nombre")
    )
    if con_pagos:
        inscripciones = inscripciones.annotate(pagado=Sum("pagos__monto_base"))
    filas, por_estado = [], dict.fromkeys(Inscripcion.Estado.values, 0)
    for i in inscripciones:
        por_estado[i.estado] += 1
        fila = {
            "id": i.pk,
            "persona": i.persona.nombre,
            "telefono": i.persona.telefono,
            "padrino": i.padrino.nombre if i.padrino_id else "",
            "estado": i.estado,
        }
        if con_pagos:
            pagado = i.pagado or 0
            cancelada = i.estado == Inscripcion.Estado.CANCELADA
            fila.update(
                pagado=pagado,
                # Quien canceló ya no debe la cuota.
                saldo=0 if cancelada else max(retiro.cuota - pagado, 0),
                estado_pago=EstadoPago.de(pagado, retiro.cuota),
            )
        filas.append(fila)
    inscritos = len(filas) - por_estado[Inscripcion.Estado.CANCELADA]
    return {
        "filas": filas,
        "inscritos": inscritos,
        "disponibles": max(retiro.cupo - inscritos, 0),
        "por_estado": [
            {"estado": valor, "etiqueta": etiqueta, "total": por_estado[valor]}
            for valor, etiqueta in Inscripcion.Estado.choices
        ],
    }


def _equipo(retiro):
    """Servidores del retiro agrupados por área de servicio."""
    participaciones = (
        retiro.participaciones.exclude(tipo=Participacion.Tipo.CAMINANTE)
        .select_related("persona").prefetch_related("servicios__area")
        .order_by("persona__nombre")
    )
    coordinadores, sin_area, areas = [], [], {}
    for p in participaciones:
        if p.tipo == Participacion.Tipo.COORDINADOR:
            coordinadores.append(p.persona.nombre)
        servicios = p.servicios.all()
        for s in servicios:
            areas.setdefault(s.area.nombre, []).append(
                {"nombre": p.persona.nombre, "es_coordinador": s.es_coordinador}
            )
        if not servicios and p.tipo == Participacion.Tipo.SERVIDOR:
            sin_area.append(p.persona.nombre)
    return {
        "total": len(participaciones),
        "coordinadores": coordinadores,
        "sin_area": sin_area,
        "areas": [
            # Quien coordina el área va primero.
            {"area": area, "personas": sorted(personas, key=lambda x: not x["es_coordinador"])}
            for area, personas in sorted(areas.items())
        ],
    }


def _finanzas(retiro, caminantes):
    ingresos, egresos = _total(retiro.pagos), _total(retiro.gastos)
    datos = {
        "ingresos": ingresos,
        "egresos": egresos,
        "balance": ingresos - egresos,
        "por_concepto": _por_opcion(retiro.pagos, "concepto", Pago.Concepto.choices),
        "por_categoria": _por_opcion(retiro.gastos, "categoria", Gasto.Categoria.choices),
    }
    if caminantes:
        # Lo que falta de la cuota de quienes siguen inscritos.
        datos["por_cobrar"] = sum(f["saldo"] for f in caminantes["filas"])
    return datos


@api_view(["GET"])
def panel_retiro(request, pk):
    """Todo lo de un retiro en una sola consulta: caminantes, equipo, charlas y finanzas."""
    user = request.user
    if not _ve(user, Retiro):
        raise PermissionDenied()
    retiro = get_object_or_404(Retiro.objects.select_related("tipo", "parroquia"), pk=pk)
    finanzas = _ve(user, Pago) and _ve(user, Gasto)

    caminantes = _caminantes(retiro, con_pagos=finanzas) if _ve(user, Inscripcion) else None
    return Response({
        "retiro": {
            "id": retiro.pk,
            "etiqueta": str(retiro),
            "parroquia": retiro.parroquia.nombre,
            "fecha_inicio": retiro.fecha_inicio,
            "fecha_fin": retiro.fecha_fin,
            "sede": retiro.sede,
            "cupo": retiro.cupo,
            "cuota": retiro.cuota,
            "estado": retiro.estado,
            "estado_display": retiro.get_estado_display(),
        },
        "caminantes": caminantes,
        "equipo": _equipo(retiro) if _ve(user, Participacion) else None,
        "charlas": [
            {"id": c.pk, "orden": c.orden, "tema": c.tema,
             "expositor": c.expositor.nombre if c.expositor_id else ""}
            for c in retiro.charlas.select_related("expositor")
        ] if _ve(user, Charla) else None,
        "finanzas": _finanzas(retiro, caminantes) if finanzas else None,
        "opciones_pago": [
            {"valor": valor, "etiqueta": etiqueta} for valor, etiqueta in EstadoPago.choices
        ],
    })
