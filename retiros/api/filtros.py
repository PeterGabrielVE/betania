"""
Filtros avanzados de los listados (panel lateral "Filtros" del frontend):
rangos de edad y de fechas, opciones múltiples, sí/no y relaciones. Cada
módulo declara los suyos en Modulo.avanzados; la API los aplica con
parámetros f_<nombre> (f_edad_min, f_inscrito_desde, f_estado_pago=pagado,parcial…),
también en las descargas.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Callable

from django.core.exceptions import ValidationError
from django.db.models import DecimalField, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from ..models import (
    CAMISAS_SERVICIO, TALLAS_CAMISA, TURNOS_SERVICIO,
    AsignacionServicio, EstadoPago, Inscripcion, Pago, Participacion, Persona,
)

SI_NO = [("si", "Sí"), ("no", "No")]
MESES = [(str(n), m) for n, m in enumerate(
    ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto",
     "Septiembre", "Octubre", "Noviembre", "Diciembre"], start=1)]


@dataclass
class Filtro:
    nombre: str
    etiqueta: str
    # "rango_numero" (f_<n>_min / f_<n>_max), "rango_fecha" (f_<n>_desde /
    # f_<n>_hasta), "opciones" (varias, separadas por coma), "si_no", "fk".
    tipo: str
    seccion: str
    # aplicar(qs, valor): valor es (desde, hasta) en los rangos, una lista en
    # "opciones" y un texto en los demás.
    aplicar: Callable
    opciones: list = field(default_factory=list)
    recurso: str = ""          # "fk": módulo donde se busca
    sensible: bool = False     # solo para quien ve datos confidenciales
    requiere: type | None = None  # modelo cuyo permiso 'view' hace falta
    ayuda: str = ""

    def describir(self):
        info = {"nombre": self.nombre, "etiqueta": self.etiqueta, "tipo": self.tipo,
                "seccion": self.seccion}
        if self.opciones:
            info["opciones"] = [{"valor": v, "etiqueta": e} for v, e in self.opciones]
        if self.recurso:
            info["recurso"] = self.recurso
        if self.ayuda:
            info["ayuda"] = self.ayuda
        return info


# --------------------------------------------------------------------------- #
# Cómo se aplica cada tipo
# --------------------------------------------------------------------------- #
def _hace(anios, hoy=None):
    """La fecha de hace `anios` años (el 29 de febrero pasa al 28)."""
    hoy = hoy or date.today()
    try:
        return hoy.replace(year=hoy.year - anios)
    except ValueError:
        return hoy.replace(year=hoy.year - anios, day=28)


def por_edad(prefijo=""):
    """Edad cumplida hoy entre desde y hasta (ambos incluidos)."""
    campo = f"{prefijo}fecha_nacimiento"

    def aplicar(qs, valor):
        desde, hasta = valor
        if desde is not None:
            qs = qs.filter(**{f"{campo}__lte": _hace(int(desde))})
        if hasta is not None:
            qs = qs.filter(**{f"{campo}__gt": _hace(int(hasta) + 1)})
        return qs
    return aplicar


def por_fechas(campo):
    def aplicar(qs, valor):
        desde, hasta = valor
        if desde:
            qs = qs.filter(**{f"{campo}__date__gte": date.fromisoformat(desde)})
        if hasta:
            qs = qs.filter(**{f"{campo}__date__lte": date.fromisoformat(hasta)})
        return qs
    return aplicar


def por_valores(campo):
    return lambda qs, valores: qs.filter(**{f"{campo}__in": valores})


def por_fk(campo):
    return lambda qs, valor: qs.filter(**{campo: valor})


def si_no(condicion):
    """condicion: Q de las filas que cumplen ("sí")."""
    return lambda qs, valor: qs.filter(condicion) if valor == "si" else qs.exclude(condicion)


def con_texto(campo_json, clave):
    """Que un dato del JSON tenga algo escrito."""
    return si_no(Q(**{f"{campo_json}__has_key": clave})
                 & ~Q(**{f"{campo_json}__{clave}": ""}))


def alguna_marcada(campo_json):
    """{clave: true}: que tenga marcada alguna de las elegidas."""
    def aplicar(qs, valores):
        condicion = Q()
        for v in valores:
            condicion |= Q(**{f"{campo_json}__{v}": True})
        return qs.filter(condicion)
    return aplicar


def por_estado_pago(pagado, cuota):
    """pagado/parcial/pendiente, como EstadoPago.de (sin cuota: pagado)."""
    def aplicar(qs, valores):
        qs = qs.annotate(_pagado=pagado, _cuota=cuota)
        casos = {
            EstadoPago.PAGADO: Q(_cuota__lte=0) | Q(_pagado__gte=F("_cuota")),
            EstadoPago.PARCIAL: Q(_cuota__gt=0, _pagado__gt=0, _pagado__lt=F("_cuota")),
            EstadoPago.PENDIENTE: Q(_cuota__gt=0, _pagado__lte=0),
        }
        condicion = Q()
        for v in valores:
            condicion |= casos.get(v, Q(pk__in=[]))
        return qs.filter(condicion)
    return aplicar


_DINERO = DecimalField(max_digits=14, decimal_places=2)
PAGADO_CAMINANTE = Coalesce(
    Subquery(Pago.objects.filter(inscripcion=OuterRef("pk")).order_by()
             .values("inscripcion").annotate(t=Sum("monto_base")).values("t"),
             output_field=_DINERO),
    Value(0), output_field=_DINERO)
PAGADO_SERVIDOR = Coalesce(
    # Lo que aporta un servidor: pagos a su nombre en ese retiro que no son la
    # cuota de un caminante (como en el panel y el control de pagos).
    Subquery(Pago.objects.filter(retiro=OuterRef("retiro"), persona=OuterRef("persona"),
                                 inscripcion__isnull=True).order_by()
             .values("persona").annotate(t=Sum("monto_base")).values("t"),
             output_field=_DINERO),
    Value(0), output_field=_DINERO)


# --------------------------------------------------------------------------- #
# Lo común a personas, caminantes y servidores (por la persona)
# --------------------------------------------------------------------------- #
_PERSONA, _FECHAS, _LUGAR = "Persona", "Fechas", "De dónde es"


def de_la_persona(prefijo=""):
    return [
        Filtro("edad", "Edad (años cumplidos)", "rango_numero", _PERSONA, por_edad(prefijo)),
        Filtro("cumple", "Cumple años en", "opciones", _PERSONA,
               por_valores(f"{prefijo}fecha_nacimiento__month"), opciones=MESES),
        Filtro("pais", "País", "fk", _LUGAR, por_fk(f"{prefijo}pais"), recurso="paises"),
        Filtro("estado_geo", "Estado", "fk", _LUGAR, por_fk(f"{prefijo}estado"),
               recurso="estados"),
        Filtro("ciudad", "Ciudad", "fk", _LUGAR, por_fk(f"{prefijo}ciudad"), recurso="ciudades"),
    ]


def _ha_participado(tipo):
    if tipo == "caminante":
        return si_no(Q(pk__in=Inscripcion.objects.exclude(
            estado=Inscripcion.Estado.CANCELADA).values("persona")))
    return si_no(Q(pk__in=Participacion.objects.exclude(tipo=Participacion.Tipo.CAMINANTE)
                   .exclude(estado=Participacion.Estado.CANCELADO).values("persona")))


def _en_retiro(qs, valor):
    return qs.filter(Q(pk__in=Inscripcion.objects.filter(retiro=valor).values("persona"))
                     | Q(pk__in=Participacion.objects.filter(retiro=valor).values("persona")))


PERSONAS = [
    *de_la_persona(),
    Filtro("tipo_documento", "Tipo de documento", "opciones", _PERSONA,
           por_valores("tipo_documento"), opciones=Persona.TipoDocumento.choices),
    Filtro("registrado", "Registrada en el sistema", "rango_fecha", _FECHAS,
           por_fechas("creado")),
    Filtro("caminante", "Ha sido caminante", "si_no", "Participación",
           _ha_participado("caminante"), opciones=SI_NO),
    Filtro("servidor", "Ha servido", "si_no", "Participación",
           _ha_participado("servidor"), opciones=SI_NO),
    Filtro("en_retiro", "Participó en el retiro", "fk", "Participación", _en_retiro,
           recurso="retiros", ayuda="Como caminante o en el equipo."),
    Filtro("acceso", "Tiene usuario del sistema", "si_no", "Participación",
           si_no(Q(usuario__isnull=False)), opciones=SI_NO),
]

CAMINANTES = [
    Filtro("inscrito", "Fecha de inscripción", "rango_fecha", _FECHAS, por_fechas("creado")),
    Filtro("tipo_retiro", "Tipo de retiro", "fk", "Inscripción", por_fk("retiro__tipo"),
           recurso="tipos-retiro"),
    Filtro("estado_pago", "Estado del pago", "opciones", "Inscripción",
           por_estado_pago(PAGADO_CAMINANTE,
                           Coalesce("cuota", "retiro__cuota", output_field=_DINERO)),
           opciones=EstadoPago.choices, requiere=Pago),
    Filtro("invitado", "Lo invitó alguien", "si_no", "Inscripción",
           si_no(Q(padrino__isnull=False)), opciones=SI_NO),
    Filtro("consentimiento", "Autorizó el uso de sus datos", "si_no", "Inscripción",
           si_no(Q(consentimiento_datos=True)), opciones=SI_NO),
    *de_la_persona("persona__"),
    Filtro("condicion", "Con condición médica", "si_no", "Salud",
           con_texto("salud_alimentacion", "condicion_medica"), opciones=SI_NO, sensible=True),
    Filtro("tratamiento", "Con tratamiento o medicamentos", "si_no", "Salud",
           con_texto("salud_alimentacion", "tratamiento"), opciones=SI_NO, sensible=True),
    Filtro("comida", "Con alimentación especial", "si_no", "Salud",
           con_texto("salud_alimentacion", "regimen_alimenticio"), opciones=SI_NO,
           sensible=True),
    Filtro("requerimientos", "Con requerimientos especiales", "si_no", "Salud",
           con_texto("salud_alimentacion", "requerimientos"), opciones=SI_NO, sensible=True),
    Filtro("talla", "Talla de camiseta", "opciones", "Salud",
           por_valores("salud_alimentacion__talla_camiseta"),
           opciones=[(t, t) for t in ["S", "M", "L", "XL"]], sensible=True),
    Filtro("contacto", "Con familiar de contacto", "si_no", "Salud",
           con_texto("contacto_emergencia", "nombre"), opciones=SI_NO, sensible=True),
]


def _en_area(qs, valor):
    return qs.filter(pk__in=AsignacionServicio.objects.filter(area=valor).values("participacion"))


SERVIDORES = [
    Filtro("registrado", "Fecha de registro", "rango_fecha", _FECHAS, por_fechas("creado"),
           ayuda="Los registrados antes de existir este dato no tienen fecha."),
    Filtro("tipo_retiro", "Tipo de retiro", "fk", "Servicio", por_fk("retiro__tipo"),
           recurso="tipos-retiro"),
    Filtro("area", "Área de servicio", "fk", "Servicio", _en_area, recurso="areas-servicio"),
    Filtro("coordina", "Coordina un área", "si_no", "Servicio",
           si_no(Q(pk__in=AsignacionServicio.objects.filter(es_coordinador=True)
                   .values("participacion"))), opciones=SI_NO),
    Filtro("sin_area", "Sin área asignada", "si_no", "Servicio",
           si_no(~Q(pk__in=AsignacionServicio.objects.values("participacion"))),
           opciones=SI_NO),
    Filtro("estado_pago", "Estado del pago", "opciones", "Servicio",
           por_estado_pago(PAGADO_SERVIDOR,
                           Coalesce("cuota", "retiro__cuota_servidor", output_field=_DINERO)),
           opciones=EstadoPago.choices, requiere=Pago),
    Filtro("duerme", "Dormirá en la casa", "opciones", "Disponibilidad",
           lambda qs, valores: qs.filter(
               (Q(duerme_en_casa=True) if "si" in valores else Q(pk__in=[]))
               | (Q(duerme_en_casa=False) if "no" in valores else Q(pk__in=[]))
               | (Q(duerme_en_casa__isnull=True) if "sin" in valores else Q(pk__in=[]))),
           opciones=[("si", "Sí"), ("no", "No"), ("sin", "Sin responder")]),
    Filtro("turno", "Puede servir en", "opciones", "Disponibilidad",
           alguna_marcada("disponibilidad"), opciones=TURNOS_SERVICIO,
           ayuda="Cualquiera de los turnos marcados."),
    Filtro("camisa", "Necesita camisa", "opciones", "Disponibilidad",
           alguna_marcada("camisas"), opciones=CAMISAS_SERVICIO),
    Filtro("talla_camisa", "Talla de camisa", "opciones", "Disponibilidad",
           alguna_marcada("tallas_camisa"), opciones=TALLAS_CAMISA),
    *de_la_persona("persona__"),
]


# --------------------------------------------------------------------------- #
# Aplicarlos
# --------------------------------------------------------------------------- #
def visibles(filtros, user, sensibles):
    from .permisos import permiso
    return [f for f in filtros
            if (sensibles or not f.sensible)
            and (f.requiere is None or user.has_perm(permiso(f.requiere, "view")))]


def aplicar(qs, filtros, params):
    """Los filtros con valor en params. Un valor que no se entiende deja la
    lista vacía (como los filtros simples)."""
    try:
        for f in filtros:
            base = f"f_{f.nombre}"
            if f.tipo == "rango_numero":
                desde, hasta = params.get(f"{base}_min"), params.get(f"{base}_max")
                desde = int(desde) if desde not in (None, "") else None
                hasta = int(hasta) if hasta not in (None, "") else None
                if desde is not None or hasta is not None:
                    qs = f.aplicar(qs, (desde, hasta))
            elif f.tipo == "rango_fecha":
                desde, hasta = params.get(f"{base}_desde"), params.get(f"{base}_hasta")
                if desde or hasta:
                    qs = f.aplicar(qs, (desde or None, hasta or None))
            elif f.tipo == "opciones":
                valores = [v for v in (params.get(base) or "").split(",") if v]
                validos = {str(v) for v, _ in f.opciones}
                valores = [v for v in valores if v in validos]
                if valores:
                    qs = f.aplicar(qs, valores)
            else:
                valor = params.get(base)
                if valor:
                    if f.tipo == "si_no" and valor not in ("si", "no"):
                        return qs.none()
                    qs = f.aplicar(qs, valor)
    except (ValueError, TypeError, ValidationError):
        return qs.none()
    return qs
