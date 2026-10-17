"""
Sesión de Django para la API, pero respondiendo 401 (no 403) cuando no hay
sesión: así el frontend distingue "tu sesión terminó" de "tu rol no te deja",
y manda a iniciar sesión en vez de decir que no hay acceso.
"""

from rest_framework.authentication import SessionAuthentication


class Sesion(SessionAuthentication):
    def authenticate_header(self, request):
        # Con encabezado WWW-Authenticate, DRF responde 401 a quien no entró.
        return "Session"
