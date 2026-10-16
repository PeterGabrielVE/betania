"""
De las líneas leídas de una planilla a los campos de los formularios de
caminante y servidor (los mismos nombres que usa el frontend).

Se buscan las etiquetas habituales ("Cédula:", "Tlf. celular:", "En caso de
emergencia avisar a:"…) y lo que sigue a cada una, en la misma línea o en la
siguiente. Un renglón puede traer varias ("Cédula: … Teléfono: …"). Lo que
tiene forma propia (cédula, teléfono, correo, fecha) se busca además en todo
el texto si no apareció con su etiqueta.
"""

import re
import unicodedata
from dataclasses import dataclass
from datetime import date

from .catalogos import simple


@dataclass
class Dato:
    valor: object
    texto: str          # lo que se leyó
    confianza: int      # 0 a 100 (la de Tesseract en esa línea)

    def json(self):
        return {"valor": self.valor, "texto": self.texto, "confianza": self.confianza}


def _plano(texto):
    """Minúsculas y sin tildes, del mismo largo que el original (para cortar
    el valor en las mismas posiciones)."""
    return "".join(
        (unicodedata.normalize("NFKD", c)[0] if c.strip() else c).lower() for c in texto
    )


# (clave, patrón sobre el texto plano, exige ":" después). Las más
# específicas primero: "estado civil" antes que "estado", "nombre del
# familiar" antes que "nombre".
SEP = r"\s*[:;=]"
ETIQUETAS = [
    ("nombre_completo", r"nombres?\s*y\s*apellidos?|apellidos?\s*y\s*nombres?|nombre completo", False),
    ("primer_nombre", r"primer\s+nombre", False),
    ("segundo_nombre", r"segundo\s+nombre", False),
    ("primer_apellido", r"primer\s+apellido", False),
    ("segundo_apellido", r"segundo\s+apellido", False),
    ("pareja_nombre", r"nombre\s+de\s+(?:la\s+|el\s+|su\s+)?(?:esposa|esposo|conyuge|pareja)", False),
    ("contacto_nombre", r"en\s+caso\s+de\s+emergencia(?:\s+(?:avisar|llamar)\s+a)?|contacto\s+de\s+emergencia|persona\s+a\s+quien\s+llamar|avisar\s+a|nombre\s+del\s+(?:familiar|contacto)", False),
    ("contacto_relacion", r"parentesco|relacion(?:\s+con\s+el\s+caminante)?", False),
    ("estado_civil", r"estado\s+civil|edo\.?\s+civil", False),
    ("edades_hijos", r"edad(?:es)?\s+de\s+(?:los\s+|sus\s+)?hijos", False),
    ("hijos", r"(?:n(?:umero|ro\.?|°|º)\s+de\s+|cantidad\s+de\s+)?hijos", True),
    ("fecha_nacimiento", r"fecha\s+de\s+nac\w*|f\.?\s*de\s*nac\w*|fecha\s+nac\w*|f\.\s*nac\w*", False),
    ("edad", r"edad", True),
    ("documento", r"c[eé]dula(?:\s+de\s+identidad)?|c\.\s?i\.?|\bc\.?i\b|pasaporte|documento(?:\s+de\s+identidad)?", False),
    ("telefono", r"(?:tel[eé]fono|telf?\.?|tlf\.?)\s*(?:celular|movil)|celular|movil|whatsapp|cel\.", False),
    ("telefono_casa", r"(?:tel[eé]fono|telf?\.?|tlf\.?)\s*(?:de\s+)?(?:habitacion|casa|local|fijo)|habitacion", False),
    ("telefono_generico", r"tel[eé]fonos?|telf?\.|tlf\.?", False),
    ("email", r"correo(?:\s+electronico)?|e-?mail", False),
    ("direccion", r"direccion(?:\s+de\s+habitacion)?|domicilio|urbanizacion|sector", False),
    ("ciudad", r"ciudad|municipio|localidad", True),
    ("entidad", r"estado", True),
    ("ocupacion", r"ocupacion|profesion|oficio", False),
    ("parroquia_asiste", r"parroquia(?:\s+(?:a\s+la\s+que|donde)\s+asiste)?", True),
    ("bautismo", r"bautizad[oa]|bautismo", False),
    ("confirmacion", r"confirmad[oa]|confirmacion", False),
    ("matrimonio", r"casad[oa]\s+por\s+la\s+iglesia|matrimonio(?:\s+eclesiastico)?", False),
    ("uncion", r"uncion(?:\s+de\s+los\s+enfermos)?", False),
    ("condicion_medica", r"condicion\s+medica|enfermedad(?:es)?|padece(?:\s+de)?|problemas?\s+de\s+salud|patologia", False),
    ("tratamiento", r"tratamiento(?:\s+medico)?|medicamentos?|medicinas?", False),
    ("regimen_alimenticio", r"dieta|alimentacion(?:\s+especial)?|regimen(?:\s+alimenticio)?|alergias?\s+(?:alimentarias?|a\s+alimentos)", False),
    ("requerimientos", r"requerimientos?(?:\s+especiales?)?|necesidades?\s+especiales?|discapacidad", False),
    ("talla", r"talla(?:\s+de\s+(?:camisa|camiseta|franela))?", False),
    ("camisa", r"camisas?|franelas?", True),
    ("padrino", r"invitad[oa]\s+por|qui[eé]n\s+(?:lo|la|te)\s+invit[oó]|padrino|madrina", False),
    ("areas", r"areas?(?:\s+de\s+servicio)?|equipos?(?:\s+de\s+servicio)?", True),
    ("duerme", r"(?:dormira|duerme|pernocta)\w*(?:\s+en\s+la\s+casa(?:\s+de\s+retiro)?)?", False),
    ("notas", r"observaciones?|comentarios?", False),
    ("nombres", r"nombres?(?:\s*\(s\))?", True),
    ("apellidos", r"apellidos?(?:\s*\(s\))?", True),
]
_PATRON = re.compile("|".join(
    f"(?P<e{i}>(?<![a-z])(?:{p})(?![a-z]){SEP if exige else ''})"
    for i, (_, p, exige) in enumerate(ETIQUETAS)
))

