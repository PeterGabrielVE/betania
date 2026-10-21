"""
Los módulos del sistema. Cada modelo se declara una sola vez aquí; de ahí salen
su API (/api/<slug>/) y el menú, la tabla y el formulario del frontend
(/api/esquema/). Para agregar un módulo o un campo basta con tocar MODULOS.
"""

from django.conf import settings
from django.db.models import Count, Q, Sum

from ..models import (
    CAMISAS_SERVICIO, SUFIJOS_CONTACTO, TALLAS_CAMISA, TURNOS_SERVICIO,
    AreaServicio, AsignacionRol, AsignacionServicio, Charla, Ciudad, Diocesis, Estado,
    EstadoPago, Gasto, Inscripcion, Pago, Pais, Parroquia, Participacion, Persona, Retiro, Tarea,
    Auditoria, Rol, TipoRetiro, Usuario,
)
from . import filtros as F
from .registro import Extra, Modulo, anotado, sub

# Secciones del menú, en el orden en que aparecen.
RETIROS, PERSONAS, FINANZAS, CATALOGOS = "Retiros", "Personas", "Finanzas", "Catálogos"
SISTEMA = "Sistema"

# Secciones del formulario de inscripción para caminantes (el de papel).
_DATOS, _CIVIL, _SACRAMENTOS = "Datos del caminante", "Estado civil", "Sacramentos"
_UBICACION = "De dónde es"
_INSCRIPCION, _SALUD, _LLAMAR = "Inscripción", "Salud", "Persona a quien llamar"

