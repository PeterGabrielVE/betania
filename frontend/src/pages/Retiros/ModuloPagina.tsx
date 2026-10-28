import PantallaError from "@/components/estados/PantallaError";
import {
  api,
  type Campo,
  type Modulo,
  type Pagina,
  type Registro,
} from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import BotonesDescarga from "@/components/modulos/BotonesDescarga";
import SelectorColumnas from "@/components/modulos/SelectorColumnas";
import { useColumnas } from "@/components/modulos/useColumnas";
import BotonLimpiarFiltros from "@/components/modulos/BotonLimpiarFiltros";
import {
  parametrosFiltros,
  resumenFiltros,
  sinFiltro,
  type ValoresFiltros,
} from "@/components/modulos/filtrosAvanzados";
import PanelFiltros from "@/components/modulos/PanelFiltros";
import DialogoCuenta from "@/components/modulos/DialogoCuenta";
import DialogoImportar from "@/components/modulos/DialogoImportar";
import DialogoListado from "@/components/ocr/DialogoListado";
import DialogoNuevaPersona from "@/components/modulos/DialogoNuevaPersona";
import { opcionesNuevaPersona } from "@/components/modulos/nuevaPersona";
import { celda } from "@/components/modulos/celda";
import { DialogoCancelar } from "@/components/retiros/AccionesAsistencia";
import {
  claseFilaLider,
  EtiquetaLider,
  LeyendaLiderOculto,
  textoLiderOculto,
} from "@/components/retiros/LideresOcultos";
import Badge from "@/components/ui/badge/Badge";
import { colorEstado } from "@/utils/formato";
import {
  ASISTENCIA,
  cambiarAsistencia,
  type Quien,
} from "@/components/retiros/asistencia";
import {
  claseBoton,
  claseBotonPrincipal,
  claseControl,
  claseEnlace,
} from "@/components/modulos/estilos";
import FormularioModulo from "@/components/modulos/FormularioModulo";
import Paginacion from "@/components/modulos/Paginacion";
import {
  guardarPorPagina,
  porPaginaGuardado,
} from "@/components/modulos/usePaginas";
import SelectorRemoto from "@/components/modulos/SelectorRemoto";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import NotFound from "@/pages/OtherPage/NotFound";
import {
  EscanearIcon,
  KeyIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SliderHorizontalIcon,
  TrashBinIcon,
  UploadIcon,
} from "@/icons";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

const claseEncabezado =
  "px-4 py-3 text-start text-theme-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400";
const claseCelda =
  "max-w-60 truncate px-4 py-3.5 text-start text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400";
// La columna de acciones queda pegada al borde aunque la tabla se desplace.
const claseFija = "sticky end-0 border-s border-gray-100 dark:border-white/5";
const claseIcono =
  "flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5";

type Acciones = {
  modulo: Modulo;
  onEditar: (fila: Registro) => void;
  onEliminar: (fila: Registro) => void;
  // Usuarios: su cuenta de acceso (usuario y contraseña).
  onCuenta?: (fila: Registro) => void;
  // Roles: su tabla de permisos.
  onPermisos?: (fila: Registro) => void;
  // Caminantes: abre el formulario del servidor que va como líder oculto.
  onEditarLider?: (fila: Registro) => void;
  // Caminantes y servidores: casillas para confirmar o cancelar varios.
  seleccion?: {
    ids: Set<string>;
    alternar: (id: string) => void;
    todas: (ids: string[], marcar: boolean) => void;
  };
};

// Casilla de selección de una fila (o de todas, en el encabezado).
function Casilla({
  marcada,
  onCambio,
  etiqueta,
}: {
  marcada: boolean;
  onCambio: () => void;
  etiqueta: string;
}) {
  return (
    <input
      type="checkbox"
      className="size-4 rounded border-gray-300 text-brand-500"
      checked={marcada}
      onChange={onCambio}
      aria-label={etiqueta}
    />
  );
}

// Editar / eliminar como iconos, con su nombre para lectores de pantalla.
function BotonesFila({
  fila,
  modulo,
  onEditar,
  onEliminar,
  onCuenta,
  onPermisos,
}: Acciones & { fila: Registro }) {
  return (
    <div className="flex items-center gap-1">
      {onPermisos && (
        <button
          type="button"
          className={`${claseIcono} hover:text-brand-500`}
          onClick={() => onPermisos(fila)}
          title="Permisos del rol"
        >
          <LockIcon className="size-4" />
          <span className="sr-only">Permisos de {fila.etiqueta}</span>
        </button>
      )}
      {onCuenta && (
        <button
          type="button"
          className={`${claseIcono} hover:text-brand-500`}
          onClick={() => onCuenta(fila)}
          title="Cuenta de acceso (usuario y contraseña)"
        >
          <KeyIcon className="size-4" />
          <span className="sr-only">Cuenta de acceso de {fila.etiqueta}</span>
        </button>
      )}
      {modulo.puede_cambiar && (
        <button
          type="button"
          className={`${claseIcono} hover:text-brand-500`}
          onClick={() => onEditar(fila)}
          title="Editar"
        >
          <PencilIcon className="size-4" />
          <span className="sr-only">Editar {fila.etiqueta}</span>
        </button>
      )}
      {modulo.puede_eliminar && (
        <button
          type="button"
          className={`${claseIcono} hover:text-error-500`}
          onClick={() => onEliminar(fila)}
          title="Eliminar"
        >
          <TrashBinIcon className="size-4" />
          <span className="sr-only">Eliminar {fila.etiqueta}</span>
        </button>
      )}
    </div>
  );
}