# Rellenos de las planillas: "______", "......", ":".
_RELLENO = re.compile(r"^[\s:;=._\-–—|]+|[\s:;=._\-–—|]+$")


def _etiquetas(texto):
    """[(clave, inicio, fin)] de las etiquetas de un renglón, en orden."""
    plano = _plano(texto)
    halladas = []
    for m in _PATRON.finditer(plano):
        clave = ETIQUETAS[int(m.lastgroup[1:])][0]
        halladas.append((clave, m.start(), m.end()))
    return halladas


def _limpio(texto):
    return " ".join(_RELLENO.sub("", texto).split())


# --------------------------------------------------------------------------- #
# Cómo se interpreta cada valor
# --------------------------------------------------------------------------- #
def documento(texto):
    """"V-12.345.678" -> ("V", "12345678"); pasaporte: ("P", "AB123456")."""
    plano = _plano(texto).upper()
    m = re.search(r"\b([VEP])\s*[-.]?\s*(\d[\d.\s]{4,11}\d)\b", plano)
    if m:
        return m.group(1), re.sub(r"\D", "", m.group(2))
    m = re.search(r"\b(\d{1,2}[.\s]?\d{3}[.\s]?\d{3})\b", plano)
    if m:
        return "V", re.sub(r"\D", "", m.group(1))
    m = re.search(r"\b([A-Z]{1,3}\d{5,9})\b", plano)
    if m:
        return "P", m.group(1)
    return None


def telefono(texto):
    """"0414 123.45.67" -> "0414-1234567"; "+57 300 1234567" se respeta."""
    m = re.search(r"\+?\d[\d\s().\-]{8,}\d", texto)
    if not m:
        return None
    crudo = m.group(0)
    digitos = re.sub(r"\D", "", crudo)
    if crudo.strip().startswith("+"):
        return "+" + digitos
    if len(digitos) == 10 and digitos[0] in "24":
        digitos = "0" + digitos
    if len(digitos) == 11 and digitos.startswith("0"):
        return f"{digitos[:4]}-{digitos[4:]}"
    return None


MESES = {m: i for i, m in enumerate(
    ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
     "septiembre", "octubre", "noviembre", "diciembre"], start=1)}


