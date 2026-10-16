"""
Carga las áreas de servicio de Emaús (ver retiros/areas.py) como áreas
generales, sin parroquia. Se puede correr las veces que sea: crea las que
faltan y completa la descripción de las que la tienen vacía; no toca las
áreas propias de cada parroquia ni una descripción ya escrita.

    python manage.py sembrar_areas
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from retiros.auditoria import sin_auditar
from retiros.areas import AREAS_SERVICIO
from retiros.models import AreaServicio


class Command(BaseCommand):
    help = "Carga las áreas de servicio de Emaús (sin duplicar)."

    def handle(self, *args, **options):
        # Carga masiva: no llena la auditoría.
        with sin_auditar():
            self._sembrar(*args, **options)

    @transaction.atomic
    def _sembrar(self, *args, **options):
        nuevas = completadas = 0
        for nombre, descripcion in AREAS_SERVICIO:
            area, creada = AreaServicio.objects.get_or_create(
                parroquia=None, nombre=nombre, defaults={"descripcion": descripcion}
            )
            if creada:
                nuevas += 1
            elif not area.descripcion:
                area.descripcion = descripcion
                area.save(update_fields=["descripcion"])
                completadas += 1
        self.stdout.write(self.style.SUCCESS(
            f"Áreas de servicio al día. Nuevas: {nuevas}; descripciones completadas: "
            f"{completadas}."
        ))
