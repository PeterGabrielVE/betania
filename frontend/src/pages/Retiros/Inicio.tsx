import { type Resumen, type Tablero } from "@/api/client";
import PageMeta from "@/components/common/PageMeta";
import {
  claseControl,
  claseEnlace,
  claseTarjeta,
} from "@/components/modulos/estilos";
import Actualizacion from "@/components/retiros/Actualizacion";
import {
  BarrasHorizontales,
  GraficaRecaudacion,
  Medidor,
} from "@/components/retiros/Graficas";
import Metrica from "@/components/retiros/Metrica";
import {
  AnilloConfirmados,
  FichasPorEstado,
  Indicadores,
  Tesoreria,
} from "@/components/retiros/ResumenCaminantes";
import Badge from "@/components/ui/badge/Badge";
import { useAuth } from "@/context/AuthContext";
import { useDatosVivos } from "@/hooks/useDatosVivos";
import {
  BoxIconLine,
  CalenderIcon,
  CheckCircleIcon,
  DollarLineIcon,
  DownloadIcon,
  GroupIcon,
  ListIcon,
  PageIcon,
  PlusIcon,
  TaskIcon,
  UserIcon,
} from "@/icons";
import { colorEstado, dinero, fecha } from "@/utils/formato";
import { Link, useSearchParams } from "react-router";

const claseTitulo = "text-lg font-semibold text-gray-800 dark:text-white/90";
const claseVacio = "text-sm text-gray-500 dark:text-gray-400";