def fecha(texto):
    """"12/03/1980", "12-3-80" o "12 de marzo de 1980" -> "1980-03-12"."""
    plano = _plano(texto)
    m = re.search(r"\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})\b", plano)
    if m:
        dia, mes, anio = (int(x) for x in m.groups())
    else:
        m = re.search(r"\b(\d{1,2})\s+de\s+([a-z]+)\s+(?:de(?:l)?\s+)?(\d{2,4})\b", plano)
        if not m or m.group(2) not in MESES:
            return None
        dia, mes, anio = int(m.group(1)), MESES[m.group(2)], int(m.group(3))
    if anio < 100:
        anio += 1900 if anio > date.today().year % 100 else 2000
    try:
        return date(anio, mes, dia).isoformat()
    except ValueError:
        return None


DOMINIOS = r"gmail|hotmail|yahoo|outlook|icloud|live|cantv"


def correo(texto):
    m = re.search(r"[\w.+-]+\s?@\s?[\w-]+(?:\.[\w-]+)+", texto)
    if m:
        return m.group(0).replace(" ", "").lower()
    # El OCR suele leer la "@" como "e", "a", "©"…: se repone ante un dominio
    # conocido ("jose.perezegmail.com" -> "jose.perez@gmail.com").
    m = re.search(rf"([\w.+-]+?)\s?[@ea©®]?\s?({DOMINIOS})\s?\.\s?(com\.ve|com|net|es|ve)(?![\w.])",
                  texto.lower())
    return f"{m.group(1)}@{m.group(2)}.{m.group(3)}" if m else None


def nombre_propio(texto):
    """"JOSE  PEREZ" -> "Jose Perez" (sin números ni signos sueltos)."""
    palabras = re.findall(r"[^\W\d_]+", texto)
    return " ".join(p.capitalize() if p.isupper() or p.islower() else p for p in palabras)


def si_no(texto):
    plano = _plano(texto).strip()
    if re.search(r"\b(no)\b", plano):
        return False
    if re.search(r"\b(si|x|sí)\b|[✓✔☑]", plano) or plano in {"x", "si"}:
        return True
    return None


ESTADOS_CIVILES = [
    ("Unión libre", r"union\s+libre|concubin"),
    ("Soltero", r"solter"),
    ("Casado", r"casad"),
    ("Divorciado", r"divorci"),
    ("Viudo", r"viud"),
]

RELACIONES = {
    "mama": "Madre", "madre": "Madre", "papa": "Padre", "padre": "Padre",
    "esposa": "Esposa", "esposo": "Esposo", "hija": "Hija", "hijo": "Hijo",
    "hermana": "Hermana", "hermano": "Hermano", "tia": "Tía", "tio": "Tío",
    "prima": "Prima", "primo": "Primo", "abuela": "Abuela", "abuelo": "Abuelo",
    "sobrina": "Sobrina", "sobrino": "Sobrino", "cunada": "Cuñada", "cunado": "Cuñado",
    "suegra": "Suegra", "suegro": "Suegro", "nuera": "Nuera", "yerno": "Yerno",
    "novia": "Novia", "novio": "Novio", "amiga": "Amiga", "amigo": "Amigo",
    "vecina": "Vecina", "vecino": "Vecino", "madrina": "Madrina", "padrino": "Padrino",
}

TALLAS = [("XXXL", r"xxxl|3xl"), ("XXL", r"xxl|2xl"), ("XL", r"\bxl\b|extra\s*grande"),
          ("L", r"\bl\b|grande"), ("M", r"\bm\b|mediana?"), ("S", r"\bs\b|peque[nñ]a")]

TURNOS = [("viernes", "viernes"), ("sabado", "sabado"), ("domingo", "domingo")]
MOMENTOS = [("manana", r"manana|am\b"), ("tarde", r"tarde"), ("noche", r"noche")]


def talla(texto):
    plano = _plano(texto)
    for valor, patron in TALLAS:
        if re.search(patron, plano):
            return valor
    return None


def relacion(texto):
    palabra = simple(texto).split(" ")[0] if texto else ""
    return RELACIONES.get(palabra) or (nombre_propio(texto) if texto else None)


def estado_civil(texto):
    plano = _plano(texto)
    for valor, patron in ESTADOS_CIVILES:
        if re.search(patron, plano):
            return valor
    return None


