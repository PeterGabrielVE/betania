# Sistema de gestión de retiros

Proyecto Django + PostgreSQL (con Row-Level Security) listo para correr en Docker.

## Cómo correrlo

Necesitas Docker y Docker Compose instalados. Desde esta carpeta:

```bash
cp .env.example .env        # 1. crea tu archivo de entorno (ajusta si quieres)
docker compose up --build   # 2. construye y levanta app + base de datos
```

Al arrancar, el contenedor `web` espera a Postgres, corre las migraciones,
aplica las políticas de RLS, recopila los estáticos y, la primera vez, crea un
superusuario.

Cuando veas que arrancó, abre:

- **http://localhost:8000/** — el panel (React). Entra con `admin` / `admin1234`
  (los valores de `DJANGO_SUPERUSER_*` en tu `.env`).
- **http://localhost:8000/admin/** — el admin de Django, con el mismo usuario.

Como superusuario obtienes el rol `super_admin`, así que ves y gestionas todo:
parroquias, personas, retiros, inscripciones, servidores por área y finanzas.
Los botones de Importar/Exportar Excel de Personas e Inscripciones están en el admin.

Para detener: `Ctrl+C`, y `docker compose down` (agrega `-v` para borrar también
la base de datos y empezar de cero).

## Modo desarrollo (recarga en caliente)

En `docker-compose.yml`, descomenta en el servicio `web` las líneas de `volumes`
y `command` para montar el código y usar `runserver`. Así los cambios de Python
se reflejan sin reconstruir la imagen. Al montar el código, el frontend
compilado de la imagen queda oculto: corre `npm run build` en `frontend/`.

## Frontend (React + Tailwind)

Todo el front es una app React 19 + TypeScript + Vite + Tailwind CSS v4 en
`frontend/`, basada en la plantilla gratuita [TailAdmin](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard)
(licencia MIT). Django la sirve ya compilada en el mismo puerto: el `Dockerfile`
corre `npm run build` y copia `frontend/dist` a la imagen, así que tras cambiar
el frontend hay que volver a correr `docker compose up --build`.

Cada módulo (retiros, inscripciones, participaciones, servidores por área,
charlas, personas, usuarios, roles, pagos, gastos y los catálogos) se declara
una sola vez en `MODULOS`, en `retiros/api/modulos.py`. De ahí salen:

| Ruta | Qué devuelve |
| --- | --- |
| `/api/auth/sesion/`, `login/`, `logout/` | Sesión de Django (la misma del admin) |
| `/api/esquema/` | Módulos visibles para el usuario: campos, columnas, filtros y permisos |
| `/api/<módulo>/` y `/api/<módulo>/<id>/` | Listar (`?search=`, `?page=`, filtros), crear, editar y borrar |
| `/api/resumen/` | Totales para la página de inicio |
| `/api/retiros/<id>/panel/` | Todo lo de un retiro: caminantes y su pago, equipo por área, charlas y finanzas |

El frontend dibuja el menú, las tablas y los formularios a partir de
`/api/esquema/`: para agregar un módulo o un campo basta con tocar `MODULOS`.
Las dos pantallas hechas a mano son el panel de un retiro (`/retiros/<id>`, se
abre al hacer clic en un retiro) y el formulario de caminantes (`/inscribir`).

Permisos y confidencialidad:

- La API usa la sesión de Django, así que el RLS aplica igual que en el admin.
- Cada acción exige el permiso de modelo de Django correspondiente (ver,
  agregar, cambiar, eliminar), igual que el admin. El superusuario los tiene todos.
- Los campos confidenciales (salud, contacto de emergencia, datos sensibles)
  solo viajan para los roles de `rol_datos_sensibles()`.
- Lo que sale de las finanzas (columnas de pago, sección de finanzas del panel)
  solo se muestra con permiso para ver pagos.
- El PDF de confirmados exige sesión y permiso para ver inscripciones.
- Un usuario que no es superusuario todavía no ve datos: falta el TODO de
  `retiros/middleware.py`.

