from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('retiros', '0022_contactos_del_servidor'),
    ]

    operations = [
        migrations.AddField(
            model_name='participacion',
            name='cama',
            field=models.CharField(blank=True, max_length=10, verbose_name='número de cama'),
        ),
    ]
