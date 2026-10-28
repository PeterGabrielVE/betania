import PantallaError from "@/components/estados/PantallaError";
import { EsqueletoPanel } from "@/components/estados/Esqueleto";
import {
  type CeldaDescarga,
  type FichaCaminante,
  type FilaLiderOculto,
  type PanelRetiro,
} from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Telefono from "@/components/common/Telefono";
import {
  claseBoton,
  claseControl,
  claseEnlace,
  claseTarjeta,
} from "@/components/modulos/estilos";
import BotonesDescarga from "@/components/modulos/BotonesDescarga";
import Paginacion from "@/components/modulos/Paginacion";
import SelectorColumnas from "@/components/modulos/SelectorColumnas";
import { useColumnas, type DefColumna } from "@/components/modulos/useColumnas";
import { usePaginas } from "@/components/modulos/usePaginas";
import AccionesAsistencia from "@/components/retiros/AccionesAsistencia";
import Actualizacion from "@/components/retiros/Actualizacion";
import {
  claseFilaLider,
  EtiquetaLider,
  LeyendaLiderOculto,
  textoLiderOculto,
} from "@/components/retiros/LideresOcultos";
import LogisticaEquipo from "@/components/retiros/LogisticaEquipo";
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
import { colorEstado, dinero, fecha, montoVista } from "@/utils/formato";
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
          valor={
            (fila.telefono || ficha.telefono_casa) && (
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                {fila.telefono && (
                  <span>
                    Celular: <Telefono numero={fila.telefono} />
                  </span>
                )}
                {ficha.telefono_casa && (
                  <span>
                    Casa: <Telefono numero={ficha.telefono_casa} />
                  </span>
                )}
              </span>
            )
          }
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
                    {c.telefono &&
                      // Puede traer dos ("0212… / 0414…"): cada uno se copia aparte.
                      c.telefono.split(" / ").map((t) => (
                        <span key={t}>
                          {" · "}
                          <Telefono numero={t} />
                        </span>
                      ))}
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
            to={`/inscribir?inscripcion=${fila.id}&paso=salud&volver=${volver}`}
            className={claseEnlace}
          >
            Editar salud y contactos
          </Link>
        )}
        {puedeEditar("personas") && (
          <Link
            to={`/inscribir?inscripcion=${fila.id}&paso=personales&volver=${volver}`}
            className={claseEnlace}
          >
            Editar datos personales
          </Link>
        )}
      </div>
    </div>
  );
}

type FilaCaminantePanel = NonNullable<
  PanelRetiro["caminantes"]
>["filas"][number];
type FilaServidorPanel = NonNullable<
  PanelRetiro["servidores"]
>["filas"][number];

// Una columna de las tablas del panel: lo que se ve (`celda`; si no, el
// texto de `valor`) y lo que va en la descarga (`valor`).
type ColumnaPanel<T> = DefColumna & {
  valor: (f: T) => CeldaDescarga;
  celda?: (f: T) => React.ReactNode;
  clase?: string;
};
const textoCelda = (v: CeldaDescarga) =>
  v === null || v === "" ? "—" : typeof v === "object" ? "" : v;

// Un renglón de la tabla de caminantes: un caminante o un líder oculto (un
// servidor que va entre ellos, con su fila resaltada).
type Renglon =
  { lider: false; f: FilaCaminantePanel } | { lider: true; l: FilaLiderOculto };
const nombreRenglon = (r: Renglon) => (r.lider ? r.l.persona : r.f.persona);

// Lo que va en cada columna para un líder oculto (en la descarga, tal cual).
function valorLider(clave: string, l: FilaLiderOculto): CeldaDescarga {
  switch (clave) {
    case "persona":
      return l.persona;
    case "telefono":
      return l.telefono;
    case "estado":
      return `Líder oculto · ${l.estado_display}`;
    case "cama":
      return l.cama;
    case "mesa":
      return l.mesa;
    default:
      return "";
  }
}

