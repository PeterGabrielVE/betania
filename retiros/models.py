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

import re
import uuid
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify

from .tasas import TasaNoDisponible, tasa_bcv


class Moneda(models.TextChoices):
    VES = "VES", "Bolívar"
    USD = "USD", "Dólar"
    EUR = "EUR", "Euro"


def moneda_predeterminada():
    """La moneda base (MONEDA en .env): en ella van las cuotas y todos los totales."""
    return settings.MONEDA


# --------------------------------------------------------------------------- #
# Roles
# --------------------------------------------------------------------------- #
class RolSistema(models.TextChoices):
    """Los roles con que viene el sistema (su código). Se cargan como filas de
    Rol (migración 0014) y desde ahí se les cambian los permisos; se pueden
    crear otros."""
    SUPER_ADMIN = "super_admin", "Super administrador"          # ámbito global
    ADMIN_DIOCESANO = "admin_diocesano", "Administrador diocesano"  # ámbito diócesis
    COORD_PARROQUIA = "coord_parroquia", "Coordinador de parroquia"  # ámbito parroquia
    COORD_RETIRO = "coord_retiro", "Coordinador de retiro"       # ámbito retiro
    LOGISTICA = "logistica", "Coordinador de logística"          # ámbito retiro
    TESORERIA = "tesoreria", "Tesorería"                         # ámbito parroquia
    SECRETARIA = "secretaria", "Secretaría / inscripciones"      # ámbito parroquia
    SERVIDOR = "servidor", "Servidor / equipo"                  # ámbito parroquia o retiro


