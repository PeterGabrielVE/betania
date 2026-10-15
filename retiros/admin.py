"""
Panel de administración: el back-office de gestión. Persona e Inscripción
heredan de ImportExportModelAdmin para tener botones de Importar/Exportar Excel
(con los Resource de reportes.py).
"""

from decimal import Decimal

from django.contrib import admin
from django.db.models import DecimalField, F, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from import_export.admin import ImportExportModelAdmin

from .models import (
    Diocesis, Parroquia, TipoRetiro, AreaServicio, Persona, Usuario, AsignacionRol,
    Pais, Estado, Ciudad,
    Retiro, Charla, Inscripcion, Participacion, AsignacionServicio, Pago, Gasto, EstadoPago,
    Tarea,
)
from .reportes import PersonaResource, InscripcionResource


admin.site.site_header = admin.site.site_title = "Betania"
admin.site.index_title = "Administración"


# --------------------------------------------------------------------------- #
# Filtros a medida
# --------------------------------------------------------------------------- #
class EstadoPagoFilter(admin.SimpleListFilter):
    """Filtra inscripciones por cuánto cubrieron de la cuota del retiro."""
    title = "estado de pago"
    parameter_name = "estado_pago"

    def lookups(self, request, model_admin):
        return EstadoPago.choices

    def queryset(self, request, queryset):
        qs = queryset.annotate(total_pagado=Sum("pagos__monto_base"))
        if self.value() == EstadoPago.PENDIENTE:
            return qs.filter(total_pagado__isnull=True)
        if self.value() == EstadoPago.PARCIAL:
            return qs.filter(total_pagado__gt=0, total_pagado__lt=F("retiro__cuota"))
        if self.value() == EstadoPago.PAGADO:
            return qs.filter(total_pagado__gte=F("retiro__cuota"))
        return queryset


class AnioCaminanteFilter(admin.SimpleListFilter):
    """Filtra personas por el año en que fueron caminante."""
    title = "año como caminante"
    parameter_name = "anio_caminante"

    def lookups(self, request, model_admin):
        anios = (
            Participacion.objects
            .filter(tipo=Participacion.Tipo.CAMINANTE)
            .dates("retiro__fecha_inicio", "year", order="DESC")
        )
        return [(d.year, str(d.year)) for d in anios]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(
                participaciones__tipo=Participacion.Tipo.CAMINANTE,
                participaciones__retiro__fecha_inicio__year=self.value(),
            ).distinct()
        return queryset


def _total_del_retiro(modelo):
    """Suma, en la moneda base, de los pagos o gastos de cada retiro."""
    totales = (
        modelo.objects.filter(retiro=OuterRef("pk"))
        .values("retiro").annotate(t=Sum("monto_base")).values("t")
    )
    return Coalesce(Subquery(totales), Value(Decimal(0)), output_field=DecimalField())


@admin.register(Persona)
class PersonaAdmin(ImportExportModelAdmin):
    resource_class = PersonaResource
    list_display = ("nombre", "documento_completo", "telefono", "ciudad", "parroquia", "creado")
    list_filter = ("parroquia", AnioCaminanteFilter)
    search_fields = ("nombre", "documento", "telefono", "email")
    autocomplete_fields = ("pais", "estado", "ciudad")
    # Se arma con nombres y apellidos al guardar.
    readonly_fields = ("nombre",)

    @admin.display(description="Documento", ordering="documento")
    def documento_completo(self, obj):
        return obj.documento_completo


class AsignacionRolInline(admin.TabularInline):
    model = AsignacionRol
    extra = 1
    autocomplete_fields = ("diocesis", "parroquia", "retiro")


@admin.register(Usuario)
class UsuarioAdmin(admin.ModelAdmin):
    list_display = ("persona", "activo", "roles_resumen")
    search_fields = ("persona__nombre",)
    autocomplete_fields = ("persona", "cuenta")
    inlines = [AsignacionRolInline]

    @admin.display(description="Roles")
    def roles_resumen(self, obj):
        return ", ".join(a.get_rol_display() for a in obj.roles.all()) or "—"


@admin.register(AsignacionRol)
class AsignacionRolAdmin(admin.ModelAdmin):
    list_display = ("usuario", "rol", "parroquia", "retiro", "diocesis")
    list_filter = ("rol", "parroquia")
    search_fields = ("usuario__persona__nombre",)
    autocomplete_fields = ("usuario", "diocesis", "parroquia", "retiro")


