"""
API JSON que consume el frontend React (frontend/).

    modulos.py   Qué módulos hay: campos, columnas, filtros. Lo que se edita a diario.
    registro.py  Con qué se declara un módulo (Modulo, Extra, sub).
    vistas.py    Serializer y ViewSet genéricos de cada módulo, y /api/esquema/.
    paneles.py   Vistas de solo lectura: resumen de inicio y panel de un retiro.
    sesion.py    Login, logout y usuario actual.
    permisos.py  Permisos de modelo y quién ve los datos confidenciales.
    urls.py      Rutas de /api/.

Seguridad:
- Sesión de Django (la misma cookie del admin), así que RLSContextMiddleware fija
  el contexto y el RLS por fila aplica igual que en el back-office.
- Permisos de modelo de Django (ver/agregar/cambiar/eliminar), como en el admin.
- Los campos confidenciales (Modulo.sensibles) solo viajan para los roles de
  rol_datos_sensibles() en rls_policies.sql.
"""