Importar/Exportar Excel sigue estando solo en `/admin/`.

Para desarrollar el frontend con recarga en caliente (Node 20+), con el backend
corriendo en el puerto 8000:

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, reenvía /api y /admin a Django
```

## Pruebas

```bash
docker compose exec web python manage.py test
```

Cubren la API, el panel de un retiro, el PDF y la importación de personas.
Corren sin las políticas de RLS (esas las aplica el entrypoint, no las
migraciones), así que no prueban el aislamiento por parroquia.

## Estructura

```
frontend/src/
  pages/Retiros/       Inicio, listado de un módulo, panel de un retiro, inscribir caminante
  components/modulos/  Formularios y selectores dibujados a partir del esquema
  components/retiros/  Piezas propias de las pantallas de retiros
  api/client.ts        Cliente de la API y tipos
config/          Proyecto Django (settings, urls, wsgi)
retiros/
  models.py      Modelo de datos (parroquia = inquilino) y sus validaciones
  admin.py       Back-office, filtros a medida e import/export Excel
  api/
    modulos.py   MODULOS: campos, columnas y filtros de cada módulo
    registro.py  Con qué se declara un módulo (Modulo, Extra, sub)
    vistas.py    CRUD genérico de cada módulo y /api/esquema/
    paneles.py   Resumen de inicio y panel de un retiro
    sesion.py    Login, logout y usuario actual
    permisos.py  Permisos de modelo y acceso a datos confidenciales
  reportes.py    Recursos de Excel y lista de confirmados en PDF
  middleware.py  Fija el contexto de RLS por petición
  migrations/    Migraciones versionadas
  sql/           Políticas de Row-Level Security (idempotentes)
  templates/     Plantilla del PDF imprimible
  tests.py
Dockerfile
docker-compose.yml
entrypoint.sh    Migra, aplica RLS, colecta estáticos, arranca
```

## Notas importantes

- **RLS y el rol de conexión.** En local, la app se conecta como el dueño de las
  tablas y el `FORCE ROW LEVEL SECURITY` hace que las políticas apliquen igual;
  el superusuario las atraviesa vía el middleware. **En producción**, conecta la
  app con un rol que **no** sea dueño de las tablas.
- **Usuarios no superadmin.** El middleware ya deja lista la estructura, pero
  falta enlazar `auth.User` con tu modelo `Usuario`/`AsignacionRol` para resolver
  su rol y parroquia activa (marcado como TODO en `retiros/middleware.py`).
- **Formulario público de inscripción.** Todavía no está; el siguiente paso son
  las páginas públicas con HTMX y las políticas `WITH CHECK` para los INSERT.
- **Migraciones.** Están versionadas en `retiros/migrations/` y el entrypoint
  solo las aplica. Tras cambiar `models.py`, genera la nueva con
  `python manage.py makemigrations retiros` (con el código montado, ver "Modo
  desarrollo") y guárdala en el repositorio.
- **Monedas.** Los pagos y gastos se registran en bolívares, dólares o euros.
  `MONEDA` (en `.env`, por defecto `USD`) es la moneda base: en ella van las
  cuotas y todos los totales. Un movimiento en otra moneda pide su tasa de
  cambio (cuántas unidades equivalen a 1 de la base, p. ej. Bs por dólar) y
  guarda su equivalente. Cambiar `MONEDA` con movimientos ya registrados no
  los recalcula.
- **País.** `TIME_ZONE` y `REGION` (formato de montos y fechas) también se
  fijan en `.env`; ver `.env.example`.
- **Producción.** `DEBUG=0` exige un `SECRET_KEY` propio; define también
  `ALLOWED_HOSTS` y `HTTPS=1`.
- **Plantilla.** Las páginas de ejemplo de TailAdmin ya no están en el menú ni
  en las rutas, pero sus archivos siguen en `frontend/src` como referencia.
