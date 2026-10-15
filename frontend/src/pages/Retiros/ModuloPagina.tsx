import {
  api,
  type Campo,
  type Modulo,
  type Pagina,
  type Registro,
} from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import {
  claseBoton,
  claseControl,
  claseEnlace,
} from "@/components/modulos/estilos";
import FormularioModulo from "@/components/modulos/FormularioModulo";
import SelectorRemoto from "@/components/modulos/SelectorRemoto";
import Badge from "@/components/ui/badge/Badge";
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
import { colorEstado, dinero, fecha } from "@/utils/formato";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

function celda(campo: Campo, fila: Registro): React.ReactNode {
  const valor = fila[campo.nombre];
  switch (campo.tipo) {
    case "fk":
      return (fila[`${campo.nombre}_etiqueta`] as string) || "—";
    case "opcion":
      return (
        <Badge size="sm" color={colorEstado(valor as string)}>
          {campo.opciones?.find((o) => o.valor === valor)?.etiqueta ??
            (valor as string)}
        </Badge>
      );
    case "bool":
      return valor ? "Sí" : "No";
    case "fecha":
    case "fechahora":
      return fecha(valor as string | null);
    case "decimal":
      // El monto de un pago o gasto va en la moneda en que se hizo.
      return dinero(
        valor as number | null,
        campo.nombre === "monto"
          ? (fila.moneda as string | undefined)
          : undefined,
      );
    case "enlace":
      // Lo sirve Django (p. ej. el PDF de un retiro), no React Router.
      return (
        <a href={valor as string} className={claseEnlace}>
          PDF
        </a>
      );
    default:
      return valor === null || valor === "" ? "—" : String(valor);
  }
}

const claseEncabezado =
  "px-5 py-3 text-start text-theme-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400";
const claseCelda =
  "max-w-80 truncate px-5 py-3 text-start text-theme-sm whitespace-nowrap text-gray-500 dark:text-gray-400";

// Listado + alta/edición/borrado de un módulo, dibujado a partir de su esquema.
function Listado({ modulo }: { modulo: Modulo }) {
  const navigate = useNavigate();
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState({ busqueda: "", pagina: 1 });
  // Filtros activos: campo -> valor (y su texto, para las relaciones).
  const [filtros, setFiltros] = useState<
    Record<string, { valor: string; etiqueta: string }>
  >({});
  const [version, setVersion] = useState(0); // se incrementa para recargar
  const [resultado, setResultado] = useState<{
    clave: string;
    datos?: Pagina<Registro>;
    error?: string;
  }>({ clave: "" });
  // undefined = cerrado, null = alta, registro = edición
  const [editando, setEditando] = useState<Registro | null | undefined>();
  const [aviso, setAviso] = useState("");
  // ?editar=<id>&volver=<ruta>: abre ese registro (p. ej. desde el panel de un
  // retiro) y, al guardar o cancelar, regresa a esa ruta.
  const [busqueda] = useSearchParams();
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

  const params = new URLSearchParams({ page: String(consulta.pagina) });
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
  const conAcciones = modulo.puede_cambiar || modulo.puede_eliminar;

  const filtrar = (nombre: string, valor: string, etiqueta = "") => {
    setFiltros((f) => ({ ...f, [nombre]: { valor, etiqueta } }));
    setConsulta((c) => ({ ...c, pagina: 1 }));
  };

  const eliminar = async (fila: Registro) => {
    if (!window.confirm(`¿Eliminar ${modulo.singular} "${fila.etiqueta}"?`)) {
      return;
    }
    setAviso("");
    try {
      await api(`/${modulo.slug}/${fila.id}/`, { method: "DELETE" });
      setVersion((v) => v + 1);
    } catch (e) {
      setAviso((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {modulo.buscable && (
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar…"
            className={`${claseControl} w-full sm:w-72`}
          />
        )}
        {modulo.filtros.map((filtro) =>
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
              className={claseControl}
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
        {modulo.puede_agregar && (
          <Button
            size="sm"
            className="ms-auto"
            onClick={() =>
              // Las inscripciones se dan de alta con el formulario de caminantes.
              modulo.slug === "inscripciones"
                ? navigate("/inscribir")
                : setEditando(null)
            }
          >
            Agregar {modulo.singular}
          </Button>
        )}
      </div>

      {aviso && (
        <p className="text-sm text-error-500" role="alert">
          {aviso}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/5 dark:bg-white/3">
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/5">
              <TableRow>
                {modulo.lista.map((columna) => (
                  <TableCell
                    key={columna.nombre}
                    isHeader
                    className={claseEncabezado}
                  >
                    {columna.etiqueta}
                  </TableCell>
                ))}
                {conAcciones && (
                  <TableCell isHeader className={claseEncabezado}>
                    Acciones
                  </TableCell>
                )}
              </TableRow>
            </TableHeader>
            <TableBody
              className={`divide-y divide-gray-100 dark:divide-white/5 ${cargando ? "opacity-50" : ""}`}
            >
              {filas.map((fila) => (
                <TableRow key={fila.id}>
                  {modulo.lista.map((columna, i) => (
                    <TableCell
                      key={columna.nombre}
                      className={`${claseCelda} ${i === 0 ? "font-medium text-gray-800 dark:text-white/90" : ""}`}
                    >
                      {i === 0 && modulo.slug === "retiros" ? (
                        // Cada retiro abre su panel: caminantes, equipo y finanzas.
                        <Link
                          to={`/retiros/${fila.id}`}
                          className="hover:text-brand-500"
                        >
                          {celda(columna, fila)}
                        </Link>
                      ) : (
                        celda(columna, fila)
                      )}
                    </TableCell>
                  ))}
                  {conAcciones && (
                    <TableCell className={claseCelda}>
                      <div className="flex gap-4">
                        {modulo.puede_cambiar && (
                          <button
                            className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                            onClick={() => setEditando(fila)}
                          >
                            Editar
                          </button>
                        )}
                        {modulo.puede_eliminar && (
                          <button
                            className="text-error-500 hover:text-error-600"
                            onClick={() => eliminar(fila)}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {filas.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {error
              ? error
              : cargando
                ? "Cargando…"
                : "No hay registros que mostrar."}
          </p>
        )}
      </div>

      {datos && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            {datos.count} {datos.count === 1 ? "registro" : "registros"}
          </span>
          <div className="flex items-center gap-2">
            <button
              className={claseBoton}
              disabled={!datos.previous || cargando}
              onClick={() =>
                setConsulta((c) => ({ ...c, pagina: c.pagina - 1 }))
              }
            >
              Anterior
            </button>
            <span>Página {consulta.pagina}</span>
            <button
              className={claseBoton}
              disabled={!datos.next || cargando}
              onClick={() =>
                setConsulta((c) => ({ ...c, pagina: c.pagina + 1 }))
              }
            >
              Siguiente
            </button>
          </div>
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
