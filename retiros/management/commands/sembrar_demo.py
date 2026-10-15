"""
Datos de prueba para ver el sistema lleno: una parroquia de ejemplo con tres
retiros (uno con inscripciones abiertas, uno pasado y otro en planeación),
caminantes con sus datos completos, servidores con áreas, turnos y camisas,
pagos en dólares y bolívares, gastos, charlas, tareas y usuarios con rol.

    python manage.py sembrar_demo            # la crea si no existe
    python manage.py sembrar_demo --borrar   # borra la de antes y la crea de nuevo

Todo queda dentro de la parroquia "San José (demo)": --borrar solo toca eso
(y las cuentas de usuario de la demo), nunca datos reales. Siempre genera lo
mismo, así las capturas y las pruebas se pueden repetir.
"""

import random
import unicodedata
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from retiros.models import (
    AreaServicio, AsignacionRol, AsignacionServicio, Charla, Ciudad, Diocesis, Gasto,
    Inscripcion, Moneda, Pago, Pais, Parroquia, Participacion, Persona, Retiro, Rol, Tarea,
    TipoRetiro, Usuario,
)

DIOCESIS = "Arquidiócesis de Caracas (demo)"
PARROQUIA = "San José (demo)"
CLAVE = "demo-betania-123"
# Cuentas de la demo: usuario, nombre, rol y ámbito ("retiro" o "parroquia").
CUENTAS = [
    ("demo.coordinador", "Alberto José Marín Paredes", Rol.COORD_RETIRO, "retiro"),
    ("demo.logistica", "Beatriz Elena Sosa Rangel", Rol.LOGISTICA, "retiro"),
    ("demo.tesoreria", "Gustavo Adolfo Pinto Lugo", Rol.TESORERIA, "parroquia"),
]
# Bolívares por dólar para los pagos en bolívares (así no consulta el BCV).
TASA_VES = Decimal("145.30")

CAMINANTES = [
    "José Gregorio Pérez Lozada", "Luis Alberto Rodríguez Mena", "Carlos Eduardo Gómez Ávila",
    "Andrés Felipe Díaz Rojas", "Miguel Ángel Torres Bello", "Pedro Pablo Ramírez Ochoa",
    "Juan Carlos Flores Pineda", "Rafael Antonio Rojas Guerra", "Daniel Morales Quintero",
    "Jesús Manuel Herrera Vivas", "Alejandro Castro Méndez", "Ricardo Vargas Salazar",
    "Fernando Ortiz Colmenares", "Manuel Silva Briceño", "Diego Mendoza Arias",
    "Javier Ruiz Contreras", "Óscar Medina Peña", "Eduardo Aguilar Rivero",
    "Roberto Navarro Guzmán", "Gabriel Suárez Linares", "Antonio León Duarte",
    "Héctor Blanco Zambrano", "Wilmer José Parra Montilla", "Yonathan Castillo Rondón",
]
# Cuántos caminantes quedan en cada estado (en el orden de la lista).
ESTADOS_CAMINANTE = (["confirmada"] * 12 + ["aceptada"] * 5 + ["solicitada"] * 3
                     + ["lista_espera"] * 2 + ["cancelada"] * 2)
MOTIVOS = ["Viaje de trabajo", "Enfermedad de un familiar", "Turno en el trabajo", ""]

