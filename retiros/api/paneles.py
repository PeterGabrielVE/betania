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
    CAMISAS_SERVICIO, SUFIJOS_CONTACTO, TALLAS_CAMISA, TURNOS_SERVICIO,
    Charla, EstadoPago, Gasto, Inscripcion, Pago, Participacion, Persona, Retiro, Tarea,
)
from ..tasas import TasaNoDisponible, tasas_bcv
from ..acceso import retiros_visibles
from .modulos import INSCRITAS
from .permisos import permiso, ve_sensibles


def _ve(user, modelo):
    return user.has_perm(permiso(modelo, "view"))


# Los de la parroquia y el tipo que fija su rol, como el listado de retiros.
_retiros = retiros_visibles


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


def elegir_retiro(request, hoy):
    """Los últimos retiros que el usuario puede ver y el que toca mostrar: el
    de ?retiro=<id>; si no, la edición que prefiere; si no, el próximo (o el
    que está en curso) y, si no hay, el más reciente."""
    retiros = list(
        _retiros(request.user).select_related("tipo").order_by("-fecha_inicio")[:30])
    preferencias = getattr(request.user, "preferencias", None)
    elegido = request.query_params.get("retiro") or str(
        getattr(preferencias, "retiro_id", "") or "")
    retiro = next((r for r in retiros if str(r.pk) == elegido), None)
    if retiro is None:
        # El próximo (o el que está en curso); si no hay, el más reciente.
        vigentes = [r for r in retiros if r.fecha_fin >= hoy]
        retiro = (min(vigentes, key=lambda r: r.fecha_inicio) if vigentes
                  else next(iter(retiros), None))
    return retiros, retiro


def _tablero_de(request, hoy):
    if not _ve(request.user, Retiro):
        return {"retiros_tablero": [], "tablero": None}
    retiros, retiro = elegir_retiro(request, hoy)
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


def _equipo_activo(retiro):
    """Los servidores que van al retiro: sin caminantes ni quienes cancelaron
    (esos quedan como historial)."""
    return (retiro.participaciones.exclude(tipo=Participacion.Tipo.CAMINANTE)
            .exclude(estado=Participacion.Estado.CANCELADO))


def lideres_ocultos(retiro):
    """Los servidores que van entre los caminantes como uno más: salen en los
    listados de caminantes, aunque no cuentan en el cupo ni en sus cuotas."""
    return (_equipo_activo(retiro).filter(lider_oculto=True)
            .select_related("persona").prefetch_related("servicios__area")
            .order_by("persona__nombre"))


def _fila_lider(p):
    return {
        "id": p.pk,
        "persona_id": p.persona_id,
        "persona": p.persona.nombre,
        "telefono": p.persona.telefono,
        "estado": p.estado,
        "estado_display": p.get_estado_display(),
        "areas": ", ".join(s.area.nombre for s in p.servicios.all()),
        "cama": p.cama,
        "mesa": p.mesa,
    }