class Rol(models.Model):
    """
    Un rol: qué puede hacer (permisos de Django por módulo: ver, agregar,
    cambiar, eliminar), dónde se asigna (su ámbito) y si ve los datos
    confidenciales. Se asigna a usuarios con AsignacionRol.

    El ámbito decide también qué filas ve (RLS, ver middleware.py): global ve
    todo; diócesis, las parroquias de su diócesis; los demás, su parroquia. Los
    de retiro, además, solo los retiros de ese tipo (acceso.ambito_fijo).
    """

    class Ambito(models.TextChoices):
        GLOBAL = "global", "Global (todo el sistema)"
        DIOCESIS = "diocesis", "Una diócesis"
        PARROQUIA = "parroquia", "Una parroquia"
        RETIRO = "retiro", "Un retiro"
        PARROQUIA_O_RETIRO = "parroquia_o_retiro", "Una parroquia o un retiro"

    # De mayor a menor alcance: con varias asignaciones manda la primera.
    ORDEN_AMBITO = [Ambito.GLOBAL, Ambito.DIOCESIS, Ambito.PARROQUIA,
                    Ambito.PARROQUIA_O_RETIRO, Ambito.RETIRO]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.SlugField(max_length=50, unique=True, editable=False)
    nombre = models.CharField(max_length=80, unique=True)
    descripcion = models.TextField("descripción", blank=True)
    ambito = models.CharField("se asigna en", max_length=20, choices=Ambito.choices,
                              default=Ambito.PARROQUIA)
    ve_datos_sensibles = models.BooleanField(
        "ve datos confidenciales", default=False,
        help_text="Salud, tratamiento, comida especial, contactos de emergencia y familia.")
    permisos = models.ManyToManyField("auth.Permission", blank=True, related_name="roles_retiros")
    # Los del sistema no se borran (sí se les cambian los permisos).
    sistema = models.BooleanField(default=False, editable=False)

    class Meta:
        ordering = ["nombre"]
        verbose_name_plural = "roles"

    @property
    def ve_finanzas(self):
        """Quien puede ver pagos o gastos ve también sus filas (RLS)."""
        return any(p.codename in ("view_pago", "view_gasto") for p in self.permisos.all())

    def delete(self, *args, **kwargs):
        if self.sistema:
            raise ValidationError("Es un rol del sistema: no se puede eliminar (sí "
                                  "cambiarle los permisos).")
        asignados = self.asignaciones.count()
        if asignados:
            raise ValidationError(f"Está asignado a {asignados} usuario(s): quítaselo "
                                  "antes de eliminarlo.")
        return super().delete(*args, **kwargs)

    def save(self, *args, **kwargs):
        if not self.codigo:
            base = slugify(self.nombre).replace("-", "_")[:40] or "rol"
            codigo, n = base, 2
            while Rol.objects.filter(codigo=codigo).exists():
                codigo, n = f"{base}_{n}", n + 1
            self.codigo = codigo
        super().save(*args, **kwargs)

    def __str__(self):
        return self.nombre


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
# Geografía: país, estado y ciudad (los carga `manage.py sembrar_geografia`)
# --------------------------------------------------------------------------- #
class Pais(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=100, unique=True)
    codigo = models.CharField(max_length=2, unique=True)  # ISO 3166-1 alfa-2: "VE"

    class Meta:
        verbose_name = "país"
        verbose_name_plural = "países"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Estado(models.Model):
    """Estado (o entidad federal) de un país."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pais = models.ForeignKey(Pais, on_delete=models.CASCADE, related_name="estados")
    nombre = models.CharField(max_length=100)

    class Meta:
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(fields=["pais", "nombre"], name="uniq_estado_pais")
        ]

    def __str__(self):
        return self.nombre


class Ciudad(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    estado = models.ForeignKey(Estado, on_delete=models.CASCADE, related_name="ciudades")
    nombre = models.CharField(max_length=100)

    class Meta:
        verbose_name_plural = "ciudades"
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(fields=["estado", "nombre"], name="uniq_ciudad_estado")
        ]

    def __str__(self):
        return self.nombre


# --------------------------------------------------------------------------- #
# Personas y acceso
# --------------------------------------------------------------------------- #
EDAD_MINIMA = 18


def edad_en(nacimiento, dia):
    return dia.year - nacimiento.year - ((dia.month, dia.day) < (nacimiento.month, nacimiento.day))


class Persona(models.Model):
    class TipoDocumento(models.TextChoices):
        VENEZOLANO = "V", "Cédula venezolana (V)"
        EXTRANJERO = "E", "Cédula de extranjero (E)"
        PASAPORTE = "P", "Pasaporte"

    class Sexo(models.TextChoices):
        MASCULINO = "M", "Masculino"
        FEMENINO = "F", "Femenino"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parroquia = models.ForeignKey(Parroquia, on_delete=models.PROTECT, related_name="personas")
    # Con lo que se identifica a la persona (y se evita duplicarla).
    tipo_documento = models.CharField(max_length=1, choices=TipoDocumento.choices,
                                      default=TipoDocumento.VENEZOLANO)
    documento = models.CharField(max_length=20, blank=True, db_index=True)
    primer_nombre = models.CharField(max_length=60, blank=True)
    segundo_nombre = models.CharField(max_length=60, blank=True)
    primer_apellido = models.CharField(max_length=60, blank=True)
    segundo_apellido = models.CharField(max_length=60, blank=True)
    # Nombre completo, armado con los cuatro de arriba al guardar (ver save()).
    # Es el que usan listados, búsquedas y reportes.
    nombre = models.CharField(max_length=200)
    # Celular: el teléfono principal ("0414-1234567" o, si es extranjero, "+57...").
    telefono = models.CharField(max_length=40, blank=True, db_index=True)   # clave para deduplicar
    email = models.EmailField(blank=True, db_index=True)                    # clave para deduplicar
    fecha_nacimiento = models.DateField(null=True, blank=True)
    # Vacío en los registros viejos: el avatar por defecto es entonces neutro.
    sexo = models.CharField(max_length=1, choices=Sexo.choices, blank=True)
    # Cuándo se cambió la foto de perfil (la imagen va en FotoPersona); nula si
    # no tiene. Sirve además para que el navegador no muestre una foto vieja.
    foto_actualizada = models.DateTimeField(null=True, blank=True, editable=False)
    # De dónde es. El detalle (sector, urbanización, dirección) va en datos_sensibles.
    pais = models.ForeignKey(Pais, on_delete=models.PROTECT, null=True, blank=True,
                             related_name="personas")
    estado = models.ForeignKey(Estado, on_delete=models.PROTECT, null=True, blank=True,
                               related_name="personas")
    ciudad = models.ForeignKey(Ciudad, on_delete=models.PROTECT, null=True, blank=True,
                               related_name="personas")
    # Para lo que no está en los catálogos: un país sin estados cargados (del
    # extranjero) o una ciudad que no aparece en la lista.
    estado_texto = models.CharField("estado / provincia", max_length=100, blank=True)
    ciudad_texto = models.CharField("ciudad (escrita)", max_length=100, blank=True)
    # Confidencial (salud, alergias, notas pastorales...). Solo roles autorizados. Ver RLS.
    datos_sensibles = models.JSONField(default=dict, blank=True)
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["parroquia", "nombre"])]
        constraints = [
            models.UniqueConstraint(
                fields=["tipo_documento", "documento"], condition=~models.Q(documento=""),
                name="uniq_persona_documento",
            )
        ]

    @property
    def foto_url(self):
        """Dirección de la foto de perfil (con la versión), o None."""
        if not self.foto_actualizada:
            return None
        return f"/api/personas/{self.pk}/foto/?v={int(self.foto_actualizada.timestamp())}"

    @property
    def documento_completo(self):
        """"V-12345678", "E-81234567" o "Pasaporte 123456789"."""
        if not self.documento:
            return ""
        if self.tipo_documento == self.TipoDocumento.PASAPORTE:
            return f"Pasaporte {self.documento}"
        return f"{self.tipo_documento}-{self.documento}"

    @property
    def procedencia(self):
        """"Los Teques, Miranda"; fuera de Venezuela, también el país."""
        partes = [self.ciudad.nombre if self.ciudad_id else self.ciudad_texto,
                  self.estado.nombre if self.estado_id else self.estado_texto]
        if self.pais_id and self.pais.codigo != "VE":
            partes.append(self.pais.nombre)
        return ", ".join(p for p in partes if p)

    @staticmethod
    def normalizar_documento(documento):
        """"v-12.345.678" -> "12345678": sin letra, puntos, guiones ni espacios."""
        return re.sub(r"^[VEP]-|[\s.-]", "", (documento or "").strip().upper())

    PARTES_NOMBRE = ("primer_nombre", "segundo_nombre", "primer_apellido", "segundo_apellido")

    def dividir_nombre(self, completo):
        """Reparte un nombre completo en nombres y apellidos (para datos que
        llegan en un solo texto: registros viejos, importaciones de Excel).
        "Ana Pérez" · "José Pérez Gómez" (un nombre, dos apellidos) ·
        "María José Pérez Gómez"; con más palabras, lo del medio va al segundo
        nombre."""
        palabras = (completo or "").split()
        n = len(palabras)
        if n <= 2:
            partes = [palabras[0] if palabras else "", "", palabras[1] if n == 2 else "", ""]
        elif n == 3:
            partes = [palabras[0], "", palabras[1], palabras[2]]
        else:
            partes = [palabras[0], " ".join(palabras[1:-2]), palabras[-2], palabras[-1]]
        for campo, valor in zip(self.PARTES_NOMBRE, partes):
            setattr(self, campo, valor)

    def save(self, *args, **kwargs):
        self.documento = self.normalizar_documento(self.documento)
        for campo in self.PARTES_NOMBRE:
            setattr(self, campo, " ".join((getattr(self, campo) or "").split()))
        if any(getattr(self, c) for c in self.PARTES_NOMBRE):
            self.nombre = " ".join(getattr(self, c) for c in self.PARTES_NOMBRE
                                   if getattr(self, c))
        else:
            self.dividir_nombre(self.nombre)
        super().save(*args, **kwargs)

    def _duplicada(self):
        """Otra persona con el mismo nombre y fecha de nacimiento (si a alguna de
        las dos le falta el documento, podría ser la misma)."""
        if not (self.fecha_nacimiento and self.primer_nombre and self.primer_apellido):
            return None
        candidatas = (
            Persona.objects.exclude(pk=self.pk)
            .filter(fecha_nacimiento=self.fecha_nacimiento,
                    primer_nombre__iexact=self.primer_nombre.strip(),
                    primer_apellido__iexact=self.primer_apellido.strip())
        )
        if self.segundo_apellido:
            candidatas = candidatas.filter(
                segundo_apellido__in=["", self.segundo_apellido.strip()])
        if self.documento:
            # Con documentos distintos son dos personas diferentes.
            candidatas = candidatas.filter(documento="")
        return candidatas.first()

    def clean(self):
        errores = {}
        self.documento = self.normalizar_documento(self.documento)
        if not (self.primer_nombre or "").strip():
            errores["primer_nombre"] = "Escribe el primer nombre."
        if not (self.primer_apellido or "").strip():
            errores["primer_apellido"] = "Escribe el primer apellido."
        if self.documento:
            if self.tipo_documento == self.TipoDocumento.PASAPORTE:
                if not re.fullmatch(r"[A-Z0-9]{5,20}", self.documento):
                    errores["documento"] = "El pasaporte lleva de 5 a 20 letras o números."
            elif not re.fullmatch(r"\d{5,9}", self.documento):
                errores["documento"] = "La cédula lleva solo números (de 5 a 9 cifras)."
            if "documento" not in errores:
                otra = (Persona.objects.exclude(pk=self.pk)
                        .filter(tipo_documento=self.tipo_documento, documento=self.documento)
                        .first())
                if otra:
                    errores["documento"] = f"Ya está registrada con ese documento: {otra}."
        if not errores:
            otra = self._duplicada()
            if otra:
                errores["primer_nombre"] = (
                    f"Ya hay una persona con ese nombre y fecha de nacimiento: {otra}"
                    + (f" ({otra.documento_completo})" if otra.documento else "")
                    + ". Búscala en vez de registrarla de nuevo."
                )
        if self.fecha_nacimiento:
            hoy = date.today()
            if self.fecha_nacimiento > hoy:
                errores["fecha_nacimiento"] = "La fecha de nacimiento no puede ser futura."
            elif edad_en(self.fecha_nacimiento, hoy) < EDAD_MINIMA:
                errores["fecha_nacimiento"] = f"Debe tener al menos {EDAD_MINIMA} años."
        if self.ciudad_id and self.estado_id and self.ciudad.estado_id != self.estado_id:
            errores["ciudad"] = "Esa ciudad no es de ese estado."
        if self.estado_id and self.pais_id and self.estado.pais_id != self.pais_id:
            errores["estado"] = "Ese estado no es de ese país."
        if errores:
            raise ValidationError(errores)

    def __str__(self):
        return self.nombre


class FotoPersona(models.Model):
    """La foto de perfil de una persona, ya recortada y reducida (ver
    retiros/api/fotos.py). Va en la base de datos, aparte de Persona para no
    cargarla en cada listado: así la protege el mismo RLS que a la persona y no
    se pierde en hostings sin disco persistente."""
    persona = models.OneToOneField(Persona, on_delete=models.CASCADE, primary_key=True,
                                   related_name="foto")
    imagen = models.BinaryField()
    tipo = models.CharField(max_length=40, default="image/jpeg")

    class Meta:
        verbose_name = "foto de persona"
        verbose_name_plural = "fotos de personas"

    def __str__(self):
        return f"Foto de {self.persona}"


class Preferencias(models.Model):
    """Lo que cada usuario elige en el encabezado: la edición (retiro) con la
    que trabaja y la moneda en que ve los montos. El sistema las usa por
    defecto (tablero, formularios, filtros)."""
    cuenta = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="preferencias"
    )
    retiro = models.ForeignKey(
        "Retiro", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # Vacía: la moneda base.
    moneda = models.CharField(max_length=3, choices=Moneda.choices, blank=True)
    # Secciones del tablero de inicio que no quiere ver (sus claves, ver
    # frontend/src/pages/Retiros/seccionesTablero.ts).
    tablero_ocultos = models.JSONField(default=list, blank=True)
    # Columnas de cada tabla (un módulo, "panel_caminantes", "reporte_salud"...):
    # {tabla: {"ocultas": [...], "agregadas": [...]}}. Lo mismo sale en las
    # descargas.
    columnas = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "preferencias"
        verbose_name_plural = "preferencias"

    def __str__(self):
        return f"Preferencias de {self.cuenta}"


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

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Desactivarlo también le impide entrar.
        if self.cuenta_id and self.cuenta.is_active != self.activo:
            self.cuenta.is_active = self.activo
            self.cuenta.save(update_fields=["is_active"])

    def delete(self, *args, **kwargs):
        # Sin su Usuario, la cuenta quedaría suelta (y podría seguir entrando).
        cuenta = self.cuenta if self.cuenta_id and not self.cuenta.is_superuser else None
        resultado = super().delete(*args, **kwargs)
        if cuenta:
            cuenta.delete()
        return resultado

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
    rol = models.ForeignKey(Rol, on_delete=models.PROTECT, related_name="asignaciones")
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
        """Valida que el ámbito corresponda al del rol."""
        if not self.rol_id:
            return
        ambito = self.rol.ambito
        lleva = {"diocesis": self.diocesis_id, "parroquia": self.parroquia_id,
                 "retiro": self.retiro_id}
        A = Rol.Ambito
        if ambito == A.GLOBAL and any(lleva.values()):
            raise ValidationError(f"{self.rol} es de alcance global: no lleva diócesis, "
                                  "parroquia ni retiro.")
        if ambito in (A.DIOCESIS, A.PARROQUIA, A.RETIRO) and not lleva[ambito]:
            raise ValidationError({ambito: f"El rol {self.rol} se asigna en un(a) "
                                           f"{A(ambito).label.split()[-1].lower()}."})
        if ambito == A.PARROQUIA_O_RETIRO and not (self.parroquia_id or self.retiro_id):
            raise ValidationError(f"El rol {self.rol} se asigna en una parroquia o un retiro.")
        # Un retiro ya dice su parroquia y su diócesis: no pueden ser otras.
        if self.retiro_id:
            retiro = Retiro.objects.select_related("parroquia").get(pk=self.retiro_id)
            if self.parroquia_id and self.parroquia_id != retiro.parroquia_id:
                raise ValidationError({"parroquia": (
                    f"El retiro {retiro} es de la parroquia {retiro.parroquia}: deja la "
                    "parroquia vacía o elige esa.")})
            if self.diocesis_id and self.diocesis_id != retiro.parroquia.diocesis_id:
                raise ValidationError({"diocesis": "Esa diócesis no es la del retiro."})

    def __str__(self):
        ambito = self.retiro or self.parroquia or self.diocesis or "global"
        return f"{self.usuario} · {self.rol} · {ambito}"


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
    materiales = models.TextField(blank=True)

    class Meta:
        ordering = ["orden"]

    def __str__(self):
        return self.tema


class Tarea(models.Model):
    """Pendientes de la preparación de un retiro (comprar, llamar, reservar...)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    retiro = models.ForeignKey(Retiro, on_delete=models.CASCADE, related_name="tareas")
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)
    area = models.ForeignKey(
        AreaServicio, on_delete=models.SET_NULL, null=True, blank=True, related_name="tareas"
    )
    responsable = models.ForeignKey(
        Persona, on_delete=models.SET_NULL, null=True, blank=True, related_name="tareas"
    )
    fecha_limite = models.DateField(null=True, blank=True)
    hecha = models.BooleanField(default=False)
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["retiro", "hecha"])]

    def __str__(self):
        return self.titulo


