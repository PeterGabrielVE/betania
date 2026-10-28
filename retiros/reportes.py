"""
Salidas del sistema: import/export a Excel (lo usa admin.py) y listas en PDF.

Confidencialidad: exportaciones y PDFs se consultan por el ORM bajo la sesión de
la petición, así que el RLS por fila (aislamiento por parroquia) se aplica solo.
Los datos sensibles se excluyen por columna: los Resource no listan los campos
de salud ni de contacto de emergencia.
"""

from django.contrib.auth.decorators import login_required, permission_required
from django.db.models import Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string
from django.utils.text import slugify
from import_export import fields, resources
from import_export.widgets import ForeignKeyWidget

from .models import Inscripcion, Parroquia, Participacion, Persona, Retiro


# --------------------------------------------------------------------------- #
# Import / Export a Excel (xlsx) y CSV
# --------------------------------------------------------------------------- #
class PersonaResource(resources.ModelResource):
    # La parroquia va por nombre, en la exportación y en la importación.
    parroquia = fields.Field(
        column_name="parroquia", attribute="parroquia",
        widget=ForeignKeyWidget(Parroquia, field="nombre"),
    )

    class Meta:
        model = Persona
        # No se exportan datos_sensibles.
        fields = ("tipo_documento", "documento", "nombre", "primer_nombre", "segundo_nombre",
                  "primer_apellido", "segundo_apellido", "telefono", "email",
                  "fecha_nacimiento", "parroquia")
        export_order = fields
        import_id_fields = ()

    def before_save_instance(self, instance, row, **kwargs):
        """Un archivo con solo "nombre" (sin nombres y apellidos por separado):
        se reparte en nombres y apellidos."""
        if row.get("nombre") and not row.get("primer_nombre"):
            instance.dividir_nombre(str(row["nombre"]))

    def get_instance(self, instance_loader, row):
        """Al importar, casa por documento, correo o teléfono para no duplicar personas."""
        documento = Persona.normalizar_documento(str(row.get("documento") or ""))
        if documento:
            encontrada = Persona.objects.filter(
                tipo_documento=str(row.get("tipo_documento") or "V").strip().upper(),
                documento=documento,
            ).first()
            if encontrada:
                return encontrada
        for campo in ("email", "telefono"):
            valor = str(row.get(campo) or "").strip()
            encontrada = valor and Persona.objects.filter(**{campo: valor}).first()
            if encontrada:
                return encontrada
        return None


class InscripcionResource(resources.ModelResource):
    total_pagado = fields.Field(column_name="total_pagado")

    class Meta:
        model = Inscripcion
        fields = ("id", "persona__nombre", "retiro__tipo__nombre", "retiro__edicion",
                  "estado", "padrino__nombre", "consentimiento_datos", "total_pagado")
        export_order = fields

    def dehydrate_total_pagado(self, obj):
        return obj.pagos.aggregate(t=Sum("monto_base"))["t"] or 0  # en la moneda base


# --------------------------------------------------------------------------- #
# Export a PDF (listas imprimibles) con WeasyPrint
# --------------------------------------------------------------------------- #
@login_required
@permission_required("retiros.view_inscripcion", raise_exception=True)
def lista_retiro_pdf(request, retiro_id):
    """PDF con los caminantes confirmados de un retiro."""
    from weasyprint import HTML  # pesado de importar: solo al generar un PDF

    from .api.paneles import lideres_ocultos

    # El RLS ya limita a la parroquia activa: un retiro ajeno da 404.
    retiro = get_object_or_404(Retiro.objects.select_related("tipo", "parroquia"), pk=retiro_id)
    inscritos = [
        {"nombre": i.persona.nombre, "padrino": i.padrino.nombre if i.padrino_id else "",
         "estado": i.get_estado_display()}
        for i in retiro.inscripciones.select_related("persona", "padrino")
        .filter(estado=Inscripcion.Estado.CONFIRMADA)
    ]
    # Los líderes ocultos confirmados van en la lista como un caminante más.
    inscritos += [
        {"nombre": p.persona.nombre, "padrino": "", "estado": "Líder oculto"}
        for p in lideres_ocultos(retiro).filter(estado=Participacion.Estado.CONFIRMADO)
    ]
    inscritos.sort(key=lambda f: f["nombre"].lower())
    html = render_to_string(
        "retiros/lista_pdf.html", {"retiro": retiro, "inscritos": inscritos}
    )
    pdf = HTML(string=html, base_url=request.build_absolute_uri()).write_pdf()
    resp = HttpResponse(pdf, content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="lista-{slugify(str(retiro))}.pdf"'
    return resp
