from rest_framework import permissions

# Mismos roles que rol_datos_sensibles() en rls_policies.sql.
ROLES_DATOS_SENSIBLES = {
    "coord_parroquia", "coord_retiro", "logistica", "secretaria", "admin_diocesano",
    "super_admin",
}


def ve_sensibles(request):
    return getattr(request, "rls_rol", "") in ROLES_DATOS_SENSIBLES


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
