import PantallaError from "@/components/estados/PantallaError";
import { EsqueletoFicha } from "@/components/estados/Esqueleto";
import { type FichaPersona } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Telefono from "@/components/common/Telefono";
import {
  claseBoton,
  claseEnlace,
  claseTarjeta,
} from "@/components/modulos/estilos";
import EditorAreas from "@/components/personas/EditorAreas";
import AccionesAsistencia from "@/components/retiros/AccionesAsistencia";
import Badge from "@/components/ui/badge/Badge";
import { useAuth } from "@/context/AuthContext";
import { useDatosVivos } from "@/hooks/useDatosVivos";
import { colorEstado, dinero, fecha } from "@/utils/formato";
import { useState } from "react";
import { Link, useParams } from "react-router";

const claseVacio = "text-sm text-gray-500 dark:text-gray-400";
const claseTitulo = "text-lg font-semibold text-gray-800 dark:text-white/90";
const ETIQUETA_PAGO: Record<string, string> = {
  pagado: "Pagado",
  parcial: "Parcial",
  pendiente: "Sin pago",
};

function Seccion({
  titulo,
  cantidad,
  accion,
  className = "",
  children,
}: {
  titulo: string;
  cantidad?: number;
  accion?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${claseTarjeta} ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className={claseTitulo}>
          {titulo}
          {cantidad !== undefined && (
            <span className="ms-2 text-theme-sm font-normal text-gray-400">
              {cantidad}
            </span>
          )}
        </h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
        {titulo}
      </dt>
      <dd className="mt-0.5 text-theme-sm break-words text-gray-800 dark:text-white/90">
        {valor || "—"}
      </dd>
    </div>
  );
}

// Lo pagado y lo que falta de una cuota (caminante o servidor).
function Pago({
  fila,
}: {
  fila: { pagado?: number; saldo?: number; estado_pago?: string };
}) {
  if (fila.estado_pago === undefined) return null;
  return (
    <span className="flex flex-wrap items-center gap-2 text-theme-xs text-gray-500 dark:text-gray-400">
      <Badge size="sm" color={colorEstado(fila.estado_pago)}>
        {ETIQUETA_PAGO[fila.estado_pago]}
      </Badge>
      Pagó {dinero(fila.pagado ?? 0)}
      {!!fila.saldo && ` · debe ${dinero(fila.saldo)}`}
    </span>
  );
}

const SACRAMENTOS: [string, string][] = [
  ["bautismo", "Bautismo"],
  ["confirmacion", "Confirmación"],
  ["matrimonio", "Matrimonio"],
  ["uncion", "Unción"],
];

