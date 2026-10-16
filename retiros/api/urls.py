from django.urls import include, path

from . import control_pagos, cuentas, paneles, permisos_rol, sesion, vistas

urlpatterns = [
    path("auth/sesion/", sesion.sesion),
    path("auth/login/", sesion.iniciar_sesion),
    path("auth/logout/", sesion.cerrar_sesion),
    path("auth/preferencias/", sesion.preferencias),
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
    path("roles/<uuid:pk>/permisos/", permisos_rol.permisos_rol),
    path("", include(vistas.router.urls)),
]