const diaYMes = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function Tarjeta({
  titulo,
  enlace,
  className = "",
  children,
}: {
  titulo: string;
  enlace?: { a: string; texto: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${claseTarjeta} ${className}`}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className={claseTitulo}>{titulo}</h3>
        {enlace && (
          <Link to={enlace.a} className={`text-sm ${claseEnlace}`}>
            {enlace.texto}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

// Cuenta regresiva: "148 días", "¡Empieza hoy!", "En curso" o "Finalizado".
function cuentaRegresiva(t: Tablero): { valor: string; detalle: string } {
  const { retiro, dias_para_inicio: inicio, dias_para_fin: fin } = t;
  if (inicio > 0) {
    return {
      valor: `${inicio} ${inicio === 1 ? "día" : "días"}`,
      detalle: `Empieza el ${fecha(retiro.fecha_inicio)}`,
    };
  }
  if (inicio === 0) {
    return { valor: "¡Empieza hoy!", detalle: retiro.sede || retiro.etiqueta };
  }
  if (fin >= 0) {
    const total = fin - inicio + 1;
    return { valor: "En curso", detalle: `Día ${1 - inicio} de ${total}` };
  }
  return {
    valor: "Finalizado",
    detalle: `Hace ${-fin} ${fin === -1 ? "día" : "días"}`,
  };
}

function AccesoRapido({
  a,
  icono,
  texto,
  externo,
  state,
}: {
  a: string;
  icono: React.ReactNode;
  texto: string;
  externo?: boolean; // lo sirve Django (un PDF), no React Router
  state?: unknown;
}) {
  const clase =
    "flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-theme-sm font-medium text-gray-700 hover:border-brand-300 hover:bg-brand-25 dark:border-gray-800 dark:text-gray-300 dark:hover:border-brand-500/40 dark:hover:bg-white/5";
  const contenido = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-white/90">
        {icono}
      </span>
      {texto}
    </>
  );
  return externo ? (
    <a href={a} className={clase}>
      {contenido}
    </a>
  ) : (
    <Link to={a} state={state} className={clase}>
      {contenido}
    </Link>
  );
}

function TableroRetiro({ t }: { t: Tablero }) {
  const { modulos } = useAuth();
  const modulo = (slug: string) => modulos.find((m) => m.slug === slug);
  const puedeAgregar = (slug: string) => !!modulo(slug)?.puede_agregar;
  const { retiro, caminantes, servidores, finanzas, tareas } = t;
  const cuenta = cuentaRegresiva(t);
  const conCuotaServidor = retiro.cuota_servidor > 0;
  const porCobrar =
    (caminantes?.por_cobrar ?? 0) +
    (conCuotaServidor ? (servidores?.por_cobrar ?? 0) : 0);
  // Lo que se espera reunir en cuotas: lo ya cobrado más lo que falta.
  const esperado =
    caminantes?.recaudado !== undefined
      ? caminantes.recaudado +
        porCobrar +
        (conCuotaServidor ? (servidores?.recaudado ?? 0) : 0)
      : undefined;

  const accesos = [
    puedeAgregar("personas") &&
      puedeAgregar("inscripciones") && {
        a: "/inscribir",
        icono: <UserIcon className="size-5" />,
        texto: "Inscribir caminante",
        state: { retiro: { id: retiro.id, etiqueta: retiro.etiqueta } },
      },
    puedeAgregar("personas") &&
      puedeAgregar("participaciones") &&
      puedeAgregar("servicios") && {
        a: "/registrar-servidor",
        icono: <GroupIcon className="size-5" />,
        texto: "Registrar servidor",
        state: { retiro: { id: retiro.id, etiqueta: retiro.etiqueta } },
      },
    puedeAgregar("pagos") && {
      a: "/pagos?nuevo=1",
      icono: <DollarLineIcon className="size-5" />,
      texto: "Registrar pago",
    },
    puedeAgregar("gastos") && {
      a: "/gastos?nuevo=1",
      icono: <BoxIconLine className="size-5" />,
      texto: "Registrar gasto",
    },
    puedeAgregar("tareas") && {
      a: "/tareas?nuevo=1",
      icono: <PlusIcon className="size-5" />,
      texto: "Nueva tarea",
    },
    {
      a: `/retiros/${retiro.id}`,
      icono: <PageIcon className="size-5" />,
      texto: "Panel del retiro",
    },
    caminantes && {
      a: `/retiros/${retiro.id}/lista.pdf`,
      icono: <DownloadIcon className="size-5" />,
      texto: "Lista de confirmados",
      externo: true,
    },
    modulo("tareas") && {
      a: "/tareas",
      icono: <TaskIcon className="size-5" />,
      texto: "Ver tareas",
    },
    modulo("participaciones") && {
      a: "/participaciones",
      icono: <GroupIcon className="size-5" />,
      texto: "Servidores",
    },
    modulo("charlas") && {
      a: "/charlas",
      icono: <ListIcon className="size-5" />,
      texto: "Charlas",
    },
  ].filter((a) => !!a);

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {/* Cifras principales */}
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3 2xl:grid-cols-6">
        <Metrica
          icono={<CalenderIcon className="size-6" />}
          etiqueta={
            t.dias_para_inicio > 0 ? "Faltan para el retiro" : "El retiro"
          }
          valor={cuenta.valor}
          detalle={cuenta.detalle}
        />
        {caminantes && (
          <Metrica
            icono={<UserIcon className="size-6" />}
            etiqueta="Caminantes inscritos"
            valor={`${caminantes.inscritos} / ${retiro.cupo}`}
            detalle={`${caminantes.disponibles} lugares disponibles`}
          >
            <Medidor
              valor={caminantes.inscritos}
              maximo={retiro.cupo}
              descripcion="Cupo ocupado"
            />
          </Metrica>
        )}
        {caminantes && (
          <Metrica
            icono={<CheckCircleIcon className="size-6" />}
            etiqueta="Asistencia confirmada"
            valor={caminantes.confirmados}
            detalle={`${caminantes.por_confirmar} por confirmar`}
          >
            <Medidor
              valor={caminantes.confirmados}
              maximo={caminantes.inscritos}
              descripcion="Confirmados de los inscritos"
            />
          </Metrica>
        )}
        {servidores && (
          <Metrica
            icono={<GroupIcon className="size-6" />}
            etiqueta="Servidores"
            valor={servidores.total}
            detalle={`${servidores.por_area.length} áreas · ${servidores.coordinadores} en coordinación`}
          />
        )}
        {caminantes?.por_cobrar !== undefined && (
          <Metrica
            icono={<DollarLineIcon className="size-6" />}
            etiqueta="Por cobrar"
            valor={dinero(porCobrar)}
            detalle={
              conCuotaServidor
                ? `Caminantes ${dinero(caminantes.por_cobrar)} · Servidores ${dinero(servidores?.por_cobrar ?? 0)}`
                : "De cuotas de caminantes"
            }
          >
            {esperado !== undefined && (
              <Medidor
                valor={esperado - porCobrar}
                maximo={esperado}
                descripcion="Cuotas cobradas"
              />
            )}
          </Metrica>
        )}
        {tareas && (
          <Metrica
            icono={<TaskIcon className="size-6" />}
            etiqueta="Tareas pendientes"
            valor={tareas.pendientes}
            detalle={[
              tareas.vencidas &&
                `${tareas.vencidas} ${tareas.vencidas === 1 ? "vencida" : "vencidas"}`,
              `${tareas.hechas} ${tareas.hechas === 1 ? "hecha" : "hechas"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
      </div>

      {/* Caminantes: confirmados, tesorería, estados y atención especial */}
      {caminantes && (
        <>
          <div className="col-span-12 md:col-span-5">
            <AnilloConfirmados caminantes={caminantes} />
          </div>
          {caminantes.pagos && (
            <div className="col-span-12 md:col-span-7">
              <Tesoreria
                retiroId={retiro.id}
                caminantes={caminantes.pagos}
                servidores={conCuotaServidor ? servidores?.pagos : undefined}
              />
            </div>
          )}
          <div className="col-span-12">
            <FichasPorEstado
              caminantes={caminantes}
              servidores={servidores ?? undefined}
            />
          </div>
          {(caminantes.atencion ||
            caminantes.confirmados_pagados !== undefined) && (
            <div className="col-span-12">
              <Indicadores caminantes={caminantes} />
            </div>
          )}
        </>
      )}

      {/* Dinero */}
      {finanzas && (
        <>
          <Tarjeta
            titulo="Recaudación acumulada"
            enlace={{ a: "/pagos", texto: "Ver pagos" }}
            className="col-span-12 xl:col-span-8"
          >
            <GraficaRecaudacion
              puntos={finanzas.recaudacion}
              esperado={esperado}
            />
          </Tarjeta>
          <Tarjeta
            titulo={`Balance · ${dinero(finanzas.balance)}`}
            enlace={{ a: "/gastos", texto: "Ver gastos" }}
            className="col-span-12 xl:col-span-4"
          >
            <dl className="mb-5 grid grid-cols-2 gap-4">
              <div>
                <dt className={claseVacio}>Ingresos</dt>
                <dd className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                  {dinero(finanzas.ingresos)}
                </dd>
              </div>
              <div>
                <dt className={claseVacio}>Gastos</dt>
                <dd className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                  {dinero(finanzas.egresos)}
                </dd>
              </div>
            </dl>
            <h4 className="mb-2 text-theme-sm font-medium text-gray-800 dark:text-white/90">
              Gastos por categoría
            </h4>
            <BarrasHorizontales
              filas={finanzas.por_categoria.map((c) => ({
                etiqueta: c.etiqueta,
                total: c.total,
              }))}
              formato={(n) => dinero(n)}
            />
          </Tarjeta>
        </>
      )}

      {/* Equipo y pendientes */}
      {servidores && (
        <Tarjeta
          titulo="Servidores por área"
          enlace={{ a: "/participaciones", texto: "Ver servidores" }}
          className="col-span-12 xl:col-span-5"
        >
          <BarrasHorizontales
            filas={[
              ...servidores.por_area.map((a) => ({
                etiqueta: a.area,
                total: a.total,
              })),
              { etiqueta: "Sin área", total: servidores.sin_area },
            ]}
          />
        </Tarjeta>
      )}
      <Tarjeta
        titulo="Pendientes"
        enlace={tareas ? { a: "/tareas", texto: "Ver tareas" } : undefined}
        className="col-span-12 xl:col-span-7"
      >
        {t.alertas.length === 0 && !tareas?.proximas.length ? (
          <p className={claseVacio}>No hay pendientes. ¡Todo al día!</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {t.alertas.length > 0 && (
              <ul className="space-y-2">
                {t.alertas.map((a) => (
                  <li key={a.clave}>
                    <Link
                      to={a.enlace}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-theme-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                    >
                      <span className="min-w-8 rounded-md bg-warning-50 px-1.5 py-0.5 text-center font-semibold text-warning-700 tabular-nums dark:bg-warning-500/15 dark:text-warning-400">
                        {a.total}
                      </span>
                      {a.texto}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {tareas && tareas.proximas.length > 0 && (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {tareas.proximas.map((tarea) => (
                  <li key={tarea.id} className="py-2 text-theme-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-800 dark:text-white/90">
                        {tarea.titulo}
                      </span>
                      {tarea.vencida ? (
                        <Badge size="sm" color="error">
                          Vencida
                        </Badge>
                      ) : (
                        tarea.fecha_limite && (
                          <span className="shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">
                            {diaYMes.format(new Date(tarea.fecha_limite))}
                          </span>
                        )
                      )}
                    </div>
                    {(tarea.responsable || tarea.area) && (
                      <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                        {[tarea.responsable, tarea.area]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Tarjeta>

      {/* Cumpleaños y accesos */}
      <Tarjeta titulo="Cumpleaños" className="col-span-12 xl:col-span-5">
        {t.cumpleanos.length === 0 ? (
          <p className={claseVacio}>
            Nadie del retiro cumple años en los próximos 30 días ni durante el
            retiro.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {t.cumpleanos.map((c) => (
              <li
                key={`${c.nombre}-${c.fecha}`}
                className="flex items-center justify-between gap-3 py-2.5 text-theme-sm"
              >
                <div>
                  <span className="block text-gray-800 dark:text-white/90">
                    {c.nombre}
                  </span>
                  <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {c.rol} · cumple {c.cumple} el{" "}
                    {diaYMes.format(new Date(c.fecha))}
                  </span>
                </div>
                {c.durante_retiro ? (
                  <Badge size="sm" color="success">
                    Durante el retiro
                  </Badge>
                ) : (
                  <span className="shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">
                    {c.en_dias === 0
                      ? "¡Hoy!"
                      : c.en_dias === 1
                        ? "Mañana"
                        : `En ${c.en_dias} días`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <Tarjeta titulo="Accesos rápidos" className="col-span-12 xl:col-span-7">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {accesos.map((a) => (
            <AccesoRapido key={a.texto} {...a} />
          ))}
        </div>
      </Tarjeta>
    </div>
  );
}

function General({ resumen }: { resumen: Resumen }) {
  return (
    <div className="mt-6 grid grid-cols-12 gap-4 md:gap-6">
      <Tarjeta
        titulo="Próximos retiros"
        enlace={{ a: "/retiros", texto: "Ver todos" }}
        className="col-span-12 xl:col-span-7"
      >
        {resumen.proximos_retiros.length === 0 ? (
          <p className={claseVacio}>No hay retiros próximos.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {resumen.proximos_retiros.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <Link
                    to={`/retiros/${r.id}`}
                    className="block text-theme-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90"
                  >
                    {r.etiqueta}
                  </Link>
                  <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                    {fecha(r.fecha_inicio)} – {fecha(r.fecha_fin)} ·{" "}
                    {r.inscritos} / {r.cupo} inscritos
                  </span>
                </div>
                <Badge size="sm" color={colorEstado(r.estado)}>
                  {r.estado_display}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <Tarjeta
        titulo="En todos los retiros"
        className="col-span-12 xl:col-span-5"
      >
        <dl className="grid grid-cols-2 gap-5 text-theme-sm">
          {[
            ["Personas registradas", resumen.personas],
            [
              "Retiros",
              `${resumen.retiros} (${resumen.retiros_activos} sin finalizar)`,
            ],
            ["Inscripciones", resumen.inscripciones],
            ["Balance", dinero(resumen.balance)],
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="text-gray-500 dark:text-gray-400">{etiqueta}</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
                {valor}
              </dd>
            </div>
          ))}
        </dl>
      </Tarjeta>
    </div>
  );
}

// Tablero del inicio: el retiro elegido (?retiro=<id>, por omisión el próximo)
// con sus cifras, gráficas, pendientes y accesos; debajo, lo general.
export default function Inicio() {
  const [busqueda, setBusqueda] = useSearchParams();
  const elegido = busqueda.get("retiro") ?? "";
  const { datos, alDia, error, hora, consultando, actualizar } =
    useDatosVivos<Resumen>(
      `/resumen/${elegido ? `?retiro=${encodeURIComponent(elegido)}` : ""}`,
    );

  if (!datos) {
    return <p className={claseVacio}>{error?.message || "Cargando…"}</p>;
  }
  const { tablero } = datos;

  return (
    <>
      <PageMeta
        title="Inicio | Betania"
        description="Tablero del retiro: caminantes, servidores, pagos, pendientes y cumpleaños"
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {datos.retiros_tablero.length > 0 && (
            <select
              value={tablero?.retiro.id ?? ""}
              onChange={(e) => setBusqueda({ retiro: e.target.value })}
              className={`${claseControl} font-medium`}
              aria-label="Retiro"
            >
              {datos.retiros_tablero.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.etiqueta} · {fecha(r.fecha_inicio)}
                </option>
              ))}
            </select>
          )}
          {tablero && (
            <Badge size="sm" color={colorEstado(tablero.retiro.estado)}>
              {tablero.retiro.estado_display}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {datos.tasas_bcv && (
            <span className="me-2 text-xs text-gray-500 dark:text-gray-400">
              BCV {fecha(datos.tasas_bcv.fecha)}:{" "}
              {dinero(datos.tasas_bcv.USD, "VES")} / USD ·{" "}
              {dinero(datos.tasas_bcv.EUR, "VES")} / EUR
            </span>
          )}
          <Actualizacion
            hora={hora}
            error={alDia ? error : undefined}
            consultando={consultando}
            onActualizar={actualizar}
          />
        </div>
      </div>

      {/* Mientras llega otro retiro, el anterior queda atenuado. */}
      <div className={alDia ? "" : "pointer-events-none opacity-60"}>
        {tablero ? (
          <TableroRetiro t={tablero} />
        ) : (
          <div className={claseTarjeta}>
            <p className={claseVacio}>
              Todavía no hay retiros.{" "}
              <Link to="/retiros?nuevo=1" className={claseEnlace}>
                Crea el primero
              </Link>{" "}
              para ver aquí su tablero.
            </p>
          </div>
        )}
        <General resumen={datos} />
      </div>
    </>
  );
}