// Todo lo de una persona en una pantalla: sus datos, sus retiros como
// caminante y como servidor (con sus áreas), a quién invitó, sus tareas y su
// acceso al sistema.
export default function PersonaFicha() {
  const { id } = useParams();
  const { modulos } = useAuth();
  const { datos, alDia, error, actualizar } = useDatosVivos<FichaPersona>(
    `/personas/${id}/ficha/`,
  );
  // La participación cuyas áreas se están editando.
  const [editando, setEditando] = useState<string | null>(null);

  if (!alDia) return <EsqueletoFicha />;
  if (!datos) return <PantallaError error={error} onReintentar={actualizar} />;

  const { persona, caminante, servidor, invito, tareas, acceso } = datos;
  const modulo = (slug: string) => modulos.find((m) => m.slug === slug);
  const puede = (slug: string, accion: "puede_agregar" | "puede_cambiar") =>
    !!modulo(slug)?.[accion];
  const volver = encodeURIComponent(`/personas/${persona.id}`);
  const sensibles = persona.datos_sensibles;
  const texto = (clave: string) =>
    sensibles?.[clave] ? String(sensibles[clave]) : "";
  const iniciales = persona.nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <>
      <PageMeta
        title={`${persona.nombre} | Betania`}
        description={`Ficha de ${persona.nombre}: datos, retiros como caminante y como servidor`}
      />
      <PageBreadcrumb pageTitle={persona.nombre} />

      {/* Encabezado: quién es y qué se puede hacer */}
      <div className={`${claseTarjeta} mb-6`}>
        <div className="flex flex-wrap items-start gap-5">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl font-semibold text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
            {iniciales}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-title-sm font-bold text-gray-800 dark:text-white/90">
              {persona.nombre}
            </h2>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              {[
                persona.documento,
                persona.edad !== null && `${persona.edad} años`,
                persona.procedencia,
                `Parroquia ${persona.parroquia}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-theme-sm">
              {persona.telefono && (
                <Telefono numero={persona.telefono} className={claseEnlace} />
              )}
              {persona.email && (
                <a href={`mailto:${persona.email}`} className={claseEnlace}>
                  {persona.email}
                </a>
              )}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {puede("personas", "puede_cambiar") && (
              <Link
                to={`/personas/${persona.id}/editar?volver=${volver}`}
                className={claseBoton}
              >
                Editar datos
              </Link>
            )}
            {puede("personas", "puede_agregar") &&
              puede("inscripciones", "puede_agregar") && (
                <Link
                  to="/inscribir"
                  state={{ persona: persona.id }}
                  className={claseBoton}
                >
                  Inscribir en un retiro
                </Link>
              )}
            {puede("participaciones", "puede_agregar") &&
              puede("servicios", "puede_agregar") && (
                <Link
                  to="/registrar-servidor"
                  state={{ persona: persona.id }}
                  className={claseBoton}
                >
                  Registrar como servidor
                </Link>
              )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* Como caminante */}
        {caminante && (
          <Seccion
            titulo="Como caminante"
            cantidad={caminante.length}
            className="col-span-12 xl:col-span-6"
          >
            {caminante.length === 0 ? (
              <p className={claseVacio}>No ha sido caminante.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {caminante.map((c) => (
                  <li key={c.id} className="space-y-1.5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={`/retiros/${c.retiro.id}`}
                        className="text-theme-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90"
                      >
                        {c.retiro.etiqueta}
                      </Link>
                      <span className="flex flex-wrap items-center gap-1">
                        <Badge size="sm" color={colorEstado(c.estado)}>
                          {c.estado_display}
                        </Badge>
                        <AccionesAsistencia
                          quien="caminante"
                          id={c.id}
                          nombre={persona.nombre}
                          estado={c.estado}
                          onCambio={actualizar}
                        />
                      </span>
                    </div>
                    {c.motivo_cancelacion && (
                      <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                        Motivo: {c.motivo_cancelacion}
                      </p>
                    )}
                    <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                      {fecha(c.retiro.fecha_inicio)}
                      {c.padrino_id && (
                        <>
                          {" · invitado por "}
                          <Link
                            to={`/personas/${c.padrino_id}`}
                            className={claseEnlace}
                          >
                            {c.padrino}
                          </Link>
                        </>
                      )}
                    </p>
                    <Pago fila={c} />
                    {Boolean(
                      c.salud?.tratamiento || c.salud?.regimen_alimenticio,
                    ) && (
                      <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                        {[
                          c.salud?.tratamiento &&
                            `Tratamiento: ${c.salud.tratamiento}`,
                          c.salud?.regimen_alimenticio &&
                            `Comida: ${c.salud.regimen_alimenticio}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {puede("inscripciones", "puede_cambiar") && (
                      <Link
                        to={`/inscribir?inscripcion=${c.id}&volver=${volver}`}
                        className={`text-theme-xs ${claseEnlace}`}
                      >
                        Editar inscripción
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        )}

        {/* Como servidor */}
        {servidor && (
          <Seccion
            titulo="Como servidor"
            cantidad={servidor.length}
            className="col-span-12 xl:col-span-6"
          >
            {servidor.length === 0 ? (
              <p className={claseVacio}>No ha servido en ningún retiro.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {servidor.map((s) => (
                  <li key={s.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={`/retiros/${s.retiro.id}`}
                        className="text-theme-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90"
                      >
                        {s.retiro.etiqueta}
                      </Link>
                      <span className="flex flex-wrap items-center gap-1">
                        <Badge size="sm" color="primary">
                          {s.tipo_display}
                        </Badge>
                        <Badge size="sm" color={colorEstado(s.estado)}>
                          {s.estado_display}
                        </Badge>
                        <AccionesAsistencia
                          quien="servidor"
                          id={s.id}
                          nombre={persona.nombre}
                          estado={s.estado}
                          onCambio={actualizar}
                        />
                      </span>
                    </div>
                    {s.motivo_cancelacion && (
                      <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                        Motivo: {s.motivo_cancelacion}
                      </p>
                    )}
                    {editando === s.id ? (
                      <EditorAreas
                        servicio={s}
                        onCancelar={() => setEditando(null)}
                        onListo={() => {
                          setEditando(null);
                          actualizar();
                        }}
                      />
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {s.areas.length === 0 ? (
                            <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                              Sin área asignada
                            </span>
                          ) : (
                            s.areas.map((a) => (
                              <Badge
                                key={a.id}
                                size="sm"
                                color={a.es_coordinador ? "success" : "light"}
                              >
                                {a.nombre}
                                {a.es_coordinador && " · coordina"}
                              </Badge>
                            ))
                          )}
                        </div>
                        {(s.duerme_en_casa !== null ||
                          s.turnos ||
                          s.camisa) && (
                          <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                            {[
                              s.duerme_en_casa !== null &&
                                (s.duerme_en_casa
                                  ? "Duerme en la casa"
                                  : "No duerme en la casa"),
                              s.turnos,
                              s.camisa && `Camisa: ${s.camisa}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        <Pago fila={s} />
                        {puede("participaciones", "puede_cambiar") && (
                          <Link
                            to={`/registrar-servidor?participacion=${s.id}&volver=${volver}`}
                            className={`me-4 text-theme-xs ${claseEnlace}`}
                          >
                            Editar
                          </Link>
                        )}
                        {puede("servicios", "puede_agregar") && (
                          <button
                            type="button"
                            className={`text-theme-xs ${claseEnlace}`}
                            onClick={() => setEditando(s.id)}
                          >
                            Editar áreas
                          </button>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        )}

        {/* Datos confidenciales (solo quien puede verlos) */}
        {sensibles && (
          <Seccion
            titulo="Datos personales"
            className="col-span-12 xl:col-span-6"
          >
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Dato
                titulo="Fecha de nacimiento"
                valor={fecha(persona.fecha_nacimiento)}
              />
              <Dato titulo="Ocupación" valor={texto("ocupacion")} />
              <Dato
                titulo="Teléfono de casa"
                valor={
                  texto("telefono_casa") && (
                    <Telefono numero={texto("telefono_casa")} />
                  )
                }
              />
              <Dato
                titulo="Sector / urbanización / dirección"
                valor={texto("direccion")}
              />
              <Dato
                titulo="Estado civil"
                valor={[texto("estado_civil"), texto("pareja_nombre")]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <Dato
                titulo="Hijos"
                valor={[texto("hijos"), texto("edades_hijos")]
                  .filter(Boolean)
                  .join(" · edades: ")}
              />
              <Dato
                titulo="Sacramentos"
                valor={SACRAMENTOS.filter(([c]) => sensibles[c])
                  .map(([, e]) => e)
                  .join(", ")}
              />
              <Dato
                titulo="Parroquia a la que asiste"
                valor={texto("parroquia_asiste")}
              />
            </dl>
          </Seccion>
        )}

        {/* Acceso al sistema */}
        {acceso !== undefined && (
          <Seccion
            titulo="Acceso al sistema"
            className="col-span-12 xl:col-span-6"
          >
            {acceso === null ? (
              <p className={claseVacio}>
                No tiene acceso. Se le da en el admin de Django: Usuarios →
                Agregar, eligiendo a esta persona, su cuenta y su rol.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-theme-sm text-gray-800 dark:text-white/90">
                  Usuario <strong>{acceso.usuario || "sin cuenta"}</strong>
                  {!acceso.activo && (
                    <span className="ms-2">
                      <Badge size="sm" color="error">
                        Inactivo
                      </Badge>
                    </span>
                  )}
                </p>
                <ul className="space-y-1.5 text-theme-sm text-gray-700 dark:text-gray-300">
                  {acceso.roles.map((r, i) => (
                    <li key={i}>
                      {r.rol_display}
                      <span className="text-gray-500 dark:text-gray-400">
                        {" "}
                        · {r.ambito}
                      </span>
                    </li>
                  ))}
                  {acceso.roles.length === 0 && (
                    <li className={claseVacio}>Sin roles asignados.</li>
                  )}
                </ul>
              </div>
            )}
          </Seccion>
        )}

        {/* A quién invitó */}
        {invito && invito.length > 0 && (
          <Seccion
            titulo="Invitó a"
            cantidad={invito.length}
            className="col-span-12 xl:col-span-6"
          >
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {invito.map((i, n) => (
                <li
                  key={n}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-theme-sm"
                >
                  <Link
                    to={`/personas/${i.persona_id}`}
                    className={claseEnlace}
                  >
                    {i.nombre}
                  </Link>
                  <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {i.retiro} · {i.estado_display}
                  </span>
                </li>
              ))}
            </ul>
          </Seccion>
        )}

        {/* Tareas pendientes */}
        {tareas && tareas.length > 0 && (
          <Seccion
            titulo="Tareas pendientes"
            cantidad={tareas.length}
            className="col-span-12 xl:col-span-6"
            accion={
              <Link to="/tareas" className={`text-sm ${claseEnlace}`}>
                Ver tareas
              </Link>
            }
          >
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {tareas.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-theme-sm"
                >
                  <span className="text-gray-800 dark:text-white/90">
                    {t.titulo}
                    <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                      {" "}
                      · {t.retiro}
                    </span>
                  </span>
                  {t.vencida ? (
                    <Badge size="sm" color="error">
                      Vencida
                    </Badge>
                  ) : (
                    t.fecha_limite && (
                      <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                        {fecha(t.fecha_limite)}
                      </span>
                    )
                  )}
                </li>
              ))}
            </ul>
          </Seccion>
        )}
      </div>
    </>
  );
}
