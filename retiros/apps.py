from django.apps import AppConfig


class RetirosConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "retiros"

    def ready(self):
        from . import auditoria

        auditoria.conectar()