class AsignacionServicioInline(admin.TabularInline):
    model = AsignacionServicio
    extra = 1
    autocomplete_fields = ("area",)


@admin.register(Participacion)
class ParticipacionAdmin(admin.ModelAdmin):
    list_display = ("persona", "tipo", "retiro")
    list_filter = ("tipo", "retiro", "servicios__area")
    search_fields = ("persona__nombre",)
    autocomplete_fields = ("persona", "retiro")
    inlines = [AsignacionServicioInline]


class PagoInline(admin.TabularInline):
    model = Pago
    extra = 0
    fields = ("concepto", "monto", "moneda", "tasa", "metodo", "fecha", "persona",
              "referencia")
    autocomplete_fields = ("persona", "inscripcion")


class GastoInline(admin.TabularInline):
    model = Gasto
    extra = 0
    fields = ("categoria", "descripcion", "monto", "moneda", "tasa", "fecha", "comprobante")


class CharlaInline(admin.TabularInline):
    model = Charla
    extra = 0
    autocomplete_fields = ("expositor",)


@admin.register(Retiro)
class RetiroAdmin(admin.ModelAdmin):
    list_display = ("__str__", "parroquia", "fecha_inicio", "fecha_fin", "cupo", "cuota",
                    "estado", "balance")
    list_filter = ("parroquia", "tipo", "estado")
    search_fields = ("tipo__nombre", "sede")
    inlines = [CharlaInline, PagoInline, GastoInline]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("tipo", "parroquia").annotate(
            balance=_total_del_retiro(Pago) - _total_del_retiro(Gasto)
        )

    @admin.display(description="Balance", ordering="balance")
    def balance(self, obj):
        return obj.balance


@admin.register(Inscripcion)
class InscripcionAdmin(ImportExportModelAdmin):
    resource_class = InscripcionResource
    list_display = ("persona", "retiro", "estado", "padrino", "consentimiento_datos", "creado")
    list_filter = ("estado", "retiro", EstadoPagoFilter)
    search_fields = ("persona__nombre", "padrino__nombre")
    autocomplete_fields = ("persona", "padrino", "retiro")


@admin.register(Pago)
class PagoAdmin(admin.ModelAdmin):
    list_display = ("concepto", "monto", "moneda", "monto_base", "metodo", "retiro",
                    "persona", "fecha")
    list_filter = ("concepto", "moneda", "metodo", "retiro")
    autocomplete_fields = ("retiro", "persona", "inscripcion")


@admin.register(Gasto)
class GastoAdmin(admin.ModelAdmin):
    list_display = ("categoria", "descripcion", "monto", "moneda", "monto_base", "retiro",
                    "fecha")
    list_filter = ("categoria", "moneda", "retiro")
    autocomplete_fields = ("retiro",)


@admin.register(AreaServicio)
class AreaServicioAdmin(admin.ModelAdmin):
    list_display = ("nombre", "parroquia")
    list_filter = ("parroquia",)
    search_fields = ("nombre",)


@admin.register(Parroquia)
class ParroquiaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "diocesis")
    list_filter = ("diocesis",)
    search_fields = ("nombre",)


@admin.register(Diocesis)
class DiocesisAdmin(admin.ModelAdmin):
    search_fields = ("nombre",)


@admin.register(Tarea)
class TareaAdmin(admin.ModelAdmin):
    list_display = ("titulo", "retiro", "area", "responsable", "fecha_limite", "hecha")
    list_filter = ("hecha", "retiro", "area")
    search_fields = ("titulo", "responsable__nombre")
    autocomplete_fields = ("retiro", "area", "responsable")


@admin.register(Pais)
class PaisAdmin(admin.ModelAdmin):
    list_display = ("nombre", "codigo")
    search_fields = ("nombre", "codigo")


@admin.register(Estado)
class EstadoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "pais")
    list_filter = ("pais",)
    search_fields = ("nombre",)


@admin.register(Ciudad)
class CiudadAdmin(admin.ModelAdmin):
    list_display = ("nombre", "estado")
    list_filter = ("estado",)
    search_fields = ("nombre",)


admin.site.register(TipoRetiro)
