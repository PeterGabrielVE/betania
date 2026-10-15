"""
Vistas de solo lectura que juntan información de varios módulos: el resumen de
la página de inicio y el panel de un retiro.

El RLS limita las filas a lo que el usuario puede ver; aquí además se omite cada
sección si falta el permiso 'view' de su modelo.
"""

from datetime import date

from django.db.models import Count, F, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from ..models import (
    Charla, EstadoPago, Gasto, Inscripcion, Pago, Participacion, Persona, Retiro, Tarea,
)
from ..tasas import TasaNoDisponible, tasas_bcv
from .modulos import INSCRITAS, POR_MODELO
from .permisos import permiso, ve_sensibles
from .vistas import filtros_fijos


def _ve(user, modelo):
    return user.has_perm(permiso(modelo, "view"))


def _retiros(user):
    """Los retiros que el usuario ve: los de la parroquia y el tipo que fija su
    rol, igual que en el listado de retiros (ver Modulo.por_ambito)."""
    fijos = filtros_fijos(POR_MODELO[Retiro], user)
    return Retiro.objects.filter(**{n: obj.pk for n, obj in fijos.items()})


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


def _tasas_json():
    """Tasa oficial del BCV (Bs por dólar y por euro), o None si no se pudo consultar."""
    try:
        tasas = tasas_bcv()
    except TasaNoDisponible:
        return None
    return {"fecha": tasas["fecha"], "USD": tasas["bolivares"]["USD"],
            "EUR": tasas["bolivares"]["EUR"]}


def _retiro_json(r):
    return {
        "id": r.pk, "etiqueta": str(r), "fecha_inicio": r.fecha_inicio,
        "fecha_fin": r.fecha_fin, "cupo": r.cupo, "inscritos": r.inscritos,
        "estado": r.estado, "estado_display": r.get_estado_display(),
    }


@api_view(["GET"])
def resumen(request):
    """Totales de la página de inicio y el tablero de un retiro (?retiro=<id>; si
    no se indica, el próximo o el que está en curso)."""
    hoy = timezone.localdate()
    por_estado = dict(
        Inscripcion.objects.values_list("estado").annotate(total=Count("id"))
    )
    proximos = (
        _retiros(request.user).select_related("tipo")
        .annotate(inscritos=Count("inscripciones", filter=INSCRITAS))
        .filter(fecha_fin__gte=hoy).order_by("fecha_inicio")[:5]
    )
    # El RLS oculta pagos/gastos a roles sin acceso a finanzas: verán 0.
    ingresos = _total(Pago.objects)
    egresos = _total(Gasto.objects)
    return Response({
        "personas": Persona.objects.count(),
        "retiros": _retiros(request.user).count(),
        "retiros_activos": _retiros(request.user).exclude(estado=Retiro.Estado.FINALIZADO).count(),
        "inscripciones": sum(por_estado.values()),
        "inscripciones_por_estado": [
            {"estado": valor, "etiqueta": etiqueta, "total": por_estado.get(valor, 0)}
            for valor, etiqueta in Inscripcion.Estado.choices
        ],
        "ingresos": ingresos,
        "egresos": egresos,
        "balance": ingresos - egresos,
        "tasas_bcv": _tasas_json(),
        "proximos_retiros": [_retiro_json(r) for r in proximos],
        **_tablero_de(request, hoy),
    })


# --------------------------------------------------------------------------- #
# Tablero de un retiro (página de inicio)
# --------------------------------------------------------------------------- #
# Por confirmar: siguen en el proceso, pero todavía no confirman su asistencia.
POR_CONFIRMAR = [Inscripcion.Estado.SOLICITADA, Inscripcion.Estado.ACEPTADA,
                 Inscripcion.Estado.LISTA_ESPERA]
DIAS_CUMPLEANOS = 30


def _tablero_de(request, hoy):
    if not _ve(request.user, Retiro):
        return {"retiros_tablero": [], "tablero": None}
    retiros = list(
        _retiros(request.user).select_related("tipo").order_by("-fecha_inicio")[:30])
    elegido = request.query_params.get("retiro")
    retiro = next((r for r in retiros if str(r.pk) == elegido), None)
    if retiro is None:
        # El próximo (o el que está en curso); si no hay, el más reciente.
        vigentes = [r for r in retiros if r.fecha_fin >= hoy]
        retiro = (min(vigentes, key=lambda r: r.fecha_inicio) if vigentes
                  else next(iter(retiros), None))
    return {
        "retiros_tablero": [
            {"id": r.pk, "etiqueta": str(r), "fecha_inicio": r.fecha_inicio} for r in retiros
        ],
        "tablero": _tablero(request, retiro, hoy) if retiro else None,
    }


