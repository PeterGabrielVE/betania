from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('retiros', '0023_cama_del_servidor'),
    ]

    operations = [
        migrations.AddField(
            model_name='preferencias',
            name='columnas',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
