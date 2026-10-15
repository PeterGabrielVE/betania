"""
Reparte el nombre completo de las personas ya registradas en primer y segundo
nombre y apellido, con la misma regla que Persona.dividir_nombre:
"Ana Pérez" · "José Pérez Gómez" (un nombre y dos apellidos) ·
"María José Pérez Gómez"; con más palabras, lo del medio va al segundo nombre.
"""

from django.db import migrations


def dividir(completo):
    palabras = (completo or "").split()
    n = len(palabras)
    if n <= 2:
        return [palabras[0] if palabras else "", "", palabras[1] if n == 2 else "", ""]
    if n == 3:
        return [palabras[0], "", palabras[1], palabras[2]]
    return [palabras[0], " ".join(palabras[1:-2]), palabras[-2], palabras[-1]]


def separar(apps, schema_editor):
    Persona = apps.get_model("retiros", "Persona")
    campos = ["primer_nombre", "segundo_nombre", "primer_apellido", "segundo_apellido"]
    for persona in Persona.objects.filter(primer_nombre="").iterator():
        for campo, valor in zip(campos, dividir(persona.nombre)):
            setattr(persona, campo, valor)
        persona.save(update_fields=campos)


class Migration(migrations.Migration):

    dependencies = [
        ("retiros", "0008_nombres_y_ubicacion_libre"),
    ]

    operations = [
        # Al deshacer, el nombre completo sigue en Persona.nombre.
        migrations.RunPython(separar, migrations.RunPython.noop),
    ]
