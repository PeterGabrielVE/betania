from django.urls import include, path

from . import auditoria, control_pagos, cuentas, ocr, paneles, permisos_rol, sesion, vistas

urlpatterns = [
    path("auth/sesion/", sesion.sesion),
    path("auth/login/", sesion.iniciar_sesion),
    path("auth/logout/", sesion.cerrar_sesion),
    path("auth/preferencias/", sesion.preferencias),
    path("auth/cuenta/", sesion.cuenta),
    path("auth/actividad/", sesion.actividad),
    path("auth/cuenta/clave/", sesion.cambiar_clave),
    path("esquema/", vistas.esquema),
    path("exportar/", vistas.exportar_tabla),
    path("resumen/", paneles.resumen),
    path("retiros/<uuid:pk>/panel/", paneles.panel_retiro),
    path("control-pagos/", control_pagos.control_pagos),
    path("control-pagos/monto/", control_pagos.cambiar_monto),
    path("personas/<uuid:pk>/ficha/", paneles.ficha_persona),
    # Deben ir antes del router (que tomaría "importar" por un id).
    path("personas/importar/", cuentas.importar_personas),
    path("usuarios/<uuid:pk>/cuenta/", cuentas.cuenta_usuario),
    path("usuarios/<uuid:pk>/cuenta/desbloquear/", cuentas.desbloquear_cuenta),
    path("roles/<uuid:pk>/permisos/", permisos_rol.permisos_rol),
    path("auditoria/opciones/", auditoria.opciones),
    path("ocr/planilla/", ocr.leer_planilla),
    path("ocr/listado/", ocr.leer_listado),
    path("ocr/listado/importar/", ocr.importar_listado),
    path("", include(vistas.router.urls)),
]