def _conteo_pagos(filas):
    conteo = dict.fromkeys(EstadoPago.values, 0)
    for f in filas:
        conteo[f["estado_pago"]] += 1
    return [{"valor": v, "etiqueta": e, "total": conteo[v]} for v, e in EstadoPago.choices]


def _proximo_cumpleanos(nacimiento, desde):
    """Fecha del próximo cumpleaños a partir de 'desde' (el 29/2 cae el 28/2)."""
    for anio in (desde.year, desde.year + 1):
        try:
            dia = nacimiento.replace(year=anio)
        except ValueError:
            dia = date(anio, 2, 28)
        if dia >= desde:
            return dia


def _cumpleanos(retiro, hoy):
    """Cumpleaños de caminantes y servidores del retiro: los de los próximos días
    y los que caen durante el retiro (para celebrarlos allá)."""
    personas = {}
    inscritas = retiro.inscripciones.exclude(estado=Inscripcion.Estado.CANCELADA)
    for i in inscritas.select_related("persona"):
        personas[i.persona_id] = (i.persona, "Caminante")
    equipo = retiro.participaciones.exclude(tipo=Participacion.Tipo.CAMINANTE)
    for p in equipo.select_related("persona"):
        personas.setdefault(p.persona_id, (p.persona, "Servidor"))
    filas = []
    for persona, rol in personas.values():
        if not persona.fecha_nacimiento:
            continue
        dia = _proximo_cumpleanos(persona.fecha_nacimiento, hoy)
        en_retiro = _proximo_cumpleanos(persona.fecha_nacimiento, retiro.fecha_inicio)
        durante = en_retiro <= retiro.fecha_fin
        if durante:
            dia = en_retiro
        elif (dia - hoy).days > DIAS_CUMPLEANOS:
            continue
        filas.append({
            "nombre": persona.nombre, "rol": rol, "fecha": dia,
            "cumple": dia.year - persona.fecha_nacimiento.year,
            "en_dias": (dia - hoy).days, "durante_retiro": durante,
        })
    return sorted(filas, key=lambda f: f["fecha"])


def _tareas(retiro, hoy):
    tareas = retiro.tareas.select_related("responsable", "area")
    pendientes = tareas.filter(hecha=False)
    # Primero las que tienen fecha, de la más urgente a la menos.
    proximas = pendientes.order_by(F("fecha_limite").asc(nulls_last=True), "creado")[:6]
    return {
        "pendientes": pendientes.count(),
        "vencidas": pendientes.filter(fecha_limite__lt=hoy).count(),
        "hechas": tareas.filter(hecha=True).count(),
        "proximas": [
            {
                "id": t.pk, "titulo": t.titulo, "fecha_limite": t.fecha_limite,
                "responsable": t.responsable.nombre if t.responsable_id else "",
                "area": t.area.nombre if t.area_id else "",
                "vencida": bool(t.fecha_limite and t.fecha_limite < hoy),
            }
            for t in proximas
        ],
    }


def _recaudacion(retiro):
    """Ingresos acumulados por fecha de pago, para ver cómo avanza la recaudación."""
    por_dia = retiro.pagos.values_list("fecha").annotate(t=Sum("monto_base")).order_by("fecha")
    total, puntos = 0, []
    for dia, monto in por_dia:
        total += monto
        puntos.append({"fecha": dia, "total": total})
    return puntos


