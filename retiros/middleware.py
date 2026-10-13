"""
Fija el contexto de RLS (app.rol / app.parroquia_id / app.diocesis_id) en cada
petición. El superusuario de Django obtiene 'super_admin' (ve todo), lo que
permite usar el admin de inmediato.

Pendiente para usuarios NO superadmin: enlaza tu auth.User con el modelo
Usuario/AsignacionRol y devuelve su rol/parroquia en _asignacion_activa().
"""
from django.db import connection


class RLSContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        rol, parroquia_id, diocesis_id = self._resolver(request)
        request.rls_rol = rol  # la API lo usa para decidir si expone datos sensibles
        self._set(rol, parroquia_id, diocesis_id)
        try:
            return self.get_response(request)
        finally:
            self._set("", "", "")

    @staticmethod
    def _set(rol, parroquia_id, diocesis_id):
        with connection.cursor() as cur:
            cur.execute("SELECT set_config('app.rol', %s, false)", [rol])
            cur.execute("SELECT set_config('app.parroquia_id', %s, false)", [parroquia_id])
            cur.execute("SELECT set_config('app.diocesis_id', %s, false)", [diocesis_id])

    def _resolver(self, request):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return "", "", ""
        if user.is_superuser:
            return "super_admin", "", ""
        asign = self._asignacion_activa(request, user)
        if asign:
            return asign.rol, str(asign.parroquia_id or ""), str(asign.diocesis_id or "")
        return "", "", ""

    def _asignacion_activa(self, request, user):
        # TODO: enlazar auth.User -> Usuario y devolver la AsignacionRol activa
        # (p. ej. según la parroquia seleccionada en la sesión del usuario).
        return None
