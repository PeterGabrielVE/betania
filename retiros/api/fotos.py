"""Foto de perfil de una persona: /api/personas/<id>/foto/.

GET devuelve la imagen; PUT (o POST) con un archivo "foto" la cambia; DELETE la
quita. Ver y cambiar siguen los permisos de Personas y el ámbito del rol (y el
RLS, porque la foto va en la base de datos: FotoPersona).

La imagen se guarda ya lista para el avatar: girada según la cámara (EXIF),
recortada al centro en un cuadrado de LADO px y en JPEG. Así pesa poco (unos
20-40 KB) y no guarda los metadatos del teléfono (ubicación, modelo...).
"""

from io import BytesIO

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.decorators import api_view, parser_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from ..models import FotoPersona, Persona
from .modulos import POR_MODELO

LADO = 400
MAX_MB = 10
# Una foto de celular ronda los 12-50 megapíxeles; más que esto no es una foto.
MAX_PIXELES = 80_000_000


def _persona(request, pk, accion):
    if not request.user.has_perm(f"retiros.{accion}_persona"):
        raise PermissionDenied("Tu rol no permite esto.")
    from .vistas import filtros_fijos  # evita la importación circular

    qs = Persona.objects.all()
    for nombre, obj in filtros_fijos(POR_MODELO[Persona], request.user).items():
        qs = qs.filter(**{nombre: obj.pk})
    return get_object_or_404(qs, pk=pk)


def preparar(archivo):
    """El archivo subido -> bytes JPEG del avatar. ValueError si no sirve."""
    if archivo.size > MAX_MB * 1024 * 1024:
        raise ValueError(f"La foto pesa más de {MAX_MB} MB.")
    try:
        imagen = Image.open(archivo)
        if imagen.width * imagen.height > MAX_PIXELES:
            raise ValueError("La imagen es demasiado grande.")
        imagen = ImageOps.exif_transpose(imagen)
        if imagen.mode in ("RGBA", "LA", "P"):
            # Lo transparente (un PNG) queda en blanco.
            imagen = imagen.convert("RGBA")
            fondo = Image.new("RGB", imagen.size, "white")
            fondo.paste(imagen, mask=imagen.getchannel("A"))
            imagen = fondo
        imagen = ImageOps.fit(imagen.convert("RGB"), (LADO, LADO), Image.Resampling.LANCZOS)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ValueError("No es una imagen válida. Usa una foto JPG, PNG o WEBP.") from e
    salida = BytesIO()
    imagen.save(salida, "JPEG", quality=85, optimize=True)
    return salida.getvalue()


@api_view(["GET", "PUT", "POST", "DELETE"])
@parser_classes([MultiPartParser, FormParser])
def foto_persona(request, pk):
    if request.method == "GET":
        persona = _persona(request, pk, "view")
        foto = FotoPersona.objects.filter(persona=persona).first()
        if foto is None:
            return Response({"detail": "No tiene foto."}, status=404)
        respuesta = HttpResponse(bytes(foto.imagen), content_type=foto.tipo)
        # La dirección lleva la versión (?v=): al cambiar la foto cambia.
        respuesta["Cache-Control"] = "private, max-age=31536000, immutable"
        return respuesta

    persona = _persona(request, pk, "change")
    if request.method == "DELETE":
        with transaction.atomic():
            FotoPersona.objects.filter(persona=persona).delete()
            persona.foto_actualizada = None
            persona.save(update_fields=["foto_actualizada"])
        return Response({"foto": None})

    archivo = request.FILES.get("foto")
    if archivo is None:
        return Response({"foto": ["Elige una foto."]}, status=400)
    try:
        imagen = preparar(archivo)
    except ValueError as e:
        return Response({"foto": [str(e)]}, status=400)
    with transaction.atomic():
        FotoPersona.objects.update_or_create(
            persona=persona, defaults={"imagen": imagen, "tipo": "image/jpeg"})
        persona.foto_actualizada = timezone.now()
        persona.save(update_fields=["foto_actualizada"])
    return Response({"foto": persona.foto_url})
