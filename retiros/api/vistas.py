"""
Serializer y ViewSet genéricos: uno por módulo de MODULOS (listar, crear, editar
y borrar), más el esquema con el que el frontend dibuja menú, tablas y formularios.
"""

import copy
import json
from datetime import date, datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import ProtectedError
from django.utils.functional import cached_property
from django.utils.text import capfirst
from rest_framework import filters, routers, serializers, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from django.conf import settings

from ..acceso import ambito_fijo
from ..models import Persona
from ..exportar import FORMATOS, MAX_FILAS, Dinero, descargar
from .sesion import _preferencias_json
from .modulos import AYUDAS, ETIQUETAS, MODULOS, POR_MODELO
from . import filtros as filtros_avanzados
from .permisos import PermisosModelo, ve_sensibles

_TIPOS = [
    (models.BooleanField, "bool"),
    (models.DateTimeField, "fechahora"),
    (models.DateField, "fecha"),
    (models.EmailField, "email"),
    (models.TextField, "area"),
    (models.JSONField, "json"),
    (models.DecimalField, "decimal"),
    (models.IntegerField, "numero"),
]


def _opciones(pares):
    return [{"valor": valor, "etiqueta": etiqueta} for valor, etiqueta in pares]


def _tipo(f):
    if f.name == "tasa":
        return "cifra"  # un decimal que no es dinero
    return next((t for clase, t in _TIPOS if isinstance(f, clase)), "texto")


def filtros_fijos(modulo, user):
    """Campo -> objeto que el rol del usuario fija en este módulo (ver Modulo.por_ambito)."""
    ambito = ambito_fijo(user)
    return {n: ambito[n] for n in modulo.por_ambito if n in ambito}


def _describir(modulo, nombre):
    """Describe un campo o columna para el frontend."""
    if nombre in modulo.extras:
        extra = modulo.extras[nombre]
        info = {"nombre": nombre, "etiqueta": extra.etiqueta, "tipo": extra.tipo}
        if extra.opciones:
            info["opciones"] = _opciones(extra.opciones)
        return info
    f = modulo.campo(nombre)
    info = {
        "nombre": nombre,
        "etiqueta": (modulo.etiquetas.get(nombre) or ETIQUETAS.get(nombre)
                     or capfirst(f.verbose_name)),
        "requerido": not f.blank and not f.has_default(),
        "seccion": next((t for t, campos in modulo.secciones.items() if nombre in campos), ""),
    }
    if nombre in AYUDAS:
        info["ayuda"] = AYUDAS[nombre]
    if nombre in modulo.subcampos:
        info["subcampos"] = modulo.subcampos[nombre]
    if f.is_relation:
        info.update(tipo="fk", recurso=POR_MODELO[f.related_model].slug)
    elif f.choices:
        info.update(tipo="opcion", opciones=_opciones(f.choices))
    else:
        info["tipo"] = _tipo(f)
    return info


def _filtro(modulo, nombre):
    """Como _describir, pero un sí/no se filtra con una lista de dos opciones."""
    info = _describir(modulo, nombre)
    if info["tipo"] == "bool":
        info.update(tipo="opcion", opciones=_opciones([("true", "Sí"), ("false", "No")]))
    # Sin las opciones que el módulo nunca muestra (Modulo.excluir).
    if nombre in modulo.excluir and "opciones" in info:
        info["opciones"] = [o for o in info["opciones"]
                            if o["valor"] != modulo.excluir[nombre]]
    return info


def columnas_lista(modulo, user):
    """Las columnas de la tabla de un módulo que este usuario puede ver: las de
    siempre y, con "opcional", los demás campos del formulario que puede
    agregar (salvo los JSON)."""
    vista = _preferencias_json(user)["moneda_vista"]
    columnas = [_describir(modulo, n) for n in modulo.lista
                if n not in modulo.extras or modulo.extras[n].visible(user)]
    columnas += [{**_describir(modulo, n), "opcional": True} for n in modulo.campos
                 if n not in modulo.lista and n not in modulo.sensibles
                 and _tipo(modulo.campo(n)) != "json"]
    if vista != settings.MONEDA:
        for columna in columnas:
            if columna["nombre"] == "monto_base":
                columna["etiqueta"] = f"Equivalente en {vista}"
    return columnas