def _alertas(retiro, caminantes, servidores, equipo, sensibles, ve_charlas):
    """Pendientes que salen solos de los datos: a quién llamar, qué completar."""
    ruta = f"/retiros/{retiro.pk}"
    alertas = []

    def agregar(clave, total, texto, enlace=ruta):
        if total:
            alertas.append({"clave": clave, "total": total, "texto": texto, "enlace": enlace})

    if caminantes:
        filas = [f for f in caminantes["filas"] if f["estado"] != Inscripcion.Estado.CANCELADA]
        agregar("por_confirmar", sum(f["estado"] in POR_CONFIRMAR for f in filas),
                "caminantes por confirmar asistencia")
        agregar("caminantes_deben", sum(f.get("saldo", 0) > 0 for f in filas),
                "caminantes con cuota pendiente")
        if sensibles:
            agregar("sin_contacto", sum(not f["ficha"]["contactos"] for f in filas),
                    "caminantes sin familiar de contacto")
            agregar("sin_consentimiento",
                    retiro.inscripciones.exclude(estado=Inscripcion.Estado.CANCELADA)
                    .filter(consentimiento_datos=False).count(),
                    "inscripciones sin consentimiento de datos", "/inscripciones")
    if servidores:
        agregar("servidores_deben", sum(f["saldo"] > 0 for f in servidores["filas"]),
                "servidores con cuota pendiente")
    if equipo:
        agregar("sin_area", len(equipo["sin_area"]), "servidores sin área asignada",
                "/servicios")
    if ve_charlas:
        agregar("charlas_sin_expositor", retiro.charlas.filter(expositor__isnull=True).count(),
                "charlas sin expositor", "/charlas")
    return alertas


def _tablero(request, retiro, hoy):
    user = request.user
    finanzas = _ve(user, Pago) and _ve(user, Gasto)
    sensibles = ve_sensibles(request)
    ve_equipo = _ve(user, Participacion)

    caminantes = _caminantes(
        retiro, con_pagos=finanzas, con_ficha=sensibles
    ) if _ve(user, Inscripcion) else None
    equipo = _equipo(retiro) if ve_equipo else None
    servidores = _servidores(retiro) if finanzas and ve_equipo else None

    datos = {
        "retiro": {
            "id": retiro.pk, "etiqueta": str(retiro), "fecha_inicio": retiro.fecha_inicio,
            "fecha_fin": retiro.fecha_fin, "sede": retiro.sede, "cupo": retiro.cupo,
            "cuota": retiro.cuota, "cuota_servidor": retiro.cuota_servidor,
            "estado": retiro.estado, "estado_display": retiro.get_estado_display(),
        },
        "dias_para_inicio": (retiro.fecha_inicio - hoy).days,
        "dias_para_fin": (retiro.fecha_fin - hoy).days,
        "caminantes": None,
        "servidores": None,
        "finanzas": None,
        "tareas": _tareas(retiro, hoy) if _ve(user, Tarea) else None,
        "cumpleanos": (_cumpleanos(retiro, hoy)
                       if _ve(user, Inscripcion) and ve_equipo else []),
        "alertas": _alertas(retiro, caminantes, servidores, equipo, sensibles,
                            _ve(user, Charla)),
    }
    if caminantes:
        estados = {e["estado"]: e["total"] for e in caminantes["por_estado"]}
        datos["caminantes"] = {
            "inscritos": caminantes["inscritos"],
            "disponibles": caminantes["disponibles"],
            "confirmados": estados[Inscripcion.Estado.CONFIRMADA],
            "por_confirmar": sum(estados[e] for e in POR_CONFIRMAR),
            "cancelados": estados[Inscripcion.Estado.CANCELADA],
            "por_estado": [e for e in caminantes["por_estado"]
                           if e["estado"] != Inscripcion.Estado.CANCELADA],
        }
        if finanzas:
            activas = [f for f in caminantes["filas"]
                       if f["estado"] != Inscripcion.Estado.CANCELADA]
            datos["caminantes"].update(
                pagos=_conteo_pagos(activas),
                por_cobrar=sum(f["saldo"] for f in activas),
                recaudado=sum(f["pagado"] for f in activas),
            )
    if equipo:
        datos["servidores"] = {
            "total": equipo["total"],
            "coordinadores": len(equipo["coordinadores"]),
            "sin_area": len(equipo["sin_area"]),
            "por_area": sorted(
                ({"area": a["area"], "total": len(a["personas"])} for a in equipo["areas"]),
                key=lambda a: -a["total"],
            ),
        }
        if servidores:
            datos["servidores"].update(
                pagos=_conteo_pagos(servidores["filas"]),
                por_cobrar=servidores["por_cobrar"],
                recaudado=sum(f["pagado"] for f in servidores["filas"]),
            )
    if finanzas:
        datos["finanzas"] = {
            **_finanzas(retiro, caminantes),
            "recaudacion": _recaudacion(retiro),
        }
    return datos