# Servidores del retiro: nombre, área, tipo y estado de asistencia. Los primeros
# cinco hicieron el retiro anterior como caminantes.
SERVIDORES = [
    ("Ana Lucía Mora Gil", "Coordinación / Dirección", "coordinador", "confirmado"),
    ("Carmen Rivas Toro", "Registro / Inscripciones", "servidor", "confirmado"),
    ("Rosa María Méndez Lara", "Comedor / Mesas", "servidor", "confirmado"),
    ("Elena Campos Urbina", "Comedor / Mesas", "servidor", "por_confirmar"),
    ("Laura Peña Acosta", "Orden y Limpieza", "servidor", "confirmado"),
    ("Marta Salas Villegas", "Orden y Limpieza", "servidor", "por_confirmar"),
    ("Sofía Ríos Mejías", "Palancas / Correspondencia", "servidor", "confirmado"),
    ("Teresa Gil Romero", "Intercesión / Capilla", "servidor", "confirmado"),
    ("Patricia Luna Esparza", "Intercesión / Capilla", "servidor", "por_confirmar"),
    ("Isabel Cruz Márquez", "Música / Coro", "servidor", "confirmado"),
    ("Raúl Ibarra Fuentes", "Música / Coro", "servidor", "confirmado"),
    ("Tomás Vera Cordero", "Logística / Infraestructura", "servidor", "confirmado"),
    ("Iván Paz Hidalgo", "Logística / Infraestructura", "servidor", "por_confirmar"),
    ("Hugo Lara Becerra", "Logística / Infraestructura", "servidor", "cancelado"),
    ("Mónica Andrea Rangel Soto", None, "servidor", "por_confirmar"),
]
OPERADORAS = ["0412", "0414", "0416", "0422", "0424", "0426"]


def sin_tildes(texto):
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()


