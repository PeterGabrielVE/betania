"""
Modelo de datos para gestión de retiros (Emaús, Samuel, etc.) — multi-parroquia.

Jerarquía:  Diócesis → Parroquia → (Personas, Retiros)
La PARROQUIA es el inquilino (tenant). La DIÓCESIS está por encima.

Acceso: los permisos NO son un campo fijo del usuario, sino ASIGNACIONES DE ROL
CON ÁMBITO (AsignacionRol). Un usuario puede tener varias: coordinar un retiro,
servir en otro y administrar una parroquia. El ámbito lo define el nivel del rol
(global / diócesis / parroquia / retiro).

Confidencialidad por fila y por columna: ver rls_policies.sql.
Este archivo asume app_label = "retiros".
"""

import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from .tasas import TasaNoDisponible, tasa_bcv


class Moneda(models.TextChoices):
    VES = "VES", "Bolívar"
    USD = "USD", "Dólar"
    EUR = "EUR", "Euro"


def moneda_predeterminada():
    """La moneda base (MONEDA en .env): en ella van las cuotas y todos los totales."""
    return settings.MONEDA


# --------------------------------------------------------------------------- #
# Catálogo de roles
# --------------------------------------------------------------------------- #
class Rol(models.TextChoices):
    SUPER_ADMIN = "super_admin", "Super administrador"          # ámbito global
    ADMIN_DIOCESANO = "admin_diocesano", "Administrador diocesano"  # ámbito diócesis
    COORD_PARROQUIA = "coord_parroquia", "Coordinador de parroquia"  # ámbito parroquia
    COORD_RETIRO = "coord_retiro", "Coordinador de retiro"       # ámbito retiro
    LOGISTICA = "logistica", "Coordinador de logística"          # ámbito retiro
    TESORERIA = "tesoreria", "Tesorería"                         # ámbito parroquia
    SECRETARIA = "secretaria", "Secretaría / inscripciones"      # ámbito parroquia
    SERVIDOR = "servidor", "Servidor / equipo"                  # ámbito parroquia o retiro


# --------------------------------------------------------------------------- #
# Tenencia y catálogos
# --------------------------------------------------------------------------- #
class Diocesis(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=200)

    class Meta:
        verbose_name_plural = "diócesis"

    def __str__(self):
        return self.nombre


class Parroquia(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    diocesis = models.ForeignKey(Diocesis, on_delete=models.PROTECT, related_name="parroquias")
    nombre = models.CharField(max_length=200)

    class Meta:
        verbose_name_plural = "parroquias"

    def __str__(self):
        return self.nombre


class TipoRetiro(models.Model):
    """Emaús hombres, Emaús mujeres, Samuel... Global (parroquia nula) o por parroquia."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parroquia = models.ForeignKey(
        Parroquia, on_delete=models.CASCADE, related_name="tipos_retiro", null=True, blank=True
    )
    nombre = models.CharField(max_length=120)

    def __str__(self):
        return self.nombre


class AreaServicio(models.Model):
    """Intercesión, logística, cocina, música, formación, secretaría, animación..."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parroquia = models.ForeignKey(
        Parroquia, on_delete=models.CASCADE, related_name="areas_servicio", null=True, blank=True
    )
    nombre = models.CharField(max_length=120)
    descripcion = models.TextField(blank=True)

    class Meta:
        verbose_name = "área de servicio"
        verbose_name_plural = "áreas de servicio"

    def __str__(self):
        return self.nombre


# --------------------------------------------------------------------------- #
# Personas y acceso
# --------------------------------------------------------------------------- #
class Persona(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parroquia = models.ForeignKey(Parroquia, on_delete=models.PROTECT, related_name="personas")
    nombre = models.CharField(max_length=200)
    telefono = models.CharField(max_length=40, blank=True, db_index=True)   # clave para deduplicar
    email = models.EmailField(blank=True, db_index=True)                    # clave para deduplicar
    fecha_nacimiento = models.DateField(null=True, blank=True)
    # Confidencial (salud, alergias, notas pastorales...). Solo roles autorizados. Ver RLS.
    datos_sensibles = models.JSONField(default=dict, blank=True)
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["parroquia", "nombre"])]

    def __str__(self):
        return self.nombre


