import {
  api,
  type Campo,
  type Modulo,
  type Pagina,
  type Registro,
} from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import { celda } from "@/components/modulos/celda";
import { claseControl, claseEnlace } from "@/components/modulos/estilos";
import FormularioModulo from "@/components/modulos/FormularioModulo";
import Paginacion from "@/components/modulos/Paginacion";
import { TAMANOS_PAGINA } from "@/components/modulos/paginas";
import SelectorRemoto from "@/components/modulos/SelectorRemoto";
import Button from "@/components/ui/button/Button";
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
import { LockIcon, PencilIcon, TrashBinIcon } from "@/icons";
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

const CLAVE_POR_PAGINA = "betania.porPagina";

function porPaginaGuardado(): number {
  try {
    const n = Number(localStorage.getItem(CLAVE_POR_PAGINA));
    return TAMANOS_PAGINA.includes(n) ? n : 25;
  } catch {
    return 25;
  }
}

type Acciones = {
  modulo: Modulo;
  onEditar: (fila: Registro) => void;
  onEliminar: (fila: Registro) => void;
};

// Editar / eliminar como iconos, con su nombre para lectores de pantalla.
function BotonesFila({
  fila,
  modulo,
  onEditar,
  onEliminar,
}: Acciones & { fila: Registro }) {
  return (
    <div className="flex items-center gap-1">
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

// Pantallas medianas y grandes: tabla.
function TablaRegistros({
  columnas,
  filas,
  cargando,
  ...acciones
}: Acciones & { columnas: Campo[]; filas: Registro[]; cargando: boolean }) {
  const { modulo } = acciones;
  const conAcciones = modulo.puede_cambiar || modulo.puede_eliminar;
  return (
    // relative: el texto sr-only (posición absoluta) no se sale de la caja.
    <div className="relative hidden max-w-full overflow-x-auto md:block">
      <Table>
        <TableHeader className="border-y border-gray-100 bg-gray-50 dark:border-white/5 dark:bg-white/2">
          <TableRow>
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
  ...acciones
}: Acciones & { columnas: Campo[]; filas: Registro[]; cargando: boolean }) {
  const { modulo } = acciones;
  const [primera, ...resto] = columnas;
  return (
    <ul
      className={`divide-y divide-gray-100 border-t border-gray-100 md:hidden dark:divide-white/5 dark:border-white/5 ${cargando ? "opacity-50" : ""}`}
    >
      {filas.map((fila) => (
        <li key={fila.id} className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 text-theme-sm font-semibold break-words text-gray-800 dark:text-white/90">
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

// Listado + alta/edición/borrado de un módulo, dibujado a partir de su esquema.
function Listado({ modulo }: { modulo: Modulo }) {
  const navigate = useNavigate();
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState({ busqueda: "", pagina: 1 });
  const [porPagina, setPorPagina] = useState(porPaginaGuardado);
  // Filtros activos: campo -> valor (y su texto, para las relaciones).
  // Empieza con la edición preferida en el filtro "Retiro" (se puede quitar).
  const [filtros, setFiltros] = useState<
    Record<string, { valor: string; etiqueta: string }>
  >(() =>
    Object.fromEntries(
      modulo.filtros
        .filter((f) => f.predeterminado)
        .map((f) => [f.nombre, f.predeterminado!]),
    ),
  );
  const [version, setVersion] = useState(0); // se incrementa para recargar
  const [resultado, setResultado] = useState<{
    clave: string;
    datos?: Pagina<Registro>;
    error?: string;
  }>({ clave: "" });
  // ?editar=<id>&volver=<ruta>: abre ese registro (p. ej. desde el panel de un
  // retiro) y, al guardar o cancelar, regresa a esa ruta. ?nuevo=1 abre el
  // formulario de alta (los accesos rápidos del inicio).
  const [busqueda] = useSearchParams();
  // undefined = cerrado, null = alta, registro = edición
  const [editando, setEditando] = useState<Registro | null | undefined>(() =>
    busqueda.has("nuevo") && modulo.puede_agregar ? null : undefined,
  );
  const [aviso, setAviso] = useState("");
  const editar = busqueda.get("editar");
  const volver = busqueda.get("volver");

  useEffect(() => {
    if (!editar) return;
    let vigente = true;
    api<Registro>(`/${modulo.slug}/${editar}/`)
      .then((registro) => vigente && setEditando(registro))
      .catch((e: Error) => vigente && setAviso(e.message));
    return () => {
      vigente = false;
    };
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
  const columnas = modulo.lista.filter(
    (c) => !fijos.some((f) => f.nombre === c.nombre),
  );

  const params = new URLSearchParams({
    page: String(consulta.pagina),
    page_size: String(porPagina),
  });
  if (consulta.busqueda) params.set("search", consulta.busqueda);
  for (const [nombre, filtro] of Object.entries(filtros)) {
    if (filtro.valor) params.set(nombre, filtro.valor);
  }
  const ruta = `/${modulo.slug}/?${params}`;
  const clave = `${ruta}#${version}`;

  useEffect(() => {
    let vigente = true;
    api<Pagina<Registro>>(ruta)
      .then((datos) => vigente && setResultado({ clave, datos }))
      .catch(
        (e: Error) => vigente && setResultado({ clave, error: e.message }),
      );
    return () => {
      vigente = false;
    };
  }, [ruta, clave]);

  const cargando = resultado.clave !== clave;
  const { datos, error } = resultado;
  const filas = datos?.results ?? [];
  const hayFiltros =
    !!consulta.busqueda || Object.values(filtros).some((f) => f.valor);

  const filtrar = (nombre: string, valor: string, etiqueta = "") => {
    setFiltros((f) => ({ ...f, [nombre]: { valor, etiqueta } }));
    setConsulta((c) => ({ ...c, pagina: 1 }));
  };

  const limpiar = () => {
    setTexto("");
    setFiltros({});
    setConsulta({ busqueda: "", pagina: 1 });
  };

  const cambiarPorPagina = (n: number) => {
    setPorPagina(n);
    setConsulta((c) => ({ ...c, pagina: 1 }));
    try {
      localStorage.setItem(CLAVE_POR_PAGINA, String(n));
    } catch {
      // Sin almacenamiento (modo privado): solo dura esta visita.
    }
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

  const acciones = { modulo, onEditar: setEditando, onEliminar: eliminar };

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
        {modulo.puede_agregar && (
          <Button
            size="sm"
            onClick={() =>
              // Caminantes y servidores se dan de alta con su formulario por pasos.
              ALTA_POR_PASOS[modulo.slug]
                ? navigate(ALTA_POR_PASOS[modulo.slug])
                : setEditando(null)
            }
          >
            Agregar {modulo.singular}
          </Button>
        )}
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
        {hayFiltros && (
          <button
            type="button"
            className={`text-sm ${claseEnlace}`}
            onClick={limpiar}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {aviso && (
        <p className="px-5 pb-4 text-sm text-error-500" role="alert">
          {aviso}
        </p>
      )}

      {/* Registros */}
      {!datos && !error ? (
        <Esqueleto />
      ) : filas.length === 0 ? (
        <div className="border-t border-gray-100 px-5 py-12 text-center dark:border-white/5">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {error ??
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
            cargando={cargando}
            {...acciones}
          />
          <TarjetasRegistros
            columnas={columnas}
            filas={filas}
            cargando={cargando}
            {...acciones}
          />
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
            onGuardado={() => {
              cerrar();
              setVersion((v) => v + 1);
            }}
          />
        )}
      </Modal>
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