# --------------------------------------------------------------------------- #
# Inscripciones (embudo de candidatos) y participación (rol confirmado)
# --------------------------------------------------------------------------- #
def _antes(obj, *campos):
    """Cómo estaba guardado (None si es nuevo): para revisar las reglas de
    duplicados solo cuando cambia algo que las afecta, y no frenar cualquier
    otro cambio (p. ej. el estado) por datos viejos en conflicto."""
    if obj._state.adding or not obj.pk:
        return None
    return type(obj).objects.filter(pk=obj.pk).values(*campos).first()


# Familiares de contacto (contacto_emergencia de Inscripcion y Participacion),
# hasta cinco: el primero con nombre, relacion, telefono, celular y correo; los
# demás con nombre2, relacion2, telefono2... hasta el 5.
SUFIJOS_CONTACTO = ("", "2", "3", "4", "5")


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
    # Por qué canceló (solo con estado "cancelada").
    motivo_cancelacion = models.CharField("motivo de la cancelación", max_length=200,
                                          blank=True)
    # Dónde duerme y dónde come en el retiro (los asigna logística; texto para
    # admitir "12" o "B-3").
    cama = models.CharField("número de cama", max_length=10, blank=True)
    mesa = models.CharField("número de mesa", max_length=10, blank=True)
    # Confidenciales — ocultos al equipo general (ver vista en rls_policies.sql):
    salud_alimentacion = models.JSONField(default=dict, blank=True)
    contacto_emergencia = models.JSONField(default=dict, blank=True)
    consentimiento_datos = models.BooleanField(default=False)
    # Lo que paga esta persona si no es la cuota del retiro (beca, descuento).
    cuota = models.DecimalField("monto a pagar", max_digits=10, decimal_places=2,
                                null=True, blank=True)
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
        if self.cuota is not None and self.cuota < 0:
            raise ValidationError({"cuota": "El monto no puede ser negativo."})
        if self.padrino_id and self.padrino_id == self.persona_id:
            raise ValidationError({"padrino": "Una persona no puede invitarse a sí misma."})
        if not (self.persona_id and self.retiro_id):
            return
        antes = _antes(self, "persona_id", "retiro_id", "estado")
        otra_persona = (antes is None or (antes["persona_id"], antes["retiro_id"])
                        != (self.persona_id, self.retiro_id))
        if otra_persona and (
            Inscripcion.objects.exclude(pk=self.pk)
            .filter(retiro_id=self.retiro_id, persona_id=self.persona_id).exists()
        ):
            raise ValidationError({"persona": "Ya está inscrita en este retiro."})
        # Que no esté también en el equipo: al inscribir, al cambiar de persona o
        # de retiro y al reactivar a quien había cancelado.
        vuelve = antes is not None and antes["estado"] == self.Estado.CANCELADA
        if self.estado == self.Estado.CANCELADA or not (otra_persona or vuelve):
            return
        equipo = (Participacion.objects
                  .filter(retiro_id=self.retiro_id, persona_id=self.persona_id)
                  .exclude(tipo=Participacion.Tipo.CAMINANTE)
                  .exclude(estado=Participacion.Estado.CANCELADO).first())
        if equipo:
            raise ValidationError({"persona": (
                f"Ya está en el equipo de este retiro como {equipo.get_tipo_display().lower()}."
            )})

    @property
    def cuota_a_pagar(self):
        """La suya si la tiene; si no, la del retiro (en la moneda base)."""
        return self.retiro.cuota if self.cuota is None else self.cuota

    def save(self, *args, **kwargs):
        if self.estado != self.Estado.CANCELADA:
            self.motivo_cancelacion = ""
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.persona} → {self.retiro} [{self.get_estado_display()}]"


