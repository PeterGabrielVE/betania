"""
Reportes de un retiro: los cortes que más se piden para organizarlo (lista de
confirmados, salud, tallas, camas, pagos pendientes, servidores por área...).

GET /api/reportes/?retiro=<id>&reporte=<clave> devuelve el catálogo que el
usuario puede ver y, si pide uno, su tabla: columnas con su tipo (texto,
numero, dinero, fecha, telefono) y filas. Los montos van en la moneda base;
el frontend los muestra en la que elige el usuario.
"""

from dataclasses import dataclass
from datetime import date
from typing import Callable

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from ..models import (
    CAMISAS_SERVICIO, TALLAS_CAMISA, Inscripcion, Pago, Participacion, Retiro,
)
from .paneles import (
    POR_CONFIRMAR, _caminantes, _contactos, _edad, _equipo_activo, _servidores, _texto,
    elegir_retiro,
)
from .permisos import permiso, ve_sensibles

SI_NO = {True: "Sí", False: "No"}


def col(etiqueta, tipo="texto", total=False):
    return {"etiqueta": etiqueta, "tipo": tipo, "total": total}


def _vigentes(retiro):
    """Caminantes que no cancelaron."""
    return (retiro.inscripciones.exclude(estado=Inscripcion.Estado.CANCELADA)
            .select_related("persona", "padrino").order_by("persona__nombre"))


def _equipo(retiro):
    return (_equipo_activo(retiro).select_related("persona")
            .prefetch_related("servicios__area").order_by("persona__nombre"))


# --------------------------------------------------------------------------- #
# Cada reporte: (columnas, filas)
# --------------------------------------------------------------------------- #
def _confirmados(retiro):
    filas = [
        [i.persona.nombre, i.persona.documento_completo,
         _edad(i.persona.fecha_nacimiento, retiro.fecha_inicio), i.persona.telefono,
         i.cama, i.mesa, i.padrino.nombre if i.padrino_id else ""]
        for i in _vigentes(retiro).filter(estado=Inscripcion.Estado.CONFIRMADA)
    ]
    return ([col("Caminante"), col("Cédula"), col("Edad", "numero"),
             col("Celular", "telefono"), col("Cama"), col("Mesa"), col("Quién lo invitó")],
            filas)


def _por_confirmar(retiro):
    filas = [
        [i.persona.nombre, i.persona.telefono, i.get_estado_display(),
         i.padrino.nombre if i.padrino_id else "", timezone.localdate(i.creado)]
        for i in _vigentes(retiro).filter(estado__in=POR_CONFIRMAR)
    ]
    return ([col("Caminante"), col("Celular", "telefono"), col("Estado"),
             col("Quién lo invitó"), col("Inscrito el", "fecha")], filas)


def _salud(retiro):
    filas = []
    for i in _vigentes(retiro):
        s = i.salud_alimentacion or {}
        datos = [_texto(s, c) for c in
                 ("condicion_medica", "tratamiento", "regimen_alimenticio", "requerimientos")]
        if any(datos):
            filas.append([i.persona.nombre, i.cama, *datos])
    return ([col("Caminante"), col("Cama"), col("Condición médica"), col("Tratamiento"),
             col("Alimentación especial"), col("Requerimientos")], filas)


def _tallas(retiro, sensibles):
    """Cuántas prendas de cada talla: camisetas de los caminantes (dato
    confidencial) y camisas de los servidores."""
    filas = []
    if sensibles:
        conteo = {}
        for i in _vigentes(retiro):
            talla = _texto(i.salud_alimentacion or {}, "talla_camiseta") or "Sin indicar"
            conteo[talla] = conteo.get(talla, 0) + 1
        orden = [t for t in ("S", "M", "L", "XL") if t in conteo]
        filas += [["Camiseta de caminante", t, conteo[t]]
                  for t in orden + sorted(set(conteo) - set(orden))]
    equipo = list(_equipo(retiro))
    for camisa, nombre in CAMISAS_SERVICIO:
        for talla, etiqueta in TALLAS_CAMISA:
            n = sum(bool((p.camisas or {}).get(camisa) and (p.tallas_camisa or {}).get(talla))
                    for p in equipo)
            if n:
                filas.append([f"Camisa de servidor: {nombre}", etiqueta, n])
    return [col("Prenda"), col("Talla"), col("Cantidad", "numero", total=True)], filas


