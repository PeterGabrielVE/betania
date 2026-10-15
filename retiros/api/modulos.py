"""
Los módulos del sistema. Cada modelo se declara una sola vez aquí; de ahí salen
su API (/api/<slug>/) y el menú, la tabla y el formulario del frontend
(/api/esquema/). Para agregar un módulo o un campo basta con tocar MODULOS.
"""

from django.conf import settings
from django.db.models import Count, Q, Sum

from ..models import (
    AreaServicio, AsignacionRol, AsignacionServicio, Charla, Diocesis, EstadoPago, Gasto,
    Inscripcion, Pago, Parroquia, Participacion, Persona, Retiro, TipoRetiro, Usuario,
)
from .registro import Extra, Modulo, anotado, sub

# Secciones del menú, en el orden en que aparecen.
RETIROS, PERSONAS, FINANZAS, CATALOGOS = "Retiros", "Personas", "Finanzas", "Catálogos"

# Secciones del formulario de inscripción para caminantes (el de papel).
_DATOS, _CIVIL, _SACRAMENTOS = "Datos del caminante", "Estado civil", "Sacramentos"
_INSCRIPCION, _SALUD, _LLAMAR = "Inscripción", "Salud", "Persona a quien llamar"
_LLAMAR2 = "Otro familiar de contacto"
_COMENTARIOS = "Comentarios"

# Una inscripción cuenta como "inscrito" mientras no esté cancelada.
INSCRITAS = ~Q(inscripciones__estado=Inscripcion.Estado.CANCELADA)
CONFIRMADAS = Q(inscripciones__estado=Inscripcion.Estado.CONFIRMADA)

