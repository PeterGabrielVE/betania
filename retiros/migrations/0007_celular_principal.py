"""
El teléfono principal de una persona (Persona.telefono) pasa a ser su celular.
Hasta ahora el celular iba aparte, en datos_sensibles["celular"]: si lo hay, se
mueve a Persona.telefono, y el teléfono que había queda como teléfono de casa
(datos_sensibles["telefono_casa"]).
"""

from django.db import migrations


def celular_principal(apps, schema_editor):
    Persona = apps.get_model("retiros", "Persona")
    for persona in Persona.objects.exclude(datos_sensibles={}).iterator():
        datos = dict(persona.datos_sensibles or {})
        celular = str(datos.pop("celular", "") or "").strip()
        if not celular:
            continue
        if persona.telefono and persona.telefono != celular:
            datos.setdefault("telefono_casa", persona.telefono)
        persona.telefono = celular
        persona.datos_sensibles = datos
        persona.save(update_fields=["telefono", "datos_sensibles"])


def deshacer(apps, schema_editor):
    Persona = apps.get_model("retiros", "Persona")
    for persona in Persona.objects.exclude(datos_sensibles={}).iterator():
        datos = dict(persona.datos_sensibles or {})
        casa = datos.pop("telefono_casa", "")
        if not casa:
            continue
        datos["celular"] = persona.telefono
        persona.telefono = casa
        persona.datos_sensibles = datos
        persona.save(update_fields=["telefono", "datos_sensibles"])


class Migration(migrations.Migration):

    dependencies = [
        ("retiros", "0006_documento_y_geografia"),
    ]

    operations = [
        migrations.RunPython(celular_principal, deshacer),
    ]