def _cumpleanos(retiro, hoy):
    """Cumpleaños de caminantes y servidores del retiro: los de los próximos días
    y los que caen durante el retiro (para celebrarlos allá)."""
    personas = {}
    inscritas = retiro.inscripciones.exclude(estado=Inscripcion.Estado.CANCELADA)
    for i in inscritas.select_related("persona"):
        personas[i.persona_id] = (i.persona, "Caminante")
    for p in _equipo_activo(retiro).select_related("persona"):
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
        agregar("servidores_deben", sum(f.get("saldo", 0) > 0 for f in servidores["filas"]),
                "servidores con cuota pendiente")
        agregar("servidores_por_confirmar",
                sum(f["estado"] == Participacion.Estado.POR_CONFIRMAR
                    for f in servidores["filas"]),
                "servidores por confirmar asistencia", "/participaciones")
    if equipo:
        agregar("sin_area", len(equipo["sin_area"]), "servidores sin área asignada",
                "/servicios")
    if caminantes and servidores:
        # Datos de antes de la regla: caminante y servidor del mismo retiro.
        inscritos = {f["persona_id"] for f in caminantes["filas"]
                     if f["estado"] != Inscripcion.Estado.CANCELADA}
        agregar("caminante_y_servidor",
                sum(f["persona_id"] in inscritos for f in servidores["filas"]
                    if f["estado"] != Participacion.Estado.CANCELADO),
                "personas que son caminante y servidor a la vez (cancela una de las dos)")
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
    servidores = _servidores(retiro, con_pagos=finanzas) if ve_equipo else None

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
        activas = [f for f in caminantes["filas"]
                   if f["estado"] != Inscripcion.Estado.CANCELADA]
        if finanzas:
            confirmadas = [f for f in activas if f["estado"] == Inscripcion.Estado.CONFIRMADA]
            datos["caminantes"].update(
                pagos=_conteo_pagos(activas),
                por_cobrar=sum(f["saldo"] for f in activas),
                recaudado=sum(f["pagado"] for f in activas),
                # De los confirmados, cuántos ya pagaron la cuota completa.
                confirmados_pagados=sum(f["estado_pago"] == EstadoPago.PAGADO
                                        for f in confirmadas),
            )
        if sensibles:
            # A cuántos de los inscritos hay que atender de forma especial.
            fichas = [f["ficha"] for f in activas]
            datos["caminantes"]["atencion"] = {
                "activos": len(fichas),
                "salud": sum(bool(f["condicion_medica"] or f["tratamiento"])
                             for f in fichas),
                "comida": sum(bool(f["alimentacion"]) for f in fichas),
                "requerimientos": sum(bool(f["requerimientos"]) for f in fichas),
            }
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
            estados = {e["estado"]: e["total"] for e in servidores["por_estado"]}
            datos["servidores"].update(
                confirmados=estados[Participacion.Estado.CONFIRMADO],
                por_confirmar=estados[Participacion.Estado.POR_CONFIRMAR],
                cancelados=estados[Participacion.Estado.CANCELADO],
            )
            if finanzas:
                activos = [f for f in servidores["filas"]
                           if f["estado"] != Participacion.Estado.CANCELADO]
                datos["servidores"].update(
                    pagos=_conteo_pagos(activos),
                    por_cobrar=servidores["por_cobrar"],
                    recaudado=sum(f["pagado"] for f in activos),
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


def _procedencia(persona, datos):
    # Registros de antes de los catálogos de geografía: "procedencia" a mano.
    return persona.procedencia or _texto(datos, "procedencia")


def _contactos(contacto):
    """Los familiares de contacto con nombre o teléfono (SUFIJOS_CONTACTO)."""
    contacto, contactos = contacto or {}, []
    for sufijo in SUFIJOS_CONTACTO:
        nombre = _texto(contacto, f"nombre{sufijo}")
        telefonos = [_texto(contacto, f"telefono{sufijo}"), _texto(contacto, f"celular{sufijo}")]
        if nombre or any(telefonos):
            contactos.append({
                "nombre": nombre,
                "relacion": _texto(contacto, f"relacion{sufijo}"),
                "telefono": " / ".join(t for t in telefonos if t),
            })
    return contactos


def _ficha(i, retiro):
    """Lo confidencial de un caminante: salud, alimentación y a quién llamar."""
    persona, salud = i.persona, i.salud_alimentacion or {}
    datos = persona.datos_sensibles or {}
    return {
        "documento": persona.documento_completo,
        "edad": _edad(persona.fecha_nacimiento, retiro.fecha_inicio),
        "procedencia": _procedencia(persona, datos),
        "direccion": _texto(datos, "direccion"),
        "telefono_casa": _texto(datos, "telefono_casa"),
        "condicion_medica": _texto(salud, "condicion_medica"),
        "tratamiento": _texto(salud, "tratamiento"),
        "alimentacion": _texto(salud, "regimen_alimenticio"),
        "requerimientos": _texto(salud, "requerimientos"),
        "talla_camiseta": _texto(salud, "talla_camiseta"),
        "contactos": _contactos(i.contacto_emergencia),
        "notas": i.notas,
    }


def _caminantes(retiro, con_pagos, con_ficha):
    inscripciones = (
        retiro.inscripciones
        .select_related("persona__pais", "persona__estado", "persona__ciudad", "padrino")
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
            "motivo_cancelacion": i.motivo_cancelacion,
            "cama": i.cama,
            "mesa": i.mesa,
        }
        if con_ficha:
            fila["ficha"] = _ficha(i, retiro)
        if con_pagos:
            pagado = i.pagado or 0
            cancelada = i.estado == Inscripcion.Estado.CANCELADA
            fila.update(
                pagado=pagado,
                # Quien canceló ya no debe la cuota.
                saldo=0 if cancelada else max(i.cuota_a_pagar - pagado, 0),
                estado_pago=EstadoPago.de(pagado, i.cuota_a_pagar),
            )
        filas.append(fila)
    inscritos = len(filas) - por_estado[Inscripcion.Estado.CANCELADA]
    return {
        "filas": filas,
        "lideres_ocultos": [_fila_lider(p) for p in lideres_ocultos(retiro)],
        "inscritos": inscritos,
        "disponibles": max(retiro.cupo - inscritos, 0),
        "por_estado": [
            {"estado": valor, "etiqueta": etiqueta, "total": por_estado[valor]}
            for valor, etiqueta in Inscripcion.Estado.choices
        ],
    }


def _equipo(retiro):
    """Servidores del retiro (sin los que cancelaron) agrupados por área."""
    participaciones = (
        _equipo_activo(retiro)
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


def _servidores(retiro, con_pagos=True):
    """Cada servidor con su estado (por confirmar, confirmado, canceló) y, con
    acceso a finanzas, lo que lleva pagado de su cuota (pagos a su nombre que
    no son la cuota de un caminante). Quien canceló ya no debe la cuota."""
    pagado = dict(
        retiro.pagos.filter(inscripcion__isnull=True, persona__isnull=False)
        .values_list("persona").annotate(t=Sum("monto_base"))
    ) if con_pagos else {}
    participaciones = (
        retiro.participaciones.exclude(tipo=Participacion.Tipo.CAMINANTE)
        .select_related("persona").prefetch_related("servicios__area")
        .order_by("persona__nombre")
    )
    filas = []
    por_estado = dict.fromkeys(Participacion.Estado.values, 0)
    for p in participaciones:
        por_estado[p.estado] += 1
        fila = {
            "id": p.pk,
            "persona": p.persona.nombre,
            "persona_id": p.persona_id,
            "telefono": p.persona.telefono,
            "tipo": p.get_tipo_display(),
            "lider_oculto": p.lider_oculto,
            "estado": p.estado,
            "estado_display": p.get_estado_display(),
            "motivo_cancelacion": p.motivo_cancelacion,
            "areas": ", ".join(s.area.nombre for s in p.servicios.all()),
            "duerme_en_casa": p.duerme_en_casa,
            "cama": p.cama,
            "turnos": p.resumen_turnos(),
            "camisa": p.resumen_camisas(),
        }
        if con_pagos:
            total = pagado.get(p.persona_id, 0)
            cancelo = p.estado == Participacion.Estado.CANCELADO
            fila.update(
                pagado=total,
                saldo=0 if cancelo else max(p.cuota_a_pagar - total, 0),
                estado_pago=EstadoPago.de(total, p.cuota_a_pagar),
            )
        filas.append(fila)
    datos = {
        "filas": filas,
        "por_estado": [
            {"estado": valor, "etiqueta": etiqueta, "total": por_estado[valor]}
            for valor, etiqueta in Participacion.Estado.choices
        ],
    }
    if con_pagos:
        datos["por_cobrar"] = sum(f["saldo"] for f in filas)
    return datos


def _logistica_equipo(retiro):
    """Para organizar al equipo: cuántos duermen en la casa, cuántos sirven en
    cada turno y cuántas camisas hacen falta, por tipo y por talla."""
    equipo = list(_equipo_activo(retiro))

    def conteo(opciones, marcadas):
        return [{"valor": c, "etiqueta": e, "total": sum(c in marcadas(p) for p in equipo)}
                for c, e in opciones]

    return {
        "total": len(equipo),
        "duermen": sum(p.duerme_en_casa is True for p in equipo),
        "no_duermen": sum(p.duerme_en_casa is False for p in equipo),
        "sin_responder": sum(p.duerme_en_casa is None for p in equipo),
        "turnos": conteo(TURNOS_SERVICIO, lambda p: p.turnos),
        "camisas": conteo(CAMISAS_SERVICIO, lambda p: p.camisas_pedidas),
        "tallas": conteo(TALLAS_CAMISA, lambda p: p.tallas),
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
        "logistica_equipo": (_logistica_equipo(retiro)
                             if _ve(user, Participacion) else None),
        "servidores": (_servidores(retiro, con_pagos=finanzas)
                       if _ve(user, Participacion) else None),
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


# --------------------------------------------------------------------------- #
# Ficha de una persona: todo lo suyo en un lugar
# --------------------------------------------------------------------------- #
def _retiro_corto(r):
    return {"id": r.pk, "etiqueta": str(r), "fecha_inicio": r.fecha_inicio,
            "estado": r.estado}


def _como_caminante(persona, con_pagos, sensibles):
    inscripciones = (
        persona.inscripciones.select_related("retiro__tipo", "padrino")
        .order_by("-retiro__fecha_inicio")
    )
    if con_pagos:
        inscripciones = inscripciones.annotate(pagado=Sum("pagos__monto_base"))
    filas = []
    for i in inscripciones:
        fila = {
            "id": i.pk,
            "retiro": _retiro_corto(i.retiro),
            "estado": i.estado,
            "estado_display": i.get_estado_display(),
            "motivo_cancelacion": i.motivo_cancelacion,
            "padrino": i.padrino.nombre if i.padrino_id else "",
            "padrino_id": i.padrino_id,
        }
        if sensibles:
            fila["salud"] = i.salud_alimentacion or {}
            fila["contacto"] = i.contacto_emergencia or {}
        if con_pagos:
            pagado = i.pagado or 0
            cancelada = i.estado == Inscripcion.Estado.CANCELADA
            fila.update(pagado=pagado,
                        saldo=0 if cancelada else max(i.cuota_a_pagar - pagado, 0),
                        estado_pago=EstadoPago.de(pagado, i.cuota_a_pagar))
        filas.append(fila)
    return filas


def _como_servidor(persona, con_pagos, sensibles):
    participaciones = (
        persona.participaciones.exclude(tipo=Participacion.Tipo.CAMINANTE)
        .select_related("retiro__tipo").prefetch_related("servicios__area")
        .order_by("-retiro__fecha_inicio")
    )
    aportado = dict(
        persona.pagos.filter(inscripcion__isnull=True)
        .values_list("retiro").annotate(t=Sum("monto_base"))
    ) if con_pagos else {}
    filas = []
    for p in participaciones:
        fila = {
            "id": p.pk,
            "retiro": _retiro_corto(p.retiro),
            "tipo": p.tipo,
            "tipo_display": p.get_tipo_display(),
            "estado": p.estado,
            "estado_display": p.get_estado_display(),
            "motivo_cancelacion": p.motivo_cancelacion,
            "duerme_en_casa": p.duerme_en_casa,
            "cama": p.cama,
            "turnos": p.resumen_turnos(),
            "camisa": p.resumen_camisas(),
            "areas": [
                {"id": s.pk, "area": s.area_id, "nombre": s.area.nombre,
                 "es_coordinador": s.es_coordinador}
                for s in sorted(p.servicios.all(), key=lambda s: s.area.nombre)
            ],
        }
        if sensibles:
            fila["contactos"] = _contactos(p.contacto_emergencia)
        if con_pagos:
            total = aportado.get(p.retiro_id, 0)
            fila.update(pagado=total,
                        saldo=max(p.cuota_a_pagar - total, 0),
                        estado_pago=EstadoPago.de(total, p.cuota_a_pagar))
        filas.append(fila)
    return filas


def _acceso(persona):
    usuario = getattr(persona, "usuario", None)
    if usuario is None:
        return None
    return {
        "usuario": usuario.cuenta.get_username() if usuario.cuenta_id else "",
        "activo": usuario.activo,
        "roles": [
            {"rol": a.rol.codigo, "rol_display": str(a.rol),
             "ambito": str(a.retiro or a.parroquia or a.diocesis or "Todo el sistema")}
            for a in usuario.roles.select_related("rol", "retiro__tipo", "parroquia", "diocesis")
        ],
    }


@api_view(["GET"])
def ficha_persona(request, pk):
    """Todo lo de una persona: sus datos, sus retiros como caminante y como
    servidor, a quién invitó, sus tareas y su acceso al sistema. Cada sección
    llega en null si falta el permiso para verla."""
    user = request.user
    if not _ve(user, Persona):
        raise PermissionDenied()
    persona = get_object_or_404(
        Persona.objects.select_related("parroquia", "pais", "estado", "ciudad"), pk=pk)
    sensibles = ve_sensibles(request)
    finanzas = _ve(user, Pago) and _ve(user, Gasto)
    hoy = timezone.localdate()
    datos = {
        "id": persona.pk,
        "nombre": persona.nombre,
        "foto": persona.foto_url,
        "sexo": persona.sexo,
        "documento": persona.documento_completo,
        "fecha_nacimiento": persona.fecha_nacimiento,
        "edad": _edad(persona.fecha_nacimiento, hoy),
        "telefono": persona.telefono,
        "email": persona.email,
        "procedencia": persona.procedencia,
        "parroquia": persona.parroquia.nombre,
        "creado": persona.creado,
    }
    if sensibles:
        datos["datos_sensibles"] = persona.datos_sensibles or {}
    ve_inscripciones = _ve(user, Inscripcion)
    ficha = {
        "persona": datos,
        "caminante": (_como_caminante(persona, finanzas, sensibles)
                      if ve_inscripciones else None),
        "servidor": (_como_servidor(persona, finanzas, sensibles)
                     if _ve(user, Participacion) else None),
        # A quién invitó a un retiro.
        "invito": [
            {"persona_id": i.persona_id, "nombre": i.persona.nombre,
             "retiro": str(i.retiro), "estado_display": i.get_estado_display()}
            for i in persona.apadrinados.select_related("persona", "retiro__tipo")
            .order_by("-retiro__fecha_inicio")
        ] if ve_inscripciones else None,
        "tareas": [
            {"id": t.pk, "titulo": t.titulo, "retiro": str(t.retiro),
             "fecha_limite": t.fecha_limite,
             "vencida": bool(t.fecha_limite and t.fecha_limite < hoy)}
            for t in persona.tareas.filter(hecha=False).select_related("retiro__tipo")
            .order_by(F("fecha_limite").asc(nulls_last=True))
        ] if _ve(user, Tarea) else None,
    }
    # Su acceso al sistema (null: no tiene usuario). Sin permiso para ver
    # usuarios, la sección no viene.
    if user.has_perm("retiros.view_usuario"):
        ficha["acceso"] = _acceso(persona)
    return Response(ficha)
