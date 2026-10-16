from django.urls import include, path

from . import control_pagos, paneles, sesion, vistas

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
    path("", include(vistas.router.urls)),
]
