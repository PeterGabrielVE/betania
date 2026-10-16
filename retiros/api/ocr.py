"""
Leer planillas en papel con OCR (Tesseract, en este servidor) para llenar los
formularios. Nada se guarda al leer: el frontend muestra lo leído para
revisarlo. Solo importar_listado crea registros, y fila por fila.
"""

from django.db import IntegrityError, transaction
from rest_framework.decorators import api_view, parser_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from ..acceso import retiros_visibles
from ..models import AsignacionServicio, Inscripcion, Participacion, Persona
from ..ocr import listado, planilla
from ..ocr.catalogos import areas as areas_por_nombre
from ..ocr.lectura import ArchivoNoValido, leer
from .permisos import permiso, ve_sensibles

TIPOS = ("caminante", "servidor")


def _leer(request):
    archivo = request.FILES.get("archivo")
    if archivo is None:
        raise ArchivoNoValido("Sube la foto o el PDF de la planilla.")
    return leer(archivo.read(), archivo.name)


def _puede(user, *modelos):
    return all(user.has_perm(permiso(m, "add")) for m in modelos)


@api_view(["POST"])
@parser_classes([MultiPartParser])
def leer_planilla(request):
    """{archivo, tipo: caminante|servidor} -> {campos: {campo: {valor, texto,
    confianza}}, texto}. Los datos de salud y familia solo vuelven a quien
    puede verlos."""
    tipo = request.data.get("tipo", "caminante")
    if tipo not in TIPOS:
        return Response({"detail": "Tipo de planilla no válido."}, status=400)
    if not _puede(request.user, Persona):
        raise PermissionDenied()
    try:
        lectura = _leer(request)
    except ArchivoNoValido as e:
        return Response({"detail": str(e)}, status=400)
    campos = planilla.json(planilla.extraer(lectura, tipo))
    if not ve_sensibles(request):
        for clave in list(campos):
            if clave in CONFIDENCIALES or clave.startswith(("contacto", "pareja_")):
                del campos[clave]
    return Response({
        "campos": campos,
        "texto": lectura.texto,
        "lineas": len(lectura.lineas),
    })


# Lo que solo ve quien puede ver datos confidenciales (como en los formularios).
CONFIDENCIALES = {
    "condicion_medica", "tratamiento", "regimen_alimenticio", "requerimientos",
    "talla_camiseta", "estado_civil", "hijos", "edades_hijos", "bautismo",
    "confirmacion", "matrimonio", "uncion", "parroquia_asiste", "direccion",
    "telefono_casa", "ocupacion",
}


@api_view(["POST"])
@parser_classes([MultiPartParser])
def leer_listado(request):
    """{archivo} -> {columnas, filas}: una hoja tabulada (varias personas)."""
    if not _puede(request.user, Persona):
        raise PermissionDenied()
    try:
        lectura = _leer(request)
    except ArchivoNoValido as e:
        return Response({"detail": str(e)}, status=400)
    resultado = listado.extraer(lectura)
    if not resultado["filas"]:
        return Response({"detail": (
            "No se encontró una tabla con encabezados como NOMBRE Y APELLIDO, "
            "CELULAR, EDAD… Toma la foto de frente, con buena luz y que se vean "
            "los encabezados."
        ), "texto": lectura.texto}, status=400)
    if not ve_sensibles(request):
        for fila in resultado["filas"]:
            for clave in ("salud", "direccion", "contacto_nombre", "contacto_relacion",
                          "contacto_celular", "talla"):
                fila.pop(clave, None)
    return Response(resultado)


def _persona(fila, parroquia):
    """La persona de la fila: la registrada con ese documento (o, sin él, con
    ese nombre), o una nueva."""
    doc = (fila.get("documento") or "").strip()
    tipo = fila.get("tipo_documento") or "V"
    if doc:
        existente = Persona.objects.filter(tipo_documento=tipo,
                                           documento=Persona.normalizar_documento(doc)).first()
        if existente:
            return existente, False
    nueva = Persona(parroquia=parroquia, nombre=fila["nombre"], telefono=fila.get("telefono", ""),
                    email=fila.get("email", ""), tipo_documento=tipo, documento=doc)
    nueva.dividir_nombre(fila["nombre"])
    if not doc:
        mismo = Persona.objects.filter(primer_nombre__iexact=nueva.primer_nombre,
                                       primer_apellido__iexact=nueva.primer_apellido,
                                       parroquia=parroquia).first()
        if mismo:
            return mismo, False
    if fila.get("direccion"):
        nueva.datos_sensibles = {"direccion": fila["direccion"]}
    nueva.full_clean(exclude=["fecha_nacimiento"])
    nueva.save()
    return nueva, True


