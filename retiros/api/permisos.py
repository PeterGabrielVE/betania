from rest_framework import permissions

def ve_sensibles(request):
    """Si algún rol del usuario ve datos confidenciales (Rol.ve_datos_sensibles;
    lo fija el middleware, como rol_datos_sensibles() en rls_policies.sql)."""
    return getattr(request, "rls_sensibles", False)


def permiso(modelo, accion):
    """Nombre del permiso de Django: permiso(Pago, "view") -> "retiros.view_pago"."""
    meta = modelo._meta
    return f"{meta.app_label}.{accion}_{meta.model_name}"


class PermisosModelo(permissions.DjangoModelPermissions):
    """Como en el admin: también leer exige el permiso 'view' del modelo."""
    perms_map = {
        **permissions.DjangoModelPermissions.perms_map,
        "GET": ["%(app_label)s.view_%(model_name)s"],
    }
