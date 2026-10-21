from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('retiros', '0021_cama_y_mesa_del_caminante'),
    ]

    operations = [
        migrations.AddField(
            model_name='participacion',
            name='contacto_emergencia',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