def _pendientes(retiro):
    filas = [
        [f["persona"], "Caminante", f["telefono"], f["pagado"] + f["saldo"], f["pagado"],
         f["saldo"]]
        for f in _caminantes(retiro, con_pagos=True, con_ficha=False)["filas"] if f["saldo"]
    ] + [
        [f["persona"], f["tipo"], f["telefono"], f["pagado"] + f["saldo"], f["pagado"],
         f["saldo"]]
        for f in _servidores(retiro)["filas"] if f["saldo"]
    ]
    filas.sort(key=lambda f: f[0].lower())
    return ([col("Nombre"), col("Participa como"), col("Celular", "telefono"),
             col("Monto a pagar", "dinero", True), col("Pagado", "dinero", True),
             col("Debe", "dinero", True)], filas)


def _orden_cama(cama):
    """"2" antes que "10", los números antes que "B-1" y sin cama, al final."""
    return (not cama, not cama.isdigit(), int(cama) if cama.isdigit() else 0, cama.lower())


def _camas(retiro):
    filas = [[i.cama, i.persona.nombre, "Caminante", i.mesa] for i in _vigentes(retiro)]
    filas += [[p.cama, p.persona.nombre, p.get_tipo_display(), ""]
              for p in _equipo(retiro) if p.duerme_en_casa]
    filas.sort(key=lambda f: (_orden_cama(f[0]), f[1].lower()))
    return [col("Cama"), col("Nombre"), col("Participa como"), col("Mesa")], filas


def _areas(retiro):
    filas = []
    for p in _equipo(retiro):
        servicios = list(p.servicios.all())
        datos = [p.persona.nombre, p.persona.telefono, p.resumen_turnos(),
                 p.get_estado_display()]
        if not servicios:
            area = ("Coordinación general" if p.tipo == Participacion.Tipo.COORDINADOR
                    else "Sin área asignada")
            filas.append([area, "", *datos])
        for s in servicios:
            filas.append([s.area.nombre, SI_NO[s.es_coordinador], *datos])
    # Por área y, en cada una, quien la coordina primero.
    filas.sort(key=lambda f: (f[0] == "Sin área asignada", f[0].lower(), f[1] != "Sí",
                              f[2].lower()))
    return ([col("Área"), col("Coordina"), col("Servidor"), col("Celular", "telefono"),
             col("Turnos"), col("Asistencia")], filas)


def _invitaron(retiro):
    por_padrino = {}
    for i in _vigentes(retiro).filter(padrino__isnull=False):
        por_padrino.setdefault(i.padrino.nombre, []).append(i.persona.nombre)
    filas = [[padrino, len(invitados), ", ".join(invitados)]
             for padrino, invitados in sorted(por_padrino.items(),
                                              key=lambda x: (-len(x[1]), x[0].lower()))]
    return ([col("Quién invitó"), col("Caminantes", "numero", total=True),
             col("A quiénes")], filas)


def _cumple_en(nacimiento, anio):
    try:
        return nacimiento.replace(year=anio)
    except ValueError:  # 29 de febrero en un año que no es bisiesto
        return date(anio, 3, 1)


def _cumpleanos(retiro):
    """Quienes cumplen años en el mes del retiro (caminantes y servidores)."""
    inicio, fin = retiro.fecha_inicio, retiro.fecha_fin
    personas = [(i.persona, "Caminante") for i in _vigentes(retiro)]
    personas += [(p.persona, p.get_tipo_display()) for p in _equipo(retiro)]
    filas = []
    for persona, como in personas:
        nacio = persona.fecha_nacimiento
        if not nacio or nacio.month != inicio.month:
            continue
        cumple = _cumple_en(nacio, inicio.year)
        filas.append([persona.nombre, como, cumple, inicio.year - nacio.year,
                      SI_NO[inicio <= cumple <= fin], persona.telefono])
    filas.sort(key=lambda f: (f[2], f[0].lower()))
    return ([col("Nombre"), col("Participa como"), col("Cumple el", "fecha"),
             col("Cumple (años)", "numero"), col("Durante el retiro"),
             col("Celular", "telefono")], filas)


SACRAMENTOS = [("bautismo", "Bautismo"), ("primera_comunion", "Primera comunión"),
               ("confirmacion", "Confirmación"), ("matrimonio", "Matrimonio"),
               ("orden_sacerdotal", "Orden sacerdotal"), ("uncion", "Unción")]


def _sacramentos(retiro):
    filas = []
    for i in _vigentes(retiro):
        datos = i.persona.datos_sensibles or {}
        filas.append([i.persona.nombre, *(SI_NO[bool(datos.get(c))] for c, _ in SACRAMENTOS),
                      _texto(datos, "parroquia_asiste")])
    return ([col("Caminante"), *(col(e) for _, e in SACRAMENTOS),
             col("Parroquia a la que asiste")], filas)


