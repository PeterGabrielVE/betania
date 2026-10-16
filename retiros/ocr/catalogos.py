"""Nombres leídos en una planilla -> registros del sistema (estado, ciudad,
área de servicio), comparando sin tildes ni mayúsculas y tolerando errores
pequeños de lectura."""

import difflib
import unicodedata


def simple(texto):
    """"Los Teques" -> "los teques" (sin tildes, espacios de más ni signos)."""
    texto = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return " ".join("".join(c if c.isalnum() else " " for c in texto.lower()).split())


def parecido(nombre, opciones, minimo=0.82):
    """La opción (id, nombre) más parecida a `nombre`, o None."""
    buscado = simple(nombre)
    if not buscado:
        return None
    mejor, puntaje = None, 0.0
    for clave, texto in opciones:
        candidato = simple(texto)
        if candidato == buscado:
            return clave, texto
        p = difflib.SequenceMatcher(None, buscado, candidato).ratio()
        if p > puntaje:
            mejor, puntaje = (clave, texto), p
    return mejor if puntaje >= minimo else None


def ubicacion(estado, ciudad):
    """{"pais", "entidad", "ciudad"} con ids si se reconocen (Venezuela);
    si no, el texto en estado_texto / ciudad_texto."""
    from ..models import Ciudad, Estado, Pais

    resultado = {}
    ve = Pais.objects.filter(codigo="VE").values_list("pk", flat=True).first()
    estados = list(Estado.objects.filter(pais_id=ve).values_list("pk", "nombre"))
    hallado = parecido(estado, estados) if estado else None
    if hallado:
        resultado["entidad"] = (str(hallado[0]), hallado[1])
    if ciudad:
        ciudades = Ciudad.objects.filter(estado__pais_id=ve)
        if hallado:
            ciudades = ciudades.filter(estado_id=hallado[0])
        c = parecido(ciudad, list(ciudades.values_list("pk", "nombre")))
        if c:
            resultado["ciudad"] = (str(c[0]), c[1])
            if not hallado:
                est = Ciudad.objects.filter(pk=c[0]).values_list(
                    "estado_id", "estado__nombre").first()
                resultado["entidad"] = (str(est[0]), est[1])
    if ve and ("entidad" in resultado or "ciudad" in resultado):
        resultado["pais"] = (str(ve), "Venezuela")
    if estado and "entidad" not in resultado:
        resultado["estado_texto"] = (estado, estado)
    if ciudad and "ciudad" not in resultado:
        resultado["ciudad_texto"] = (ciudad, ciudad)
    return resultado


def areas(textos, parroquia=None):
    """Las áreas de servicio nombradas (generales o de la parroquia)."""
    from django.db.models import Q

    from ..models import AreaServicio

    opciones = list(AreaServicio.objects.filter(Q(parroquia=None) | Q(parroquia=parroquia))
                    .values_list("pk", "nombre"))
    # "Coordinación / Dirección" se reconoce por cualquiera de sus partes.
    partes = [(pk, parte) for pk, nombre in opciones
              for parte in [nombre, *nombre.split("/")]]
    halladas = {}
    for texto in textos:
        hallado = parecido(texto, partes, minimo=0.75)
        if hallado:
            pk = hallado[0]
            halladas[str(pk)] = dict(opciones)[pk]
    return halladas