# Lo que un servidor indica para cada retiro (ver Participacion): los turnos del
# fin de semana en que puede servir, las camisas que necesita y sus tallas. Se
# guardan como {clave: true} con las claves de abajo.
TURNOS_SERVICIO = [
    ("viernes_manana", "Viernes · Mañana"), ("viernes_tarde", "Viernes · Tarde"),
    ("viernes_noche", "Viernes · Noche"),
    ("sabado_manana", "Sábado · Mañana"), ("sabado_tarde", "Sábado · Tarde"),
    ("sabado_noche", "Sábado · Noche"),
    ("domingo_manana", "Domingo · Mañana"), ("domingo_tarde", "Domingo · Tarde"),
]
CAMISAS_SERVICIO = [
    ("azul", "Azul de servicio"), ("blanca", "Blanca de servicio"),
    ("polo", "Polo de la Rosa"),
]
TALLAS_CAMISA = [
    ("S", "Pequeña"), ("M", "Mediana"), ("L", "Grande"), ("XL", "X Grande"),
    ("XXL", "XX Grande"), ("XXXL", "XXX Grande"),
]


def _marcadas(valor, opciones):
    """Las claves marcadas de un {clave: true}, en el orden de `opciones`."""
    valor = valor or {}
    return [clave for clave, _ in opciones if valor.get(clave)]


