"""Con qué se declara un módulo. Los módulos en sí están en modulos.py."""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Callable

from .permisos import permiso


@dataclass
class Extra:
    """Columna calculada de solo lectura de una tabla."""
    etiqueta: str
    tipo: str                 # "numero", "decimal", "enlace", "opcion"...
    calcular: Callable        # función(obj) -> valor
    opciones: list = field(default_factory=list)  # tipo "opcion": [(valor, etiqueta)]
    # Modelo cuyo permiso 'view' hace falta para ver la columna (p. ej. Pago
    # para lo que sale de las finanzas).
    requiere: type | None = None

    def visible(self, user):
        return self.requiere is None or user.has_perm(permiso(self.requiere, "view"))


@dataclass
class Modulo:
    slug: str                 # /api/<slug>/ y ruta /<slug> en el frontend
    modelo: type
    titulo: str
    singular: str
    grupo: str                # sección del menú
    campos: list              # campos editables, en el orden del formulario
    lista: list               # columnas de la tabla (campos o extras)
    buscar: list = field(default_factory=list)
    filtros: list = field(default_factory=list)       # ?campo=valor
    orden: list = field(default_factory=list)
    relacionados: list = field(default_factory=list)  # select_related
    sensibles: list = field(default_factory=list)
    anotaciones: dict = field(default_factory=dict)
    extras: dict = field(default_factory=dict)        # nombre -> Extra
    etiquetas: dict = field(default_factory=dict)     # campo -> etiqueta propia
    secciones: dict = field(default_factory=dict)     # título -> [campos] del formulario
    # Campo JSON -> lista de sub(): el formulario pide cada dato por separado
    # en vez de JSON a mano.
    subcampos: dict = field(default_factory=dict)
    # Campos que el rol del usuario fija ("parroquia", "tipo"; ver
    # acceso.ambito_fijo): el listado solo muestra ese valor y el formulario lo
    # trae puesto.
    por_ambito: list = field(default_factory=list)
    # Filas que el módulo no muestra nunca (p. ej. {"tipo": "caminante"}).
    excluir: dict = field(default_factory=dict)
    prefetch: list = field(default_factory=list)      # prefetch_related
    # False: el módulo existe (API, formularios) pero no aparece en el menú.
    en_menu: bool = True
    # Campo de fecha que se filtra con ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD.
    rango_fecha: str = ""
    # Nadie crea, cambia ni borra (ni el superusuario): p. ej. la auditoría.
    solo_lectura: bool = False

    def campo(self, nombre):
        return self.modelo._meta.get_field(nombre)

    @property
    def fks(self):
        nombres = dict.fromkeys([*self.campos, *self.lista])
        return [n for n in nombres if n not in self.extras and self.campo(n).is_relation]

    def permiso(self, accion):
        return permiso(self.modelo, accion)


def sub(nombre, etiqueta, seccion, tipo="texto", opciones=()):
    """Un dato dentro de un campo JSON (p. ej. salud_alimentacion["eps"])."""
    info = {"nombre": nombre, "etiqueta": etiqueta, "tipo": tipo, "seccion": seccion}
    if opciones:
        info["opciones"] = [{"valor": o, "etiqueta": o} for o in opciones]
    return info


def anotado(nombre):
    """Lee una anotación del queryset (Modulo.anotaciones) para un Extra."""
    def leer(obj):
        valor = getattr(obj, nombre, None)
        return float(valor) if isinstance(valor, Decimal) else valor
    return leer