MODULOS = [
    # ---- Retiros ----
    Modulo(
        "retiros", Retiro, "Retiros", "retiro", RETIROS,
        campos=["parroquia", "tipo", "edicion", "fecha_inicio", "fecha_fin", "sede", "cupo",
                "cuota", "cuota_servidor", "estado"],
        lista=["tipo", "edicion", "parroquia", "fecha_inicio", "fecha_fin", "sede",
               "inscritos", "cupo", "estado", "lista_pdf"],
        buscar=["tipo__nombre", "sede", "parroquia__nombre"],
        filtros=["estado", "parroquia", "tipo"],
        orden=["-fecha_inicio"],
        relacionados=["tipo", "parroquia"],
        anotaciones={
            "inscritos": Count("inscripciones", filter=INSCRITAS),
            "confirmados": Count("inscripciones", filter=CONFIRMADAS),
        },
        extras={
            "inscritos": Extra("Inscritos", "numero", anotado("inscritos")),
            "confirmados": Extra("Confirmados", "numero", anotado("confirmados")),
            "lista_pdf": Extra("Lista", "enlace", lambda o: f"/retiros/{o.pk}/lista.pdf",
                               requiere=Inscripcion),
        },
    ),
    Modulo(
        "inscripciones", Inscripcion, "Inscripciones", "inscripción", RETIROS,
        campos=["retiro", "persona", "padrino", "estado", "salud_alimentacion",
                "contacto_emergencia", "notas", "consentimiento_datos"],
        lista=["persona", "retiro", "padrino", "estado", "estado_pago", "total_pagado",
               "consentimiento_datos", "creado"],
        buscar=["persona__nombre", "padrino__nombre", "retiro__tipo__nombre"],
        filtros=["estado", "retiro"],
        orden=["-creado"],
        relacionados=["persona", "padrino", "retiro__tipo"],
        sensibles=["salud_alimentacion", "contacto_emergencia"],
        anotaciones={"total_pagado": Sum("pagos__monto_base")},
        extras={
            "total_pagado": Extra("Pagado", "decimal", anotado("total_pagado"),
                                  requiere=Pago),
            "estado_pago": Extra(
                # Recién creada no trae la anotación: todavía no tiene pagos.
                "Pago", "opcion",
                lambda o: EstadoPago.de(getattr(o, "total_pagado", None), o.retiro.cuota),
                opciones=EstadoPago.choices, requiere=Pago,
            ),
        },
        etiquetas={"padrino": "Quién lo invitó al retiro", "notas": "Comentario"},
        secciones={
            _INSCRIPCION: ["retiro", "persona", "padrino", "estado"],
            _COMENTARIOS: ["notas", "consentimiento_datos"],
        },
        subcampos={
            "salud_alimentacion": [
                sub("condicion_medica", "Condición médica a reportar", _SALUD, "area"),
                sub("tratamiento", "Tratamiento o medicamentos que toma", _SALUD, "area"),
                sub("regimen_alimenticio", "Régimen alimenticio especial", _SALUD, "area"),
                sub("requerimientos", "Requerimientos especiales (movilidad, descanso...)",
                    _SALUD, "area"),
                sub("eps", "EPS", _SALUD),
                sub("talla_camiseta", "Talla de camiseta", _SALUD, "opcion",
                    ["S", "M", "L", "XL"]),
            ],
            "contacto_emergencia": [
                sub("nombre", "Nombre", _LLAMAR),
                sub("relacion", "Tipo de relación", _LLAMAR),
                sub("telefono", "Teléfono", _LLAMAR),
                sub("celular", "Celular", _LLAMAR),
                sub("correo", "Correo", _LLAMAR, "email"),
                sub("nombre2", "Nombre", _LLAMAR2),
                sub("relacion2", "Tipo de relación", _LLAMAR2),
                sub("telefono2", "Teléfono", _LLAMAR2),
            ],
        },
    ),
    Modulo(
        "participaciones", Participacion, "Participaciones", "participación", RETIROS,
        campos=["retiro", "persona", "tipo"],
        lista=["persona", "tipo", "retiro"],
        buscar=["persona__nombre", "retiro__tipo__nombre"],
        filtros=["tipo", "retiro"],
        orden=["persona__nombre"],
        relacionados=["persona", "retiro__tipo"],
    ),
    Modulo(
        "servicios", AsignacionServicio, "Servidores por área", "asignación de servicio",
        RETIROS,
        campos=["participacion", "area", "es_coordinador"],
        lista=["participacion", "area", "es_coordinador"],
        buscar=["participacion__persona__nombre", "area__nombre"],
        filtros=["area"],
        orden=["area__nombre", "participacion__persona__nombre"],
        relacionados=["participacion__persona", "participacion__retiro__tipo", "area"],
    ),
    Modulo(
        "charlas", Charla, "Charlas", "charla", RETIROS,
        campos=["retiro", "tema", "expositor", "orden", "materiales"],
        lista=["orden", "tema", "expositor", "retiro"],
        buscar=["tema", "expositor__nombre"],
        filtros=["retiro"],
        orden=["retiro", "orden"],
        relacionados=["retiro__tipo", "expositor"],
    ),
    # ---- Personas y acceso ----
    Modulo(
        "personas", Persona, "Personas", "persona", PERSONAS,
        campos=["nombre", "parroquia", "telefono", "email", "fecha_nacimiento",
                "datos_sensibles"],
        lista=["nombre", "telefono", "email", "fecha_nacimiento", "parroquia", "creado"],
        buscar=["nombre", "telefono", "email"],
        filtros=["parroquia"],
        orden=["nombre"],
        relacionados=["parroquia"],
        sensibles=["datos_sensibles"],
        etiquetas={"nombre": "Nombres y apellidos", "fecha_nacimiento": "Nacimiento",
                   "email": "Correo", "parroquia": "Parroquia (del sistema)"},
        secciones={_DATOS: ["nombre", "parroquia", "fecha_nacimiento", "telefono", "email"]},
        subcampos={
            "datos_sensibles": [
                sub("celular", "Celular", _DATOS),
                sub("telefono_oficina", "Teléfono de oficina", _DATOS),
                sub("procedencia", "De dónde es (ciudad o sector)", _DATOS),
                sub("direccion", "Dirección", _DATOS),
                sub("conjunto", "Conjunto", _DATOS),
                sub("ocupacion", "Ocupación", _DATOS),
                sub("estado_civil", "Estado civil", _CIVIL, "opcion",
                    ["Soltero", "Casado", "Divorciado", "Viudo", "Unión libre"]),
                sub("pareja_nombre", "Nombre de la pareja", _CIVIL),
                sub("pareja_telefono", "Teléfono de la pareja", _CIVIL),
                sub("pareja_celular", "Celular de la pareja", _CIVIL),
                sub("pareja_correo", "Correo de la pareja", _CIVIL, "email"),
                sub("hijos", "Número de hijos", _CIVIL, "numero"),
                sub("edades_hijos", "Edades de los hijos", _CIVIL),
                sub("bautismo", "Bautismo", _SACRAMENTOS, "bool"),
                sub("confirmacion", "Confirmación", _SACRAMENTOS, "bool"),
                sub("matrimonio", "Matrimonio", _SACRAMENTOS, "bool"),
                sub("uncion", "Unción", _SACRAMENTOS, "bool"),
                sub("parroquia_asiste", "Parroquia a la que asiste regularmente",
                    _SACRAMENTOS),
            ],
        },
    ),
    Modulo(
        "usuarios", Usuario, "Usuarios", "usuario", PERSONAS,
        campos=["persona", "activo"],
        lista=["persona", "activo"],
        buscar=["persona__nombre"],
        orden=["persona__nombre"],
        relacionados=["persona"],
    ),
    Modulo(
        "roles", AsignacionRol, "Asignaciones de rol", "asignación de rol", PERSONAS,
        campos=["usuario", "rol", "diocesis", "parroquia", "retiro"],
        lista=["usuario", "rol", "diocesis", "parroquia", "retiro"],
        buscar=["usuario__persona__nombre"],
        filtros=["rol", "parroquia"],
        orden=["usuario__persona__nombre"],
        relacionados=["usuario__persona", "diocesis", "parroquia", "retiro__tipo"],
    ),
    # ---- Finanzas ----
    Modulo(
        "pagos", Pago, "Pagos", "pago", FINANZAS,
        campos=["retiro", "concepto", "monto", "moneda", "tasa", "metodo", "fecha",
                "persona", "inscripcion", "referencia"],
        lista=["fecha", "concepto", "monto", "moneda", "monto_base", "metodo", "retiro",
               "persona"],
        buscar=["persona__nombre", "referencia"],
        filtros=["concepto", "metodo", "retiro"],
        orden=["-fecha"],
        relacionados=["retiro__tipo", "persona", "inscripcion__persona",
                      "inscripcion__retiro__tipo"],
    ),
    Modulo(
        "gastos", Gasto, "Gastos", "gasto", FINANZAS,
        campos=["retiro", "categoria", "descripcion", "monto", "moneda", "tasa", "fecha",
                "comprobante"],
        lista=["fecha", "categoria", "descripcion", "monto", "moneda", "monto_base",
               "retiro"],
        buscar=["descripcion", "comprobante"],
        filtros=["categoria", "retiro"],
        orden=["-fecha"],
        relacionados=["retiro__tipo"],
    ),
    # ---- Catálogos ----
    Modulo(
        "diocesis", Diocesis, "Diócesis", "diócesis", CATALOGOS,
        campos=["nombre"], lista=["nombre"], buscar=["nombre"], orden=["nombre"],
    ),
    Modulo(
        "parroquias", Parroquia, "Parroquias", "parroquia", CATALOGOS,
        campos=["nombre", "diocesis"], lista=["nombre", "diocesis"],
        buscar=["nombre"], filtros=["diocesis"], orden=["nombre"],
        relacionados=["diocesis"],
    ),
    Modulo(
        "tipos-retiro", TipoRetiro, "Tipos de retiro", "tipo de retiro", CATALOGOS,
        campos=["nombre", "parroquia"], lista=["nombre", "parroquia"],
        buscar=["nombre"], filtros=["parroquia"], orden=["nombre"],
        relacionados=["parroquia"],
    ),
    Modulo(
        "areas-servicio", AreaServicio, "Áreas de servicio", "área de servicio", CATALOGOS,
        campos=["nombre", "parroquia", "descripcion"],
        lista=["nombre", "parroquia", "descripcion"],
        buscar=["nombre"], filtros=["parroquia"], orden=["nombre"],
        relacionados=["parroquia"],
    ),
]

POR_MODELO = {m.modelo: m for m in MODULOS}

# Etiquetas donde el nombre del campo no basta (acentos, aclaraciones).
ETIQUETAS = {
    "diocesis": "Diócesis", "telefono": "Teléfono", "edicion": "Edición",
    "descripcion": "Descripción", "categoria": "Categoría", "metodo": "Método",
    "area": "Área", "participacion": "Servidor (participación)",
    "inscripcion": "Inscripción", "es_coordinador": "Coordina el área",
    "consentimiento_datos": "Consentimiento de datos", "creado": "Alta",
    "salud_alimentacion": "Salud y alimentación", "tipo": "Tipo",
    "cuota": f"Cuota del caminante ({settings.MONEDA})",
    "cuota_servidor": f"Cuota del servidor ({settings.MONEDA})", "monto": "Monto",
    "tasa": f"Tasa de cambio (por 1 {settings.MONEDA})",
    "monto_base": f"Equivalente en {settings.MONEDA}",
}

# Texto de ayuda bajo el control de un campo.
AYUDAS = {
    "tasa": "Déjala vacía para usar la tasa oficial del BCV de hoy.",
    "inscripcion": "Para la cuota de un caminante basta con elegir la persona.",
}
