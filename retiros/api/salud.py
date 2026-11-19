"""Estado del servidor, para el cron que lo mantiene despierto
(.github/workflows/mantener-vivo.yml) y para monitores externos.

Es público y liviano: no abre sesión, no lee datos de nadie. Toca la base de
datos para que también ella se mantenga despierta (algunos hostings gratuitos
la duermen) y para avisar si no responde.
"""

from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods


def _consultar_base():
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")


@require_http_methods(["GET", "HEAD"])
def salud(request):
    try:
        _consultar_base()
        if request.method == "HEAD":
            respuesta = HttpResponse(status=200)
        else:
            respuesta = JsonResponse({"estado": "ok"})
    except Exception:
        if request.method == "HEAD":
            respuesta = HttpResponse(status=503)
        else:
            respuesta = JsonResponse({"estado": "sin base de datos"}, status=503)
    respuesta["Cache-Control"] = "no-store"
    return respuesta