class Participacion(models.Model):
    """Rol confirmado de una persona en un retiro. Para servidores, ver AsignacionServicio."""
    class Tipo(models.TextChoices):
        CAMINANTE = "caminante", "Caminante"
        SERVIDOR = "servidor", "Servidor"
        COORDINADOR = "coordinador", "Coordinador general"

    class Estado(models.TextChoices):
        """Si va a servir. Quien cancela queda como historial (áreas, pagos),
        pero no cuenta en el equipo del retiro."""
        POR_CONFIRMAR = "por_confirmar", "Por confirmar"
        CONFIRMADO = "confirmado", "Confirmado"
        CANCELADO = "cancelado", "Canceló"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    persona = models.ForeignKey(Persona, on_delete=models.PROTECT, related_name="participaciones")
    retiro = models.ForeignKey(Retiro, on_delete=models.CASCADE, related_name="participaciones")
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    estado = models.CharField(max_length=20, choices=Estado.choices,
                              default=Estado.POR_CONFIRMAR)
    motivo_cancelacion = models.CharField("motivo de la cancelación", max_length=200,
                                          blank=True)
    # Logística del servidor para este retiro (vacío: no lo indicó).
    duerme_en_casa = models.BooleanField("dormirá en la casa de retiro", null=True,
                                         blank=True)
    # Si duerme en la casa, dónde (como la del caminante).
    cama = models.CharField("número de cama", max_length=10, blank=True)
    # Líder oculto: va entre los caminantes como uno más. Sigue siendo del
    # equipo (paga la cuota de servidor), pero sale en los listados de
    # caminantes del retiro.
    lider_oculto = models.BooleanField("líder oculto", default=False)
    # La mesa en que come entre los caminantes (solo el líder oculto).
    mesa = models.CharField("número de mesa", max_length=10, blank=True)
    disponibilidad = models.JSONField(default=dict, blank=True)  # TURNOS_SERVICIO
    camisas = models.JSONField(default=dict, blank=True)         # CAMISAS_SERVICIO
    tallas_camisa = models.JSONField(default=dict, blank=True)   # TALLAS_CAMISA
    # Confidencial, como el de Inscripcion (SUFIJOS_CONTACTO).
    contacto_emergencia = models.JSONField(default=dict, blank=True)
    # Lo que aporta este servidor si no es la cuota de servidor del retiro (no
    # todos pagan lo mismo: p. ej. 20 o 25 $).
    cuota = models.DecimalField("monto a pagar", max_digits=10, decimal_places=2,
                                null=True, blank=True)
    creado = models.DateTimeField("registrado", auto_now_add=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["persona", "retiro"], name="uniq_participacion_persona_retiro"
            )
        ]

    @property
    def cuota_a_pagar(self):
        """La suya si la tiene; si no, la cuota de servidor del retiro."""
        return self.retiro.cuota_servidor if self.cuota is None else self.cuota

    @property
    def turnos(self):
        return _marcadas(self.disponibilidad, TURNOS_SERVICIO)

    @property
    def camisas_pedidas(self):
        return _marcadas(self.camisas, CAMISAS_SERVICIO)

    @property
    def tallas(self):
        return _marcadas(self.tallas_camisa, TALLAS_CAMISA)

    def resumen_turnos(self):
        """"Vie: mañana, tarde · Sáb: todo el día · Dom: mañana"."""
        partes = []
        for dia, corto in (("viernes", "Vie"), ("sabado", "Sáb"), ("domingo", "Dom")):
            del_dia = [(c, e) for c, e in TURNOS_SERVICIO if c.startswith(dia)]
            elegidos = [e.split(" · ")[1].lower() for c, e in del_dia
                        if (self.disponibilidad or {}).get(c)]
            if elegidos:
                todo = len(elegidos) == len(del_dia)
                partes.append(f"{corto}: {'todo el día' if todo else ', '.join(elegidos)}")
        return " · ".join(partes)

    def resumen_camisas(self):
        """"Azul de servicio, Polo de la Rosa · tallas M, L"."""
        nombres = dict(CAMISAS_SERVICIO)
        camisas = ", ".join(nombres[c] for c in self.camisas_pedidas)
        if not camisas:
            return ""
        return f"{camisas} · talla {', '.join(self.tallas)}" if self.tallas else camisas

    def clean(self):
        if self.cuota is not None and self.cuota < 0:
            raise ValidationError({"cuota": "El monto no puede ser negativo."})
        if not (self.persona_id and self.retiro_id):
            return
        antes = _antes(self, "persona_id", "retiro_id", "estado", "tipo")
        otra_persona = (antes is None or (antes["persona_id"], antes["retiro_id"])
                        != (self.persona_id, self.retiro_id))
        otra = (Participacion.objects.exclude(pk=self.pk)
                .filter(retiro_id=self.retiro_id, persona_id=self.persona_id).first()
                if otra_persona else None)
        if otra:
            raise ValidationError({"persona": (
                f"Ya está en este retiro como {otra.get_tipo_display().lower()}."
            )})
        if self.camisas_pedidas and not self.tallas:
            raise ValidationError({"tallas_camisa": "Indica la talla de la camisa."})
        # Que no sea también caminante: al registrarlo, al cambiar de persona o
        # de retiro, al reactivarlo o al pasarlo de caminante a servidor.
        revisar = otra_persona or (
            antes["estado"] == self.Estado.CANCELADO
            or antes["tipo"] == self.Tipo.CAMINANTE
        )
        if revisar and self.estado != self.Estado.CANCELADO and self.tipo != self.Tipo.CAMINANTE and (
            Inscripcion.objects.filter(retiro_id=self.retiro_id, persona_id=self.persona_id)
            .exclude(estado=Inscripcion.Estado.CANCELADA).exists()
        ):
            raise ValidationError({"persona": "Está inscrita como caminante en este retiro."})

    def save(self, *args, **kwargs):
        if self.estado != self.Estado.CANCELADO:
            self.motivo_cancelacion = ""
        if not self.lider_oculto:
            self.mesa = ""
        super().save(*args, **kwargs)

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

    def clean(self):
        if (self.participacion_id and self.area_id
                and AsignacionServicio.objects.exclude(pk=self.pk)
                .filter(participacion_id=self.participacion_id, area_id=self.area_id).exists()):
            raise ValidationError({"area": "Ya sirve en esa área."})

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


