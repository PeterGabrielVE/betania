from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('retiros', '0003_monedas_y_tasa'),
    ]

    operations = [
        migrations.AddField(
            model_name='usuario',
            name='cuenta',
            field=models.OneToOneField(blank=True, help_text='Usuario y contraseña con que entra.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='usuario_retiros', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='retiro',
            name='cuota_servidor',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AlterField(
            model_name='asignacionrol',
            name='rol',
            field=models.CharField(choices=[('super_admin', 'Super administrador'), ('admin_diocesano', 'Administrador diocesano'), ('coord_parroquia', 'Coordinador de parroquia'), ('coord_retiro', 'Coordinador de retiro'), ('logistica', 'Coordinador de logística'), ('tesoreria', 'Tesorería'), ('secretaria', 'Secretaría / inscripciones'), ('servidor', 'Servidor / equipo')], max_length=20),
        ),
    ]