class Usuario(models.Model):
    """
    Identidad de acceso: une la cuenta con la que se entra (auth.User) con su
    persona. Los permisos viven en AsignacionRol, no aquí (ver acceso.py).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    persona = models.OneToOneField(Persona, on_delete=models.CASCADE, related_name="usuario")
    cuenta = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="usuario_retiros", help_text="Usuario y contraseña con que entra.",
    )
    activo = models.BooleanField(default=True)

    def __str__(self):
        return str(self.persona)


class AsignacionRol(models.Model):
    """
    Otorga un rol a un usuario en un ámbito. Reglas de ámbito según el rol:
      - super_admin      → sin ámbito (acceso global)
      - admin_diocesano  → diocesis
      - coord_parroquia / tesoreria / secretaria → parroquia
      - coord_retiro / logistica → retiro
      - servidor         → parroquia (equipo estable) o retiro (equipo de ese retiro)
    Un usuario puede acumular varias asignaciones.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, related_name="roles")
    rol = models.CharField(max_length=20, choices=Rol.choices)
    diocesis = models.ForeignKey(
        Diocesis, on_delete=models.CASCADE, null=True, blank=True, related_name="asignaciones_rol"
    )
    parroquia = models.ForeignKey(
        Parroquia, on_delete=models.CASCADE, null=True, blank=True, related_name="asignaciones_rol"
    )
    retiro = models.ForeignKey(
        "Retiro", on_delete=models.CASCADE, null=True, blank=True, related_name="asignaciones_rol"
    )
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "asignación de rol"
        verbose_name_plural = "asignaciones de rol"
        constraints = [
            models.UniqueConstraint(
                fields=["usuario", "rol", "diocesis", "parroquia", "retiro"],
                name="uniq_asignacion_rol",
            )
        ]

    def clean(self):
        """Valida que el ámbito corresponda al rol."""
        requiere = {
            Rol.ADMIN_DIOCESANO: "diocesis",
            Rol.COORD_PARROQUIA: "parroquia",
            Rol.TESORERIA: "parroquia",
            Rol.SECRETARIA: "parroquia",
            Rol.COORD_RETIRO: "retiro",
            Rol.LOGISTICA: "retiro",
        }
        campo = requiere.get(self.rol)
        if campo and getattr(self, f"{campo}_id") is None:
            raise ValidationError(f"El rol '{self.get_rol_display()}' requiere un(a) {campo}.")
        if self.rol == Rol.SUPER_ADMIN and (self.diocesis_id or self.parroquia_id or self.retiro_id):
            raise ValidationError("Super administrador es de ámbito global: no lleva ámbito.")
        if self.rol == Rol.SERVIDOR and not (self.parroquia_id or self.retiro_id):
            raise ValidationError("Servidor requiere parroquia o retiro.")

    def __str__(self):
        ambito = self.retiro or self.parroquia or self.diocesis or "global"
        return f"{self.usuario} · {self.get_rol_display()} · {ambito}"


# --------------------------------------------------------------------------- #
# Retiros
# --------------------------------------------------------------------------- #
class Retiro(models.Model):
    class Estado(models.TextChoices):
        PLANEACION = "planeacion", "En planeación"
        INSCRIPCIONES = "inscripciones", "Inscripciones abiertas"
        EN_CURSO = "en_curso", "En curso"
        FINALIZADO = "finalizado", "Finalizado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parroquia = models.ForeignKey(Parroquia, on_delete=models.PROTECT, related_name="retiros")
    tipo = models.ForeignKey(TipoRetiro, on_delete=models.PROTECT, related_name="retiros")
    edicion = models.PositiveIntegerField()
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    sede = models.CharField(max_length=200, blank=True)
    cupo = models.PositiveIntegerField(default=0)
    # Montos esperados por caminante y por servidor, en la moneda base.
    cuota = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cuota_servidor = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PLANEACION)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["tipo", "edicion"], name="uniq_tipo_edicion")
        ]

    def clean(self):
        if self.fecha_inicio and self.fecha_fin and self.fecha_fin < self.fecha_inicio:
            raise ValidationError({"fecha_fin": "El retiro no puede terminar antes de empezar."})

    def __str__(self):
        return f"{self.tipo} #{self.edicion}"