class Command(BaseCommand):
    help = "Carga datos de prueba (parroquia San José (demo)); --borrar la rehace."

    def add_arguments(self, parser):
        parser.add_argument("--borrar", action="store_true",
                            help="Borra la demo anterior antes de crearla de nuevo.")

    @transaction.atomic
    def handle(self, *args, borrar=False, **options):
        # Las políticas de RLS dejan pasar todo a super_admin.
        with connection.cursor() as c:
            c.execute("SELECT set_config('app.rol', 'super_admin', true)")
        existe = Parroquia.objects.filter(nombre=PARROQUIA).exists()
        if existe and not borrar:
            self.stdout.write(self.style.WARNING(
                f"La demo ya existe ({PARROQUIA}). Usa --borrar para rehacerla."))
            return
        if existe:
            self.borrar()
        call_command("sembrar_geografia", verbosity=0)
        call_command("sembrar_areas", verbosity=0)
        self.random = random.Random(12)
        self.hoy = timezone.localdate()
        self.n = 0
        self.crear()

    # ------------------------------------------------------------------ #
    def borrar(self):
        parroquias = Parroquia.objects.filter(nombre=PARROQUIA)
        Pago.objects.filter(retiro__parroquia__in=parroquias).delete()
        Gasto.objects.filter(retiro__parroquia__in=parroquias).delete()
        Retiro.objects.filter(parroquia__in=parroquias).delete()
        get_user_model().objects.filter(username__in=[c[0] for c in CUENTAS]).delete()
        Persona.objects.filter(parroquia__in=parroquias).delete()
        parroquias.delete()
        Diocesis.objects.filter(nombre=DIOCESIS).delete()
        self.stdout.write("Demo anterior borrada.")

    # ------------------------------------------------------------------ #
    def persona(self, nombre, nacimiento, *, extranjera=False, familia=True):
        """Una persona con documento, celular y procedencia (Caracas y alrededores)."""
        self.n += 1
        r = self.random
        datos = {
            "direccion": r.choice(["Urb. La Florida, calle 3", "Sector El Paraíso, vereda 12",
                                   "Av. Principal de Los Ruices, edif. Sol", "Urb. Los Naranjos"]),
            "telefono_casa": f"0212-{r.randint(2000000, 9999999)}",
            "ocupacion": r.choice(["Comerciante", "Docente", "Ingeniero", "Contador",
                                   "Chofer", "Médico", "Estudiante", "Jubilado"]),
        }
        if familia:
            civil = r.choice(["Casado", "Casado", "Soltero", "Divorciado", "Unión libre"])
            datos.update({
                "estado_civil": civil, "hijos": r.randint(0, 4),
                "bautismo": True, "confirmacion": r.random() < 0.7,
                "matrimonio": civil == "Casado", "uncion": False,
                "parroquia_asiste": PARROQUIA.replace(" (demo)", ""),
            })
            if civil in ("Casado", "Unión libre"):
                datos["pareja_nombre"] = r.choice(["María", "Carolina", "Yelitza", "Andreína"])
                datos["pareja_celular"] = self.celular()
        p = Persona(parroquia=self.parroquia, nombre=nombre, fecha_nacimiento=nacimiento,
                    telefono=self.celular(), datos_sensibles=datos,
                    email=f"{sin_tildes(nombre.split()[0]).lower()}.{self.n}@example.com")
        if extranjera:
            p.tipo_documento = Persona.TipoDocumento.PASAPORTE
            p.documento = f"AV{4410000 + self.n}"
            p.telefono = f"+57 310 555 {1000 + self.n}"
            p.pais = Pais.objects.get(codigo="CO")
            p.estado_texto, p.ciudad_texto = "Norte de Santander", "Cúcuta"
        else:
            ciudad = r.choice(self.ciudades)
            p.documento = str(r.randint(6_000_000, 30_000_000))
            p.pais, p.estado, p.ciudad = ciudad.estado.pais, ciudad.estado, ciudad
        p.save()
        return p

    def celular(self):
        return f"{self.random.choice(OPERADORAS)}-{self.random.randint(1000000, 9999999)}"

    def pago(self, retiro, monto, concepto, dias, **otros):
        """En dólares; uno de cada cuatro, en bolívares con la tasa de la demo."""
        if settings.MONEDA == Moneda.USD and self.random.random() < 0.25:
            otros.update(moneda=Moneda.VES, tasa=TASA_VES, monto=Decimal(monto) * TASA_VES,
                         metodo=Pago.Metodo.TRANSFERENCIA,
                         referencia=str(self.random.randint(100000, 999999)))
        else:
            otros.update(moneda=settings.MONEDA, monto=monto,
                         metodo=self.random.choice([Pago.Metodo.EFECTIVO,
                                                    Pago.Metodo.TRANSFERENCIA]))
        return Pago.objects.create(retiro=retiro, concepto=concepto,
                                   fecha=self.hoy - timedelta(days=dias), **otros)

    def nacimiento(self, anio):
        return date(anio, self.random.randint(1, 12), self.random.randint(1, 28))

    # ------------------------------------------------------------------ #
    def crear(self):
        r, hoy = self.random, self.hoy
        self.ciudades = list(Ciudad.objects.filter(
            estado__nombre__in=["Miranda", "Distrito Capital", "Aragua", "La Guaira"]))
        diocesis, _ = Diocesis.objects.get_or_create(nombre=DIOCESIS)
        self.parroquia = Parroquia.objects.create(nombre=PARROQUIA, diocesis=diocesis)
        hombres = TipoRetiro.objects.create(parroquia=self.parroquia, nombre="Emaús hombres")
        mujeres = TipoRetiro.objects.create(parroquia=self.parroquia, nombre="Emaús mujeres")
        areas = {a.nombre: a for a in AreaServicio.objects.filter(parroquia=None)}

        actual = Retiro.objects.create(
            parroquia=self.parroquia, tipo=hombres, edicion=12,
            fecha_inicio=hoy + timedelta(days=23), fecha_fin=hoy + timedelta(days=25),
            sede="Casa de retiros La Victoria", cupo=30, cuota=60, cuota_servidor=25,
            estado=Retiro.Estado.INSCRIPCIONES)
        anterior = Retiro.objects.create(
            parroquia=self.parroquia, tipo=hombres, edicion=11,
            fecha_inicio=hoy - timedelta(days=180), fecha_fin=hoy - timedelta(days=178),
            sede="Casa de retiros La Victoria", cupo=30, cuota=50,
            estado=Retiro.Estado.FINALIZADO)
        proximo = Retiro.objects.create(
            parroquia=self.parroquia, tipo=mujeres, edicion=5,
            fecha_inicio=hoy + timedelta(days=60), fecha_fin=hoy + timedelta(days=62),
            sede="Casa San Benito, Los Teques", cupo=25, cuota=60, cuota_servidor=25)

        # Caminantes del retiro actual.
        inscritos = []
        for n, (nombre, estado) in enumerate(zip(CAMINANTES, ESTADOS_CAMINANTE)):
            nacimiento = self.nacimiento(1962 + n)
            if n == 2:  # cumple durante el retiro
                nacimiento = (hoy + timedelta(days=24)).replace(year=1985)
            if n == 5:  # cumple esta semana
                nacimiento = (hoy + timedelta(days=4)).replace(year=1990)
            persona = self.persona(nombre, nacimiento, extranjera=n == 20)
            salud = {"talla_camiseta": r.choice(["S", "M", "L", "L", "XL"])}
            if n % 5 == 0:
                salud.update(condicion_medica="Diabetes tipo 2", tratamiento="Metformina 850 mg")
            if n % 6 == 1:
                salud.update(condicion_medica="Hipertensión", tratamiento="Losartán 50 mg")
            if n % 7 == 0:
                salud["regimen_alimenticio"] = "Sin gluten"
            if n % 9 == 4:
                salud["requerimientos"] = "Habitación en planta baja (rodilla operada)"
            contacto = {} if n % 8 == 3 else {
                "nombre": r.choice(["Carmen", "Yolanda", "Luisa", "Mariela"]) + " "
                + nombre.split()[-2],
                "relacion": r.choice(["Esposa", "Madre", "Hermana", "Hija"]),
                "celular": self.celular(),
            }
            ins = Inscripcion.objects.create(
                retiro=actual, persona=persona, estado=estado, salud_alimentacion=salud,
                contacto_emergencia=contacto, consentimiento_datos=n % 6 != 0,
                motivo_cancelacion=MOTIVOS[n % len(MOTIVOS)] if estado == "cancelada" else "",
                padrino=inscritos[n - 3].persona if n > 6 and n % 4 == 0 else None,
            )
            inscritos.append(ins)
            pagado = r.choice([60, 60, 60, 30, 20, 0])
            if pagado and estado in ("confirmada", "aceptada"):
                self.pago(actual, pagado, Pago.Concepto.CUOTA, r.randint(0, 40), inscripcion=ins)

        # Servidores: los primeros cinco fueron caminantes del retiro anterior.
        equipo = []
        for n, (nombre, area, tipo, estado) in enumerate(SERVIDORES):
            persona = self.persona(nombre, (hoy + timedelta(days=12)).replace(year=1980)
                                   if n == 4 else self.nacimiento(1968 + n))
            if n < 5:
                Inscripcion.objects.create(retiro=anterior, persona=persona,
                                           estado="confirmada", consentimiento_datos=True)
                self.pago(anterior, 50, Pago.Concepto.CUOTA, 200,
                          inscripcion=persona.inscripciones.get())
            turnos = {t: True for t in r.sample(
                ["viernes_manana", "viernes_tarde", "viernes_noche", "sabado_manana",
                 "sabado_tarde", "sabado_noche", "domingo_manana", "domingo_tarde"],
                8 if n % 4 == 0 else r.randint(3, 6))}
            camisas = {c: True for c in r.sample(["azul", "blanca", "polo"], r.randint(0, 2))}
            part = Participacion.objects.create(
                retiro=actual, persona=persona, tipo=tipo, estado=estado,
                motivo_cancelacion="Enfermedad" if estado == "cancelado" else "",
                duerme_en_casa=None if n == 14 else n % 3 != 2,
                disponibilidad=turnos, camisas=camisas,
                tallas_camisa={r.choice(["S", "M", "L", "XL", "XXL"]): True} if camisas else {},
            )
            if area:
                AsignacionServicio.objects.create(participacion=part, area=areas[area],
                                                  es_coordinador=n in (0, 1, 7, 11))
            if n % 3 and estado != "cancelado":
                self.pago(actual, r.choice([25, 25, 10]), Pago.Concepto.APORTACION,
                          r.randint(0, 20), persona=persona)
            equipo.append(persona)

        # Caminantes del retiro de mujeres (todavía en planeación).
        for n, nombre in enumerate(["Yusmary Carolina Ortega Páez", "Daniela Fernández Rivas",
                                    "Gabriela Inés Morillo Cedeño", "Andreína Torres Lugo",
                                    "María Fernanda Quintero Sanz"]):
            persona = self.persona(nombre, self.nacimiento(1975 + n * 4))
            Inscripcion.objects.create(retiro=proximo, persona=persona,
                                       estado="solicitada" if n % 2 else "aceptada",
                                       consentimiento_datos=True,
                                       salud_alimentacion={"talla_camiseta": "M"})

        # Dinero, charlas y tareas del retiro actual.
        self.pago(actual, 150, Pago.Concepto.DONATIVO, 15)
        self.pago(actual, 85, Pago.Concepto.RECAUDACION, 9, referencia="Venta de tortas")
        for categoria, descripcion, monto, dias in [
            ("comida", "Mercado del fin de semana", 320, 6),
            ("hospedaje", "Anticipo de la casa de retiros", 400, 30),
            ("materiales", "Libretas, rosarios y cruces", 85, 12),
            ("transporte", "Alquiler del autobús", 120, 3),
        ]:
            Gasto.objects.create(retiro=actual, categoria=categoria, descripcion=descripcion,
                                 monto=monto, moneda=settings.MONEDA,
                                 fecha=hoy - timedelta(days=dias))
        for orden, (tema, expositor) in enumerate([
            ("El camino de Emaús", equipo[0]), ("El perdón", equipo[6]),
            ("La familia", None), ("La Eucaristía", equipo[7]), ("El servicio", None),
        ], start=1):
            Charla.objects.create(retiro=actual, tema=tema, orden=orden, expositor=expositor)
        for titulo, dias, hecha, area, responsable in [
            ("Confirmar el menú con la casa", -2, False, "Comedor / Mesas", equipo[2]),
            ("Contratar el autobús", 5, False, "Logística / Infraestructura", equipo[11]),
            ("Imprimir los cancioneros", 10, False, "Música / Coro", equipo[9]),
            ("Comprar velas y cruces", 15, False, "Logística / Infraestructura", None),
            ("Llamar a los de la lista de espera", 3, False, "Registro / Inscripciones",
             equipo[1]),
            ("Pedir las cartas a las familias", 8, False, "Palancas / Correspondencia",
             equipo[6]),
            ("Reservar la casa", -40, True, "Logística / Infraestructura", equipo[11]),
        ]:
            Tarea.objects.create(retiro=actual, titulo=titulo, fecha_limite=hoy + timedelta(days=dias),
                                 hecha=hecha, area=areas[area], responsable=responsable)

        # Usuarios con rol, para entrar como cada uno.
        User = get_user_model()
        for usuario, nombre, rol, ambito in CUENTAS:
            cuenta = User.objects.create_user(usuario, password=CLAVE)
            persona = self.persona(nombre, self.nacimiento(1978), familia=False)
            u = Usuario.objects.create(persona=persona, cuenta=cuenta)
            AsignacionRol.objects.create(
                usuario=u, rol=rol, **({"retiro": actual} if ambito == "retiro"
                                       else {"parroquia": self.parroquia}))

        self.stdout.write(self.style.SUCCESS(
            f"Demo lista: {PARROQUIA}, retiro {actual} con {len(inscritos)} caminantes y "
            f"{len(equipo)} servidores. Usuarios: "
            + ", ".join(c[0] for c in CUENTAS) + f" (clave {CLAVE})."))
