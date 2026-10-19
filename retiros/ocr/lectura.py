"""De una foto o un PDF escaneado a texto, línea por línea."""

import io
from dataclasses import dataclass, field

from PIL import Image, ImageOps

MAX_BYTES = 15 * 1024 * 1024
MAX_PAGINAS = 10
FORMATOS = {"jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp", "pdf"}


class ArchivoNoValido(ValueError):
    """El archivo no se puede leer (formato, tamaño o contenido)."""


@dataclass
class Palabra:
    texto: str
    x: int
    y: int
    ancho: int
    alto: int
    confianza: float  # 0 a 100

    @property
    def centro(self):
        return self.x + self.ancho / 2


@dataclass
class Linea:
    palabras: list = field(default_factory=list)
    pagina: int = 1

    @property
    def texto(self):
        return " ".join(p.texto for p in self.palabras)

    @property
    def confianza(self):
        conf = [p.confianza for p in self.palabras if p.confianza >= 0]
        return sum(conf) / len(conf) if conf else 0

    @property
    def y(self):
        return min(p.y for p in self.palabras)


@dataclass
class Lectura:
    lineas: list

    @property
    def texto(self):
        return "\n".join(l.texto for l in self.lineas)


def imagenes(contenido, nombre):
    """Las páginas del archivo como imágenes."""
    extension = nombre.rsplit(".", 1)[-1].lower() if "." in nombre else ""
    if extension not in FORMATOS:
        raise ArchivoNoValido("Sube una foto (JPG, PNG…) o un PDF escaneado.")
    if len(contenido) > MAX_BYTES:
        raise ArchivoNoValido("El archivo pesa más de 15 MB.")
    if extension == "pdf":
        import pymupdf

        try:
            documento = pymupdf.open(stream=contenido, filetype="pdf")
        except Exception as e:  # noqa: BLE001 - PDF dañado
            raise ArchivoNoValido("No se pudo abrir el PDF.") from e
        if documento.page_count > MAX_PAGINAS:
            raise ArchivoNoValido(f"El PDF tiene más de {MAX_PAGINAS} páginas.")
        paginas = []
        for pagina in documento:
            imagen = pagina.get_pixmap(dpi=300)
            paginas.append(Image.open(io.BytesIO(imagen.tobytes("png"))))
        return paginas
    try:
        imagen = Image.open(io.BytesIO(contenido))
        imagen.load()
    except Exception as e:  # noqa: BLE001 - imagen dañada o formato raro
        raise ArchivoNoValido("No se pudo abrir la imagen.") from e
    return [imagen]


def preparar(imagen, tabla=False):
    """Derecha (según la foto), en grises, con contraste y de buen tamaño. Con
    `tabla`, además sin la cuadrícula (ver sin_cuadricula)."""
    imagen = ImageOps.exif_transpose(imagen)
    imagen = imagen.convert("L")
    if tabla:
        return sin_cuadricula(imagen)
    # Tesseract lee mejor con letras de ~30 px: las fotos chicas se agrandan.
    if imagen.width < 1800:
        escala = 1800 / imagen.width
        imagen = imagen.resize((1800, int(imagen.height * escala)), Image.LANCZOS)
    return ImageOps.autocontrast(imagen, cutoff=1)


def sin_cuadricula(imagen, ancho=3000):
    """Una tabla (p. ej. la foto de un Excel en pantalla) en blanco y negro,
    derecha y sin las líneas de las celdas: Tesseract confunde esas líneas con
    letras ("|", "[") y deja de ver las filas.

    Se agranda más que las planillas (las fotos de pantalla traen letras
    chicas), se binariza tolerando luz despareja, se endereza según las líneas
    horizontales y se borran las líneas largas, horizontales y verticales,
    alargando las verticales para llevarse los trozos que deja la inclinación."""
    import cv2
    import numpy as np

    gris = np.asarray(imagen)
    escala = ancho / gris.shape[1]
    gris = cv2.resize(gris, None, fx=escala, fy=escala, interpolation=cv2.INTER_CUBIC)
    alto = gris.shape[0]
    tinta = cv2.adaptiveThreshold(gris, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY_INV, 41, 15)

    def rect(w, h):
        return cv2.getStructuringElement(cv2.MORPH_RECT, (w, h))

    angulo = _inclinacion(cv2.morphologyEx(tinta, cv2.MORPH_OPEN, rect(ancho // 15, 1)), ancho)
    if angulo:
        giro = cv2.getRotationMatrix2D((ancho / 2, alto / 2), angulo, 1)
        tinta = cv2.warpAffine(tinta, giro, (ancho, alto), flags=cv2.INTER_NEAREST,
                               borderValue=0)
    horizontales = cv2.morphologyEx(tinta, cv2.MORPH_OPEN, rect(ancho // 30, 1))
    # Por el ancho, no el alto: las letras se escalan con él (una hoja corta
    # no puede tomar una letra alta por línea).
    verticales = cv2.morphologyEx(tinta, cv2.MORPH_OPEN, rect(1, ancho // 50))
    verticales = cv2.dilate(verticales, rect(5, ancho // 25))
    horizontales = cv2.dilate(horizontales, rect(ancho // 30, 5))
    lineas = cv2.dilate(horizontales | verticales, np.ones((3, 3), np.uint8))
    return Image.fromarray(255 - cv2.bitwise_and(tinta, cv2.bitwise_not(lineas)))


def _inclinacion(horizontales, ancho):
    """Grados que hay que girar para que las líneas de la tabla queden derechas
    (0 si no se ven líneas largas)."""
    import cv2
    import numpy as np

    lineas = cv2.HoughLinesP(horizontales, 1, np.pi / 1800, 200,
                             minLineLength=ancho // 4, maxLineGap=20)
    if lineas is None:
        return 0.0
    angulos = [np.degrees(np.arctan2(y2 - y1, x2 - x1))
               for x1, y1, x2, y2 in lineas.reshape(-1, 4)]
    angulos = [a for a in angulos if abs(a) < 10]
    return float(np.median(angulos)) if angulos else 0.0


def leer_imagen(imagen, pagina=1, tabla=False):
    """Las líneas de una imagen, con la posición y confianza de cada palabra."""
    import pytesseract

    datos = pytesseract.image_to_data(
        preparar(imagen, tabla), lang="spa", config="--psm 4",
        output_type=pytesseract.Output.DICT,
    )
    lineas = {}
    for i, texto in enumerate(datos["text"]):
        texto = (texto or "").strip()
        if not texto:
            continue
        clave = (datos["block_num"][i], datos["par_num"][i], datos["line_num"][i])
        lineas.setdefault(clave, Linea(pagina=pagina)).palabras.append(Palabra(
            texto=texto, x=datos["left"][i], y=datos["top"][i],
            ancho=datos["width"][i], alto=datos["height"][i],
            confianza=float(datos["conf"][i]),
        ))
    return sorted(lineas.values(), key=lambda l: (l.pagina, l.y))


def leer(contenido, nombre, tabla=False):
    """Todo el archivo: las líneas de cada página, en orden. `tabla`: quitar la
    cuadrícula antes de leer (para listados con celdas)."""
    lineas = []
    for n, imagen in enumerate(imagenes(contenido, nombre), start=1):
        lineas.extend(leer_imagen(imagen, n, tabla))
    return Lectura(lineas)
