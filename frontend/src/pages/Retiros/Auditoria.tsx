import PantallaError from "@/components/estados/PantallaError";
import { EsqueletoTabla } from "@/components/estados/Esqueleto";
import { api, type Pagina } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import BotonesDescarga from "@/components/modulos/BotonesDescarga";
import BotonLimpiarFiltros from "@/components/modulos/BotonLimpiarFiltros";
import {
  claseControl,
  claseEnlace,
  claseTarjeta,
} from "@/components/modulos/estilos";
import Paginacion from "@/components/modulos/Paginacion";
import Badge from "@/components/ui/badge/Badge";
import { useAuth } from "@/context/AuthContext";
import NotFound from "@/pages/OtherPage/NotFound";
import { Fragment, useEffect, useState } from "react";

type Cambio = {
  etiqueta: string;
  antes?: unknown;
  despues?: unknown;
  confidencial?: boolean;
  detalle?: string; // "agregados" / "quitados" (permisos de un rol)
};
type Registro = {
  id: string;
  fecha: string;
  usuario_nombre: string;
  accion: string;
  modulo: string;
  objeto: string;
  resumen: string;
  ip: string | null;
  cambios: Record<string, Cambio>;
};
type Opcion = { valor: string; etiqueta: string };

const claseVacio = "text-sm text-gray-500 dark:text-gray-400";
const claseEncabezado =
  "px-4 py-3 text-start text-theme-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400";
const claseCelda =
  "px-4 py-3 text-start text-theme-sm text-gray-600 dark:text-gray-400";

// Color de cada acción (siempre con su nombre escrito).
const COLOR: Record<
  string,
  "success" | "info" | "error" | "light" | "warning"
> = {
  crear: "success",
  cambiar: "info",
  eliminar: "error",
  ingreso: "light",
  salida: "light",
  ingreso_fallido: "warning",
};

const fechaHora = new Intl.DateTimeFormat("es-VE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function texto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "object") {
    // JSON (p. ej. turnos {viernes_manana: true}): las claves marcadas.
    const marcadas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v)
      .map(([k]) => k.replace(/_/g, " "));
    return marcadas.join(", ") || "—";
  }
  return String(valor);
}