@api_view(["POST"])
@parser_classes([JSONParser])
def importar_listado(request):
    """{retiro, como: caminantes|servidores|personas, filas: [...]}: crea cada
    fila (sin duplicar personas ni inscripciones). Devuelve qué pasó con cada
    una; una fila con error no detiene a las demás."""
    user = request.user
    como = request.data.get("como")
    modelos = {"caminantes": (Persona, Inscripcion), "servidores": (Persona, Participacion),
               "personas": (Persona,)}.get(como)
    if modelos is None:
        return Response({"detail": "Elige cómo cargarlas."}, status=400)
    if not _puede(user, *modelos):
        raise PermissionDenied()
    retiro = retiros_visibles(user).filter(pk=request.data.get("retiro")).first()
    if retiro is None:
        return Response({"detail": "Elige el retiro."}, status=400)
    filas = request.data.get("filas")
    if not isinstance(filas, list) or not filas or len(filas) > 300:
        return Response({"detail": "No hay filas para cargar (máximo 300)."}, status=400)
    sensibles = ve_sensibles(request)

    resultados = []
    for n, fila in enumerate(filas, start=1):
        if not isinstance(fila, dict) or len(str(fila.get("nombre", "")).split()) < 2:
            resultados.append({"fila": n, "estado": "error",
                               "mensaje": "Falta el nombre y el apellido."})
            continue
        try:
            with transaction.atomic():
                persona, nueva = _persona(fila, retiro.parroquia)
                resultados.append(_cargar(fila, n, persona, nueva, retiro, como, sensibles))
        except Exception as e:  # noqa: BLE001 - se informa por fila
            mensajes = getattr(e, "messages", None) or [
                "Ya existe un registro con esos datos." if isinstance(e, IntegrityError)
                else "No se pudo guardar."]
            resultados.append({"fila": n, "estado": "error", "nombre": fila.get("nombre"),
                               "mensaje": " ".join(mensajes)})
    return Response({
        "resultados": resultados,
        "creados": sum(r["estado"] == "creado" for r in resultados),
        "existentes": sum(r["estado"] == "existente" for r in resultados),
        "errores": sum(r["estado"] == "error" for r in resultados),
    })


def _cargar(fila, n, persona, nueva, retiro, como, sensibles):
    base = {"fila": n, "nombre": str(persona), "persona": str(persona.pk)}
    if como == "personas":
        return {**base, "estado": "creado" if nueva else "existente",
                "mensaje": "Persona nueva." if nueva else "Ya estaba registrada."}
    if como == "caminantes":
        if Inscripcion.objects.filter(retiro=retiro, persona=persona).exists():
            return {**base, "estado": "existente", "mensaje": "Ya estaba inscrita."}
        ins = Inscripcion(retiro=retiro, persona=persona)
        if sensibles:
            salud = {k: v for k, v in (("talla_camiseta", fila.get("talla")),
                                       ("tratamiento", fila.get("salud"))) if v}
            contacto = {k: v for k, v in (("nombre", fila.get("contacto_nombre")),
                                          ("relacion", fila.get("contacto_relacion")),
                                          ("celular", fila.get("contacto_celular"))) if v}
            ins.salud_alimentacion, ins.contacto_emergencia = salud, contacto
        ins.full_clean()
        ins.save()
        return {**base, "estado": "creado", "mensaje": "Inscrita como caminante."}
    # servidores
    if Participacion.objects.filter(retiro=retiro, persona=persona).exists():
        return {**base, "estado": "existente", "mensaje": "Ya estaba en este retiro."}
    part = Participacion(retiro=retiro, persona=persona, tipo=Participacion.Tipo.SERVIDOR)
    part.full_clean()
    part.save()
    halladas = areas_por_nombre([fila["area"]], retiro.parroquia_id) if fila.get("area") else {}
    for area_id in halladas:
        AsignacionServicio.objects.create(participacion=part, area_id=area_id)
    extra = f" Área: {', '.join(halladas.values())}." if halladas else ""
    return {**base, "estado": "creado", "mensaje": f"Registrado como servidor.{extra}"}

