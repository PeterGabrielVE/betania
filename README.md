# Betania

Sistema de gestión de retiros de Emaús y Samuel.

Proyecto Django + PostgreSQL (con Row-Level Security) listo para correr en Docker.

## Cómo correrlo

Necesitas Docker y Docker Compose instalados. Desde esta carpeta:

```bash
cp .env.example .env        # 1. crea tu archivo de entorno (ajusta si quieres)
docker compose up --build   # 2. construye y levanta app + base de datos (la primera vez)
```

Después basta con `docker compose up`: en desarrollo los cambios se ven al
guardar, sin reconstruir (ver "Modo desarrollo").

Al arrancar, el contenedor `web` espera a Postgres, corre las migraciones,
carga países, estados y ciudades (`python manage.py sembrar_geografia`, ver
`retiros/geografia.py`) y las áreas de servicio de Emaús (`python manage.py
sembrar_areas`, ver `retiros/areas.py`); ambos se pueden correr cuando sea, no
duplican nada. Después aplica las
políticas de RLS, recopila los estáticos y, la primera vez, crea un
superusuario.

Para ver el sistema con datos, carga la demo:

```bash
docker compose exec web python manage.py sembrar_demo            # la crea
docker compose exec web python manage.py sembrar_demo --borrar   # la rehace desde cero
```