# --------------------------------------------------------------------------- #
# Panel de un retiro
# --------------------------------------------------------------------------- #
def _edad(nacimiento, el_dia):
    if not nacimiento:
        return None
    return el_dia.year - nacimiento.year - (
        (el_dia.month, el_dia.day) < (nacimiento.month, nacimiento.day)
    )


def _texto(datos, clave):
    return str(datos.get(clave) or "").strip()


def _ficha(i, retiro):
    """Lo confidencial de un caminante: salud, alimentación y a quién llamar."""
    persona, salud = i.persona, i.salud_alimentacion or {}
    datos, contacto = persona.datos_sensibles or {}, i.contacto_emergencia or {}
    contactos = []
    for sufijo in ("", "2"):
        nombre = _texto(contacto, f"nombre{sufijo}")
        telefonos = [_texto(contacto, f"telefono{sufijo}"), _texto(contacto, f"celular{sufijo}")]
        if nombre or any(telefonos):
            contactos.append({
                "nombre": nombre,
                "relacion": _texto(contacto, f"relacion{sufijo}"),
                "telefono": " / ".join(t for t in telefonos if t),
            })
    return {
        "edad": _edad(persona.fecha_nacimiento, retiro.fecha_inicio),
        "procedencia": _texto(datos, "procedencia") or _texto(datos, "direccion"),
        "celular": _texto(datos, "celular"),
        "condicion_medica": _texto(salud, "condicion_medica"),
        "tratamiento": _texto(salud, "tratamiento"),
        "alimentacion": _texto(salud, "regimen_alimenticio"),
        "requerimientos": _texto(salud, "requerimientos"),
        "talla_camiseta": _texto(salud, "talla_camiseta"),
        "contactos": contactos,
        "notas": i.notas,
    }


def _caminantes(retiro, con_pagos, con_ficha):
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
            "persona_id": i.persona_id,
            "persona": i.persona.nombre,
            "telefono": i.persona.telefono,
            "padrino": i.padrino.nombre if i.padrino_id else "",
            "estado": i.estado,
        }
        if con_ficha:
            fila["ficha"] = _ficha(i, retiro)
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


def _servidores(retiro):
    """Cada servidor con lo que lleva pagado de su cuota (pagos a su nombre que no
    son la cuota de un caminante)."""
    pagado = dict(
        retiro.pagos.filter(inscripcion__isnull=True, persona__isnull=False)
        .values_list("persona").annotate(t=Sum("monto_base"))
    )
    participaciones = (
        retiro.participaciones.exclude(tipo=Participacion.Tipo.CAMINANTE)
        .select_related("persona").prefetch_related("servicios__area")
        .order_by("persona__nombre")
    )
    filas = []
    for p in participaciones:
        total = pagado.get(p.persona_id, 0)
        filas.append({
            "id": p.pk,
            "persona": p.persona.nombre,
            "telefono": p.persona.telefono,
            "tipo": p.get_tipo_display(),
            "areas": ", ".join(s.area.nombre for s in p.servicios.all()),
            "pagado": total,
            "saldo": max(retiro.cuota_servidor - total, 0),
            "estado_pago": EstadoPago.de(total, retiro.cuota_servidor),
        })
    return {"filas": filas, "por_cobrar": sum(f["saldo"] for f in filas)}


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
    retiro = get_object_or_404(_retiros(user).select_related("tipo", "parroquia"), pk=pk)
    finanzas = _ve(user, Pago) and _ve(user, Gasto)

    caminantes = _caminantes(
        retiro, con_pagos=finanzas, con_ficha=ve_sensibles(request)
    ) if _ve(user, Inscripcion) else None
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
            "cuota_servidor": retiro.cuota_servidor,
            "estado": retiro.estado,
            "estado_display": retiro.get_estado_display(),
        },
        "caminantes": caminantes,
        "equipo": _equipo(retiro) if _ve(user, Participacion) else None,
        "servidores": _servidores(retiro) if finanzas and _ve(user, Participacion) else None,
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