class Charla(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    retiro = models.ForeignKey(Retiro, on_delete=models.CASCADE, related_name="charlas")
    expositor = models.ForeignKey(
        Persona, on_delete=models.SET_NULL, null=True, blank=True, related_name="charlas"
    )
    tema = models.CharField(max_length=200)
    orden = models.PositiveIntegerField(default=0)
    materiales = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["orden"]

    def __str__(self):
        return self.tema


# --------------------------------------------------------------------------- #
# Inscripciones (embudo de candidatos) y participación (rol confirmado)
# --------------------------------------------------------------------------- #
class Inscripcion(models.Model):
    class Estado(models.TextChoices):
        SOLICITADA = "solicitada", "Solicitada"
        ACEPTADA = "aceptada", "Aceptada"
        LISTA_ESPERA = "lista_espera", "Lista de espera"
        CONFIRMADA = "confirmada", "Confirmada"
        CANCELADA = "cancelada", "Cancelada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    retiro = models.ForeignKey(Retiro, on_delete=models.CASCADE, related_name="inscripciones")
    persona = models.ForeignKey(Persona, on_delete=models.PROTECT, related_name="inscripciones")
    padrino = models.ForeignKey(
        Persona, on_delete=models.SET_NULL, null=True, blank=True, related_name="apadrinados"
    )
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.SOLICITADA)
    # Confidenciales — ocultos al equipo general (ver vista en rls_policies.sql):
    salud_alimentacion = models.JSONField(default=dict, blank=True)
    contacto_emergencia = models.JSONField(default=dict, blank=True)
    consentimiento_datos = models.BooleanField(default=False)
    notas = models.TextField(blank=True)
    registrado_por = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="inscripciones_registradas",
    )
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["retiro", "persona"], name="uniq_inscripcion_persona_retiro"
            )
        ]

    def clean(self):
        if self.padrino_id and self.padrino_id == self.persona_id:
            raise ValidationError({"padrino": "Una persona no puede invitarse a sí misma."})

    def __str__(self):
        return f"{self.persona} → {self.retiro} [{self.get_estado_display()}]"


class Participacion(models.Model):
    """Rol confirmado de una persona en un retiro. Para servidores, ver AsignacionServicio."""
    class Tipo(models.TextChoices):
        CAMINANTE = "caminante", "Caminante"
        SERVIDOR = "servidor", "Servidor"
        COORDINADOR = "coordinador", "Coordinador general"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    persona = models.ForeignKey(Persona, on_delete=models.PROTECT, related_name="participaciones")
    retiro = models.ForeignKey(Retiro, on_delete=models.CASCADE, related_name="participaciones")
    tipo = models.CharField(max_length=20, choices=Tipo.choices)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["persona", "retiro"], name="uniq_participacion_persona_retiro"
            )
        ]

    def __str__(self):
        return f"{self.persona} · {self.get_tipo_display()} · {self.retiro}"