# --------------------------------------------------------------------------- #
# Auditoría
# --------------------------------------------------------------------------- #
class Auditoria(models.Model):
    """
    Quién hizo qué y cuándo: altas, cambios y bajas de cada módulo (con el
    antes y el después de cada campo), permisos dados o quitados a un rol, e
    ingresos y salidas del sistema. Se escribe sola (ver auditoria.py) y no se
    edita ni se borra: en la base de datos solo admite insertar y leer (RLS).

    No se registra cuando un super administrador entra o sale.
    """

    class Accion(models.TextChoices):
        CREAR = "crear", "Creó"
        CAMBIAR = "cambiar", "Cambió"
        ELIMINAR = "eliminar", "Eliminó"
        INGRESO = "ingreso", "Inició sesión"
        SALIDA = "salida", "Cerró sesión"
        INGRESO_FALLIDO = "ingreso_fallido", "Intento fallido de ingreso"
        BLOQUEO = "bloqueo", "Bloqueado por intentos fallidos"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fecha = models.DateTimeField("fecha y hora", auto_now_add=True, db_index=True)
    # Sin restricción en la base: el registro queda aunque se borre la cuenta o
    # la parroquia (y como no se puede editar, tampoco se pone en nulo).
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING,
                                null=True, blank=True, related_name="+", db_constraint=False)
    # Como se llamaba al momento.
    usuario_nombre = models.CharField("usuario", max_length=150, blank=True)
    accion = models.CharField("acción", max_length=20, choices=Accion.choices, db_index=True)
    modelo = models.CharField("módulo", max_length=60, blank=True, db_index=True)
    objeto_id = models.CharField(max_length=64, blank=True)
    objeto = models.CharField("registro", max_length=255, blank=True)
    # {campo: {"etiqueta": ..., "antes": ..., "despues": ...}}
    cambios = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    # De qué parroquia es lo afectado: el RLS deja ver a cada quien lo suyo.
    parroquia = models.ForeignKey(Parroquia, on_delete=models.DO_NOTHING, null=True,
                                  blank=True, related_name="+", db_constraint=False)

    class Meta:
        verbose_name = "registro de auditoría"
        verbose_name_plural = "auditoría"
        ordering = ["-fecha"]
        # Solo se consulta: nadie la crea, cambia ni borra a mano.
        default_permissions = ("view",)

    def __str__(self):
        return f"{self.usuario_nombre or 'Sistema'} · {self.get_accion_display()} · {self.objeto}"


# --------------------------------------------------------------------------- #
# Intentos fallidos de inicio de sesión (límite y bloqueo: seguridad.py)
# --------------------------------------------------------------------------- #
class IntentoFallido(models.Model):
    """Un intento de inicio de sesión con la contraseña equivocada: el usuario
    escrito (exista o no) y la IP. Los de más de dos días se borran solos."""
    usuario = models.CharField(max_length=150, db_index=True)
    ip = models.GenericIPAddressField(null=True, blank=True, db_index=True)
    fecha = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "intento fallido de ingreso"
        verbose_name_plural = "intentos fallidos de ingreso"
        default_permissions = ()

    def __str__(self):
        return f"{self.usuario} · {self.ip} · {self.fecha:%d/%m %H:%M}"
