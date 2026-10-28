from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('retiros', '0024_columnas_por_usuario'),
    ]

    operations = [
        migrations.AddField(
            model_name='participacion',
            name='lider_oculto',
            field=models.BooleanField(default=False, verbose_name='líder oculto'),
        ),
        migrations.AddField(
            model_name='participacion',
            name='mesa',
            field=models.CharField(blank=True, max_length=10, verbose_name='número de mesa'),
        ),
    ]