# --------------------------------------------------------------------------- #
# La planilla completa
# --------------------------------------------------------------------------- #
def _valores(lineas):
    """[(clave, texto del valor, confianza, sección)] en el orden de la hoja.
    La sección cambia a "contacto" al llegar a "En caso de emergencia…", para
    que sus teléfonos sean del familiar."""
    valores, seccion, contactos = [], "persona", 0
    for i, linea in enumerate(lineas):
        texto = linea.texto
        halladas = _etiquetas(texto)
        for n, (clave, _ini, fin) in enumerate(halladas):
            if clave == "contacto_nombre":
                contactos += 1
                seccion = "contacto" if contactos == 1 else "contacto2"
            corte = halladas[n + 1][1] if n + 1 < len(halladas) else len(texto)
            valor = _limpio(texto[fin:corte])
            # Sin valor en el renglón: el siguiente, si no es otra etiqueta.
            if not valor and n == len(halladas) - 1 and i + 1 < len(lineas):
                siguiente = lineas[i + 1]
                if not _etiquetas(siguiente.texto):
                    valor = _limpio(siguiente.texto)
            if valor:
                valores.append((clave, valor, round(linea.confianza), seccion))
    return valores


def _poner(campos, clave, valor, texto, confianza):
    if valor not in (None, "", [], {}) and clave not in campos:
        campos[clave] = Dato(valor, texto, confianza)


def extraer(lectura, tipo="caminante"):
    """{campo: Dato} para el formulario de caminante o de servidor."""
    campos = {}
    textos_area, textos_camisa, lugar = [], [], {}
    for clave, texto, conf, seccion in _valores(lectura.lineas):
        en_contacto = seccion in ("contacto", "contacto2")
        pref = "contacto2_" if seccion == "contacto2" else "contacto_"
        if clave == "nombre_completo" or (clave == "nombres" and en_contacto):
            if en_contacto:
                _poner(campos, f"{pref}nombre", nombre_propio(texto), texto, conf)
                continue
            from ..models import Persona
            p = Persona()
            p.dividir_nombre(nombre_propio(texto))
            for parte in Persona.PARTES_NOMBRE:
                _poner(campos, parte, getattr(p, parte), texto, conf)
        elif clave in ("nombres", "apellidos"):
            partes = nombre_propio(texto).split()
            base = "nombre" if clave == "nombres" else "apellido"
            if partes:
                _poner(campos, f"primer_{base}", partes[0], texto, conf)
                _poner(campos, f"segundo_{base}", " ".join(partes[1:]), texto, conf)
        elif clave in ("primer_nombre", "segundo_nombre", "primer_apellido",
                       "segundo_apellido", "pareja_nombre"):
            _poner(campos, clave, nombre_propio(texto), texto, conf)
        elif clave == "contacto_nombre":
            _poner(campos, f"{pref}nombre", nombre_propio(texto), texto, conf)
        elif clave == "contacto_relacion":
            _poner(campos, f"{pref}relacion", relacion(texto), texto, conf)
        elif clave == "documento" and not en_contacto:
            doc = documento(texto)
            if doc:
                _poner(campos, "tipo_documento", doc[0], texto, conf)
                _poner(campos, "documento", doc[1], texto, conf)
        elif clave in ("telefono", "telefono_casa", "telefono_generico"):
            numero = telefono(texto)
            if not numero:
                continue
            fijo = numero.startswith("02") or clave == "telefono_casa"
            if en_contacto:
                destino = (f"{pref}telefono" if fijo or seccion == "contacto2"
                           else f"{pref}celular")
            elif clave == "telefono_generico":
                destino = "telefono_casa" if fijo else "telefono"
            else:
                destino = clave
            _poner(campos, destino, numero, texto, conf)
        elif clave == "email":
            _poner(campos, f"{pref}correo" if en_contacto else "email",
                   correo(texto), texto, conf)
        elif clave == "fecha_nacimiento":
            _poner(campos, clave, fecha(texto), texto, conf)
        elif clave == "edad":
            m = re.search(r"\d{1,3}", texto)
            _poner(campos, "edad", int(m.group(0)) if m else None, texto, conf)
        elif clave == "estado_civil":
            _poner(campos, clave, estado_civil(texto), texto, conf)
        elif clave == "hijos":
            m = re.search(r"\d{1,2}", texto)
            if m:
                _poner(campos, "hijos", m.group(0), texto, conf)
            elif re.search(r"\bno\b|ningun", _plano(texto)):
                _poner(campos, "hijos", "0", texto, conf)
        elif clave in ("bautismo", "confirmacion", "matrimonio", "uncion"):
            _poner(campos, clave, si_no(texto), texto, conf)
        elif clave == "talla":
            _poner(campos, "talla_camiseta", talla(texto), texto, conf)
            textos_camisa.append(texto)
        elif clave == "camisa":
            textos_camisa.append(texto)
        elif clave in ("entidad", "ciudad"):
            lugar.setdefault(clave, (nombre_propio(texto), texto, conf))
        elif clave == "areas":
            textos_area.extend(re.split(r"[,;/]| y ", texto))
        elif clave == "duerme":
            valor = si_no(texto)
            _poner(campos, "duerme", None if valor is None else ("si" if valor else "no"),
                   texto, conf)
        elif clave == "padrino":
            _poner(campos, "padrino_nombre", nombre_propio(texto), texto, conf)
        elif clave in ("direccion", "ocupacion", "parroquia_asiste", "edades_hijos",
                       "condicion_medica", "tratamiento", "regimen_alimenticio",
                       "requerimientos", "notas"):
            # Respuestas de "no tiene" no son un dato.
            if re.fullmatch(r"(no|ninguna?|n/?a|-+)\.?", _plano(texto).strip()):
                continue
            _poner(campos, clave, texto, texto, conf)

    _por_forma(lectura, campos)
    _ubicar(campos, lugar)
    if tipo == "servidor":
        _servicio(lectura, campos, textos_area, textos_camisa)
    return campos