# Los familiares de contacto (contacto_emergencia), como los pide el formulario.
_CONTACTOS = [
    sub("nombre", "Nombre", _LLAMAR),
    sub("relacion", "Tipo de relación", _LLAMAR),
    sub("telefono", "Teléfono", _LLAMAR),
    sub("celular", "Celular", _LLAMAR),
    sub("correo", "Correo", _LLAMAR, "email"),
] + [
    sub(f"{c}{n}", e, f"Otro familiar de contacto ({n})")
    for n in SUFIJOS_CONTACTO[1:]
    for c, e in (("nombre", "Nombre"), ("relacion", "Tipo de relación"),
                 ("telefono", "Teléfono"))
]
_TURNOS, _CAMISA = "Turnos en que puede servir", "Camisa para servir"
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
        lista=["nombre", "parroquia", "fecha_inicio", "fecha_fin", "sede",
               "inscritos", "cupo", "estado", "lista_pdf"],
        buscar=["tipo__nombre", "sede", "parroquia__nombre"],
        filtros=["estado", "parroquia", "tipo"],
        por_ambito=["parroquia", "tipo"],
        orden=["-fecha_inicio"],
        relacionados=["tipo", "parroquia"],
        anotaciones={
            "inscritos": Count("inscripciones", filter=INSCRITAS),
            "confirmados": Count("inscripciones", filter=CONFIRMADAS),
        },
        extras={
            # "Emaús hombres #12": tipo y edición juntos, con lo que se reconoce.
            "nombre": Extra("Retiro", "texto", str),
            "inscritos": Extra("Inscritos", "numero", anotado("inscritos")),
            "confirmados": Extra("Confirmados", "numero", anotado("confirmados")),
            "lista_pdf": Extra("Confirmados", "enlace", lambda o: f"/retiros/{o.pk}/lista.pdf",
                               requiere=Inscripcion),
        },
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
    Modulo(
        "tareas", Tarea, "Tareas", "tarea", RETIROS,
        campos=["retiro", "titulo", "descripcion", "area", "responsable", "fecha_limite",
                "hecha"],
        lista=["titulo", "fecha_limite", "responsable", "area", "retiro", "hecha"],
        buscar=["titulo", "responsable__nombre"],
        filtros=["hecha", "retiro", "area", "responsable"],
        orden=["hecha", "fecha_limite"],
        relacionados=["retiro__tipo", "area", "responsable"],
        etiquetas={"titulo": "Tarea", "hecha": "Hecha"},
    ),
    # ---- Personas: caminantes, servidores y acceso ----
    Modulo(
        "personas", Persona, "Personas", "persona", PERSONAS,
        campos=["tipo_documento", "documento", "primer_nombre", "segundo_nombre",
                "primer_apellido", "segundo_apellido", "parroquia", "fecha_nacimiento",
                "sexo", "telefono", "email", "pais", "estado", "ciudad", "estado_texto",
                "ciudad_texto", "datos_sensibles"],
        lista=["nombre", "documento_completo", "telefono", "procedencia",
               "fecha_nacimiento", "parroquia", "creado"],
        buscar=["nombre", "documento", "telefono", "email"],
        filtros=["parroquia"],
        avanzados=F.PERSONAS,
        orden=["nombre"],
        relacionados=["parroquia", "pais", "estado", "ciudad"],
        sensibles=["datos_sensibles"],
        extras={
            # "V-12345678" o "Pasaporte 123456789".
            "documento_completo": Extra("Documento", "texto", lambda o: o.documento_completo),
            "procedencia": Extra("De dónde es", "texto", lambda o: o.procedencia),
        },
        etiquetas={"nombre": "Nombres y apellidos", "fecha_nacimiento": "Nacimiento",
                   "email": "Correo", "parroquia": "Parroquia (del sistema)",
                   "telefono": "Celular", "documento": "Número de documento",
                   "tipo_documento": "Tipo de documento"},
        secciones={
            _DATOS: ["tipo_documento", "documento", "primer_nombre", "segundo_nombre",
                     "primer_apellido", "segundo_apellido", "parroquia", "fecha_nacimiento",
                     "sexo", "telefono", "email"],
            _UBICACION: ["pais", "estado", "ciudad", "estado_texto", "ciudad_texto"],
        },
        subcampos={
            "datos_sensibles": [
                sub("telefono_casa", "Teléfono de casa", _DATOS),
                sub("direccion", "Sector / urbanización / dirección", _UBICACION, "area"),
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
                sub("primera_comunion", "Primera comunión", _SACRAMENTOS, "bool"),
                sub("confirmacion", "Confirmación", _SACRAMENTOS, "bool"),
                sub("matrimonio", "Matrimonio", _SACRAMENTOS, "bool"),
                sub("orden_sacerdotal", "Orden sacerdotal", _SACRAMENTOS, "bool"),
                sub("uncion", "Unción", _SACRAMENTOS, "bool"),
                sub("parroquia_asiste", "Parroquia a la que asiste regularmente",
                    _SACRAMENTOS),
            ],
        },
    ),
    Modulo(
        "inscripciones", Inscripcion, "Caminantes", "inscripción", PERSONAS,
        campos=["retiro", "persona", "padrino", "estado", "motivo_cancelacion", "cama", "mesa",
                "salud_alimentacion", "contacto_emergencia", "notas", "consentimiento_datos"],
        lista=["persona", "retiro", "padrino", "estado", "cama", "mesa", "estado_pago",
               "total_pagado", "consentimiento_datos", "creado"],
        buscar=["persona__nombre", "padrino__nombre", "retiro__tipo__nombre"],
        filtros=["estado", "retiro"],
        avanzados=F.CAMINANTES,
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
                lambda o: EstadoPago.de(getattr(o, "total_pagado", None), o.cuota_a_pagar),
                opciones=EstadoPago.choices, requiere=Pago,
            ),
        },
        etiquetas={"padrino": "Quién lo invitó al retiro", "notas": "Comentario"},
        secciones={
            _INSCRIPCION: ["retiro", "persona", "padrino", "estado", "motivo_cancelacion",
                           "cama", "mesa"],
            _COMENTARIOS: ["notas", "consentimiento_datos"],
        },
        subcampos={
            "salud_alimentacion": [
                sub("condicion_medica", "Condición médica a reportar", _SALUD, "area"),
                sub("tratamiento", "Tratamiento o medicamentos que toma", _SALUD, "area"),
                sub("regimen_alimenticio", "Régimen alimenticio especial", _SALUD, "area"),
                sub("requerimientos", "Requerimientos especiales (movilidad, descanso...)",
                    _SALUD, "area"),
                sub("talla_camiseta", "Talla de camiseta", _SALUD, "opcion",
                    ["S", "M", "L", "XL"]),
            ],
            "contacto_emergencia": _CONTACTOS,
        },
    ),
    Modulo(
        # Los servidores de cada retiro, con sus áreas (AsignacionServicio). Las
        # participaciones de caminante no van aquí: los caminantes son las
        # inscripciones.
        "participaciones", Participacion, "Servidores", "servidor", PERSONAS,
        campos=["retiro", "persona", "tipo", "estado", "motivo_cancelacion", "duerme_en_casa",
                "disponibilidad", "camisas", "tallas_camisa", "contacto_emergencia"],
        lista=["persona", "documento", "telefono", "areas", "tipo", "estado", "duerme",
               "turnos", "camisa", "retiro"],
        buscar=["persona__nombre", "persona__documento", "servicios__area__nombre",
                "retiro__tipo__nombre"],
        excluir={"tipo": Participacion.Tipo.CAMINANTE},
        sensibles=["contacto_emergencia"],
        prefetch=["servicios__area"],
        extras={
            "documento": Extra("Documento", "texto", lambda o: o.persona.documento_completo),
            "telefono": Extra("Celular", "texto", lambda o: o.persona.telefono),
            # "Cocina (coordina), Música".
            "duerme": Extra("Duerme en la casa", "texto", lambda o: (
                "" if o.duerme_en_casa is None else "Sí" if o.duerme_en_casa else "No")),
            "turnos": Extra("Turnos", "texto", lambda o: o.resumen_turnos()),
            "camisa": Extra("Camisa", "texto", lambda o: o.resumen_camisas()),
            "areas": Extra("Áreas", "texto", lambda o: ", ".join(
                f"{s.area.nombre} (coordina)" if s.es_coordinador else s.area.nombre
                for s in sorted(o.servicios.all(), key=lambda s: s.area.nombre)
            )),
        },
        filtros=["estado", "tipo", "retiro"],
        avanzados=F.SERVIDORES,
        etiquetas={"persona": "Servidor", "tipo": "Participa como",
                   "duerme_en_casa": "Dormirá en la casa de retiro"},
        subcampos={
            "disponibilidad": [sub(c, e, _TURNOS, "bool") for c, e in TURNOS_SERVICIO],
            "camisas": [sub(c, e, _CAMISA, "bool") for c, e in CAMISAS_SERVICIO],
            "tallas_camisa": [sub(c, f"Talla {e}", _CAMISA, "bool")
                              for c, e in TALLAS_CAMISA],
            "contacto_emergencia": _CONTACTOS,
        },
        orden=["persona__nombre"],
        relacionados=["persona", "retiro__tipo"],
    ),
    Modulo(
        "servicios", AsignacionServicio, "Servidores por área", "asignación de servicio",
        PERSONAS,
        # Las áreas se ven en Servidores y se editan en la ficha de la persona.
        en_menu=False,
        campos=["participacion", "area", "es_coordinador"],
        lista=["participacion", "area", "es_coordinador"],
        buscar=["participacion__persona__nombre", "area__nombre"],
        filtros=["area", "participacion"],
        orden=["area__nombre", "participacion__persona__nombre"],
        relacionados=["participacion__persona", "participacion__retiro__tipo", "area"],
    ),
    Modulo(
        "usuarios", Usuario, "Usuarios", "usuario", PERSONAS,
        campos=["persona", "activo"],
        lista=["persona", "cuenta_acceso", "activo"],
        buscar=["persona__nombre", "cuenta__username"],
        orden=["persona__nombre"],
        relacionados=["persona", "cuenta"],
        extras={
            # El nombre con que entra; la cuenta se crea con el botón de la llave.
            "cuenta_acceso": Extra("Cuenta", "texto",
                                   lambda o: o.cuenta.username if o.cuenta_id else ""),
        },
    ),
    Modulo(
        "asignaciones", AsignacionRol, "Asignar roles", "asignación de rol", PERSONAS,
        campos=["usuario", "rol", "diocesis", "parroquia", "retiro"],
        lista=["usuario", "rol", "diocesis", "parroquia", "retiro"],
        buscar=["usuario__persona__nombre", "rol__nombre"],
        filtros=["rol", "parroquia"],
        orden=["usuario__persona__nombre"],
        relacionados=["usuario__persona", "rol", "diocesis", "parroquia", "retiro__tipo"],
    ),
    Modulo(
        # Qué puede hacer cada rol: sus permisos se marcan en /roles/<id>/permisos.
        "roles", Rol, "Roles y permisos", "rol", PERSONAS,
        campos=["nombre", "descripcion", "ambito", "ve_datos_sensibles"],
        lista=["nombre", "ambito", "ve_datos_sensibles", "num_permisos", "num_asignaciones"],
        buscar=["nombre", "descripcion"],
        filtros=["ambito"],
        orden=["nombre"],
        anotaciones={
            "permisos_total": Count("permisos", distinct=True),
            "asignaciones_total": Count("asignaciones", distinct=True),
        },
        extras={
            "num_permisos": Extra("Permisos", "numero", anotado("permisos_total")),
            "num_asignaciones": Extra("Asignado a", "numero", anotado("asignaciones_total")),
        },
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
        "paises", Pais, "Países", "país", CATALOGOS,
        campos=["nombre", "codigo"], lista=["nombre", "codigo"],
        buscar=["nombre", "codigo"], orden=["nombre"],
    ),
    Modulo(
        "estados", Estado, "Estados", "estado", CATALOGOS,
        campos=["pais", "nombre"], lista=["nombre", "pais"],
        buscar=["nombre"], filtros=["pais"], orden=["nombre"],
        relacionados=["pais"],
    ),
    Modulo(
        "ciudades", Ciudad, "Ciudades", "ciudad", CATALOGOS,
        campos=["estado", "nombre"], lista=["nombre", "estado"],
        buscar=["nombre", "estado__nombre"], filtros=["estado"], orden=["nombre"],
        relacionados=["estado"],
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
    # ---- Sistema ----
    Modulo(
        # Solo lectura: la escribe retiros/auditoria.py. Pantalla propia en el
        # frontend (/auditoria), con el detalle de cada cambio.
        "auditoria", Auditoria, "Auditoría", "registro de auditoría", SISTEMA,
        campos=["cambios"],
        lista=["fecha", "usuario_nombre", "accion", "modulo", "objeto", "resumen", "ip"],
        buscar=["usuario_nombre", "objeto", "objeto_id"],
        filtros=["accion", "modelo"],
        orden=["-fecha"],
        rango_fecha="fecha",
        solo_lectura=True,
        extras={
            "modulo": Extra("Módulo", "texto", lambda o: titulo_modelo(o.modelo)),
            "resumen": Extra("Cambios", "texto", lambda o: resumen_cambios(o.cambios)),
        },
    ),
]

