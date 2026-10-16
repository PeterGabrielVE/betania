"""
Carga países y, de Venezuela, sus estados y ciudades (ver retiros/geografia.py).
Se puede correr las veces que sea: solo agrega lo que falta.

    python manage.py sembrar_geografia
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from retiros.auditoria import sin_auditar
from retiros.geografia import ESTADOS_VENEZUELA, PAISES, VENEZUELA
from retiros.models import Ciudad, Estado, Pais


class Command(BaseCommand):
    help = "Carga países, y estados y ciudades de Venezuela (sin duplicar)."

    def handle(self, *args, **options):
        # Carga masiva: no llena la auditoría.
        with sin_auditar():
            self._sembrar(*args, **options)

    @transaction.atomic
    def _sembrar(self, *args, **options):
        nuevos = {"países": 0, "estados": 0, "ciudades": 0}
        paises = {}
        for codigo, nombre in PAISES:
            paises[codigo], creado = Pais.objects.get_or_create(
                codigo=codigo, defaults={"nombre": nombre}
            )
            nuevos["países"] += creado

        venezuela = paises[VENEZUELA]
        for nombre_estado, ciudades in ESTADOS_VENEZUELA.items():
            estado, creado = Estado.objects.get_or_create(pais=venezuela, nombre=nombre_estado)
            nuevos["estados"] += creado
            for nombre_ciudad in ciudades:
                _, creado = Ciudad.objects.get_or_create(estado=estado, nombre=nombre_ciudad)
                nuevos["ciudades"] += creado

        self.stdout.write(self.style.SUCCESS(
            "Geografía al día. Nuevos: "
            + ", ".join(f"{n} {que}" for que, n in nuevos.items())
        ))
