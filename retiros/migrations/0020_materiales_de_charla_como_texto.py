"""Los materiales de una charla pasan de JSON a texto libre: el formulario
pedía JSON y nadie escribe así "Biblia, libreta y lápiz".

Lo que ya hubiera guardado se convierte a texto: una línea por dato."""

from django.db import migrations, models


def _a_texto(valor):
    if not valor:
        return ""
    if isinstance(valor, dict):
        return "\n".join(f"{clave}: {dato}" for clave, dato in valor.items())
    if isinstance(valor, list):
        return "\n".join(str(dato) for dato in valor)
    return str(valor)


def pasar_a_texto(apps, schema_editor):
    Charla = apps.get_model("retiros", "Charla")
    for charla in Charla.objects.exclude(materiales={}):
        charla.materiales_texto = _a_texto(charla.materiales)
        charla.save(update_fields=["materiales_texto"])


class Migration(migrations.Migration):

    dependencies = [
        ('retiros', '0019_tablero_personalizado'),
    ]

    operations = [
        migrations.AddField(
            model_name='charla',
            name='materiales_texto',
            field=models.TextField(blank=True),
        ),
        migrations.RunPython(pasar_a_texto, migrations.RunPython.noop),
        migrations.RemoveField(model_name='charla', name='materiales'),
        migrations.RenameField(
            model_name='charla', old_name='materiales_texto', new_name='materiales',
        ),
    ]
