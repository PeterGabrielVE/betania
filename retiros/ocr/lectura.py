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


def preparar(imagen):
    """Derecha (según la foto), en grises, con contraste y de buen tamaño."""
    imagen = ImageOps.exif_transpose(imagen)
    imagen = imagen.convert("L")
    # Tesseract lee mejor con letras de ~30 px: las fotos chicas se agrandan.
    if imagen.width < 1800:
        escala = 1800 / imagen.width
        imagen = imagen.resize((1800, int(imagen.height * escala)), Image.LANCZOS)
    return ImageOps.autocontrast(imagen, cutoff=1)


def leer_imagen(imagen, pagina=1):
    """Las líneas de una imagen, con la posición y confianza de cada palabra."""
    import pytesseract

    datos = pytesseract.image_to_data(
        preparar(imagen), lang="spa", config="--psm 4",
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


def leer(contenido, nombre):
    """Todo el archivo: las líneas de cada página, en orden."""
    lineas = []
    for n, imagen in enumerate(imagenes(contenido, nombre), start=1):
        lineas.extend(leer_imagen(imagen, n))
    return Lectura(lineas)