function celdaLider(clave: string, l: FilaLiderOculto): React.ReactNode {
  switch (clave) {
    case "persona":
      return (
        <>
          <Link
            to={`/personas/${l.persona_id}`}
            className="hover:text-brand-500"
          >
            {l.persona}
          </Link>
          <EtiquetaLider />
        </>
      );
    case "telefono":
      return l.telefono ? <Telefono numero={l.telefono} /> : "—";
    case "estado":
      return (
        <Badge size="sm" color={colorEstado(l.estado)}>
          {l.estado_display}
        </Badge>
      );
    default:
      return textoCelda(valorLider(clave, l));
  }
}

function Caminantes({
  caminantes,
  lideres,
  opcionesPago,
  retiroId,
  retiro,
  puedeEditar,
  onCambio,
}: {
  caminantes: NonNullable<PanelRetiro["caminantes"]>;
  lideres: FilaLiderOculto[];
  opcionesPago: PanelRetiro["opciones_pago"];
  retiroId: string;
  retiro: string; // "Emaús hombres #12", para el título de la descarga
  puedeEditar: (slug: string) => boolean;
  onCambio: () => void; // tras confirmar o cancelar: recargar
}) {
  const { filas, por_estado } = caminantes;
  const [filtro, setFiltro] = useState("");
  const [mesa, setMesa] = useState(""); // "-": sin mesa
  const [texto, setTexto] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const paginas = usePaginas();
  const conPagos = filas.some((f) => f.estado_pago !== undefined);
  const conFicha = filas.some((f) => f.ficha !== undefined);
  const estados = new Map(por_estado.map((e) => [e.estado, e.etiqueta]));
  const pagos = new Map(opcionesPago.map((o) => [o.valor, o.etiqueta]));

  // Cada columna: lo que se ve en la tabla y lo que va en la descarga. Las de
  // la ficha (salud, familiares) se agregan con "Columnas".
  const definidas: ColumnaPanel<FilaCaminantePanel>[] = [
    {
      clave: "persona",
      etiqueta: "Caminante",
      fija: true,
      celda: (f) => (
        <>
          <Link
            to={`/personas/${f.persona_id}`}
            className="hover:text-brand-500"
          >
            {f.persona}
          </Link>
          <Avisos ficha={f.ficha} />
        </>
      ),
      valor: (f) => f.persona,
      clase: "font-medium text-gray-800 dark:text-white/90",
    },
    ...(conFicha
      ? ([
          {
            clave: "documento",
            etiqueta: "Documento",
            opcional: true,
            valor: (f) => f.ficha?.documento ?? "",
          },
          {
            clave: "edad",
            etiqueta: "Edad",
            valor: (f) => f.ficha?.edad ?? null,
          },
          {
            clave: "procedencia",
            etiqueta: "De dónde es",
            valor: (f) => f.ficha?.procedencia ?? "",
          },
        ] satisfies ColumnaPanel<FilaCaminantePanel>[])
      : []),
    {
      clave: "telefono",
      etiqueta: "Teléfono",
      celda: (f) =>
        f.telefono || f.ficha?.telefono_casa ? (
          <Telefono numero={f.telefono || f.ficha!.telefono_casa} />
        ) : (
          "—"
        ),
      valor: (f) => f.telefono || f.ficha?.telefono_casa || "",
    },
    {
      clave: "padrino",
      etiqueta: "Quién lo invitó",
      // Con la ficha la tabla ya es ancha: se agrega si se quiere.
      opcional: conFicha,
      valor: (f) => f.padrino,
    },
    { clave: "mesa", etiqueta: "Mesa", valor: (f) => f.mesa },
    { clave: "cama", etiqueta: "Cama", opcional: true, valor: (f) => f.cama },
    {
      clave: "estado",
      etiqueta: "Estado",
      celda: (f) => (
        <>
          <span className="flex items-center gap-1">
            <Badge size="sm" color={colorEstado(f.estado)}>
              {estados.get(f.estado)}
            </Badge>
            <AccionesAsistencia
              quien="caminante"
              id={f.id}
              nombre={f.persona}
              estado={f.estado}
              onCambio={onCambio}
            />
          </span>
          {f.motivo_cancelacion && !ve("motivo") && (
            <span className="mt-0.5 block text-theme-xs text-gray-400">
              {f.motivo_cancelacion}
            </span>
          )}
        </>
      ),
      valor: (f) => estados.get(f.estado) ?? f.estado,
    },
    {
      clave: "motivo",
      etiqueta: "Motivo de la cancelación",
      opcional: true,
      valor: (f) => f.motivo_cancelacion,
    },
    ...(conPagos
      ? ([
          {
            clave: "pago",
            etiqueta: "Pago",
            celda: (f) => (
              <Badge size="sm" color={colorEstado(f.estado_pago!)}>
                {pagos.get(f.estado_pago!)}
              </Badge>
            ),
            valor: (f) => pagos.get(f.estado_pago!) ?? "",
          },
          {
            clave: "pagado",
            etiqueta: "Pagado",
            celda: (f) => dinero(f.pagado!),
            valor: (f) => montoVista(f.pagado),
          },
          {
            clave: "debe",
            etiqueta: "Debe",
            celda: (f) => dinero(f.saldo!),
            valor: (f) => montoVista(f.saldo),
          },
        ] satisfies ColumnaPanel<FilaCaminantePanel>[])
      : []),
    ...(conFicha
      ? (
          [
            ["condicion", "Condición médica", (f) => f.ficha?.condicion_medica],
            ["tratamiento", "Tratamiento", (f) => f.ficha?.tratamiento],
            [
              "alimentacion",
              "Alimentación especial",
              (f) => f.ficha?.alimentacion,
            ],
            [
              "requerimientos",
              "Requerimientos",
              (f) => f.ficha?.requerimientos,
            ],
            ["talla", "Talla", (f) => f.ficha?.talla_camiseta],
            [
              "contactos",
              "Familiares de contacto",
              (f) =>
                (f.ficha?.contactos ?? [])
                  .map((c) =>
                    [c.nombre, c.relacion && `(${c.relacion})`, c.telefono]
                      .filter(Boolean)
                      .join(" "),
                  )
                  .join("; "),
            ],
          ] as [string, string, (f: FilaCaminantePanel) => string | undefined][]
        ).map(([clave, etiqueta, dato]) => ({
          clave,
          etiqueta,
          opcional: true,
          valor: (f: FilaCaminantePanel) => dato(f) ?? "",
        }))
      : []),
  ];
  const { ve, selector } = useColumnas("panel_caminantes", definidas);
  const columnas = definidas.filter((c) => ve(c.clave));

  if (filas.length === 0 && lideres.length === 0) {
    return <p className={claseVacio}>Todavía no hay inscripciones.</p>;
  }

  const disponibles = filtrosCaminante.filter(
    (f) => !f.requiere || (f.requiere === "pagos" ? conPagos : conFicha),
  );
  const elegido = disponibles.find((f) => f.valor === filtro) ?? disponibles[0];
  const buscado = texto.trim().toLowerCase();
  const mesas = [
    ...new Set([...filas, ...lideres].map((x) => x.mesa).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const coincide = (nombre: string, suMesa: string) =>
    (!buscado || nombre.toLowerCase().includes(buscado)) &&
    (!mesa || (mesa === "-" ? !suMesa : suMesa === mesa));
  // Los líderes ocultos van entre los caminantes, por nombre; con un filtro
  // propio del caminante (deben, salud…) no salen.
  const visibles: Renglon[] = [
    ...filas
      .filter((f) => elegido.cumple(f) && coincide(f.persona, f.mesa))
      .map((f) => ({ lider: false as const, f })),
    ...(elegido.valor
      ? []
      : lideres
          .filter((l) => coincide(l.persona, l.mesa))
          .map((l) => ({ lider: true as const, l }))),
  ].sort((a, b) => nombreRenglon(a).localeCompare(nombreRenglon(b), "es"));
  const totalLideres = visibles.filter((r) => r.lider).length;
  const { pagina, hayPaginas, paginacion } = paginas.de(
    visibles,
    `${elegido.valor}|${buscado}|${mesa}`,
  );

  const alternar = (id: string) =>
    setAbiertos((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  const tablaDescarga = () => ({
    titulo: `Caminantes · ${retiro}`,
    subtitulo: [
      elegido.valor && `Filtro: ${elegido.etiqueta}`,
      mesa && (mesa === "-" ? "Sin mesa" : `Mesa ${mesa}`),
      buscado && `Búsqueda: «${texto.trim()}»`,
    ]
      .filter(Boolean)
      .join(" · "),
    columnas: columnas.map((c) => c.etiqueta),
    filas: visibles.map((r) =>
      columnas.map((c) => (r.lider ? valorLider(c.clave, r.l) : c.valor(r.f))),
    ),
  });

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
        {mesas.length > 0 && (
          <select
            value={mesa}
            onChange={(e) => setMesa(e.target.value)}
            className={claseControl}
            aria-label="Filtrar por mesa"
          >
            <option value="">Mesa: todas</option>
            {mesas.map((m) => (
              <option key={m} value={m}>
                Mesa {m}
              </option>
            ))}
            <option value="-">Sin mesa</option>
          </select>
        )}
        {conFicha && (
          <button
            type="button"
            className={claseBoton}
            onClick={() =>
              setAbiertos(
                abiertos.size
                  ? new Set()
                  : new Set(visibles.flatMap((r) => (r.lider ? [] : [r.f.id]))),
              )
            }
          >
            {abiertos.size ? "Cerrar fichas" : "Abrir todas las fichas"}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:ms-auto">
          <SelectorColumnas {...selector} />
          {visibles.length > 0 && <BotonesDescarga tabla={tablaDescarga} />}
        </div>
      </div>
      {visibles.length === 0 ? (
        <p className={claseVacio}>Ningún caminante coincide.</p>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/5">
              <TableRow>
                {columnas.map((c) => (
                  <TableCell key={c.clave} isHeader className={claseEncabezado}>
                    {c.etiqueta}
                  </TableCell>
                ))}
                {conFicha && <TableCell isHeader className={claseEncabezado} />}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
              {pagina.map((r) => {
                if (r.lider) {
                  return (
                    <TableRow
                      key={`lider-${r.l.id}`}
                      className={claseFilaLider}
                      title={textoLiderOculto}
                    >
                      {columnas.map((c) => (
                        <TableCell
                          key={c.clave}
                          className={`${claseCelda} ${c.clase ?? ""}`}
                        >
                          {celdaLider(c.clave, r.l)}
                        </TableCell>
                      ))}
                      {conFicha && <TableCell className={claseCelda} />}
                    </TableRow>
                  );
                }
                const f = r.f;
                return (
                  <Fragment key={f.id}>
                    <TableRow>
                      {columnas.map((c) => (
                        <TableCell
                          key={c.clave}
                          className={`${claseCelda} ${c.clase ?? ""}`}
                        >
                          {c.celda ? c.celda(f) : textoCelda(c.valor(f))}
                        </TableCell>
                      ))}
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
                        <TableCell
                          colSpan={columnas.length + 1}
                          className="px-4 pb-4"
                        >
                          <Ficha
                            fila={f}
                            retiroId={retiroId}
                            puedeEditar={puedeEditar}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {totalLideres > 0 && (
        <div className="mt-4">
          <LeyendaLiderOculto total={totalLideres} />
        </div>
      )}
      {hayPaginas && (
        <div className="mt-5">
          <Paginacion {...paginacion} />
        </div>
      )}
    </>
  );
}

// Los servidores del retiro: su estado (con Confirmar / Cancelar), áreas,
// disponibilidad y, con acceso a finanzas, lo que pagaron de su cuota.
function Servidores({
  servidores,
  cuota,
  opcionesPago,
  retiro,
  onCambio,
}: {
  servidores: NonNullable<PanelRetiro["servidores"]>;
  retiro: string;
  cuota: number;
  opcionesPago: PanelRetiro["opciones_pago"];
  onCambio: () => void;
}) {
  const [estado, setEstado] = useState("");
  const [soloDeben, setSoloDeben] = useState(false);
  const paginas = usePaginas();
  const pagos = new Map(opcionesPago.map((o) => [o.valor, o.etiqueta]));
  const conPagos = servidores.filas.some((f) => f.estado_pago !== undefined);
  // Cuota del retiro o, sin ella, el monto propio de algún servidor.
  const conCuota =
    conPagos && (cuota > 0 || servidores.filas.some((f) => (f.saldo ?? 0) > 0));
  const siNo = (v: boolean | null) => (v === null ? "" : v ? "Sí" : "No");

  // Cada columna: lo que se ve en la tabla y lo que va en la descarga.
  const definidas: ColumnaPanel<FilaServidorPanel>[] = [
    {
      clave: "persona",
      etiqueta: "Servidor",
      fija: true,
      celda: (f) => (
        <>
          <Link
            to={`/personas/${f.persona_id}`}
            className="hover:text-brand-500"
          >
            {f.persona}
          </Link>
          {f.lider_oculto && <EtiquetaLider />}
        </>
      ),
      valor: (f) => f.persona,
      clase: "font-medium text-gray-800 dark:text-white/90",
    },
    {
      clave: "estado",
      etiqueta: "Asistencia",
      celda: (f) => (
        <>
          <span className="flex items-center gap-1">
            <Badge size="sm" color={colorEstado(f.estado)}>
              {f.estado_display}
            </Badge>
            <AccionesAsistencia
              quien="servidor"
              id={f.id}
              nombre={f.persona}
              estado={f.estado}
              onCambio={onCambio}
            />
          </span>
          {f.motivo_cancelacion && !ve("motivo") && (
            <span className="mt-0.5 block text-theme-xs text-gray-400">
              {f.motivo_cancelacion}
            </span>
          )}
        </>
      ),
      valor: (f) => f.estado_display,
    },
    {
      clave: "motivo",
      etiqueta: "Motivo de la cancelación",
      opcional: true,
      valor: (f) => f.motivo_cancelacion,
    },
    {
      clave: "tipo",
      etiqueta: "Participa como",
      opcional: true,
      valor: (f) => f.tipo,
    },
    { clave: "areas", etiqueta: "Área", valor: (f) => f.areas || f.tipo },
    {
      clave: "telefono",
      etiqueta: "Teléfono",
      celda: (f) => (f.telefono ? <Telefono numero={f.telefono} /> : "—"),
      valor: (f) => f.telefono,
    },
    {
      clave: "duerme",
      etiqueta: "Duerme",
      valor: (f) => siNo(f.duerme_en_casa),
    },
    { clave: "cama", etiqueta: "Cama", opcional: true, valor: (f) => f.cama },
    { clave: "turnos", etiqueta: "Turnos", valor: (f) => f.turnos },
    { clave: "camisa", etiqueta: "Camisa", valor: (f) => f.camisa },
    ...(conCuota
      ? ([
          {
            clave: "pago",
            etiqueta: "Pago",
            celda: (f) => (
              <Badge size="sm" color={colorEstado(f.estado_pago!)}>
                {pagos.get(f.estado_pago!)}
              </Badge>
            ),
            valor: (f) => pagos.get(f.estado_pago!) ?? "",
          },
        ] satisfies ColumnaPanel<FilaServidorPanel>[])
      : []),
    ...(conPagos
      ? ([
          {
            clave: "pagado",
            etiqueta: "Pagado",
            celda: (f) => dinero(f.pagado ?? 0),
            valor: (f) => montoVista(f.pagado),
          },
        ] satisfies ColumnaPanel<FilaServidorPanel>[])
      : []),
    ...(conCuota
      ? ([
          {
            clave: "debe",
            etiqueta: "Debe",
            celda: (f) => dinero(f.saldo ?? 0),
            valor: (f) => montoVista(f.saldo),
          },
        ] satisfies ColumnaPanel<FilaServidorPanel>[])
      : []),
  ];
  const { ve, selector } = useColumnas("panel_servidores", definidas);
  const columnas = definidas.filter((c) => ve(c.clave));

  if (servidores.filas.length === 0) {
    return <p className={claseVacio}>Todavía no hay servidores registrados.</p>;
  }
  const visibles = servidores.filas.filter(
    (f) =>
      (!estado || f.estado === estado) && (!soloDeben || (f.saldo ?? 0) > 0),
  );
  const { pagina, hayPaginas, paginacion } = paginas.de(
    visibles,
    `${estado}|${soloDeben}`,
  );
  const tablaDescarga = () => ({
    titulo: `Servidores · ${retiro}`,
    subtitulo: [
      estado &&
        `Asistencia: ${servidores.por_estado.find((e) => e.estado === estado)?.etiqueta}`,
      soloDeben && "Solo los que deben",
    ]
      .filter(Boolean)
      .join(" · "),
    columnas: columnas.map((c) => c.etiqueta),
    filas: visibles.map((f) => columnas.map((c) => c.valor(f))),
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {servidores.por_estado
            .filter((e) => e.total)
            .map((e) => (
              <Badge key={e.estado} size="sm" color={colorEstado(e.estado)}>
                {e.etiqueta}: {e.total}
              </Badge>
            ))}
        </div>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className={`${claseControl} ms-auto`}
          aria-label="Filtrar servidores por asistencia"
        >
          <option value="">Todos</option>
          {servidores.por_estado.map((e) => (
            <option key={e.estado} value={e.estado}>
              {e.etiqueta} ({e.total})
            </option>
          ))}
        </select>
        {conCuota && (
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <input
              type="checkbox"
              checked={soloDeben}
              onChange={(e) => setSoloDeben(e.target.checked)}
            />
            Solo los que deben
          </label>
        )}
        <SelectorColumnas {...selector} />
        {visibles.length > 0 && <BotonesDescarga tabla={tablaDescarga} />}
      </div>
      {visibles.length === 0 ? (
        <p className={claseVacio}>Ningún servidor coincide.</p>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/5">
              <TableRow>
                {columnas.map((c) => (
                  <TableCell key={c.clave} isHeader className={claseEncabezado}>
                    {c.etiqueta}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
              {pagina.map((f) => (
                <TableRow
                  key={f.id}
                  className={`${f.estado === "cancelado" ? "opacity-60" : ""} ${
                    f.lider_oculto ? claseFilaLider : ""
                  }`}
                  title={f.lider_oculto ? textoLiderOculto : undefined}
                >
                  {columnas.map((c) => (
                    <TableCell
                      key={c.clave}
                      className={`${claseCelda} ${c.clase ?? ""}`}
                    >
                      {c.celda ? c.celda(f) : textoCelda(c.valor(f))}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {hayPaginas && (
        <div className="mt-5">
          <Paginacion {...paginacion} />
        </div>
      )}
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

  if (!alDia) return <EsqueletoPanel />;
  const panel = datos;
  if (!panel) return <PantallaError error={error} onReintentar={actualizar} />;

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
          {finanzas && (
            <Link
              to={`/control-pagos?retiro=${retiro.id}`}
              className={claseBoton}
            >
              Control de pagos
            </Link>
          )}
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
              lideres={caminantes.lideres_ocultos}
              opcionesPago={panel.opciones_pago}
              retiroId={retiro.id}
              retiro={retiro.etiqueta}
              puedeEditar={puedeEditar}
              onCambio={actualizar}
            />
          </Seccion>
        )}

        {servidores && (
          <Seccion
            titulo={
              servidores.por_cobrar !== undefined && servidores.por_cobrar > 0
                ? `Servidores · ${dinero(servidores.por_cobrar)} por cobrar`
                : "Servidores"
            }
            className="col-span-12"
            enlace={
              <Link to="/participaciones" className={`text-sm ${claseEnlace}`}>
                Ver todos
              </Link>
            }
          >
            <Servidores
              servidores={servidores}
              cuota={retiro.cuota_servidor}
              opcionesPago={panel.opciones_pago}
              retiro={retiro.etiqueta}
              onCambio={actualizar}
            />
          </Seccion>
        )}

        {equipo && (
          <Seccion
            titulo="Equipo por área"
            className="col-span-12 xl:col-span-6"
            enlace={
              <Link to="/participaciones" className={`text-sm ${claseEnlace}`}>
                Ver servidores
              </Link>
            }
          >
            <Equipo equipo={equipo} />
          </Seccion>
        )}

        {panel.logistica_equipo && (
          <Seccion
            titulo="Logística del equipo"
            className="col-span-12 xl:col-span-6"
          >
            <LogisticaEquipo logistica={panel.logistica_equipo} />
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
