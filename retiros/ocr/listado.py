"""
De la foto de una hoja tabulada (como "Listado de caminantes" o "Control de
pago servidores") a filas: se ubica el renglón de encabezados y cada palabra
de las filas va a la columna que tiene encima.
"""

import re

from .catalogos import simple
from .planilla import documento, nombre_propio, talla, telefono

# Encabezado (sin tildes, minúsculas) -> campo. El primer "celular" es el de
# la persona; el que va después de "contacto", el del familiar.
COLUMNAS = [
    (r"nombres?\s*y\s*apellidos?|nombre\s*(?:del\s*)?(?:servidor|caminante)?|apellidos?\s*y\s*nombres?", "nombre"),
    (r"cedula|c\.?\s?i\.?|documento", "documento"),
    (r"celular|telefono|tlf|movil", "telefono"),
    (r"edad", "edad"),
    (r"direccion|sector|domicilio", "direccion"),
    (r"talla", "talla"),
    (r"dieta|tratamiento|salud|alimentacion", "salud"),
    (r"contacto|familiar|emergencia", "contacto_nombre"),
    (r"equipo|area|servicio", "area"),
    (r"correo|e-?mail", "email"),
    (r"parentesco|relacion", "contacto_relacion"),
    (r"monto|abono|pago|resta|total|saldo|n[°º]|^no?$|^#$", None),  # se ignoran
]
CAMPOS = ["nombre", "documento", "telefono", "edad", "direccion", "talla", "salud",
          "contacto_nombre", "contacto_relacion", "contacto_celular", "email", "area"]


def _campo(texto, completo=False):
    """El campo de un encabezado. `completo`: el texto entero tiene que ser el
    encabezado (para no juntar "EDAD TALLA CONTACTO" en una sola columna)."""
    t = simple(texto)
    for patron, campo in COLUMNAS:
        if (re.fullmatch(patron, t) if completo else re.search(patron, t)):
            return campo, True
    return None, False


def _encabezados(linea):
    """[(campo, x_inicio)] si la línea parece de encabezados (≥ 3 conocidos)."""
    columnas, conocidas = [], 0
    palabras = linea.palabras
    i = 0
    while i < len(palabras):
        # Encabezados de varias palabras ("NOMBRE Y APELLIDO", "DIETA O TRATAMIENTO").
        mejor = None
        for largo in (4, 3, 2, 1):
            grupo = palabras[i:i + largo]
            if len(grupo) < largo:
                continue
            campo, reconocido = _campo(" ".join(p.texto for p in grupo), largo > 1)
            if reconocido:
                mejor = (campo, grupo)
                break
        if mejor:
            campo, grupo = mejor
            if campo:
                conocidas += 1
            columnas.append((campo, grupo[0].x, grupo[-1].x + grupo[-1].ancho))
            i += len(grupo)
        else:
            i += 1
    if conocidas < 3:
        return None
    # El segundo "telefono" (después del contacto) es el del familiar.
    vistos, resultado = set(), []
    for campo, x0, x1 in columnas:
        if campo == "telefono" and "telefono" in vistos:
            campo = "contacto_celular"
        vistos.add(campo)
        resultado.append((campo, x0, x1))
    return resultado


def extraer(lectura):
    """{"columnas": [campo…], "filas": [{campo: texto}…]}."""
    lineas = lectura.lineas
    for n, linea in enumerate(lineas):
        columnas = _encabezados(linea)
        if columnas:
            break
    else:
        return {"columnas": [], "filas": []}

    # Límites: a mitad de camino entre el fin de un encabezado y el inicio
    # del siguiente.
    limites = []
    for i, (campo, x0, x1) in enumerate(columnas):
        izq = 0 if i == 0 else (columnas[i - 1][2] + x0) / 2
        der = float("inf") if i == len(columnas) - 1 else (x1 + columnas[i + 1][1]) / 2
        limites.append((campo, izq, der))

    filas = []
    for linea in lineas[n + 1:]:
        if _encabezados(linea):
            break
        valores = {}
        for p in linea.palabras:
            for campo, izq, der in limites:
                if izq <= p.centro < der:
                    if campo:
                        valores.setdefault(campo, []).append(p)
                    break
        fila = _fila({c: " ".join(p.texto for p in ps) for c, ps in valores.items()},
                     {c: sum(p.confianza for p in ps) / len(ps) for c, ps in valores.items()})
        if fila:
            filas.append(fila)
    return {"columnas": [c for c, _, _ in columnas if c], "filas": filas}


def _fila(textos, confianzas):
    """Limpia una fila; None si no trae un nombre (renglón vacío o ruido)."""
    nombre = nombre_propio(textos.get("nombre", ""))
    if len(nombre.split()) < 2:
        return None
    fila = {"nombre": nombre}
    if textos.get("documento"):
        doc = documento(textos["documento"])
        if doc:
            fila["tipo_documento"], fila["documento"] = doc
    for campo in ("telefono", "contacto_celular"):
        if textos.get(campo):
            numero = telefono(textos[campo])
            if numero:
                fila[campo] = numero
    if textos.get("edad"):
        m = re.search(r"\d{1,3}", textos["edad"])
        if m:
            fila["edad"] = int(m.group(0))
    if textos.get("talla"):
        t = talla(textos["talla"])
        if t:
            fila["talla"] = t
    for campo in ("direccion", "salud", "area", "email", "contacto_relacion"):
        if textos.get(campo):
            fila[campo] = textos[campo]
    if textos.get("contacto_nombre"):
        fila["contacto_nombre"] = nombre_propio(textos["contacto_nombre"])
    fila["confianza"] = round(sum(confianzas.values()) / len(confianzas)) if confianzas else 0
    return fila
