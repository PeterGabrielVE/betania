from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponse
from django.urls import include, path, re_path
from django.views.decorators.csrf import ensure_csrf_cookie

from retiros.reportes import lista_retiro_pdf


@ensure_csrf_cookie
def frontend(request):
    """Sirve el index.html del frontend React; las rutas las resuelve React Router."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return HttpResponse(
            "El frontend no está compilado. Corre `npm run build` en frontend/ "
            "o usa el servidor de desarrollo en http://localhost:5173.",
            status=503,
            content_type="text/plain; charset=utf-8",
        )
    respuesta = FileResponse(index.open("rb"), content_type="text/html; charset=utf-8")
    # Que el navegador no reutilice un index viejo: es el que apunta al JS/CSS
    # de la última compilación (esos sí se cachean, llevan hash en el nombre).
    respuesta["Cache-Control"] = "no-cache"
    return respuesta


urlpatterns = [
    path("admin/", admin.site.urls),
    path("retiros/<uuid:retiro_id>/lista.pdf", lista_retiro_pdf, name="lista_retiro_pdf"),
    path("api/", include("retiros.api.urls")),
    # Todo lo demás es del frontend (debe ir al final).
    re_path(r"^(?!api/|admin/|static/).*$", frontend),
]
