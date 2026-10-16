"""
Lo que antes solo se hacía en el admin de Django, ahora desde el frontend:

- La cuenta de acceso de un Usuario (nombre de usuario, correo y contraseña).
  Los permisos no van aquí: salen de sus roles (AsignacionRol, módulo Roles).
- Importar personas desde un Excel o CSV, con vista previa antes de guardar.
"""

import tablib
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, parser_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from ..acceso import ambito_fijo
from ..models import Parroquia, Persona, Usuario
from ..reportes import PersonaResource
from .permisos import permiso


# --------------------------------------------------------------------------- #
# Cuenta de acceso
# --------------------------------------------------------------------------- #
def _cuenta_json(usuario):
    cuenta = usuario.cuenta
    return {
        "usuario": usuario.pk,
        "persona": str(usuario.persona),
        "tiene_cuenta": cuenta is not None,
        "username": cuenta.username if cuenta else "",
        "email": (cuenta.email if cuenta else "") or usuario.persona.email,
        "activo": usuario.activo,
        "ultimo_acceso": cuenta.last_login if cuenta else None,
        "es_superusuario": bool(cuenta and cuenta.is_superuser),
    }


@api_view(["GET", "POST"])
def cuenta_usuario(request, pk):
    """GET: la cuenta del usuario. POST {username, email, password?}: la crea o
    la cambia (la contraseña es obligatoria al crearla; si se deja vacía al
    editar, no cambia)."""
    if not request.user.has_perm(permiso(Usuario, "change")):
        raise PermissionDenied()
    usuario = get_object_or_404(Usuario.objects.select_related("persona", "cuenta"), pk=pk)
    if request.method == "GET":
        return Response(_cuenta_json(usuario))

    cuenta = usuario.cuenta
    # A un superusuario solo lo toca otro superusuario.
    if cuenta and cuenta.is_superuser and not request.user.is_superuser:
        raise PermissionDenied("Solo un superusuario puede cambiar esta cuenta.")
    User = get_user_model()
    username = str(request.data.get("username") or "").strip()
    email = str(request.data.get("email") or "").strip()
    password = str(request.data.get("password") or "")
    errores = {}
    if not username:
        errores["username"] = ["Escribe el nombre de usuario."]
    else:
        try:
            User.username_validator(username)
        except ValidationError:
            errores["username"] = [
                "Solo letras, números y los signos . @ + - _ (sin espacios)."]
        if User.objects.exclude(pk=getattr(cuenta, "pk", None)).filter(
                username__iexact=username).exists():
            errores["username"] = ["Ya hay otra cuenta con ese nombre de usuario."]
    if cuenta is None and not password:
        errores["password"] = ["Escribe una contraseña para la cuenta nueva."]
    nueva = cuenta or User(is_active=usuario.activo)
    nueva.username, nueva.email = username, email
    if password and "username" not in errores:
        try:
            validate_password(password, nueva)
        except ValidationError as e:
            errores["password"] = list(e.messages)
    if errores:
        return Response(errores, status=400)
    if password:
        nueva.set_password(password)
    with transaction.atomic():
        nueva.save()
        if cuenta is None:
            usuario.cuenta = nueva
            usuario.save(update_fields=["cuenta"])
    usuario.cuenta = nueva
    return Response(_cuenta_json(usuario))


# --------------------------------------------------------------------------- #
# Importar personas
# --------------------------------------------------------------------------- #
FORMATOS_IMPORTAR = {"xlsx": "xlsx", "xls": "xls", "csv": "csv"}
COLUMNAS_IMPORTAR = list(PersonaResource.Meta.fields)


def _con_encabezados(crudo):
    """Los datos a partir de la fila de encabezados (la primera que nombra
    alguna columna conocida), sin filas vacías. Así sirve la plantilla, que
    trae título arriba, o un archivo con notas antes de la tabla."""
    filas = [[("" if v is None else v) for v in fila] for fila in crudo]
    for i, fila in enumerate(filas):
        encabezados = [str(v).strip() for v in fila]
        if any(h in COLUMNAS_IMPORTAR for h in encabezados):
            datos = tablib.Dataset(headers=encabezados)
            for resto in filas[i + 1:]:
                if any(str(v).strip() for v in resto):
                    datos.append(resto)
            return datos
    return None