Crea la parroquia "San José (demo)" con tres retiros (Emaús hombres #12 con
inscripciones abiertas, el #11 ya finalizado y Emaús mujeres #5 en planeación),
24 caminantes con datos de salud y contactos, 15 servidores con áreas, turnos y
camisas, pagos en dólares y bolívares, gastos, charlas y tareas. También crea
tres usuarios para entrar con cada rol, todos con la clave `demo-betania-123`:
`demo.coordinador` (coordinador del retiro), `demo.logistica` (coordinador de
logística) y `demo.tesoreria` (tesorería de la parroquia). `--borrar` solo
toca la parroquia de la demo y esas cuentas, nunca otros datos.

Cuando veas que arrancó, abre:

- **http://localhost:5173/** — el panel (React). Entra con `admin` / `admin1234`
  (los valores de `DJANGO_SUPERUSER_*` en tu `.env`). Si entras por
  http://localhost:8000/ te lleva ahí.
Todo se administra desde ese panel, en español: personas, retiros, equipo,
finanzas, catálogos, usuarios con su cuenta de acceso y roles, importar
personas de Excel y descargar cualquier tabla en Excel o PDF. El admin de
Django (http://localhost:8000/admin/) sigue disponible para el superusuario
como respaldo, pero el panel no lo enlaza ni hace falta.

Como superusuario obtienes el rol `super_admin`, así que ves y gestionas todo.

Para detener: `Ctrl+C`, y `docker compose down` (agrega `-v` para borrar también
la base de datos y empezar de cero).

## Modo desarrollo (recarga en caliente)

`docker compose up` carga además `docker-compose.override.yml`, que es el modo
desarrollo:

- **web** monta el código y usa el servidor de desarrollo de Django: al guardar
  un `.py` se reinicia solo. Al arrancar instala lo que falte de
  `requirements.txt` y aplica las migraciones.
- **frontend** corre Vite en http://localhost:5173: al guardar un `.tsx` o un
  `.css` la pantalla se actualiza sola. Reenvía `/api`, `/admin` y los PDF a
  `web`. Instala los paquetes de Node solo cuando cambia `package-lock.json`.

Solo hace falta reiniciar (`docker compose restart web`, sin `--build`) tras
crear una migración nueva o agregar un paquete a `requirements.txt`. Reconstruir
(`--build`) solo hace falta si cambia el `Dockerfile`.

En producción no se usa ese archivo:
`docker compose -f docker-compose.yml up -d --build` levanta gunicorn con el
frontend compilado dentro de la imagen, en el puerto 8000.

### Mantener vivo el servidor

- **Hosting gratuito que se duerme** (Render, Koyeb, Railway...): el workflow
  `.github/workflows/mantener-vivo.yml` consulta `GET /api/salud/` cada 10
  minutos, así la app no llega a dormirse y nadie espera el arranque en frío.
  Para activarlo, crea en GitHub la variable `URL_SERVIDOR` (Settings > Secrets
  and variables > Actions > Variables) con la dirección pública. Se puede
  probar a mano desde la pestaña Actions (*Run workflow*). Si el servidor no
  responde, el job falla y GitHub avisa por correo.
- **Servidor propio**: `docker-compose.yml` lleva `restart: unless-stopped`, así
  Docker vuelve a levantar la base y la app si se caen o si se reinicia el
  equipo. En desarrollo no (lo anula `docker-compose.override.yml`).

`/api/salud/` es público y liviano: responde `{"estado": "ok"}` (o 503 si la
base de datos no responde) sin abrir sesión ni leer datos; sirve también para
monitores externos como UptimeRobot.

Ojo: GitHub pausa los workflows programados de un repositorio público tras 60
días sin commits (se reactivan desde la pestaña Actions), y puede atrasar unos
minutos cada ejecución.

## Frontend (React + Tailwind)

Todo el front es una app React 19 + TypeScript + Vite + Tailwind CSS v4 en
`frontend/`, basada en la plantilla gratuita [TailAdmin](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard)
(licencia MIT). En desarrollo la sirve Vite (ver "Modo desarrollo"); en
producción, Django la sirve ya compilada en el mismo puerto: el `Dockerfile`
corre `npm run build` y copia `frontend/dist` a la imagen.

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

**Asistencia.** Un caminante (inscripción) se confirma o se cancela; un
servidor tiene su propio estado: por confirmar, confirmado o canceló. Al
cancelar se puede anotar el motivo, y se puede reactivar. Se hace sin abrir
formularios: botones Confirmar / Cancelar / Reactivar en el panel del retiro
y en la ficha de la persona, y casillas en Caminantes y Servidores para
confirmar o cancelar a varios a la vez. Quien cancela queda como historial
(con sus áreas y pagos) pero no cuenta en el cupo, en el equipo, en la
logística ni en lo que falta cobrar.

**Editar** una persona, un caminante o un servidor usa el mismo formulario por
pasos con que se registró (no el formulario genérico): `/personas/<id>/editar`,
`/inscribir?inscripcion=<id>` y `/registrar-servidor?participacion=<id>`, con
`?volver=<ruta>` para regresar al guardar. A ellos llevan el lápiz de los
listados, la ficha y el panel del retiro.

Los servidores se registran con su propio formulario por pasos
(`/registrar-servidor`: Identificación, Datos personales, Servicio y Confirmar),
que comparte con el de caminantes la identificación y los datos personales; en
Servicio se marcan sus áreas y cuáles coordina, y en Disponibilidad si dormirá
en la casa de retiro, los turnos del fin de semana en que puede servir (viernes
y sábado mañana/tarde/noche, domingo mañana/tarde, o el día completo) y la
camisa que necesita (azul, blanca o polo de la Rosa) con su talla. El panel del
retiro resume la logística del equipo: cuántos duermen, cuántos hay por turno
y cuántas camisas encargar por tipo y talla.

Permisos y confidencialidad:

- La API usa la sesión de Django, así que el RLS aplica igual que en el admin.
- Cada acción exige el permiso de modelo de Django correspondiente (ver,
  agregar, cambiar, eliminar), igual que el admin. El superusuario los tiene todos.
- Los campos confidenciales (salud, contacto de emergencia, datos sensibles)
  solo viajan para los roles de `rol_datos_sensibles()`.
- Lo que sale de las finanzas (columnas de pago, sección de finanzas del panel)
  solo se muestra con permiso para ver pagos.
- El PDF de confirmados exige sesión y permiso para ver inscripciones.
- Los demás usuarios obtienen sus permisos de su rol (ver "Roles, permisos y acceso" más abajo).

**Importar personas** (Personas → Importar): sube un Excel o CSV (hay una
plantilla para descargar); primero muestra cuántas son nuevas, cuántas se
actualizan y los errores por fila, y solo guarda al confirmar. No duplica:
casa por documento, correo o teléfono. Si el archivo no trae la parroquia, usa
la que fija el rol de quien importa.

Para desarrollar el frontend fuera de Docker (Node 20+), con el backend
corriendo en el puerto 8000 y el servicio `frontend` detenido:

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, reenvía /api y /admin a Django
```

## Roles, permisos y acceso

Cada usuario entra con su propia cuenta y puede hacer lo que digan sus roles.
Los roles se administran en **Personas → Roles y permisos**:

- **Crear, cambiar y eliminar roles**: nombre, descripción, dónde se asigna
  (todo el sistema, una diócesis, una parroquia, un retiro, o parroquia o
  retiro) y si ve datos confidenciales (salud, tratamiento, comida especial,
  contactos y familia).
- **Permisos** (el candado de cada rol): una tabla con cada módulo y sus
  acciones (ver, agregar, cambiar, eliminar). Marcar agregar, cambiar o
  eliminar marca también ver. Quien puede ver pagos o gastos ve también las
  finanzas del retiro.
- **Asignarlos** en **Personas → Asignar roles**: usuario, rol y su diócesis,
  parroquia o retiro, según el rol.

Dónde se asigna el rol decide además qué ve: uno global, todo; uno de
diócesis, sus parroquias; uno de parroquia, su parroquia; uno de retiro, su
parroquia y solo los retiros de ese tipo (p. ej. Emaús hombres). Esto lo
aplica también la base de datos (RLS).

El sistema trae ocho roles (super administrador, administrador diocesano,
coordinador de parroquia, coordinador de retiro, coordinador de logística,
tesorería, secretaría y servidor) con permisos iniciales (ver
`retiros/roles.py`); se les pueden cambiar los permisos, pero no eliminar. Un
rol asignado a alguien tampoco se elimina hasta quitárselo. Quien no es
superusuario solo puede dar permisos que él mismo tiene.

Para dar acceso a alguien, desde el panel:

1. **Personas → Usuarios → Agregar usuario**: elige su persona.
2. En su fila, la **llave**: escribe el nombre de usuario y la contraseña (o
   «Generar» una). Al guardar se muestra para anotarla y dársela.
3. **Personas → Asignar roles → Agregar**: su rol (p. ej. *Coordinador de
   logística*) y el retiro o la parroquia.

Desactivar al usuario le impide entrar; borrarlo borra también su cuenta.

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

## Filtros de Personas, Caminantes y Servidores

Además de la búsqueda y los filtros rápidos, estos listados tienen un botón
**Filtros** que abre un panel lateral (se aplican también a las descargas):

- **Personas:** edad, mes de cumpleaños, país/estado/ciudad, tipo de
  documento, fecha de registro, si ha sido caminante o ha servido, si
  participó en un retiro y si tiene usuario del sistema.
- **Caminantes:** fecha de inscripción, tipo de retiro, estado del pago, si lo
  invitó alguien, consentimiento, edad, cumpleaños, procedencia y —para quien
  ve datos confidenciales— condición médica, tratamiento, alimentación
  especial, requerimientos, talla y familiar de contacto.
- **Servidores:** fecha de registro, tipo de retiro, área, si coordina o no
  tiene área, estado del pago, si duerme en la casa, turnos, camisa y talla,
  edad, cumpleaños y procedencia.

Lo aplicado se ve como etiquetas bajo los filtros; cada una se quita con su
×. Los filtros se declaran en `retiros/api/filtros.py` (`Modulo.avanzados`).

## Leer planillas en papel (OCR)

En **Inscribir caminante** y **Registrar servidor**, el botón **Leer planilla**
lee la foto (con la cámara del celular) o el PDF escaneado de la planilla y
propone sus datos: nombres y apellidos, cédula, fecha de nacimiento,
teléfonos, correo, estado y ciudad, estado civil, sacramentos, salud, talla,
el familiar de contacto y, en servidores, áreas, turnos y camisa. Se ve cada
dato con la confianza de la lectura y se elige qué usar; después todo queda en
los pasos del formulario para revisarlo. Si la cédula ya está registrada, se
conservan sus datos guardados y la planilla solo completa lo vacío.

En **Personas**, **Caminantes** y **Servidores**, **Leer listado** lee la foto de
una hoja tabulada (como el "Listado de caminantes" o el "Control de pago
servidores"): reconoce las columnas por sus encabezados, muestra una tabla
para corregir y carga las filas al retiro elegido, sin duplicar personas.

El OCR es **Tesseract, en el propio servidor**: las fotos no salen a ningún
servicio externo. Lee bien la letra de molde y el texto impreso; con letra
cursiva se equivoca más, por eso todo se revisa antes de guardar. La lógica
está en `retiros/ocr/` (las etiquetas que reconoce, en `planilla.py`).

## Seguridad del acceso

- **Límite de intentos**: 5 contraseñas equivocadas para un mismo usuario (o
  20 desde una misma IP, contra cualquier usuario) en 15 minutos bloquean el
  acceso por 15 minutos, aunque después se escriba la correcta. Vale para el
  panel y para el admin de Django, y también para usuarios que no existen (así
  no se puede averiguar cuáles hay). Al quedar 2 intentos se avisa, y el
  bloqueo queda en la auditoría. En **Usuarios → llave** se ve el bloqueo y se
  puede quitar. Los límites se ajustan en el `.env` (ver `.env.example`).
- **Inactividad**: tras 15 minutos sin usar el sistema (ratón, teclado,
  toques) la sesión se cierra. A los 13 minutos aparece «¿Sigues ahí?» con la
  cuenta regresiva y los botones *Seguir conectado* y *Cerrar sesión*. Las
  actualizaciones automáticas del tablero no cuentan como actividad; si se
  trabaja en un formulario largo sin guardar, la app avisa sola al servidor.
  La actividad en una pestaña cuenta para todas, y el servidor aplica el mismo
  límite aunque la pestaña esté dormida. Se ajusta con
  `SESION_INACTIVIDAD_MINUTOS` en el `.env`.
- **Sesión**: además se cierra al cerrar el navegador y, como tope, 8 horas
  después de la última petición; al vencer, la app lleva a iniciar sesión y
  luego vuelve a la misma página. Cambiar la contraseña cierra las demás
  sesiones abiertas.
- **Contraseñas**: al menos 10 caracteres, que no sean solo números, ni
  comunes, ni parecidas al usuario.
- **Cabeceras**: el sitio no se puede incrustar en otros (contra clickjacking),
  el navegador no adivina tipos de archivo y no se envía la dirección a sitios
  externos. Con `HTTPS=1`, además, cookies solo cifradas y HSTS.

Detrás de un proxy, pon `PROXY_CONFIABLE=1` para que el límite por IP use la
IP real de cada visitante y no la del proxy (que bloquearía a todos juntos).

## Auditoría

**Sistema → Auditoría** muestra quién hizo qué y cuándo, con su IP:

- Altas, cambios y bajas de todos los módulos, con el antes y el después de
  cada campo («Ver detalle»). Los permisos que se dan o quitan a un rol.
- Ingresos, salidas e intentos fallidos de inicio de sesión (con el usuario
  intentado; la clave nunca se guarda).
- **No** se registra cuando un super administrador (superusuario o rol de
  alcance global) entra o sale. Sus cambios a los datos sí.
- Los datos confidenciales (salud, contactos, familia) y las contraseñas no se
  copian: solo se anota que cambiaron.
- Filtros por acción, módulo y fechas, búsqueda y descarga en Excel o PDF.

No se puede editar ni borrar, ni desde la API ni en la base de datos (las
políticas de RLS de la tabla solo permiten insertar y leer). La ve quien tenga
el permiso «Ver auditoría» (al inicio, el super administrador, que ve todo, y
el administrador diocesano, que ve lo de su diócesis). Las cargas masivas
(`sembrar_demo`, `sembrar_geografia`, `sembrar_areas`) no dejan registro.

Detrás de un proxy (nginx…) pon `PROXY_CONFIABLE=1` para registrar la IP real
del visitante; si no, se usa la de la conexión (ese encabezado lo podría
inventar cualquiera).

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