def _por_forma(lectura, campos):
    """Cédula, celular, correo y fecha sin su etiqueta: por cómo se ven."""
    for linea in lectura.lineas:
        texto, conf = linea.texto, round(linea.confianza)
        plano = _plano(texto)
        if "documento" not in campos and re.search(r"\b[ve]\s*[-.]\s*\d", plano):
            doc = documento(texto)
            if doc:
                _poner(campos, "tipo_documento", doc[0], texto, conf)
                _poner(campos, "documento", doc[1], texto, conf)
        if "email" not in campos and "contacto_correo" not in campos:
            _poner(campos, "email", correo(texto), texto, conf)


def _ubicar(campos, lugar):
    from .catalogos import ubicacion

    estado = lugar.get("entidad")
    ciudad = lugar.get("ciudad")
    if not (estado or ciudad):
        return
    hallado = ubicacion(estado[0] if estado else "", ciudad[0] if ciudad else "")
    origen = estado or ciudad
    for clave, (valor, etiqueta) in hallado.items():
        conf = (ciudad if clave in ("ciudad", "ciudad_texto") and ciudad else origen)[2]
        campos.setdefault(clave, Dato(valor, etiqueta, conf))


def _servicio(lectura, campos, textos_area, textos_camisa):
    """Servidores: áreas, turnos y camisas."""
    from .catalogos import areas

    halladas = areas(textos_area) if textos_area else {}
    if halladas:
        campos["areas"] = Dato(list(halladas), ", ".join(halladas.values()), 60)

    turnos = []
    for linea in lectura.lineas:
        plano = _plano(linea.texto)
        for dia, nombre_dia in TURNOS:
            if nombre_dia not in plano:
                continue
            if re.search(r"todo\s+el\s+dia|full|completo", plano):
                momentos = ["manana", "tarde"] + (["noche"] if dia != "domingo" else [])
            else:
                momentos = [m for m, patron in MOMENTOS if re.search(patron, plano)]
            turnos += [f"{dia}_{m}" for m in momentos
                       if not (dia == "domingo" and m == "noche")]
    if turnos:
        campos["turnos"] = Dato(sorted(set(turnos)), ", ".join(sorted(set(turnos))), 50)

    if textos_camisa:
        texto = " ".join(textos_camisa)
        plano = _plano(texto)
        camisas = [c for c, p in (("azul", r"azul"), ("blanca", r"blanc"), ("polo", r"polo"))
                   if re.search(p, plano)]
        if camisas:
            campos["camisas"] = Dato(camisas, texto, 50)
        t = talla(texto)
        if t:
            campos["tallas"] = Dato([t], texto, 50)


def json(campos):
    return {clave: dato.json() for clave, dato in campos.items()}
