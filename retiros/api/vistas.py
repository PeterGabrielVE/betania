"""
Serializer y ViewSet genéricos: uno por módulo de MODULOS (listar, crear, editar
y borrar), más el esquema con el que el frontend dibuja menú, tablas y formularios.
"""

import copy

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import ProtectedError
from django.utils.functional import cached_property
from django.utils.text import capfirst
from rest_framework import filters, routers, serializers, status, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..acceso import ambito_fijo
from .modulos import AYUDAS, ETIQUETAS, MODULOS, POR_MODELO
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
    return info


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
            datos[f"{nombre}_etiqueta"] = str(getattr(obj, nombre)) if tiene else ""
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
        return qs

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
        .select_related(*modulo.relacionados)
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
        lista = [n for n in m.lista if n not in m.extras or m.extras[n].visible(user)]
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
            "emoji": m.emoji,
            "campos": [con_fijo(_describir(m, n)) for n in campos],
            "lista": [_describir(m, n) for n in lista],
            "filtros": [con_fijo(_filtro(m, n)) for n in m.filtros],
            "buscable": bool(m.buscar),
            "puede_agregar": user.has_perm(m.permiso("add")),
            "puede_cambiar": user.has_perm(m.permiso("change")),
            "puede_eliminar": user.has_perm(m.permiso("delete")),
        })
    return Response(modulos)