@api_view(["POST"])
@parser_classes([MultiPartParser])
def importar_personas(request):
    """Sube un Excel/CSV de personas (columnas como las de COLUMNAS_IMPORTAR).
    Sin ?confirmar=1 solo muestra qué pasaría; con él, lo guarda. Casa por
    documento, correo o teléfono para no duplicar (ver PersonaResource)."""
    user = request.user
    if not (user.has_perm(permiso(Persona, "add")) and user.has_perm(permiso(Persona, "change"))):
        raise PermissionDenied()
    archivo = request.FILES.get("archivo")
    extension = (archivo.name.rsplit(".", 1)[-1].lower() if archivo else "")
    if extension not in FORMATOS_IMPORTAR:
        return Response({"detail": "Sube un archivo .xlsx o .csv."}, status=400)
    contenido = archivo.read()
    try:
        crudo = tablib.Dataset().load(
            contenido.decode("utf-8-sig") if extension == "csv" else contenido,
            format=FORMATOS_IMPORTAR[extension], headers=False,
        )
    except Exception:  # noqa: BLE001 - cualquier archivo ilegible
        return Response({"detail": "No se pudo leer el archivo."}, status=400)
    datos = _con_encabezados(crudo)
    if datos is None:
        return Response({"detail": (
            "El archivo no tiene las columnas esperadas. Descarga la plantilla y "
            "llénala."
        )}, status=400)
    # Sin columna de parroquia: la que fija el rol de quien importa o, si hay
    # una sola, esa.
    if "parroquia" not in datos.headers:
        parroquias = list(Parroquia.objects.all()[:2])
        fija = ambito_fijo(user).get("parroquia") or (
            parroquias[0] if len(parroquias) == 1 else None)
        if fija is None:
            return Response({"detail": (
                "Agrega la columna «parroquia» con el nombre de la parroquia de "
                "cada persona (como aparece en Catálogos → Parroquias)."
            )}, status=400)
        datos.append_col([fija.nombre] * datos.height, header="parroquia")

    # Antes de importar: que cada fila tenga una parroquia que exista.
    existentes = {n.lower() for n in Parroquia.objects.values_list("nombre", flat=True)}
    previos = []
    for numero, fila in enumerate(datos.dict, start=1):
        nombre = str(fila.get("parroquia") or "").strip()
        if not nombre:
            previos.append({"fila": numero, "mensaje": "Falta la parroquia."})
        elif nombre.lower() not in existentes:
            previos.append({"fila": numero,
                            "mensaje": f"No existe la parroquia «{nombre}»."})
    if previos:
        return Response({
            "guardado": False, "filas": datos.height, "nuevas": 0, "actualizadas": 0,
            "sin_cambios": 0, "errores": previos[:50], "total_errores": len(previos),
        })

    confirmar = request.query_params.get("confirmar") == "1"
    resultado = PersonaResource().import_data(datos, dry_run=not confirmar,
                                              raise_errors=False)
    errores = [
        # Errores inesperados (de la base de datos): sin el detalle técnico.
        {"fila": numero, "mensaje": "No se pudo guardar: revisa los datos de esta fila."}
        for numero, _lista in resultado.row_errors()
    ] + [
        {"fila": fila.number, "mensaje": "; ".join(
            f"{campo}: {', '.join(str(m) for m in mensajes)}"
            for campo, mensajes in fila.error.message_dict.items())}
        for fila in resultado.invalid_rows
    ]
    totales = resultado.totals
    return Response({
        "guardado": confirmar and not errores,
        "filas": datos.height,
        "nuevas": totales.get("new", 0),
        "actualizadas": totales.get("update", 0),
        "sin_cambios": totales.get("skip", 0),
        "errores": errores[:50],
        "total_errores": len(errores),
    })
