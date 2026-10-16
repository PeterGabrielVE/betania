"""
Los roles con que viene el sistema y sus permisos iniciales. La migración 0014
los carga como filas de Rol; desde ahí (pantalla Roles y permisos) se les
cambian los permisos y se crean roles nuevos.

Cada permiso es "acción_modelo" de la app retiros (view_pago, add_persona...).
"""

from .models import Rol, RolSistema

VER = [
    "diocesis", "parroquia", "pais", "estado", "ciudad", "tiporetiro", "areaservicio",
    "persona", "retiro", "charla", "inscripcion", "participacion", "asignacionservicio",
    "pago", "gasto", "tarea",
]
EQUIPO = ["persona", "inscripcion", "participacion", "asignacionservicio", "tarea"]
# Lo que solo administra el superusuario o el super administrador.
DEFINIR_ROLES = {"add_rol", "change_rol", "delete_rol"}


def perms(acciones, modelos):
    return {f"{a}_{m}" for a in acciones for m in modelos}


COORDINACION = (
    perms(["view"], VER)
    | perms(["add", "change", "delete"], [*EQUIPO, "charla", "pago", "gasto"])
    | perms(["change"], ["retiro"])
)
TODOS = "*"  # todos los permisos de la app

# código -> (ámbito, ve datos confidenciales, permisos, descripción)
ROLES_SISTEMA = {
    RolSistema.SUPER_ADMIN: (
        Rol.Ambito.GLOBAL, True, TODOS,
        "Administra todo el sistema: todas las diócesis y parroquias, usuarios y roles."),
    RolSistema.ADMIN_DIOCESANO: (
        Rol.Ambito.DIOCESIS, True, TODOS,
        "Administra las parroquias de su diócesis (no define roles)."),
    RolSistema.COORD_PARROQUIA: (
        Rol.Ambito.PARROQUIA, True, COORDINACION | perms(["add"], ["retiro"]),
        "Coordina los retiros de su parroquia: caminantes, equipo, charlas y finanzas."),
    RolSistema.COORD_RETIRO: (
        Rol.Ambito.RETIRO, True, COORDINACION,
        "Coordina un retiro: caminantes, equipo, charlas, pagos y gastos."),
    RolSistema.LOGISTICA: (
        Rol.Ambito.RETIRO, True,
        perms(["view"], VER) | perms(["add", "change"], EQUIPO) | perms(["delete"], ["tarea"]),
        "Organiza caminantes, equipo y tareas; consulta pagos y gastos."),
    RolSistema.TESORERIA: (
        Rol.Ambito.PARROQUIA, False,
        perms(["view"], VER) | perms(["add", "change", "delete"], ["pago", "gasto"]),
        "Registra pagos y gastos de los retiros de su parroquia."),
    RolSistema.SECRETARIA: (
        Rol.Ambito.PARROQUIA, True,
        perms(["view"], [m for m in VER if m not in ("pago", "gasto")])
        | perms(["add", "change"], ["persona", "inscripcion"]),
        "Inscribe caminantes y mantiene los datos de las personas."),
    RolSistema.SERVIDOR: (
        Rol.Ambito.PARROQUIA_O_RETIRO, False,
        perms(["view"], ["retiro", "charla", "tarea", "participacion", "asignacionservicio",
                         "areaservicio", "tiporetiro"]) | perms(["change"], ["tarea"]),
        "Parte del equipo: ve el retiro, las charlas y sus tareas."),
}


def permisos_iniciales(codigo, todos_los_codenames):
    """Los codenames que le tocan a un rol del sistema."""
    _ambito, _sensibles, permisos, _ = ROLES_SISTEMA[codigo]
    if permisos == TODOS:
        quitar = DEFINIR_ROLES if codigo != RolSistema.SUPER_ADMIN else set()
        return set(todos_los_codenames) - quitar
    return set(permisos)