# Nombre de cada modelo como se ve en el menú (para la auditoría).
TITULOS_MODELO = {"user": "Cuentas de acceso"}
for _m in MODULOS:
    TITULOS_MODELO.setdefault(_m.modelo._meta.model_name, _m.titulo)


def titulo_modelo(nombre):
    return TITULOS_MODELO.get(nombre, nombre or "—")


def resumen_cambios(cambios, maximo=4):
    """"Estado: Aceptada → Confirmada · Monto: 30 → 60"."""
    partes = []
    for datos in (cambios or {}).values():
        if datos.get("confidencial"):
            partes.append(f"{datos['etiqueta']} (confidencial)")
            continue
        antes, despues = datos.get("antes"), datos.get("despues")
        if datos.get("detalle"):
            partes.append(f"{datos['etiqueta']} {datos['detalle']}: {antes or despues}")
        elif antes is None:
            partes.append(f"{datos['etiqueta']}: {despues}")
        else:
            partes.append(f"{datos['etiqueta']}: {antes} → {despues if despues is not None else '—'}")
    texto = " · ".join(partes[:maximo])
    if len(partes) > maximo:
        texto += f" · y {len(partes) - maximo} más"
    return texto

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
    "fecha_limite": "Fecha límite",
    "pais": "País", "codigo": "Código (ISO)",
    "primer_nombre": "Primer nombre", "segundo_nombre": "Segundo nombre",
    "primer_apellido": "Primer apellido", "segundo_apellido": "Segundo apellido",
    "estado_texto": "Estado / provincia (si no está en la lista)",
    "ciudad_texto": "Ciudad (si no está en la lista)",
}

# Texto de ayuda bajo el control de un campo.
AYUDAS = {
    "tasa": "Déjala vacía para usar la tasa oficial del BCV de hoy.",
    "inscripcion": "Para la cuota de un caminante basta con elegir la persona.",
    "ambito": ("Dónde se asigna y qué ve: global, todo; una diócesis, sus parroquias; "
               "una parroquia o un retiro, esa parroquia (y de retiro, solo ese tipo de "
               "retiro)."),
    "ve_datos_sensibles": ("Salud, tratamiento, comida especial, contactos de emergencia "
                           "y familia de los caminantes."),
}