class AsignacionServicio(models.Model):
    """
    Ubica a un servidor en un área. Un servidor puede estar en varias áreas;
    es_coordinador marca al responsable (coordinador de área) en ese retiro.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participacion = models.ForeignKey(
        Participacion, on_delete=models.CASCADE, related_name="servicios"
    )
    area = models.ForeignKey(AreaServicio, on_delete=models.PROTECT, related_name="asignaciones")
    es_coordinador = models.BooleanField(default=False)

    class Meta:
        verbose_name = "asignación de servicio"
        verbose_name_plural = "asignaciones de servicio"
        constraints = [
            models.UniqueConstraint(
                fields=["participacion", "area"], name="uniq_servidor_area"
            )
        ]

    def __str__(self):
        rol = "coord. de área" if self.es_coordinador else "servidor"
        return f"{self.participacion.persona} · {self.area} ({rol})"


# --------------------------------------------------------------------------- #
# Finanzas — hacen posible el retiro. Confidencial (solo tesorería/coordinación).
# --------------------------------------------------------------------------- #
class EstadoPago(models.TextChoices):
    """Cuánto de la cuota del retiro lleva pagado una inscripción."""
    PAGADO = "pagado", "Pagado"
    PARCIAL = "parcial", "Parcial"
    PENDIENTE = "pendiente", "Sin pago"

    @classmethod
    def de(cls, pagado, cuota):
        if cuota <= 0:
            return cls.PAGADO  # sin cuota no hay nada que deber
        if not pagado or pagado <= 0:
            return cls.PENDIENTE
        return cls.PAGADO if pagado >= cuota else cls.PARCIAL


class Movimiento(models.Model):
    """
    Lo común a pagos y gastos: un monto en bolívares, dólares o euros. Para poder
    sumar monedas distintas, cada movimiento guarda la tasa de cambio con que se
    registró y su equivalente en la moneda base; los totales se hacen sobre
    monto_base. Si no se escribe la tasa, se toma la oficial del BCV del momento.
    """
    monto = models.DecimalField(max_digits=14, decimal_places=2)
    moneda = models.CharField(max_length=3, choices=Moneda.choices,
                              default=moneda_predeterminada)
    # Cuántas unidades de `moneda` equivalen a 1 de la moneda base (p. ej. Bs por
    # dólar). Nula si el movimiento ya está en la moneda base.
    tasa = models.DecimalField(max_digits=18, decimal_places=8, null=True, blank=True)
    monto_base = models.DecimalField(max_digits=14, decimal_places=2, default=0,
                                     editable=False)

    class Meta:
        abstract = True

    def clean(self):
        if self.monto is not None and self.monto <= 0:
            raise ValidationError({"monto": "El monto debe ser mayor que cero."})
        if self.moneda == settings.MONEDA:
            return
        if self.tasa is None:
            try:
                tasa_bcv(self.moneda)  # queda en caché para save()
            except TasaNoDisponible:
                raise ValidationError({"tasa": (
                    "No se pudo consultar la tasa del BCV. Escríbela: cuántos "
                    f"{self.get_moneda_display().lower()} equivalen a 1 {settings.MONEDA}."
                )})
        elif self.tasa <= 0:
            raise ValidationError({"tasa": "La tasa debe ser mayor que cero."})

    def save(self, *args, **kwargs):
        if self.moneda == settings.MONEDA:
            self.tasa = None
        elif self.tasa is None:
            self.tasa = tasa_bcv(self.moneda)
        self.monto_base = (Decimal(self.monto) / (self.tasa or 1)).quantize(Decimal("0.01"))
        super().save(*args, **kwargs)


class Pago(Movimiento):
    """Ingreso: cuota de un candidato, donativo, aportación de servidor o recaudación."""
    class Concepto(models.TextChoices):
        CUOTA = "cuota", "Cuota de inscripción"
        DONATIVO = "donativo", "Donativo"
        APORTACION = "aportacion", "Aportación de servidor"
        RECAUDACION = "recaudacion", "Recaudación / evento"

    class Metodo(models.TextChoices):
        EFECTIVO = "efectivo", "Efectivo"
        TRANSFERENCIA = "transferencia", "Transferencia"
        OTRO = "otro", "Otro"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    retiro = models.ForeignKey(Retiro, on_delete=models.PROTECT, related_name="pagos")
    # Pagador; nulo si es donativo anónimo:
    persona = models.ForeignKey(
        Persona, on_delete=models.SET_NULL, null=True, blank=True, related_name="pagos"
    )
    # Si el pago es la cuota de un candidato, se liga a su inscripción:
    inscripcion = models.ForeignKey(
        Inscripcion, on_delete=models.SET_NULL, null=True, blank=True, related_name="pagos"
    )
    concepto = models.CharField(max_length=20, choices=Concepto.choices)
    metodo = models.CharField(max_length=20, choices=Metodo.choices, default=Metodo.EFECTIVO)
    fecha = models.DateField()
    referencia = models.CharField(max_length=120, blank=True)  # folio, no. de transferencia
    registrado_por = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="pagos_registrados",
    )

    class Meta:
        indexes = [models.Index(fields=["retiro", "concepto"])]

    def clean(self):
        super().clean()
        if self.inscripcion_id and self.inscripcion.retiro_id != self.retiro_id:
            raise ValidationError({"inscripcion": "Esa inscripción es de otro retiro."})

    def save(self, *args, **kwargs):
        # Basta con elegir la persona o la inscripción: se completa la otra, para
        # que la cuota de un caminante cuente aunque solo se haya elegido su nombre.
        if self.inscripcion_id and not self.persona_id:
            self.persona_id = self.inscripcion.persona_id
        elif self.persona_id and not self.inscripcion_id and self.concepto == self.Concepto.CUOTA:
            self.inscripcion = Inscripcion.objects.filter(
                retiro_id=self.retiro_id, persona_id=self.persona_id
            ).first()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_concepto_display()} {self.monto} {self.moneda}"


class Gasto(Movimiento):
    """Egreso del retiro: comida, hospedaje/sede, materiales, transporte."""
    class Categoria(models.TextChoices):
        COMIDA = "comida", "Comida"
        HOSPEDAJE = "hospedaje", "Hospedaje / sede"
        MATERIALES = "materiales", "Materiales"
        TRANSPORTE = "transporte", "Transporte"
        OTRO = "otro", "Otro"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    retiro = models.ForeignKey(Retiro, on_delete=models.PROTECT, related_name="gastos")
    categoria = models.CharField(max_length=20, choices=Categoria.choices)
    descripcion = models.CharField(max_length=200)
    fecha = models.DateField()
    comprobante = models.CharField(max_length=200, blank=True)  # folio o ruta al archivo
    registrado_por = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="gastos_registrados",
    )

    class Meta:
        indexes = [models.Index(fields=["retiro", "categoria"])]

    def __str__(self):
        return f"{self.get_categoria_display()} {self.monto} {self.moneda}"
