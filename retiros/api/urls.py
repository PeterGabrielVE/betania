from django.urls import include, path

from . import paneles, sesion, vistas

urlpatterns = [
    path("auth/sesion/", sesion.sesion),
    path("auth/login/", sesion.iniciar_sesion),
    path("auth/logout/", sesion.cerrar_sesion),
    path("auth/preferencias/", sesion.preferencias),
    path("esquema/", vistas.esquema),
    path("exportar/", vistas.exportar_tabla),
    path("resumen/", paneles.resumen),
    path("retiros/<uuid:pk>/panel/", paneles.panel_retiro),
    path("personas/<uuid:pk>/ficha/", paneles.ficha_persona),
    path("", include(vistas.router.urls)),
]
