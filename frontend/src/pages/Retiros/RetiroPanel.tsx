import { ApiError, type FichaCaminante, type PanelRetiro } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import {
  claseBoton,
  claseControl,
  claseEnlace,
  claseTarjeta,
} from "@/components/modulos/estilos";
import Actualizacion from "@/components/retiros/Actualizacion";
import Metrica from "@/components/retiros/Metrica";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { useDatosVivos } from "@/hooks/useDatosVivos";
import { BoxIconLine, CalenderIcon, DollarLineIcon, GroupIcon } from "@/icons";
import NotFound from "@/pages/OtherPage/NotFound";
import { colorEstado, dinero, fecha } from "@/utils/formato";
import { Fragment, useState } from "react";
import { Link, useParams } from "react-router";

const claseTitulo = "text-lg font-semibold text-gray-800 dark:text-white/90";
const claseVacio = "text-sm text-gray-500 dark:text-gray-400";
const claseEncabezado =
  "px-4 py-3 text-start text-theme-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400";
const claseCelda =
  "px-4 py-3 text-start text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400";

function Seccion({
  titulo,
  enlace,
  className = "",
  children,
}: {
  titulo: string;
  enlace?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${claseTarjeta} ${className}`}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className={claseTitulo}>{titulo}</h3>
        {enlace}
      </div>
      {children}
    </section>
  );
}

// Renglones "etiqueta … monto"; los que están en cero no se muestran.
function Desglose({
  filas,
}: {
  filas: { valor: string; etiqueta: string; total: number }[];
}) {
  const conMonto = filas.filter((f) => f.total);
  if (conMonto.length === 0)
    return <p className={claseVacio}>Sin registros.</p>;
  return (
    <ul className="space-y-2 text-theme-sm text-gray-700 dark:text-gray-400">
      {conMonto.map((f) => (
        <li key={f.valor} className="flex justify-between gap-4">
          <span>{f.etiqueta}</span>
          <span className="font-medium">{dinero(f.total)}</span>
        </li>
      ))}
    </ul>
  );
}

type FilaCaminante = NonNullable<PanelRetiro["caminantes"]>["filas"][number];

// Filtros rápidos de la tabla de caminantes. `requiere` dice qué datos hacen
// falta para ofrecerlo (finanzas o la ficha confidencial).
const filtrosCaminante: {
  valor: string;
  etiqueta: string;
  requiere?: "pagos" | "ficha";
  cumple: (f: FilaCaminante) => boolean;
}[] = [
  { valor: "", etiqueta: "Todos", cumple: () => true },
  {
    valor: "deben",
    etiqueta: "Deben",
    requiere: "pagos",
    cumple: (f) => (f.saldo ?? 0) > 0,
  },
  {
    valor: "salud",
    etiqueta: "Salud o tratamiento",
    requiere: "ficha",
    cumple: (f) => !!(f.ficha?.condicion_medica || f.ficha?.tratamiento),
  },
  {
    valor: "comida",
    etiqueta: "Comida especial",
    requiere: "ficha",
    cumple: (f) => !!f.ficha?.alimentacion,
  },
  {
    valor: "requerimientos",
    etiqueta: "Requerimiento especial",
    requiere: "ficha",
    cumple: (f) => !!f.ficha?.requerimientos,
  },
];

// Avisos junto al nombre, para ver de un vistazo a quién hay que atender.
function Avisos({ ficha }: { ficha?: FichaCaminante }) {
  if (!ficha) return null;
  const avisos: [string, "error" | "warning" | "info"][] = [];
  if (ficha.condicion_medica || ficha.tratamiento) {
    avisos.push(["Salud", "error"]);
  }
  if (ficha.alimentacion) avisos.push(["Comida", "warning"]);
  if (ficha.requerimientos) avisos.push(["Requerimiento", "info"]);
  return (
    <>
      {avisos.map(([texto, color]) => (
        <span key={texto} className="ml-2">
          <Badge size="sm" color={color}>
            {texto}
          </Badge>
        </span>
      ))}
    </>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
        {titulo}
      </dt>
      <dd className="mt-0.5 text-theme-sm whitespace-pre-line text-gray-800 dark:text-white/90">
        {valor || "—"}
      </dd>
    </div>
  );
}

// Todo lo confidencial de un caminante, con enlaces para corregirlo.
function Ficha({
  fila,
  retiroId,
  puedeEditar,
}: {
  fila: FilaCaminante;
  retiroId: string;
  puedeEditar: (slug: string) => boolean;
}) {
  const ficha = fila.ficha!;
  // Al guardar o cancelar la edición se vuelve a este panel.
  const volver = encodeURIComponent(`/retiros/${retiroId}`);
  return (
    <div className="rounded-xl bg-gray-50 p-4 whitespace-normal dark:bg-white/3">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Dato titulo="Documento" valor={ficha.documento} />
        <Dato titulo="De dónde es" valor={ficha.procedencia} />
        <Dato
          titulo="Sector / urbanización / dirección"
          valor={ficha.direccion}
        />
        <Dato titulo="Condición médica" valor={ficha.condicion_medica} />
        <Dato titulo="Tratamiento o medicamentos" valor={ficha.tratamiento} />
        <Dato titulo="Alimentación especial" valor={ficha.alimentacion} />
        <Dato titulo="Requerimientos especiales" valor={ficha.requerimientos} />
        <Dato
          titulo="Teléfonos del caminante"
          valor={[
            fila.telefono && `Celular: ${fila.telefono}`,
            ficha.telefono_casa && `Casa: ${ficha.telefono_casa}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Dato
          titulo="Familiares / contacto de emergencia"
          valor={
            ficha.contactos.length > 0 && (
              <ul className="space-y-1">
                {ficha.contactos.map((c, i) => (
                  <li key={i}>
                    {c.nombre || "Sin nombre"}
                    {c.relacion && ` (${c.relacion})`}
                    {c.telefono && ` · ${c.telefono}`}
                  </li>
                ))}
              </ul>
            )
          }
        />
        <Dato titulo="Quién lo invitó" valor={fila.padrino} />
        <Dato titulo="Talla de camiseta" valor={ficha.talla_camiseta} />
        {ficha.notas && <Dato titulo="Comentario" valor={ficha.notas} />}
      </dl>
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        {puedeEditar("inscripciones") && (
          <Link
            to={`/inscripciones?editar=${fila.id}&volver=${volver}`}
            className={claseEnlace}
          >
            Editar salud y contactos
          </Link>
        )}
        {puedeEditar("personas") && (
          <Link
            to={`/personas?editar=${fila.persona_id}&volver=${volver}`}
            className={claseEnlace}
          >
            Editar datos personales
          </Link>
        )}
      </div>
    </div>
  );
}