def elegir_columnas(columnas, eleccion):
    """Las que se ven según lo que eligió el usuario ({"ocultas", "agregadas"},
    ver Preferencias.columnas). Siempre queda al menos una."""
    eleccion = eleccion or {}
    ocultas, agregadas = eleccion.get("ocultas", []), eleccion.get("agregadas", [])
    elegidas = [c for c in columnas if (c["nombre"] in agregadas if c.get("opcional")
                                        else c["nombre"] not in ocultas)]
    return elegidas or [c for c in columnas if not c.get("opcional")][:1]


def _celda(columna, datos, vista, factor):
    """Valor de una columna para la descarga, como lo muestra la tabla
    (ver celda.tsx en el frontend)."""
    nombre, tipo = columna["nombre"], columna["tipo"]
    valor = datos.get(nombre)
    if tipo == "fk":
        return datos.get(f"{nombre}_etiqueta") or ""
    if valor is None or valor == "":
        return ""
    if tipo == "opcion":
        opciones = {o["valor"]: o["etiqueta"] for o in columna.get("opciones", [])}
        return opciones.get(valor, valor)
    if tipo == "bool":
        return bool(valor)
    if tipo == "fecha":
        return date.fromisoformat(str(valor)[:10])
    if tipo == "fechahora":
        return datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    if tipo == "decimal":
        # El monto de un pago o gasto va en la moneda en que se hizo; lo demás,
        # de la moneda base a la que el usuario eligió para ver.
        if nombre == "monto":
            return Dinero(float(valor), datos.get("moneda") or settings.MONEDA)
        return Dinero(float(valor) * factor, vista)
    if tipo in ("numero", "cifra"):
        return valor
    return str(valor)


# --------------------------------------------------------------------------- #
# Serializer y ViewSet de un módulo
# --------------------------------------------------------------------------- #
class ModuloSerializer(serializers.ModelSerializer):
    modulo = None

    def get_fields(self):
        campos = super().get_fields()
        if not ve_sensibles(self.context.get("request")):
            for nombre in self.modulo.sensibles:
                campos.pop(nombre, None)
        return campos

    @cached_property
    def _extras(self):
        user = self.context["request"].user
        return {n: e for n, e in self.modulo.extras.items() if e.visible(user)}

    def to_representation(self, obj):
        datos = super().to_representation(obj)
        datos["etiqueta"] = str(obj)
        # Texto legible de cada relación, para tablas y selectores.
        for nombre in self.modulo.fks:
            tiene = getattr(obj, f"{nombre}_id") is not None
            relacionado = getattr(obj, nombre) if tiene else None
            datos[f"{nombre}_etiqueta"] = str(relacionado) if tiene else ""
            # Una persona va con su avatar: la foto o, sin ella, el sexo.
            if isinstance(relacionado, Persona):
                datos[f"{nombre}_foto"] = relacionado.foto_url
                datos[f"{nombre}_sexo"] = relacionado.sexo
        if isinstance(obj, Persona):
            datos["foto"] = obj.foto_url
        for nombre, extra in self._extras.items():
            datos[nombre] = extra.calcular(obj)
        return datos

    def validate(self, attrs):
        """Corre Model.clean() (p. ej. el ámbito de AsignacionRol)."""
        obj = copy.copy(self.instance) if self.instance else self.Meta.model()
        for nombre, valor in attrs.items():
            setattr(obj, nombre, valor)
        try:
            obj.clean()
        except DjangoValidationError as e:
            # Con campo ({"fecha_fin": [...]}) el error sale junto a su control.
            raise serializers.ValidationError(
                e.message_dict if hasattr(e, "error_dict") else e.messages
            )
        return attrs


