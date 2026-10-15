"""
Tasas de cambio oficiales del BCV, tomadas de DolarApi (https://ve.dolarapi.com).

Con ellas se convierte a la moneda base un pago o gasto hecho en otra moneda
cuando no se escribe la tasa a mano (ver Movimiento en models.py).
"""

import json
import logging
from decimal import Decimal
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache

log = logging.getLogger(__name__)

_RECURSOS = {"USD": "dolares", "EUR": "euros"}
_CLAVE = "tasas_bcv"
_VIGENCIA = 60 * 60       # el BCV publica una tasa al día
_REINTENTO = 5 * 60       # si la consulta falla, no se repite en cada petición


class TasaNoDisponible(Exception):
    pass


def _consultar():
    """Bolívares por cada unidad de moneda, según el BCV."""
    tasas, fecha = {"VES": Decimal(1)}, ""
    for moneda, recurso in _RECURSOS.items():
        peticion = Request(
            settings.TASAS_BCV_URL.format(recurso=recurso),
            headers={"Accept": "application/json", "User-Agent": "gestion-retiros"},
        )
        with urlopen(peticion, timeout=5) as respuesta:
            datos = json.load(respuesta, parse_float=Decimal)
        tasas[moneda] = Decimal(datos["promedio"])
        fecha = datos.get("fechaActualizacion", "")[:10]
    return {"bolivares": tasas, "fecha": fecha}


def tasas_bcv():
    """{"bolivares": {"VES": 1, "USD": ..., "EUR": ...}, "fecha": "2026-10-13"}"""
    tasas = cache.get(_CLAVE)
    if tasas is None:
        try:
            tasas = _consultar()
        except Exception:  # sin red, respuesta inesperada...
            log.exception("No se pudo consultar la tasa del BCV")
            tasas = False
        cache.set(_CLAVE, tasas, _VIGENCIA if tasas else _REINTENTO)
    if not tasas:
        raise TasaNoDisponible()
    return tasas


def tasa_bcv(moneda):
    """Cuántas unidades de `moneda` equivalen a 1 de la moneda base."""
    bolivares = tasas_bcv()["bolivares"]
    return (bolivares[settings.MONEDA] / bolivares[moneda]).quantize(Decimal("1e-8"))