// Personas, caminantes y servidores se editan con su formulario por pasos
// (no con el formulario genérico).
const EDICION_POR_PASOS: Record<string, (id: string) => string> = {
  personas: (id) => `/personas/${id}/editar`,
  inscripciones: (id) => `/inscribir?inscripcion=${id}`,
  participaciones: (id) => `/registrar-servidor?participacion=${id}`,
};

function rutaDeEdicion(slug: string, id: string, volver: string) {
  const ruta = EDICION_POR_PASOS[slug](id);
  return `${ruta}${ruta.includes("?") ? "&" : "?"}volver=${encodeURIComponent(volver)}`;
}

// Módulos donde se puede leer la foto de un listado, y cómo se cargan.
const LISTADO_OCR: Record<
  string,
  "caminantes" | "servidores" | "personas" | undefined
> = {
  personas: "personas",
  inscripciones: "caminantes",
  participaciones: "servidores",
};

// Módulos donde se confirma o cancela la asistencia de varios a la vez.
const ASISTENCIA_MASIVA: Record<string, Quien | undefined> = {
  inscripciones: "caminante",
  participaciones: "servidor",
};

const ALTA_POR_PASOS: Record<string, string> = {
  inscripciones: "/inscribir",
  participaciones: "/registrar-servidor",
};

// A dónde lleva el primer dato de cada fila: un retiro, a su panel; una
// persona (o su inscripción o su lugar en el equipo), a su ficha.
const DESTINO: Record<string, (fila: Registro) => string> = {
  retiros: (f) => `/retiros/${f.id}`,
  personas: (f) => `/personas/${f.id}`,
  inscripciones: (f) => `/personas/${f.persona}`,
  participaciones: (f) => `/personas/${f.persona}`,
};

// El primer dato de la fila, con enlace si el módulo tiene a dónde llevar.
function Titulo({
  modulo,
  columna,
  fila,
}: {
  modulo: Modulo;
  columna: Campo;
  fila: Registro;
}) {
  const contenido = celda(columna, fila);
  const destino = DESTINO[modulo.slug];
  return destino ? (
    <Link
      to={destino(fila)}
      className="text-gray-800 hover:text-brand-500 dark:text-white/90 dark:hover:text-brand-400"
    >
      {contenido}
    </Link>
  ) : (
    contenido
  );
}

// Un líder oculto en la tabla de caminantes: su asistencia como servidor y,
// en lo que es solo del caminante (pago, quién lo invitó…), nada.
function celdaLider(columna: Campo, fila: Registro): React.ReactNode {
  if (columna.nombre === "estado") {
    return (
      <Badge size="sm" color={colorEstado(String(fila.estado))}>
        {String(fila.estado_display)}
      </Badge>
    );
  }
  if (columna.tipo !== "fk" && fila[columna.nombre] == null) return "—";
  return celda(columna, fila);
}

function EditarLider({
  fila,
  onEditarLider,
}: {
  fila: Registro;
  onEditarLider?: (fila: Registro) => void;
}) {
  if (!onEditarLider) return null;
  return (
    <button
      type="button"
      className={`${claseIcono} hover:text-brand-500`}
      onClick={() => onEditarLider(fila)}
      title="Editar servidor"
    >
      <PencilIcon className="size-4" />
      <span className="sr-only">Editar a {fila.etiqueta}</span>
    </button>
  );
}

type PropsRegistros = Acciones & {
  columnas: Campo[];
  filas: Registro[];
  cargando: boolean;
  // Caminantes: los líderes ocultos, al final y resaltados.
  lideres?: Registro[];
};

