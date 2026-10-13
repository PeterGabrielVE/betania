import { api, ApiError, type PanelRetiro } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import {
  claseBoton,
  claseEnlace,
  claseTarjeta,
} from "@/components/modulos/estilos";
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
import { BoxIconLine, CalenderIcon, DollarLineIcon, GroupIcon } from "@/icons";
import NotFound from "@/pages/OtherPage/NotFound";
import { colorEstado, dinero, fecha } from "@/utils/formato";
import { useEffect, useState } from "react";
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

function Caminantes({
  caminantes,
  opcionesPago,
}: {
  caminantes: NonNullable<PanelRetiro["caminantes"]>;
  opcionesPago: PanelRetiro["opciones_pago"];
}) {
  const { filas, por_estado } = caminantes;
  const conPagos = filas.some((f) => f.estado_pago !== undefined);
  const estados = new Map(por_estado.map((e) => [e.estado, e.etiqueta]));
  const pagos = new Map(opcionesPago.map((o) => [o.valor, o.etiqueta]));

  if (filas.length === 0) {
    return <p className={claseVacio}>Todavía no hay inscripciones.</p>;
  }
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
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-white/5">
            <TableRow>
              {[
                "Caminante",
                "Teléfono",
                "Quién lo invitó",
                "Estado",
                ...(conPagos ? ["Pago", "Saldo"] : []),
              ].map((titulo) => (
                <TableCell key={titulo} isHeader className={claseEncabezado}>
                  {titulo}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
            {filas.map((f) => (
              <TableRow key={f.id}>
                <TableCell
                  className={`${claseCelda} font-medium text-gray-800 dark:text-white/90`}
                >
                  {f.persona}
                </TableCell>
                <TableCell className={claseCelda}>
                  {f.telefono || "—"}
                </TableCell>
                <TableCell className={claseCelda}>{f.padrino || "—"}</TableCell>
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
                      {dinero(f.saldo!)}
                    </TableCell>
                  </>
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
  const [resultado, setResultado] = useState<{
    id?: string;
    panel?: PanelRetiro;
    error?: ApiError | Error;
  }>({});

  useEffect(() => {
    let vigente = true;
    api<PanelRetiro>(`/retiros/${id}/panel/`)
      .then((panel) => vigente && setResultado({ id, panel }))
      .catch((error: Error) => vigente && setResultado({ id, error }));
    return () => {
      vigente = false;
    };
  }, [id]);

  const { panel, error } = resultado;
  if (resultado.id !== id) return <p className={claseVacio}>Cargando…</p>;
  if (error instanceof ApiError && [403, 404].includes(error.status)) {
    return <NotFound />;
  }
  if (!panel) return <p className={claseVacio}>{error?.message}</p>;

  const { retiro, caminantes, equipo, charlas, finanzas } = panel;
  const puede = (slug: string) =>
    modulos.find((m) => m.slug === slug)?.puede_agregar;
  const puedeInscribir = puede("personas") && puede("inscripciones");

  return (
    <>
      <PageMeta
        title={`${retiro.etiqueta} | Gestión de retiros`}
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
        <div className="flex flex-wrap gap-2">
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
            etiqueta="Cuota"
            valor={dinero(retiro.cuota)}
            detalle={
              finanzas?.por_cobrar !== undefined
                ? `${dinero(finanzas.por_cobrar)} por cobrar`
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
