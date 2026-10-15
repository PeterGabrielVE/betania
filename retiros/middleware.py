"""
Fija el contexto de RLS (app.rol / app.parroquia_id / app.diocesis_id) en cada
petición. El superusuario de Django obtiene 'super_admin' (ve todo), lo que
permite usar el admin de inmediato. Los demás toman el de su AsignacionRol de
mayor alcance (ver acceso.py); un rol de retiro ve la parroquia de ese retiro.
"""
from django.db import connection

from .acceso import asignaciones
from .models import Retiro


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
        asign = next(iter(asignaciones(user)), None)
        if asign is None:
            return "", "", ""
        parroquia_id = asign.parroquia_id
        if not parroquia_id and asign.retiro_id:
            # El RLS oculta el retiro mientras no haya contexto: su parroquia se
            # lee antes de fijar el definitivo.
            self._set("super_admin", "", "")
            parroquia_id = (
                Retiro.objects.filter(pk=asign.retiro_id)
                .values_list("parroquia_id", flat=True).first()
            )
        return asign.rol, str(parroquia_id or ""), str(asign.diocesis_id or "")