// Pantallas medianas y grandes: tabla.
function TablaRegistros({
  columnas,
  filas,
  cargando,
  lideres = [],
  ...acciones
}: PropsRegistros) {
  const { modulo, seleccion } = acciones;
  const conAcciones = modulo.puede_cambiar || modulo.puede_eliminar;
  const todas =
    filas.length > 0 && filas.every((f) => seleccion?.ids.has(f.id));
  return (
    // relative: el texto sr-only (posición absoluta) no se sale de la caja.
    <div className="relative hidden max-w-full overflow-x-auto md:block">
      <Table>
        <TableHeader className="border-y border-gray-100 bg-gray-50 dark:border-white/5 dark:bg-white/2">
          <TableRow>
            {seleccion && (
              <TableCell isHeader className="w-10 ps-4">
                <Casilla
                  marcada={todas}
                  etiqueta="Elegir todos los de esta página"
                  onCambio={() =>
                    seleccion.todas(
                      filas.map((f) => f.id),
                      !todas,
                    )
                  }
                />
              </TableCell>
            )}
            {columnas.map((columna) => (
              <TableCell
                key={columna.nombre}
                isHeader
                className={claseEncabezado}
              >
                {columna.etiqueta}
              </TableCell>
            ))}
            {conAcciones && (
              <TableCell
                isHeader
                className={`${claseEncabezado} ${claseFija} bg-gray-50 dark:bg-gray-900`}
              >
                <span className="sr-only">Acciones</span>
              </TableCell>
            )}
          </TableRow>
        </TableHeader>
        <TableBody
          className={`divide-y divide-gray-100 dark:divide-white/5 ${cargando ? "opacity-50" : ""}`}
        >
          {filas.map((fila) => (
            <TableRow
              key={fila.id}
              className="group transition-colors hover:bg-gray-50 dark:hover:bg-white/2"
            >
              {seleccion && (
                <TableCell className="w-10 ps-4">
                  <Casilla
                    marcada={seleccion.ids.has(fila.id)}
                    etiqueta={`Elegir ${fila.etiqueta}`}
                    onCambio={() => seleccion.alternar(fila.id)}
                  />
                </TableCell>
              )}
              {columnas.map((columna, i) => (
                <TableCell
                  key={columna.nombre}
                  className={`${claseCelda} ${i === 0 ? "font-medium text-gray-800 dark:text-white/90" : ""}`}
                >
                  {i === 0 ? (
                    <Titulo modulo={modulo} columna={columna} fila={fila} />
                  ) : (
                    celda(columna, fila)
                  )}
                </TableCell>
              ))}
              {conAcciones && (
                <TableCell
                  className={`${claseFija} bg-white px-3 py-2 text-end group-hover:bg-gray-50 dark:bg-gray-900 dark:group-hover:bg-gray-800`}
                >
                  <BotonesFila fila={fila} {...acciones} />
                </TableCell>
              )}
            </TableRow>
          ))}
          {lideres.map((fila) => (
            <TableRow
              key={`lider-${fila.id}`}
              className={claseFilaLider}
              title={textoLiderOculto}
            >
              {seleccion && <TableCell className="w-10 ps-4" />}
              {columnas.map((columna, i) => (
                <TableCell
                  key={columna.nombre}
                  className={`${claseCelda} ${i === 0 ? "font-medium text-gray-800 dark:text-white/90" : ""}`}
                >
                  {i === 0 ? (
                    <>
                      <Titulo modulo={modulo} columna={columna} fila={fila} />
                      <EtiquetaLider />
                    </>
                  ) : (
                    celdaLider(columna, fila)
                  )}
                </TableCell>
              ))}
              {conAcciones && (
                <TableCell
                  className={`${claseFija} px-3 py-2 text-end ${claseFilaLider}`}
                >
                  <EditarLider fila={fila} {...acciones} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Celulares: una tarjeta por registro, con cada dato bajo su nombre.
function TarjetasRegistros({
  columnas,
  filas,
  cargando,
  lideres = [],
  ...acciones
}: PropsRegistros) {
  const { modulo, seleccion } = acciones;
  const [primera, ...resto] = columnas;
  return (
    <ul
      className={`divide-y divide-gray-100 border-t border-gray-100 md:hidden dark:divide-white/5 dark:border-white/5 ${cargando ? "opacity-50" : ""}`}
    >
      {filas.map((fila) => (
        <li key={fila.id} className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-3 text-theme-sm font-semibold break-words text-gray-800 dark:text-white/90">
              {seleccion && (
                <Casilla
                  marcada={seleccion.ids.has(fila.id)}
                  etiqueta={`Elegir ${fila.etiqueta}`}
                  onCambio={() => seleccion.alternar(fila.id)}
                />
              )}
              <Titulo modulo={modulo} columna={primera} fila={fila} />
            </span>
            <BotonesFila fila={fila} {...acciones} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            {resto.map((columna) => (
              <div key={columna.nombre} className="min-w-0">
                <dt className="text-theme-xs text-gray-400 dark:text-gray-500">
                  {columna.etiqueta}
                </dt>
                <dd className="mt-0.5 truncate text-theme-sm text-gray-700 dark:text-gray-300">
                  {celda(columna, fila)}
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
      {lideres.map((fila) => (
        <li
          key={`lider-${fila.id}`}
          className={`px-4 py-4 ${claseFilaLider}`}
          title={textoLiderOculto}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 text-theme-sm font-semibold break-words text-gray-800 dark:text-white/90">
              <Titulo modulo={modulo} columna={primera} fila={fila} />
              <EtiquetaLider />
            </span>
            <EditarLider fila={fila} {...acciones} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            {resto.map((columna) => (
              <div key={columna.nombre} className="min-w-0">
                <dt className="text-theme-xs text-gray-400 dark:text-gray-500">
                  {columna.etiqueta}
                </dt>
                <dd className="mt-0.5 truncate text-theme-sm text-gray-700 dark:text-gray-300">
                  {celdaLider(columna, fila)}
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

// Mientras llega la primera página: renglones grises en lugar de "Cargando…".
function Esqueleto() {
  return (
    <div className="space-y-3 border-t border-gray-100 px-5 py-5 dark:border-white/5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg bg-gray-100 dark:bg-white/5"
        />
      ))}
    </div>
  );
}

// Filtro escrito (p. ej. la mesa): busca el valor exacto al dejar de escribir.
function FiltroTexto({
  etiqueta,
  valor,
  onCambio,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
}) {
  const [texto, setTexto] = useState(valor);
  // Al limpiar los filtros desde afuera, se vacía también.
  const [previo, setPrevio] = useState(valor);
  if (valor !== previo) {
    setPrevio(valor);
    setTexto(valor);
  }
  useEffect(() => {
    if (texto.trim() === valor) return;
    const espera = setTimeout(() => onCambio(texto.trim()), 300);
    return () => clearTimeout(espera);
    // onCambio cambia en cada render del listado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, valor]);
  return (
    <input
      type="search"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      placeholder={`${etiqueta}: todas`}
      aria-label={etiqueta}
      className={`${claseControl} w-full sm:w-36`}
    />
  );
}

// Listado + alta/edición/borrado de un módulo, dibujado a partir de su esquema.
// Caminantes: los servidores que van como líder oculto, con el retiro, la mesa
// y la búsqueda del listado (la descarga los agrega igual), como filas de la
// tabla. Necesita ver Servidores; `activo` en falso: ninguno.
function useLideresOcultos({
  activo,
  retiro,
  mesa,
  busqueda,
  version,
}: {
  activo: boolean;
  retiro: string;
  mesa: string;
  busqueda: string;
  version: number;
}) {
  const { modulos } = useAuth();
  const servidores = modulos.find((m) => m.slug === "participaciones");
  const [filas, setFilas] = useState<Registro[]>([]);
  const buscar = activo && !!servidores;
  useEffect(() => {
    if (!buscar || !servidores) return;
    const estados = new Map(
      servidores.campos
        .find((c) => c.nombre === "estado")
        ?.opciones?.map((o) => [o.valor, o.etiqueta]),
    );
    const p = new URLSearchParams({ lider_oculto: "true", page_size: "100" });
    if (retiro) p.set("retiro", retiro);
    if (mesa) p.set("mesa", mesa);
    if (busqueda) p.set("search", busqueda);
    let vigente = true;
    api<Pagina<Registro>>(`/participaciones/?${p}`)
      .then((d) => {
        if (!vigente) return;
        setFilas(
          d.results
            .filter((r) => r.estado !== "cancelado")
            // Con las columnas de Caminantes (persona, celular, retiro, cama…).
            .map((r) => ({
              id: r.id,
              etiqueta: String(r.persona_etiqueta ?? ""),
              persona: r.persona,
              persona_etiqueta: r.persona_etiqueta,
              persona_foto: r.persona_foto,
              persona_sexo: r.persona_sexo,
              telefono: r.telefono,
              retiro: r.retiro,
              retiro_etiqueta: r.retiro_etiqueta,
              estado: r.estado,
              estado_display: estados.get(String(r.estado)) ?? String(r.estado),
              cama: r.cama,
              mesa: r.mesa,
            })),
        );
      })
      .catch(() => vigente && setFilas([]));
    return () => {
      vigente = false;
    };
  }, [buscar, servidores, retiro, mesa, busqueda, version]);
  return {
    filas: buscar ? filas : [],
    editar: servidores?.puede_cambiar,
  };
}

function Listado({ modulo }: { modulo: Modulo }) {
  const navigate = useNavigate();
  // ?editar, ?nuevo (ver abajo) y filtros en la dirección: ?estado=confirmada,
  // ?retiro=<id>&retiro__etiqueta=…, ?search=…, ?f_edad_min=… (panel lateral).
  // Así el tablero y otras pantallas abren un listado ya filtrado.
  const [busqueda, setBusquedaUrl] = useSearchParams();
  const [texto, setTexto] = useState(() => busqueda.get("search") ?? "");
  const [consulta, setConsulta] = useState(() => ({
    busqueda: busqueda.get("search") ?? "",
    pagina: 1,
  }));
  const [porPagina, setPorPagina] = useState(porPaginaGuardado);
  // Filtros activos: campo -> valor (y su texto, para las relaciones).
  // Empieza con la edición preferida en el filtro "Retiro" (se puede quitar).
  const [filtros, setFiltros] = useState<
    Record<string, { valor: string; etiqueta: string }>
  >(() => {
    const iniciales = Object.fromEntries(
      modulo.filtros
        .filter((f) => f.predeterminado)
        .map((f) => [f.nombre, f.predeterminado!]),
    );
    for (const f of modulo.filtros) {
      const valor = busqueda.get(f.nombre);
      if (valor !== null) {
        iniciales[f.nombre] = {
          valor,
          etiqueta: busqueda.get(`${f.nombre}__etiqueta`) ?? "",
        };
      }
    }
    return iniciales;
  });
  const [version, setVersion] = useState(0); // se incrementa para recargar
  const [resultado, setResultado] = useState<{
    clave: string;
    datos?: Pagina<Registro>;
    error?: Error;
  }>({ clave: "" });
  // ?editar=<id>&volver=<ruta>: abre ese registro (p. ej. desde el panel de un
  // retiro) y, al guardar o cancelar, regresa a esa ruta. ?nuevo=1 abre el
  // formulario de alta (los accesos rápidos del inicio).
  // undefined = cerrado, null = alta, registro = edición
  const [editando, setEditando] = useState<Registro | null | undefined>(() =>
    busqueda.has("nuevo") && modulo.puede_agregar ? null : undefined,
  );
  const [aviso, setAviso] = useState("");
  // Filas elegidas para confirmar o cancelar varias (caminantes, servidores).
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [cancelandoVarios, setCancelandoVarios] = useState(false);
  // Usuarios: la cuenta que se está editando; Personas: importar de Excel.
  // Ruta de la API de la cuenta que se está editando (Usuarios o Servidores).
  const [cuentaDe, setCuentaDe] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  // Leer la foto de un listado de personas (OCR).
  const [leyendoListado, setLeyendoListado] = useState(false);
  // Personas: elegir si se registra un caminante, un servidor o solo la persona.
  const [eligiendoAlta, setEligiendoAlta] = useState(false);
  const { modulos, sesion } = useAuth();
  // La llave de Servidores: solo el super administrador y el coordinador de
  // logística (el servidor revisa además que sea de su retiro).
  const daAcceso = !!(sesion?.autenticado && sesion.da_acceso_servidores);
  // Panel lateral de filtros (edad, fechas, pago…) y lo aplicado en él.
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [avanzados, setAvanzados] = useState<ValoresFiltros>(() =>
    Object.fromEntries([...busqueda].filter(([k]) => k.startsWith("f_"))),
  );
  // Los filtros de la dirección ya se aplicaron: se quitan de ella para que
  // no vuelvan al recargar después de cambiarlos a mano.
  useEffect(() => {
    const deFiltro = (k: string) =>
      k === "search" ||
      k.startsWith("f_") ||
      modulo.filtros.some(
        (f) => k === f.nombre || k === `${f.nombre}__etiqueta`,
      );
    if ([...busqueda.keys()].some(deFiltro)) {
      setBusquedaUrl(
        new URLSearchParams([...busqueda].filter(([k]) => !deFiltro(k))),
        { replace: true },
      );
    }
    // Solo al abrir el listado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const editar = busqueda.get("editar");
  const volver = busqueda.get("volver");

  useEffect(() => {
    if (!editar) return;
    if (EDICION_POR_PASOS[modulo.slug]) {
      navigate(
        rutaDeEdicion(modulo.slug, editar, volver ?? `/${modulo.slug}`),
        {
          replace: true,
        },
      );
      return;
    }
    let vigente = true;
    api<Registro>(`/${modulo.slug}/${editar}/`)
      .then((registro) => vigente && setEditando(registro))
      .catch((e: Error) => vigente && setAviso(e.message));
    return () => {
      vigente = false;
    };
    // volver y navigate no cambian mientras se abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulo.slug, editar]);

  const cerrar = () => {
    setEditando(undefined);
    if (volver?.startsWith("/")) navigate(volver);
  };

  // Espera a que el usuario deje de escribir antes de consultar.
  useEffect(() => {
    const espera = setTimeout(() => {
      setConsulta((c) =>
        c.busqueda === texto ? c : { busqueda: texto, pagina: 1 },
      );
    }, 300);
    return () => clearTimeout(espera);
  }, [texto]);

  // Los filtros que fija el rol (p. ej. la parroquia del coordinador) los
  // aplica el servidor; aquí solo se muestran.
  const libres = modulo.filtros.filter((f) => !f.fijo);
  const fijos = modulo.filtros.filter((f) => f.fijo);
  // Una columna con el mismo valor en todas las filas no dice nada.
  const posibles = modulo.lista.filter(
    (c) => !fijos.some((f) => f.nombre === c.nombre),
  );
  // Las que el usuario eligió ver (y las opcionales que agregó).
  const elegidas = useColumnas(
    modulo.slug,
    posibles.map((c) => ({
      clave: c.nombre,
      etiqueta: c.etiqueta,
      opcional: c.opcional,
    })),
  );
  const columnas = posibles.filter((c) => elegidas.ve(c.nombre));

  const params = new URLSearchParams({
    page: String(consulta.pagina),
    page_size: String(porPagina),
  });
  if (consulta.busqueda) params.set("search", consulta.busqueda);
  for (const [nombre, filtro] of Object.entries(filtros)) {
    if (filtro.valor) params.set(nombre, filtro.valor);
  }
  for (const [nombre, valor] of parametrosFiltros(avanzados)) {
    params.set(nombre, valor);
  }
  const ruta = `/${modulo.slug}/?${params}`;
  const aplicados = resumenFiltros(modulo.avanzados ?? [], avanzados);

  // La descarga: lo mismo que la tabla, sin paginar, y bajo el título qué
  // filtros tenía ("Estado: Confirmada · Búsqueda: «pérez»").
  const rutaDescarga = (formato: string) => {
    const p = new URLSearchParams(params);
    p.delete("page");
    p.delete("page_size");
    p.set("formato", formato);
    // Las mismas columnas que la tabla.
    p.set("columnas", columnas.map((c) => c.nombre).join(","));
    const detalle = libres
      .filter((f) => filtros[f.nombre]?.valor)
      .map((f) => {
        const { valor, etiqueta } = filtros[f.nombre];
        const texto =
          etiqueta || f.opciones?.find((o) => o.valor === valor)?.etiqueta;
        return `${f.etiqueta}: ${texto ?? valor}`;
      });
    detalle.push(...aplicados.map((a) => a.texto));
    if (consulta.busqueda) detalle.push(`Búsqueda: «${consulta.busqueda}»`);
    if (detalle.length) p.set("detalle", detalle.join(" · "));
    return `/${modulo.slug}/exportar/?${p}`;
  };
  const clave = `${ruta}#${version}`;

  useEffect(() => {
    let vigente = true;
    api<Pagina<Registro>>(ruta)
      .then((datos) => vigente && setResultado({ clave, datos }))
      .catch((e: Error) => vigente && setResultado({ clave, error: e }));
    return () => {
      vigente = false;
    };
  }, [ruta, clave]);

  const cargando = resultado.clave !== clave;
  const { datos, error } = resultado;
  const filas = datos?.results ?? [];
  // Caminantes: los líderes ocultos, en la primera página. Si se filtra por
  // algo propio del caminante (estado, pago, edad…), no van.
  const lideres = useLideresOcultos({
    activo:
      modulo.slug === "inscripciones" &&
      consulta.pagina === 1 &&
      !filtros.estado?.valor &&
      aplicados.length === 0,
    retiro: filtros.retiro?.valor ?? "",
    mesa: filtros.mesa?.valor ?? "",
    busqueda: consulta.busqueda,
    version,
  });
  const hayFiltros =
    !!consulta.busqueda ||
    Object.values(filtros).some((f) => f.valor) ||
    aplicados.length > 0;

  const filtrar = (nombre: string, valor: string, etiqueta = "") => {
    setFiltros((f) => ({ ...f, [nombre]: { valor, etiqueta } }));
    setConsulta((c) => ({ ...c, pagina: 1 }));
  };

  const limpiar = () => {
    setTexto("");
    setFiltros({});
    setAvanzados({});
    setConsulta({ busqueda: "", pagina: 1 });
  };

  const cambiarPorPagina = (n: number) => {
    setPorPagina(n);
    setConsulta((c) => ({ ...c, pagina: 1 }));
    guardarPorPagina(n);
  };

  const eliminar = async (fila: Registro) => {
    if (!window.confirm(`¿Eliminar ${modulo.singular} "${fila.etiqueta}"?`)) {
      return;
    }
    setAviso("");
    try {
      await api(`/${modulo.slug}/${fila.id}/`, { method: "DELETE" });
      // Si era el último de su página, se vuelve a la anterior.
      if (filas.length === 1 && consulta.pagina > 1) {
        setConsulta((c) => ({ ...c, pagina: c.pagina - 1 }));
      }
      setVersion((v) => v + 1);
    } catch (e) {
      setAviso((e as Error).message);
    }
  };

  // Caminantes y servidores: confirmar o cancelar a varios a la vez.
  const quien = ASISTENCIA_MASIVA[modulo.slug];
  const elegidos = filas.filter((f) => seleccion.has(f.id));
  const marcarAsistencia = async (estado: string, motivo = "") => {
    if (!quien) return;
    setAviso("");
    const fallidos = await cambiarAsistencia(
      quien,
      elegidos.map((f) => f.id),
      estado,
      motivo,
    );
    if (fallidos.length) {
      setAviso(
        `${fallidos.length} no se pudieron cambiar: ${[...new Set(fallidos)].join(" ")}`,
      );
    }
    setSeleccion(new Set());
    setVersion((v) => v + 1);
  };

  const acciones = {
    modulo,
    onEditar: (fila: Registro) =>
      EDICION_POR_PASOS[modulo.slug]
        ? navigate(rutaDeEdicion(modulo.slug, fila.id, `/${modulo.slug}`))
        : setEditando(fila),
    onEliminar: eliminar,
    onEditarLider: lideres.editar
      ? (fila: Registro) =>
          navigate(rutaDeEdicion("participaciones", fila.id, `/${modulo.slug}`))
      : undefined,
    onPermisos:
      modulo.slug === "roles"
        ? (fila: Registro) => navigate(`/roles/${fila.id}/permisos`)
        : undefined,
    onCuenta:
      modulo.slug === "usuarios" && modulo.puede_cambiar
        ? (fila: Registro) => setCuentaDe(`/usuarios/${fila.id}/cuenta/`)
        : modulo.slug === "participaciones" && daAcceso
          ? (fila: Registro) =>
              setCuentaDe(`/participaciones/${fila.id}/cuenta/`)
          : undefined,
    seleccion:
      quien && modulo.puede_cambiar
        ? {
            ids: seleccion,
            alternar: (id: string) =>
              setSeleccion((actual) => {
                const nueva = new Set(actual);
                if (nueva.has(id)) nueva.delete(id);
                else nueva.add(id);
                return nueva;
              }),
            todas: (ids: string[], marcar: boolean) =>
              setSeleccion((actual) => {
                const nueva = new Set(actual);
                for (const id of ids) {
                  if (marcar) nueva.add(id);
                  else nueva.delete(id);
                }
                return nueva;
              }),
          }
        : undefined,
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
      {/* Encabezado: total y alta */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          {datos ? (
            <>
              <strong className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {datos.count}
              </strong>{" "}
              {datos.count === 1
                ? modulo.singular
                : modulo.titulo.toLowerCase()}
              {hayFiltros && " con estos filtros"}
            </>
          ) : (
            " "
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {modulo.slug === "personas" &&
            modulo.puede_agregar &&
            modulo.puede_cambiar && (
              <button
                type="button"
                className={`${claseBoton} inline-flex items-center gap-2`}
                onClick={() => setImportando(true)}
              >
                <UploadIcon className="size-5" aria-hidden="true" />
                Importar
              </button>
            )}
          {LISTADO_OCR[modulo.slug] && modulo.puede_agregar && (
            <button
              type="button"
              className={`${claseBoton} inline-flex items-center gap-2`}
              onClick={() => setLeyendoListado(true)}
            >
              <EscanearIcon className="size-5" aria-hidden="true" />
              Leer listado
            </button>
          )}
          <SelectorColumnas {...elegidas.selector} />
          {!!datos?.count && <BotonesDescarga ruta={rutaDescarga} />}
          {modulo.puede_agregar && (
            <button
              type="button"
              className={claseBotonPrincipal}
              onClick={() => {
                // Caminantes y servidores se dan de alta con su formulario por pasos.
                if (ALTA_POR_PASOS[modulo.slug]) {
                  navigate(ALTA_POR_PASOS[modulo.slug]);
                } else if (modulo.slug === "personas") {
                  const puede = opcionesNuevaPersona(modulos);
                  // Si no puede inscribir ni registrar servidores, directo al formulario.
                  if (puede.caminante || puede.servidor) setEligiendoAlta(true);
                  else setEditando(null);
                } else {
                  setEditando(null);
                }
              }}
            >
              <PlusIcon className="size-5" aria-hidden="true" />
              Agregar {modulo.singular}
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        {modulo.buscable && (
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar…"
            className={`${claseControl} w-full sm:w-72`}
          />
        )}
        {fijos.map((filtro) => (
          <span
            key={filtro.nombre}
            className="inline-flex h-11 w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-600 sm:w-auto dark:border-gray-800 dark:bg-white/3 dark:text-gray-300"
            title="Lo fija tu rol"
          >
            <LockIcon className="size-4 shrink-0" aria-hidden="true" />
            {filtro.etiqueta}:
            <strong className="font-medium text-gray-800 dark:text-white/90">
              {filtro.fijo!.etiqueta}
            </strong>
          </span>
        ))}
        {libres.map((filtro) =>
          filtro.tipo === "fk" ? (
            <SelectorRemoto
              key={filtro.nombre}
              recurso={filtro.recurso!}
              valor={filtros[filtro.nombre]?.valor || null}
              etiqueta={filtros[filtro.nombre]?.etiqueta ?? ""}
              onChange={(id, etiqueta) =>
                filtrar(filtro.nombre, id ?? "", etiqueta)
              }
              placeholder={`${filtro.etiqueta}: todos`}
              className="w-full sm:w-56"
            />
          ) : !filtro.opciones ? (
            <FiltroTexto
              key={filtro.nombre}
              etiqueta={filtro.etiqueta}
              valor={filtros[filtro.nombre]?.valor ?? ""}
              onCambio={(valor) => filtrar(filtro.nombre, valor)}
            />
          ) : (
            <select
              key={filtro.nombre}
              value={filtros[filtro.nombre]?.valor ?? ""}
              onChange={(e) => filtrar(filtro.nombre, e.target.value)}
              className={`${claseControl} w-full sm:w-auto`}
              aria-label={filtro.etiqueta}
            >
              <option value="">{filtro.etiqueta}: todos</option>
              {filtro.opciones?.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          ),
        )}
        {(modulo.avanzados ?? []).length > 0 && (
          <button
            type="button"
            onClick={() => setPanelAbierto(true)}
            className={`${claseControl} inline-flex items-center gap-2 font-medium ${
              aplicados.length
                ? "border-brand-300 bg-brand-25 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300"
                : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
            }`}
            aria-haspopup="dialog"
          >
            <SliderHorizontalIcon className="size-5" aria-hidden="true" />
            Filtros
            {aplicados.length > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-500 text-theme-xs text-white">
                {aplicados.length}
              </span>
            )}
          </button>
        )}
        {hayFiltros && <BotonLimpiarFiltros onClick={limpiar} />}
      </div>

      {/* Lo aplicado en el panel, para verlo y quitarlo de a uno. */}
      {aplicados.length > 0 && (
        <ul
          className="flex flex-wrap gap-2 px-5 pb-4"
          aria-label="Filtros aplicados"
        >
          {aplicados.map((a) => (
            <li
              key={a.nombre}
              className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-25 py-1 ps-3 pe-1 text-theme-xs font-medium text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
            >
              {a.texto}
              <button
                type="button"
                onClick={() => {
                  setAvanzados((v) => sinFiltro(modulo.avanzados, v, a.nombre));
                  setConsulta((c) => ({ ...c, pagina: 1 }));
                }}
                className="flex size-5 items-center justify-center rounded-full hover:bg-brand-100 dark:hover:bg-brand-500/20"
                aria-label={`Quitar ${a.texto}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <PanelFiltros
        abierto={panelAbierto}
        filtros={modulo.avanzados ?? []}
        valores={avanzados}
        onCerrar={() => setPanelAbierto(false)}
        onAplicar={(valores) => {
          setAvanzados(valores);
          setConsulta((c) => ({ ...c, pagina: 1 }));
          setPanelAbierto(false);
        }}
      />

      {aviso && (
        <p className="px-5 pb-4 text-sm text-error-500" role="alert">
          {aviso}
        </p>
      )}

      {quien && elegidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-brand-100 bg-brand-25 px-5 py-3 text-sm dark:border-brand-500/20 dark:bg-brand-500/10">
          <span className="font-medium text-gray-800 dark:text-white/90">
            {elegidos.length} {elegidos.length === 1 ? "elegido" : "elegidos"}
          </span>
          <button
            type="button"
            className={claseBotonPrincipal}
            onClick={() => marcarAsistencia(ASISTENCIA[quien].confirmado)}
          >
            Confirmar asistencia
          </button>
          <button
            type="button"
            className={`${claseBoton} text-error-600 dark:text-error-400`}
            onClick={() => setCancelandoVarios(true)}
          >
            Cancelar asistencia…
          </button>
          <button
            type="button"
            className={`text-sm ${claseEnlace}`}
            onClick={() => setSeleccion(new Set())}
          >
            Quitar selección
          </button>
          <DialogoCancelar
            abierto={cancelandoVarios}
            titulo={`Cancelar la asistencia de ${elegidos.length} ${
              quien === "caminante" ? "caminantes" : "servidores"
            }`}
            onCerrar={() => setCancelandoVarios(false)}
            onConfirmar={async (motivo) => {
              await marcarAsistencia(ASISTENCIA[quien].cancelado, motivo);
              setCancelandoVarios(false);
            }}
          />
        </div>
      )}

      {/* Registros */}
      {!datos && error ? (
        <div className="border-t border-gray-100 dark:border-white/5">
          <PantallaError
            error={error}
            onReintentar={() => setVersion((v) => v + 1)}
          />
        </div>
      ) : !datos ? (
        <Esqueleto />
      ) : filas.length === 0 && lideres.filas.length === 0 ? (
        <div className="border-t border-gray-100 px-5 py-12 text-center dark:border-white/5">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {error?.message ??
              (hayFiltros
                ? "Nada coincide con la búsqueda o los filtros."
                : `Todavía no hay ${modulo.titulo.toLowerCase()}.`)}
          </p>
          {hayFiltros && !error && (
            <button
              type="button"
              className={`mt-3 text-sm ${claseEnlace}`}
              onClick={limpiar}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <TablaRegistros
            columnas={columnas}
            filas={filas}
            lideres={lideres.filas}
            cargando={cargando}
            {...acciones}
          />
          <TarjetasRegistros
            columnas={columnas}
            filas={filas}
            lideres={lideres.filas}
            cargando={cargando}
            {...acciones}
          />
          {lideres.filas.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-3 dark:border-white/5">
              <LeyendaLiderOculto total={lideres.filas.length} />
            </div>
          )}
        </>
      )}

      {datos && datos.count > 0 && (
        <div className="border-t border-gray-100 px-5 py-4 dark:border-white/5">
          <Paginacion
            pagina={consulta.pagina}
            total={datos.count}
            porPagina={porPagina}
            cargando={cargando}
            onPagina={(pagina) => setConsulta((c) => ({ ...c, pagina }))}
            onPorPagina={cambiarPorPagina}
          />
        </div>
      )}

      <Modal
        isOpen={editando !== undefined}
        onClose={cerrar}
        className="m-4 max-w-2xl"
      >
        {editando !== undefined && (
          <FormularioModulo
            modulo={modulo}
            registro={editando}
            onCancelar={cerrar}
            onGuardado={(guardado) => {
              const nuevo = !editando;
              cerrar();
              setVersion((v) => v + 1);
              // Un rol nuevo no sirve sin permisos: se abre su tabla.
              if (nuevo && modulo.slug === "roles") {
                navigate(`/roles/${guardado.id}/permisos`);
              }
            }}
          />
        )}
      </Modal>
      {cuentaDe && (
        <DialogoCuenta
          ruta={cuentaDe}
          onCerrar={() => setCuentaDe(null)}
          onGuardado={() => setVersion((v) => v + 1)}
        />
      )}
      {eligiendoAlta && (
        <DialogoNuevaPersona
          onCerrar={() => setEligiendoAlta(false)}
          onSoloPersona={() => {
            setEligiendoAlta(false);
            setEditando(null);
          }}
        />
      )}
      {leyendoListado && LISTADO_OCR[modulo.slug] && (
        <DialogoListado
          como={LISTADO_OCR[modulo.slug]!}
          onCerrar={() => setLeyendoListado(false)}
          onCargado={() => setVersion((v) => v + 1)}
        />
      )}
      {importando && (
        <DialogoImportar
          onCerrar={() => setImportando(false)}
          onImportado={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

export default function ModuloPagina() {
  const { slug } = useParams();
  const { modulos } = useAuth();
  const modulo = modulos.find((m) => m.slug === slug);

  if (!modulo) return <NotFound />;

  return (
    <>
      <PageMeta
        title={`${modulo.titulo} | Betania`}
        description={`Listado de ${modulo.titulo.toLowerCase()}`}
      />
      <PageBreadcrumb pageTitle={modulo.titulo} />
      {/* key: al cambiar de módulo se reinician búsqueda, filtros y página. */}
      <Listado key={modulo.slug} modulo={modulo} />
    </>
  );
}
