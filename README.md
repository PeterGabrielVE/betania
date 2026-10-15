# Betania

Sistema de gestión de retiros de Emaús y Samuel.

Proyecto Django + PostgreSQL (con Row-Level Security) listo para correr en Docker.

## Cómo correrlo

Necesitas Docker y Docker Compose instalados. Desde esta carpeta:

```bash
cp .env.example .env        # 1. crea tu archivo de entorno (ajusta si quieres)
docker compose up --build   # 2. construye y levanta app + base de datos
```

Al arrancar, el contenedor `web` espera a Postgres, corre las migraciones,
carga países, estados y ciudades (`python manage.py sembrar_geografia`, ver
`retiros/geografia.py`) y las áreas de servicio de Emaús (`python manage.py
sembrar_areas`, ver `retiros/areas.py`); ambos se pueden correr cuando sea, no
duplican nada. Después aplica las
políticas de RLS, recopila los estáticos y, la primera vez, crea un
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

El formulario de caminantes va por pasos (Retiro, Datos personales, Familia y
fe, Salud, Contactos y Confirmar). Cada paso se valida antes de seguir, con
[zod](https://zod.dev) y [react-hook-form](https://react-hook-form.com); las
reglas (qué es obligatorio, teléfonos, correo, edad, pareja si está casado,
consentimiento…) están en `frontend/src/components/inscripcion/esquema.ts`.
Los pasos de datos confidenciales solo aparecen a quien puede verlos.

Cada persona se identifica por su documento: cédula venezolana (V), cédula de
extranjero (E) o pasaporte. No se puede repetir, y al escribirlo en el primer
paso, si ya está registrada, sus datos se cargan solos. El celular se elige por
operadora (0412, 0414, 0416, 0422, 0424, 0426) o "Otro país", y se guarda como
`0414-1234567` o con su código (`+57 300 1234567`). La edad mínima es 18 años.

Nombres y apellidos van por separado (primer y segundo nombre, primer y segundo
apellido); el nombre completo se arma solo al guardar. Si la ciudad no está en
la lista se elige «Otra ciudad» y se escribe; para otro país, estado/provincia
y ciudad se escriben a mano.

No se registran duplicados: el documento no se repite, tampoco una persona sin
documento con el mismo nombre y fecha de nacimiento que otra, nadie se inscribe
dos veces en un retiro ni está dos veces en su equipo, y quien es caminante de
un retiro no puede ser servidor de ese mismo retiro (ni al revés).

Los servidores se registran con su propio formulario por pasos
(`/registrar-servidor`: Identificación, Datos personales, Servicio y Confirmar),
que comparte con el de caminantes la identificación y los datos personales; en
Servicio se marcan sus áreas y cuáles coordina.

Permisos y confidencialidad:

- La API usa la sesión de Django, así que el RLS aplica igual que en el admin.
- Cada acción exige el permiso de modelo de Django correspondiente (ver,
  agregar, cambiar, eliminar), igual que el admin. El superusuario los tiene todos.
- Los campos confidenciales (salud, contacto de emergencia, datos sensibles)
  solo viajan para los roles de `rol_datos_sensibles()`.
- Lo que sale de las finanzas (columnas de pago, sección de finanzas del panel)
  solo se muestra con permiso para ver pagos.
- El PDF de confirmados exige sesión y permiso para ver inscripciones.
- Los demás usuarios obtienen sus permisos de su rol (ver "Acceso de
  coordinación y logística" más abajo).

Importar/Exportar Excel sigue estando solo en `/admin/`.

Para desarrollar el frontend con recarga en caliente (Node 20+), con el backend
corriendo en el puerto 8000:

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, reenvía /api y /admin a Django
```

## Acceso de coordinación y logística

Coordinación y logística entran al mismo panel con su propio usuario. Los
permisos salen del rol (`retiros/acceso.py`); no hay que marcarlos uno por uno.

| Rol | Ve | Edita |
| --- | --- | --- |
| Coordinador de retiro / de parroquia | Todo el retiro: ficha de cada caminante (salud, tratamiento, comida, requerimientos, contactos), equipo y finanzas | Caminantes, equipo, charlas, tareas, **pagos** y gastos |
| Coordinador de logística | Lo mismo | Caminantes, equipo y tareas; pagos y gastos solo los consulta |

Para dar acceso a alguien, en `/admin/`:

1. **Users → Add**: crea su usuario y contraseña (no hace falta marcar "staff").
2. **Usuarios → Add**: elige su persona y, en **Cuenta**, el usuario del paso 1.
   En la misma pantalla, agrega su rol (p. ej. *Coordinador de logística*) y el
   retiro.

El rol también fija lo que se ve: un coordinador de parroquia solo ve los
retiros de su parroquia, y uno de retiro o de logística, además, solo los de su
tipo (p. ej. Emaús hombres). En el listado de retiros esos filtros aparecen
bloqueados (con un candado), y el inicio y el panel aplican el mismo límite. Para agregar
otro campo así, se agrega a `por_ambito` del módulo en `retiros/api/modulos.py`.

Luego se le comparte el enlace del panel del retiro (`/retiros/<id>`): ahí ven
qué caminante y qué servidor debe, cuánto ha pagado cada uno y la ficha
completa de cada caminante. El panel se actualiza solo cada 30 segundos (y al
volver a la pestaña), así que un pago o un cambio que registre otro aparece sin
recargar.

Lo que paga un servidor se registra en **Pagos** con su nombre en *Persona*
(concepto "Aportación de servidor"); lo que debe sale de la **cuota del
servidor** del retiro. Para la cuota de un caminante basta elegir su nombre: el
pago se liga solo a su inscripción.

## Personas: caminantes, servidores y acceso

El menú **Personas** junta todo lo de la gente: Personas, Caminantes (las
inscripciones, con "Inscribir caminante"), Servidores (con sus áreas y
"Registrar servidor"), Usuarios y Roles. **Retiros** queda con Retiros, Charlas
y Tareas.

Cada persona tiene su **ficha** (`/personas/<id>`, `GET /api/personas/<id>/ficha/`):
sus datos, sus retiros como caminante (estado, quién lo invitó, pagos), como
servidor (áreas y cuáles coordina, aportes; las áreas se editan ahí mismo), a
quién invitó, sus tareas pendientes y su acceso al sistema. Desde la ficha se
la puede inscribir en un retiro o registrar como servidor con sus datos ya
cargados. Se llega desde Personas, Caminantes, Servidores y el panel de un
retiro.

## Preferencias de cada usuario

En el encabezado cada usuario elige la **edición** (el retiro) con la que
trabaja y la **moneda** en que ve los montos. Se guardan en el servidor para
ese usuario (modelo `Preferencias`, `PATCH /api/auth/preferencias/`), así que lo
siguen en cualquier equipo. La edición elegida va por defecto en el tablero,
en los formularios de caminante y servidor, en el campo "Retiro" al crear y en
el filtro "Retiro" de los listados (que se puede quitar). Los montos se guardan
siempre en la moneda base (`MONEDA`) y solo se *muestran* convertidos con la
tasa BCV del día; un pago se sigue viendo en la moneda en que se hizo. Sin
tasa del BCV, se muestran en la moneda base y el selector lo avisa.

## Tablero (página de inicio)

El inicio muestra el tablero de un retiro: por omisión el próximo (o el que está
en curso), y se cambia con el selector de arriba (`/?retiro=<id>`, un enlace que
se puede compartir). Se actualiza solo cada 30 segundos, como el panel.

- Cuenta regresiva al retiro, caminantes inscritos contra el cupo, asistencia
  confirmada y por confirmar, servidores, cuánto falta por cobrar y tareas
  pendientes (con las vencidas).
- Gráficas: caminantes por estado, cuotas de caminantes y de servidores
  (pagado / parcial / sin pago), recaudación acumulada contra lo esperado en
  cuotas, gastos por categoría y servidores por área.
- **Pendientes:** las tareas más urgentes y los avisos que salen solos de los
  datos (caminantes por confirmar o que deben, sin familiar de contacto o sin
  consentimiento, servidores que deben o sin área, charlas sin expositor).
- **Cumpleaños** de caminantes y servidores en los próximos 30 días y los que
  caen durante el retiro.
- **Accesos rápidos:** inscribir caminante, registrar pago o gasto, nueva tarea,
  panel del retiro, lista PDF, etc. (solo los que el rol permite).

Las tareas se gestionan en el módulo **Tareas** (menú Retiros): título, retiro,
área, responsable, fecha límite y si ya está hecha.

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
  tasas.py       Tasa oficial del BCV (dólar y euro)
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

- **RLS y el rol de conexión.** El usuario `retiros` del `docker-compose.yml` es
  superusuario de Postgres, y un superusuario se salta el RLS aunque haya
  `FORCE ROW LEVEL SECURITY`: en local las políticas **no** filtran. **En
  producción**, conecta la app con un rol que no sea superusuario ni dueño de las
  tablas (con `GRANT` sobre ellas); así las políticas sí aplican.
- **Formulario público de inscripción.** Todavía no está; el siguiente paso son
  las páginas públicas con HTMX y las políticas `WITH CHECK` para los INSERT.
- **Migraciones.** Están versionadas en `retiros/migrations/` y el entrypoint
  solo las aplica. Tras cambiar `models.py`, genera la nueva con
  `python manage.py makemigrations retiros` (con el código montado, ver "Modo
  desarrollo") y guárdala en el repositorio.
- **Monedas.** Los pagos y gastos se registran en bolívares, dólares o euros.
  `MONEDA` (en `.env`, por defecto `USD`) es la moneda base: en ella van las
  cuotas y todos los totales. Un movimiento en otra moneda guarda su tasa de
  cambio (cuántas unidades equivalen a 1 de la base, p. ej. Bs por dólar) y su
  equivalente. Si la tasa se deja vacía se toma la oficial del BCV de ese
  momento, consultada a [DolarApi](https://ve.dolarapi.com) (`retiros/tasas.py`;
  el contenedor necesita salida a internet). Si la consulta falla, el
  formulario pide escribirla. Cambiar `MONEDA` con movimientos ya registrados
  no los recalcula.
- **País.** `TIME_ZONE` y `REGION` (formato de montos y fechas) también se
  fijan en `.env`; ver `.env.example`.
- **Producción.** `DEBUG=0` exige un `SECRET_KEY` propio; define también
  `ALLOWED_HOSTS` y `HTTPS=1`.
- **Nombre y logo.** El logo es `frontend/public/images/logo/betania.svg`
  (también es el icono de la pestaña); para cambiarlo basta reemplazar ese
  archivo. El nombre se dibuja en `frontend/src/components/common/Logo.tsx`.
- **Plantilla.** Las páginas de ejemplo de TailAdmin ya no están en el menú ni
  en las rutas, pero sus archivos siguen en `frontend/src` como referencia.