function Caminantes({
  caminantes,
  opcionesPago,
  retiroId,
  puedeEditar,
}: {
  caminantes: NonNullable<PanelRetiro["caminantes"]>;
  opcionesPago: PanelRetiro["opciones_pago"];
  retiroId: string;
  puedeEditar: (slug: string) => boolean;
}) {
  const { filas, por_estado } = caminantes;
  const [filtro, setFiltro] = useState("");
  const [texto, setTexto] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const conPagos = filas.some((f) => f.estado_pago !== undefined);
  const conFicha = filas.some((f) => f.ficha !== undefined);
  const estados = new Map(por_estado.map((e) => [e.estado, e.etiqueta]));
  const pagos = new Map(opcionesPago.map((o) => [o.valor, o.etiqueta]));

  if (filas.length === 0) {
    return <p className={claseVacio}>Todavía no hay inscripciones.</p>;
  }

  const disponibles = filtrosCaminante.filter(
    (f) => !f.requiere || (f.requiere === "pagos" ? conPagos : conFicha),
  );
  const elegido = disponibles.find((f) => f.valor === filtro) ?? disponibles[0];
  const buscado = texto.trim().toLowerCase();
  const visibles = filas.filter(
    (f) =>
      elegido.cumple(f) &&
      (!buscado || f.persona.toLowerCase().includes(buscado)),
  );

  const alternar = (id: string) =>
    setAbiertos((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  const titulos = conFicha
    ? ["Caminante", "Edad", "De dónde es", "Teléfono", "Estado"]
    : ["Caminante", "Teléfono", "Quién lo invitó", "Estado"];
  if (conPagos) titulos.push("Pago", "Pagado", "Debe");
  if (conFicha) titulos.push("");

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {por_estado
          .filter((e) => e.total)
          .map((e) => (
            <Badge key={e.estado} size="sm" color={colorEstado(e.estado)}>
              {e.etiqueta}: {e.total}
            </Badge>
          ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Buscar caminante…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className={`${claseControl} w-full sm:w-64`}
        />
        {disponibles.length > 1 && (
          <select
            value={elegido.valor}
            onChange={(e) => setFiltro(e.target.value)}
            className={claseControl}
            aria-label="Filtrar caminantes"
          >
            {disponibles.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.etiqueta} ({filas.filter(f.cumple).length})
              </option>
            ))}
          </select>
        )}
        {conFicha && (
          <button
            type="button"
            className={claseBoton}
            onClick={() =>
              setAbiertos(
                abiertos.size ? new Set() : new Set(visibles.map((f) => f.id)),
              )
            }
          >
            {abiertos.size ? "Cerrar fichas" : "Abrir todas las fichas"}
          </button>
        )}
      </div>
      {visibles.length === 0 ? (
        <p className={claseVacio}>Ningún caminante coincide.</p>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/5">
              <TableRow>
                {titulos.map((titulo, i) => (
                  <TableCell key={i} isHeader className={claseEncabezado}>
                    {titulo}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
              {visibles.map((f) => (
                <Fragment key={f.id}>
                  <TableRow>
                    <TableCell
                      className={`${claseCelda} font-medium text-gray-800 dark:text-white/90`}
                    >
                      {f.persona}
                      <Avisos ficha={f.ficha} />
                    </TableCell>
                    {conFicha && (
                      <>
                        <TableCell className={claseCelda}>
                          {f.ficha?.edad ?? "—"}
                        </TableCell>
                        <TableCell className={claseCelda}>
                          {f.ficha?.procedencia || "—"}
                        </TableCell>
                      </>
                    )}
                    <TableCell className={claseCelda}>
                      {f.telefono || f.ficha?.telefono_casa || "—"}
                    </TableCell>
                    {!conFicha && (
                      <TableCell className={claseCelda}>
                        {f.padrino || "—"}
                      </TableCell>
                    )}
                    <TableCell className={claseCelda}>
                      <Badge size="sm" color={colorEstado(f.estado)}>
                        {estados.get(f.estado)}
                      </Badge>
                    </TableCell>
                    {conPagos && (
                      <>
                        <TableCell className={claseCelda}>
                          <Badge size="sm" color={colorEstado(f.estado_pago!)}>
                            {pagos.get(f.estado_pago!)}
                          </Badge>
                        </TableCell>
                        <TableCell className={claseCelda}>
                          {dinero(f.pagado!)}
                        </TableCell>
                        <TableCell className={claseCelda}>
                          {dinero(f.saldo!)}
                        </TableCell>
                      </>
                    )}
                    {conFicha && (
                      <TableCell className={claseCelda}>
                        <button
                          type="button"
                          className={claseEnlace}
                          aria-expanded={abiertos.has(f.id)}
                          onClick={() => alternar(f.id)}
                        >
                          {abiertos.has(f.id) ? "Ocultar ficha" : "Ver ficha"}
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                  {abiertos.has(f.id) && f.ficha && (
                    <TableRow>
                      <TableCell colSpan={titulos.length} className="px-4 pb-4">
                        <Ficha
                          fila={f}
                          retiroId={retiroId}
                          puedeEditar={puedeEditar}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

// Lo que lleva pagado y lo que debe cada servidor de su cuota.
function Servidores({
  servidores,
  cuota,
  opcionesPago,
}: {
  servidores: NonNullable<PanelRetiro["servidores"]>;
  cuota: number;
  opcionesPago: PanelRetiro["opciones_pago"];
}) {
  const [soloDeben, setSoloDeben] = useState(false);
  const pagos = new Map(opcionesPago.map((o) => [o.valor, o.etiqueta]));
  if (servidores.filas.length === 0) {
    return <p className={claseVacio}>Todavía no hay servidores asignados.</p>;
  }
  const conCuota = cuota > 0;
  const visibles = soloDeben
    ? servidores.filas.filter((f) => f.saldo > 0)
    : servidores.filas;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
        <span>
          {conCuota
            ? `Cuota por servidor: ${dinero(cuota)}`
            : "Este retiro no tiene cuota de servidor: se muestra lo aportado."}
        </span>
        {conCuota && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={soloDeben}
              onChange={(e) => setSoloDeben(e.target.checked)}
            />
            Solo los que deben
          </label>
        )}
      </div>
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-white/5">
            <TableRow>
              {[
                "Servidor",
                "Área",
                "Teléfono",
                ...(conCuota ? ["Pago"] : []),
                "Pagado",
                ...(conCuota ? ["Debe"] : []),
              ].map((titulo) => (
                <TableCell key={titulo} isHeader className={claseEncabezado}>
                  {titulo}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
            {visibles.map((f) => (
              <TableRow key={f.id}>
                <TableCell
                  className={`${claseCelda} font-medium text-gray-800 dark:text-white/90`}
                >
                  {f.persona}
                </TableCell>
                <TableCell className={claseCelda}>
                  {f.areas || f.tipo}
                </TableCell>
                <TableCell className={claseCelda}>
                  {f.telefono || "—"}
                </TableCell>
                {conCuota && (
                  <TableCell className={claseCelda}>
                    <Badge size="sm" color={colorEstado(f.estado_pago)}>
                      {pagos.get(f.estado_pago)}
                    </Badge>
                  </TableCell>
                )}
                <TableCell className={claseCelda}>{dinero(f.pagado)}</TableCell>
                {conCuota && (
                  <TableCell className={claseCelda}>
                    {dinero(f.saldo)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function Equipo({ equipo }: { equipo: NonNullable<PanelRetiro["equipo"]> }) {
  if (equipo.total === 0) {
    return <p className={claseVacio}>Todavía no hay servidores asignados.</p>;
  }
  const grupos = [
    ...(equipo.coordinadores.length
      ? [
          {
            area: "Coordinación general",
            personas: equipo.coordinadores.map((nombre) => ({
              nombre,
              es_coordinador: false,
            })),
          },
        ]
      : []),
    ...equipo.areas,
    ...(equipo.sin_area.length
      ? [
          {
            area: "Sin área asignada",
            personas: equipo.sin_area.map((nombre) => ({
              nombre,
              es_coordinador: false,
            })),
          },
        ]
      : []),
  ];
  return (
    <dl className="space-y-4">
      {grupos.map((grupo) => (
        <div key={grupo.area}>
          <dt className="mb-1 text-theme-sm font-medium text-gray-800 dark:text-white/90">
            {grupo.area}{" "}
            <span className="font-normal text-gray-400">
              ({grupo.personas.length})
            </span>
          </dt>
          <dd className="text-theme-sm text-gray-500 dark:text-gray-400">
            {grupo.personas.map((p, i) => (
              <span key={p.nombre}>
                {i > 0 && ", "}
                {p.nombre}
                {p.es_coordinador && " (coordina)"}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Todo lo de un retiro en una pantalla: caminantes, equipo, charlas y finanzas.
export default function RetiroPanel() {
  const { id } = useParams();
  const { modulos } = useAuth();
  const { datos, alDia, error, hora, consultando, actualizar } =
    useDatosVivos<PanelRetiro>(`/retiros/${id}/panel/`);

  if (!alDia) return <p className={claseVacio}>Cargando…</p>;
  const panel = datos;
  if (!panel) {
    if (error instanceof ApiError && [403, 404].includes(error.status)) {
      return <NotFound />;
    }
    return <p className={claseVacio}>{error?.message}</p>;
  }

  const { retiro, caminantes, equipo, servidores, charlas, finanzas } = panel;
  const modulo = (slug: string) => modulos.find((m) => m.slug === slug);
  const puede = (slug: string) => modulo(slug)?.puede_agregar;
  const puedeEditar = (slug: string) => !!modulo(slug)?.puede_cambiar;
  const puedeInscribir = puede("personas") && puede("inscripciones");
  const puedeRegistrarServidor =
    puede("personas") && puede("participaciones") && puede("servicios");

  return (
    <>
      <PageMeta
        title={`${retiro.etiqueta} | Betania`}
        description={`Caminantes, equipo, charlas y finanzas de ${retiro.etiqueta}`}
      />
      <PageBreadcrumb pageTitle={retiro.etiqueta} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <Badge size="sm" color={colorEstado(retiro.estado)}>
            {retiro.estado_display}
          </Badge>
          <span>
            {fecha(retiro.fecha_inicio)} – {fecha(retiro.fecha_fin)}
          </span>
          <span>{retiro.parroquia}</span>
          {retiro.sede && <span>Sede: {retiro.sede}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Actualizacion
            hora={hora}
            error={error}
            consultando={consultando}
            onActualizar={actualizar}
          />
          {puede("pagos") && (
            <Link to="/pagos" className={claseBoton}>
              Registrar pago
            </Link>
          )}
          {caminantes && (
            // Lo sirve Django, no React Router.
            <a href={`/retiros/${retiro.id}/lista.pdf`} className={claseBoton}>
              Lista de confirmados (PDF)
            </a>
          )}
          {puedeInscribir && (
            <Link
              to="/inscribir"
              state={{ retiro: { id: retiro.id, etiqueta: retiro.etiqueta } }}
              className={claseBoton}
            >
              Inscribir caminante
            </Link>
          )}
          {puedeRegistrarServidor && (
            <Link
              to="/registrar-servidor"
              state={{ retiro: { id: retiro.id, etiqueta: retiro.etiqueta } }}
              className={claseBoton}
            >
              Registrar servidor
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
          {caminantes && (
            <Metrica
              icono={<BoxIconLine className="size-6" />}
              etiqueta="Inscritos"
              valor={`${caminantes.inscritos} / ${retiro.cupo}`}
              detalle={`${caminantes.disponibles} lugares disponibles`}
            />
          )}
          {equipo && (
            <Metrica
              icono={<GroupIcon className="size-6" />}
              etiqueta="Equipo de servicio"
              valor={equipo.total}
              detalle={`${equipo.areas.length} áreas`}
            />
          )}
          <Metrica
            icono={<CalenderIcon className="size-6" />}
            etiqueta="Cuota del caminante"
            valor={dinero(retiro.cuota)}
            detalle={
              finanzas?.por_cobrar !== undefined
                ? `${dinero(finanzas.por_cobrar)} por cobrar a caminantes`
                : undefined
            }
          />
          {finanzas && (
            <Metrica
              icono={<DollarLineIcon className="size-6" />}
              etiqueta="Balance"
              valor={dinero(finanzas.balance)}
              detalle={`${dinero(finanzas.ingresos)} ingresos · ${dinero(finanzas.egresos)} gastos`}
            />
          )}
        </div>

        {caminantes && (
          <Seccion
            titulo="Caminantes"
            className="col-span-12"
            enlace={
              <Link to="/inscripciones" className={`text-sm ${claseEnlace}`}>
                Editar en Inscripciones
              </Link>
            }
          >
            <Caminantes
              caminantes={caminantes}
              opcionesPago={panel.opciones_pago}
              retiroId={retiro.id}
              puedeEditar={puedeEditar}
            />
          </Seccion>
        )}

        {servidores && (
          <Seccion
            titulo={
              retiro.cuota_servidor > 0
                ? `Pagos de servidores · ${dinero(servidores.por_cobrar)} por cobrar`
                : "Aportes de servidores"
            }
            className="col-span-12"
            enlace={
              <Link to="/pagos" className={`text-sm ${claseEnlace}`}>
                Ver pagos
              </Link>
            }
          >
            <Servidores
              servidores={servidores}
              cuota={retiro.cuota_servidor}
              opcionesPago={panel.opciones_pago}
            />
          </Seccion>
        )}

        {equipo && (
          <Seccion
            titulo="Equipo por área"
            className="col-span-12 xl:col-span-6"
            enlace={
              <Link to="/servicios" className={`text-sm ${claseEnlace}`}>
                Servidores por área
              </Link>
            }
          >
            <Equipo equipo={equipo} />
          </Seccion>
        )}

        {charlas && (
          <Seccion
            titulo="Charlas"
            className="col-span-12 xl:col-span-6"
            enlace={
              <Link to="/charlas" className={`text-sm ${claseEnlace}`}>
                Editar charlas
              </Link>
            }
          >
            {charlas.length === 0 ? (
              <p className={claseVacio}>Todavía no hay charlas.</p>
            ) : (
              <ol className="divide-y divide-gray-100 dark:divide-gray-800">
                {charlas.map((c) => (
                  <li
                    key={c.id}
                    className="flex justify-between gap-4 py-2.5 text-theme-sm"
                  >
                    <span className="text-gray-800 dark:text-white/90">
                      {c.orden}. {c.tema}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {c.expositor || "Sin expositor"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Seccion>
        )}

        {finanzas && (
          <>
            <Seccion
              titulo={`Ingresos · ${dinero(finanzas.ingresos)}`}
              className="col-span-12 xl:col-span-6"
              enlace={
                <Link to="/pagos" className={`text-sm ${claseEnlace}`}>
                  Ver pagos
                </Link>
              }
            >
              <Desglose filas={finanzas.por_concepto} />
            </Seccion>
            <Seccion
              titulo={`Gastos · ${dinero(finanzas.egresos)}`}
              className="col-span-12 xl:col-span-6"
              enlace={
                <Link to="/gastos" className={`text-sm ${claseEnlace}`}>
                  Ver gastos
                </Link>
              }
            >
              <Desglose filas={finanzas.por_categoria} />
            </Seccion>
          </>
        )}
      </div>
    </>
  );
}