def _incompletos(retiro, sensibles):
    """Caminantes a los que les falta algún dato para el retiro."""
    filas = []
    for i in _vigentes(retiro):
        p = i.persona
        falta = [texto for texto, falta in (
            ("cédula", not p.documento),
            ("celular", not p.telefono),
            ("fecha de nacimiento", not p.fecha_nacimiento),
            ("familiar de contacto", sensibles and not _contactos(i.contacto_emergencia)),
            ("autorización de datos", not i.consentimiento_datos),
        ) if falta]
        if falta:
            filas.append([p.nombre, p.telefono, i.get_estado_display(), ", ".join(falta)])
    return ([col("Caminante"), col("Celular", "telefono"), col("Estado"), col("Le falta")],
            filas)


# --------------------------------------------------------------------------- #
# Catálogo
# --------------------------------------------------------------------------- #
@dataclass
class Reporte:
    clave: str
    titulo: str
    descripcion: str
    generar: Callable  # (retiro, sensibles) -> (columnas, filas)
    requiere: tuple = (Inscripcion,)  # modelos cuyo permiso 'view' hace falta
    sensible: bool = False


def _sin_sensibles(funcion):
    return lambda retiro, sensibles: funcion(retiro)


REPORTES = [
    Reporte("confirmados", "Caminantes confirmados",
            "La lista para el retiro: cédula, edad, celular, cama, mesa y quién lo invitó.",
            _sin_sensibles(_confirmados)),
    Reporte("por_confirmar", "Caminantes por confirmar",
            "Solicitadas, aceptadas y en lista de espera: a quién hay que llamar.",
            _sin_sensibles(_por_confirmar)),
    Reporte("salud", "Salud y alimentación",
            "Condición médica, tratamiento, comida especial y requerimientos (para cocina y "
            "enfermería).", _sin_sensibles(_salud), sensible=True),
    Reporte("tallas", "Tallas de camisetas y camisas",
            "Cuántas prendas de cada talla hay que encargar.", _tallas,
            requiere=(Inscripcion, Participacion)),
    Reporte("pendientes", "Pagos pendientes",
            "Caminantes y servidores que deben algo de su cuota.",
            _sin_sensibles(_pendientes), requiere=(Inscripcion, Participacion, Pago)),
    Reporte("camas", "Camas y mesas",
            "Quién duerme en cada cama (caminantes y servidores que duermen en la casa) y "
            "su mesa.", _sin_sensibles(_camas), requiere=(Inscripcion, Participacion)),
    Reporte("areas", "Servidores por área",
            "El equipo por área de servicio, con quién coordina y sus turnos.",
            _sin_sensibles(_areas), requiere=(Participacion,)),
    Reporte("invitaron", "Quién invitó a los caminantes",
            "Cuántos caminantes invitó cada persona.", _sin_sensibles(_invitaron)),
    Reporte("cumpleanos", "Cumpleaños del mes del retiro",
            "Caminantes y servidores que cumplen años ese mes, y si es durante el retiro.",
            _sin_sensibles(_cumpleanos), requiere=(Inscripcion, Participacion)),
    Reporte("sacramentos", "Sacramentos de los caminantes",
            "Qué sacramentos ha recibido cada caminante y a qué parroquia asiste.",
            _sin_sensibles(_sacramentos), sensible=True),
    Reporte("incompletos", "Datos incompletos",
            "Caminantes sin cédula, celular, fecha de nacimiento, familiar de contacto o "
            "autorización de datos.", _incompletos),
]


def disponibles(user, sensibles):
    return [r for r in REPORTES
            if (sensibles or not r.sensible)
            and all(user.has_perm(permiso(m, "view")) for m in r.requiere)]


@api_view(["GET"])
def reportes(request):
    user = request.user
    if not user.has_perm(permiso(Retiro, "view")):
        raise PermissionDenied()
    sensibles = ve_sensibles(request)
    catalogo = disponibles(user, sensibles)
    if not catalogo:
        raise PermissionDenied()
    retiros, retiro = elegir_retiro(request, timezone.localdate())
    datos = {
        "catalogo": [{"clave": r.clave, "titulo": r.titulo, "descripcion": r.descripcion}
                     for r in catalogo],
        "retiros": [{"id": r.pk, "etiqueta": str(r), "fecha_inicio": r.fecha_inicio}
                    for r in retiros],
        "retiro": retiro and {"id": retiro.pk, "etiqueta": str(retiro),
                              "fecha_inicio": retiro.fecha_inicio},
        "reporte": None,
    }
    clave = request.query_params.get("reporte")
    elegido = next((r for r in catalogo if r.clave == clave), None)
    if clave and elegido is None:
        return Response({"detail": "Ese reporte no existe o no tienes acceso."}, status=404)
    if elegido and retiro:
        columnas, filas = elegido.generar(retiro, sensibles)
        datos["reporte"] = {"clave": elegido.clave, "titulo": elegido.titulo,
                            "columnas": columnas, "filas": filas}
    return Response(datos)
