"""
Fija el contexto de RLS en cada petición:

  app.rol          el nivel del rol de mayor alcance: 'super_admin' (global, ve
                   todo), 'admin_diocesano' (su diócesis) o el código del rol
                   (los demás ven su parroquia).
  app.parroquia_id / app.diocesis_id   dónde está asignado.
  app.finanzas     '1' si algún rol suyo puede ver pagos o gastos.
  app.sensibles    '1' si algún rol suyo ve datos confidenciales.

El superusuario de Django ve todo. Un rol de retiro ve la parroquia de ese retiro.
"""
from django.db import connection

from .acceso import asignaciones, ve_datos_sensibles, ve_finanzas
from .models import Retiro, Rol

NIVEL = {Rol.Ambito.GLOBAL: "super_admin", Rol.Ambito.DIOCESIS: "admin_diocesano"}


class RLSContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        contexto = self._resolver(request)
        # La API lo usa para decidir si expone datos sensibles.
        request.rls_rol = contexto[0]
        request.rls_sensibles = contexto[4] == "1"
        self._set(*contexto)
        try:
            return self.get_response(request)
        finally:
            self._set("", "", "", "", "")

    @staticmethod
    def _set(rol, parroquia_id, diocesis_id, finanzas="", sensibles=""):
        with connection.cursor() as cur:
            cur.execute(
                "SELECT set_config('app.rol', %s, false), set_config('app.parroquia_id', %s, false),"
                " set_config('app.diocesis_id', %s, false), set_config('app.finanzas', %s, false),"
                " set_config('app.sensibles', %s, false)",
                [rol, parroquia_id, diocesis_id, finanzas, sensibles],
            )

    def _resolver(self, request):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return "", "", "", "", ""
        if user.is_superuser:
            return "super_admin", "", "", "1", "1"
        asign = next(iter(asignaciones(user)), None)
        if asign is None:
            return "", "", "", "", ""
        parroquia_id = asign.parroquia_id
        # Con retiro, manda el retiro: su parroquia es la de él.
        if asign.retiro_id:
            # El RLS oculta el retiro mientras no haya contexto: su parroquia se
            # lee antes de fijar el definitivo.
            self._set("super_admin", "", "")
            parroquia_id = (
                Retiro.objects.filter(pk=asign.retiro_id)
                .values_list("parroquia_id", flat=True).first()
            )
        return (
            NIVEL.get(asign.rol.ambito, asign.rol.codigo),
            str(parroquia_id or ""),
            str(asign.diocesis_id or ""),
            "1" if ve_finanzas(user) else "",
            "1" if ve_datos_sensibles(user) else "",
        )