class ModuloViewSet(viewsets.ModelViewSet):
    modulo = None
    permission_classes = [PermisosModelo]
    filter_backends = [filters.SearchFilter]

    def get_queryset(self):
        qs = super().get_queryset()
        # Lo que fija el rol se aplica siempre, aunque la URL pida otra cosa.
        fijos = filtros_fijos(self.modulo, self.request.user)
        for nombre, obj in fijos.items():
            qs = qs.filter(**{nombre: obj.pk})
        for nombre in self.modulo.filtros:
            if nombre in fijos:
                continue
            valor = self.request.query_params.get(nombre)
            if valor:
                try:
                    qs = qs.filter(**{nombre: valor})
                except (ValueError, DjangoValidationError):
                    return qs.none()
        if self.modulo.avanzados:
            qs = filtros_avanzados.aplicar(qs, filtros_avanzados.visibles(
                self.modulo.avanzados, self.request.user, ve_sensibles(self.request)),
                self.request.query_params)
        if self.modulo.rango_fecha:
            for parametro, operador in (("desde", "gte"), ("hasta", "lte")):
                valor = self.request.query_params.get(parametro)
                if valor:
                    try:
                        dia = date.fromisoformat(valor)
                    except ValueError:
                        return qs.none()
                    qs = qs.filter(**{f"{self.modulo.rango_fecha}__date__{operador}": dia})
        return qs

    @action(detail=False, methods=["get"])
    def exportar(self, request):
        """Toda la tabla (con los filtros y la búsqueda de la pantalla, sin
        paginar) en Excel o PDF: ?formato=xlsx|pdf. ?detalle= es el texto de
        los filtros que se pone bajo el título."""
        formato = request.query_params.get("formato", "xlsx")
        if formato not in FORMATOS:
            return Response({"detail": "Formato no válido."}, status=400)
        qs = self.filter_queryset(self.get_queryset())
        if qs.count() > MAX_FILAS:
            return Response({"detail": (
                f"Son más de {MAX_FILAS} registros: filtra la tabla para descargarla."
            )}, status=400)
        fijos = filtros_fijos(self.modulo, request.user)
        columnas = [c for c in columnas_lista(self.modulo, request.user)
                    if c["tipo"] != "enlace" and c["nombre"] not in fijos]
        # Las que se ven en la tabla: ?columnas=a,b (las de la pantalla) o, si
        # no, las que el usuario dejó guardadas.
        pedidas = request.query_params.get("columnas")
        if pedidas:
            nombres = pedidas.split(",")
            columnas = [c for c in columnas if c["nombre"] in nombres] or columnas[:1]
        else:
            columnas = elegir_columnas(columnas, _preferencias_json(request.user)
                                       ["columnas"].get(self.modulo.slug))
        pref = _preferencias_json(request.user)
        datos = self.get_serializer(qs, many=True).data
        filas = [[_celda(c, d, pref["moneda_vista"], pref["factor"]) for c in columnas]
                 for d in datos]
        subtitulo = " · ".join(filter(None, [
            *(f"{capfirst(_describir(self.modulo, n)['etiqueta'])}: {obj}"
              for n, obj in fijos.items()),
            request.query_params.get("detalle", "")[:300],
        ]))
        return descargar(request, formato, self.modulo.titulo,
                         [c["etiqueta"] for c in columnas], filas, subtitulo)

    def _guardar(self, accion, *args, **kwargs):
        # Las restricciones de unicidad las valida la base de datos.
        try:
            with transaction.atomic():
                return accion(*args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "No se puede eliminar: hay otros registros que dependen de este."},
                status=status.HTTP_409_CONFLICT,
            )
        except IntegrityError:
            return Response(
                {"detail": "Ya existe un registro con esos datos."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except DjangoValidationError as e:
            # Reglas del modelo al borrar (p. ej. un rol del sistema).
            return Response({"detail": " ".join(e.messages)},
                            status=status.HTTP_409_CONFLICT)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if self.modulo.solo_lectura and request.method not in ("GET", "HEAD", "OPTIONS"):
            raise PermissionDenied("Este módulo es de solo lectura.")

    def create(self, request, *args, **kwargs):
        return self._guardar(super().create, request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        return self._guardar(super().update, request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return self._guardar(super().destroy, request, *args, **kwargs)


def _crear_viewset(modulo):
    de_lista = [n for n in modulo.lista if n not in modulo.extras]
    campos = list(dict.fromkeys(["id", *modulo.campos, *de_lista]))
    meta = type("Meta", (), {
        "model": modulo.modelo,
        "fields": campos,
        "read_only_fields": [n for n in de_lista if n not in modulo.campos],
        "validators": [],  # ver ModuloViewSet._guardar
    })
    serializer = type(
        f"{modulo.modelo.__name__}Serializer", (ModuloSerializer,),
        {"Meta": meta, "modulo": modulo},
    )
    queryset = (
        modulo.modelo.objects
        .exclude(**modulo.excluir)
        .select_related(*modulo.relacionados)
        .prefetch_related(*modulo.prefetch)
        .annotate(**modulo.anotaciones)
        .order_by(*modulo.orden, "pk")
    )
    return type(
        f"{modulo.modelo.__name__}ViewSet", (ModuloViewSet,),
        {"modulo": modulo, "queryset": queryset, "serializer_class": serializer,
         "search_fields": modulo.buscar},
    )


router = routers.SimpleRouter()
for _modulo in MODULOS:
    router.register(_modulo.slug, _crear_viewset(_modulo), basename=_modulo.slug)


# --------------------------------------------------------------------------- #
# Esquema: menú, tablas y formularios del frontend
# --------------------------------------------------------------------------- #
@api_view(["GET"])
def esquema(request):
    """Módulos que el usuario puede ver, con sus campos, columnas y permisos."""
    user = request.user
    sensibles = ve_sensibles(request)
    modulos = []
    for m in MODULOS:
        if not user.has_perm(m.permiso("view")):
            continue
        campos = [n for n in m.campos if sensibles or n not in m.sensibles]
        fijos = {n: {"valor": obj.pk, "etiqueta": str(obj)}
                 for n, obj in filtros_fijos(m, user).items()}

        def con_fijo(info):
            if info["nombre"] in fijos:
                info["fijo"] = fijos[info["nombre"]]
            return info

        modulos.append({
            "slug": m.slug,
            "titulo": m.titulo,
            "singular": m.singular,
            "grupo": m.grupo,
            "en_menu": m.en_menu,
            "campos": [con_fijo(_describir(m, n)) for n in campos],
            "lista": columnas_lista(m, user),
            "filtros": [con_fijo(_filtro(m, n)) for n in m.filtros],
            "avanzados": [f.describir() for f in
                          filtros_avanzados.visibles(m.avanzados, user, sensibles)],
            "buscable": bool(m.buscar),
            "puede_agregar": not m.solo_lectura and user.has_perm(m.permiso("add")),
            "puede_cambiar": not m.solo_lectura and user.has_perm(m.permiso("change")),
            "puede_eliminar": not m.solo_lectura and user.has_perm(m.permiso("delete")),
        })
    return Response(modulos)


# --------------------------------------------------------------------------- #
# Descarga de una tabla armada en el navegador (las del panel de un retiro)
# --------------------------------------------------------------------------- #
def _celda_recibida(valor):
    """Texto, número, null o {"monto": n, "moneda": "VES"}."""
    if isinstance(valor, dict):
        return Dinero(float(valor.get("monto") or 0), str(valor.get("moneda") or settings.MONEDA))
    if valor is None or isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return valor
    return str(valor)[:500]


@api_view(["POST"])
def exportar_tabla(request):
    """Devuelve como Excel o PDF la tabla que manda el navegador: {formato,
    titulo, subtitulo, columnas: [texto], filas: [[celda]]}. Son datos que el
    usuario ya está viendo; aquí solo se les da formato."""
    try:
        datos = json.loads(request.body or b"{}")
        formato = datos.get("formato")
        columnas = [str(c)[:100] for c in datos["columnas"]]
        filas = [[_celda_recibida(v) for v in fila][:len(columnas)] for fila in datos["filas"]]
    except (ValueError, KeyError, TypeError):
        return Response({"detail": "Tabla no válida."}, status=400)
    if formato not in FORMATOS or not columnas or len(columnas) > 40:
        return Response({"detail": "Tabla no válida."}, status=400)
    if len(filas) > MAX_FILAS:
        return Response({"detail": f"La tabla tiene más de {MAX_FILAS} filas."}, status=400)
    filas = [fila + [""] * (len(columnas) - len(fila)) for fila in filas]
    return descargar(request, formato, str(datos.get("titulo") or "Tabla")[:150],
                     columnas, filas, str(datos.get("subtitulo") or "")[:300])