function Detalle({ cambios }: { cambios: Record<string, Cambio> }) {
  const filas = Object.values(cambios);
  if (filas.length === 0) return <p className={claseVacio}>Sin detalle.</p>;
  return (
    <table className="w-full text-theme-sm">
      <thead>
        <tr className="text-theme-xs text-gray-500 dark:text-gray-400">
          <th className="w-1/4 py-1.5 pe-4 text-start font-medium">Campo</th>
          <th className="py-1.5 pe-4 text-start font-medium">Antes</th>
          <th className="py-1.5 text-start font-medium">Después</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((c) => (
          <tr key={c.etiqueta} className="align-top">
            <td className="py-1.5 pe-4 font-medium text-gray-700 dark:text-gray-300">
              {c.etiqueta}
              {c.detalle && (
                <span className="font-normal text-gray-400">
                  {" "}
                  ({c.detalle})
                </span>
              )}
            </td>
            {c.confidencial ? (
              <td colSpan={2} className="py-1.5 text-gray-400 italic">
                Dato confidencial: se registra que cambió, no su contenido.
              </td>
            ) : (
              <>
                <td className="py-1.5 pe-4 break-words text-gray-500 line-through decoration-gray-300 dark:text-gray-400">
                  {texto(c.antes)}
                </td>
                <td className="py-1.5 break-words text-gray-800 dark:text-white/90">
                  {texto(c.despues)}
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Quién hizo qué y cuándo. Los ingresos y salidas del super administrador
// no se registran (ver retiros/auditoria.py).
export default function Auditoria() {
  const { modulos } = useAuth();
  const puedeVer = modulos.some((m) => m.slug === "auditoria");
  const [opciones, setOpciones] = useState<{
    acciones: Opcion[];
    modulos: Opcion[];
  }>({ acciones: [], modulos: [] });
  const [filtros, setFiltros] = useState({
    accion: "",
    modelo: "",
    desde: "",
    hasta: "",
  });
  const [texto, setTextoBusqueda] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [resultado, setResultado] = useState<{
    clave: string;
    datos?: Pagina<Registro>;
    error?: Error;
  }>({ clave: "" });
  // Para volver a consultar (Reintentar).
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!puedeVer) return;
    api<typeof opciones>("/auditoria/opciones/")
      .then(setOpciones)
      .catch(() => undefined);
  }, [puedeVer]);

  // La búsqueda espera a que se deje de escribir.
  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(texto.trim());
      setPagina(1);
    }, 350);
    return () => clearTimeout(espera);
  }, [texto]);

  const params = new URLSearchParams();
  if (busqueda) params.set("search", busqueda);
  for (const [k, v] of Object.entries(filtros)) if (v) params.set(k, v);
  const consulta = new URLSearchParams(params);
  consulta.set("page", String(pagina));
  consulta.set("page_size", String(porPagina));
  const ruta = `/auditoria/?${consulta}`;
  const clave = `${ruta}#${version}`;

  useEffect(() => {
    if (!puedeVer) return;
    let vigente = true;
    api<Pagina<Registro>>(ruta)
      .then((datos) => vigente && setResultado({ clave, datos }))
      .catch((e: Error) => vigente && setResultado({ clave, error: e }));
    return () => {
      vigente = false;
    };
  }, [ruta, clave, puedeVer]);

  if (!puedeVer) return <NotFound />;
  const { datos, error } = resultado;
  const cargando = resultado.clave !== clave;
  const filas = datos?.results ?? [];
  const hayFiltros = !!busqueda || Object.values(filtros).some(Boolean);

  const poner = (campo: keyof typeof filtros, valor: string) => {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(1);
  };
  const alternar = (id: string) =>
    setAbiertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // La descarga lleva los mismos filtros y, bajo el título, cuáles eran.
  const rutaDescarga = (formato: string) => {
    const p = new URLSearchParams(params);
    p.set("formato", formato);
    const detalle = [
      filtros.accion &&
        `Acción: ${opciones.acciones.find((a) => a.valor === filtros.accion)?.etiqueta}`,
      filtros.modelo &&
        `Módulo: ${opciones.modulos.find((m) => m.valor === filtros.modelo)?.etiqueta}`,
      filtros.desde && `Desde ${filtros.desde}`,
      filtros.hasta && `hasta ${filtros.hasta}`,
      busqueda && `Búsqueda: «${busqueda}»`,
    ].filter(Boolean);
    if (detalle.length) p.set("detalle", detalle.join(" · "));
    return `/auditoria/exportar/?${p}`;
  };

  return (
    <>
      <PageMeta
        title="Auditoría | Betania"
        description="Quién creó, cambió o eliminó cada registro, y cuándo entró o salió del sistema"
      />
      <PageBreadcrumb pageTitle="Auditoría" />

      <section className={claseTarjeta}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            {datos ? (
              <>
                <strong className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  {datos.count}
                </strong>{" "}
                {datos.count === 1 ? "registro" : "registros"}
                {hayFiltros && " con estos filtros"}
              </>
            ) : (
              " "
            )}
          </p>
          {!!datos?.count && <BotonesDescarga ruta={rutaDescarga} />}
        </div>

        <div className="mb-5 flex flex-wrap items-end gap-3">
          <input
            type="search"
            value={texto}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            placeholder="Buscar usuario o registro…"
            className={`${claseControl} w-full sm:w-64`}
          />
          <select
            value={filtros.accion}
            onChange={(e) => poner("accion", e.target.value)}
            className={`${claseControl} w-full sm:w-auto`}
            aria-label="Acción"
          >
            <option value="">Acción: todas</option>
            {opciones.acciones.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.etiqueta}
              </option>
            ))}
          </select>
          <select
            value={filtros.modelo}
            onChange={(e) => poner("modelo", e.target.value)}
            className={`${claseControl} w-full sm:w-auto`}
            aria-label="Módulo"
          >
            <option value="">Módulo: todos</option>
            {opciones.modulos.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            Desde
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => poner("desde", e.target.value)}
              className={claseControl}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            Hasta
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => poner("hasta", e.target.value)}
              className={claseControl}
            />
          </label>
          {hayFiltros && (
            <BotonLimpiarFiltros
              onClick={() => {
                setTextoBusqueda("");
                setBusqueda("");
                setFiltros({ accion: "", modelo: "", desde: "", hasta: "" });
                setPagina(1);
              }}
            />
          )}
        </div>

        {error && !datos ? (
          <PantallaError
            error={error}
            onReintentar={() => setVersion((v) => v + 1)}
          />
        ) : !datos ? (
          <EsqueletoTabla filas={8} columnas={6} conTarjeta={false} />
        ) : filas.length === 0 ? (
          <p className={claseVacio}>
            {hayFiltros
              ? "Nada coincide con los filtros."
              : "Todavía no hay registros."}
          </p>
        ) : (
          <div
            className={`max-w-full overflow-x-auto transition-opacity ${cargando ? "opacity-60" : ""}`}
          >
            <table className="w-full min-w-[860px]">
              <thead className="border-y border-gray-100 bg-gray-50 dark:border-white/5 dark:bg-white/2">
                <tr>
                  {[
                    "Fecha y hora",
                    "Usuario",
                    "Acción",
                    "Módulo",
                    "Registro",
                    "Cambios",
                  ].map((t) => (
                    <th key={t} className={claseEncabezado}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filas.map((f) => {
                  const conDetalle = Object.keys(f.cambios ?? {}).length > 0;
                  const abierto = abiertos.has(f.id);
                  return (
                    <Fragment key={f.id}>
                      <tr className="align-top">
                        <td className={`${claseCelda} whitespace-nowrap`}>
                          {fechaHora.format(new Date(f.fecha))}
                        </td>
                        <td className={claseCelda}>
                          <span className="font-medium text-gray-800 dark:text-white/90">
                            {f.usuario_nombre || "Sistema"}
                          </span>
                          {f.ip && (
                            <span className="block text-theme-xs text-gray-400">
                              {f.ip}
                            </span>
                          )}
                        </td>
                        <td className={`${claseCelda} whitespace-nowrap`}>
                          <Badge size="sm" color={COLOR[f.accion] ?? "light"}>
                            {opciones.acciones.find((a) => a.valor === f.accion)
                              ?.etiqueta ?? f.accion}
                          </Badge>
                        </td>
                        <td className={`${claseCelda} whitespace-nowrap`}>
                          {f.modulo === "—" ? "" : f.modulo}
                        </td>
                        <td className={`${claseCelda} max-w-56 break-words`}>
                          {f.objeto}
                        </td>
                        <td className={`${claseCelda} max-w-96`}>
                          <span className="line-clamp-2">{f.resumen}</span>
                          {conDetalle && (
                            <button
                              type="button"
                              className={`mt-1 text-theme-xs ${claseEnlace}`}
                              aria-expanded={abierto}
                              onClick={() => alternar(f.id)}
                            >
                              {abierto ? "Ocultar detalle" : "Ver detalle"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {abierto && (
                        <tr>
                          <td
                            colSpan={6}
                            className="bg-gray-50 px-4 py-3 dark:bg-white/2"
                          >
                            <Detalle cambios={f.cambios} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {datos && datos.count > 0 && (
          <div className="mt-5">
            <Paginacion
              pagina={pagina}
              total={datos.count}
              porPagina={porPagina}
              cargando={cargando}
              onPagina={setPagina}
              onPorPagina={(n) => {
                setPorPagina(n);
                setPagina(1);
              }}
            />
          </div>
        )}
      </section>
    </>
  );
}
