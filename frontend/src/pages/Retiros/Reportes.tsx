import PantallaError from "@/components/estados/PantallaError";
import { EsqueletoPanel } from "@/components/estados/Esqueleto";
import {
  type CeldaDescarga,
  type ColumnaReporte,
  type Reportes as Datos,
  type TablaDescarga,
} from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Telefono from "@/components/common/Telefono";
import BotonesDescarga from "@/components/modulos/BotonesDescarga";
import Paginacion from "@/components/modulos/Paginacion";
import { usePaginas } from "@/components/modulos/usePaginas";
import {
  claseControl,
  claseEnlace,
  claseTarjeta,
} from "@/components/modulos/estilos";
import Actualizacion from "@/components/retiros/Actualizacion";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDatosVivos } from "@/hooks/useDatosVivos";
import { dinero, fecha, montoVista } from "@/utils/formato";
import { useState } from "react";
import { useSearchParams } from "react-router";

type Celda = string | number | null;

const claseVacio = "text-sm text-gray-500 dark:text-gray-400";
const claseEncabezado =
  "px-3 py-3 text-start text-theme-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400";
const claseCelda =
  "px-3 py-3 text-start align-top text-theme-sm text-gray-600 dark:text-gray-400";
const claseCifra = `${claseCelda} text-end whitespace-nowrap tabular-nums`;

const esCifra = (c: ColumnaReporte) =>
  c.tipo === "numero" || c.tipo === "dinero";

// "José Pérez" y "jose perez" coinciden.
const plano = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function mostrar(c: ColumnaReporte, v: Celda): React.ReactNode {
  if (v === null || v === "") return "—";
  if (c.tipo === "dinero") return dinero(Number(v));
  if (c.tipo === "fecha") return fecha(String(v));
  if (c.tipo === "telefono") return <Telefono numero={String(v)} />;
  return v;
}

function paraDescarga(c: ColumnaReporte, v: Celda): CeldaDescarga {
  if (c.tipo === "dinero") return montoVista(Number(v ?? 0));
  if (c.tipo === "fecha") return v ? fecha(String(v)) : "";
  return v;
}

// Los cortes que más se piden para organizar un retiro: cada uno en una tabla
// que se puede filtrar con un texto y descargar en Excel o PDF.
export default function Reportes() {
  const [busqueda, setBusqueda] = useSearchParams();
  const retiro = busqueda.get("retiro") ?? "";
  const clave = busqueda.get("reporte") ?? "";
  const parametros = new URLSearchParams(
    Object.entries({ retiro, reporte: clave }).filter(([, v]) => v),
  ).toString();
  const { datos, alDia, error, hora, consultando, actualizar } =
    useDatosVivos<Datos>(`/reportes/${parametros ? `?${parametros}` : ""}`);
  const [texto, setTexto] = useState("");

  const cambiar = (cambios: Record<string, string>) => {
    setBusqueda(
      (actual) => {
        const nueva = new URLSearchParams(actual);
        for (const [k, v] of Object.entries(cambios)) {
          if (v) nueva.set(k, v);
          else nueva.delete(k);
        }
        return nueva;
      },
      { replace: true },
    );
    if ("reporte" in cambios) setTexto("");
  };

  const reporte = datos?.reporte;
  const buscado = plano(texto.trim());
  const filas = (reporte?.filas ?? []).filter(
    (f) => !buscado || f.some((v) => plano(String(v ?? "")).includes(buscado)),
  );
  const paginas = usePaginas();
  const { pagina, hayPaginas, paginacion } = paginas.de(
    filas,
    `${reporte?.clave}|${datos?.retiro?.id}|${buscado}`,
  );
  const conTotales = !!reporte?.columnas.some((c) => c.total);
  const total = (i: number) => filas.reduce((s, f) => s + Number(f[i] ?? 0), 0);

  const tablaDescarga = (): TablaDescarga => {
    const columnas = reporte!.columnas;
    return {
      titulo: `${reporte!.titulo} · ${datos?.retiro?.etiqueta ?? ""}`,
      subtitulo: texto.trim() ? `Búsqueda: «${texto.trim()}»` : "",
      columnas: columnas.map((c) => c.etiqueta),
      filas: [
        ...filas.map((f) => f.map((v, i) => paraDescarga(columnas[i], v))),
        ...(conTotales
          ? [
              columnas.map((c, i) =>
                c.total
                  ? paraDescarga(c, total(i))
                  : i === 0
                    ? "Total"
                    : "",
              ),
            ]
          : []),
      ],
    };
  };

  return (
    <>
      <PageMeta
        title="Reportes | Betania"
        description="Los reportes que más se usan para organizar un retiro"
      />
      <PageBreadcrumb pageTitle="Reportes" />

      {!datos && error ? (
        <PantallaError error={error} onReintentar={actualizar} />
      ) : !alDia || !datos ? (
        <EsqueletoPanel />
      ) : !datos.retiro ? (
        <p className={claseVacio}>Todavía no hay retiros.</p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <select
                value={datos.retiro.id}
                onChange={(e) => cambiar({ retiro: e.target.value })}
                className={`${claseControl} w-full font-medium sm:w-auto`}
                aria-label="Retiro"
              >
                {datos.retiros.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.etiqueta} · {fecha(r.fecha_inicio)}
                  </option>
                ))}
              </select>
              {reporte && (
                <select
                  value={reporte.clave}
                  onChange={(e) => cambiar({ reporte: e.target.value })}
                  className={`${claseControl} w-full sm:w-auto`}
                  aria-label="Reporte"
                >
                  {datos.catalogo.map((r) => (
                    <option key={r.clave} value={r.clave}>
                      {r.titulo}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <Actualizacion
              hora={hora}
              error={error}
              consultando={consultando}
              onActualizar={actualizar}
            />
          </div>

          {!reporte ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {datos.catalogo.map((r) => (
                <button
                  key={r.clave}
                  type="button"
                  onClick={() => cambiar({ reporte: r.clave })}
                  className={`${claseTarjeta} text-start transition hover:border-brand-300 dark:hover:border-brand-800`}
                >
                  <p className="mb-1 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                    {r.titulo}
                  </p>
                  <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {r.descripcion}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <section className={claseTarjeta}>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => cambiar({ reporte: "" })}
                  className={`text-theme-sm ${claseEnlace}`}
                >
                  Todos los reportes
                </button>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                  {datos.catalogo.find((r) => r.clave === reporte.clave)
                    ?.descripcion}
                </p>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  placeholder="Buscar en el reporte…"
                  aria-label="Buscar en el reporte"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  className={`${claseControl} w-full sm:w-72`}
                />
                <span className={claseVacio}>
                  {filas.length === 1 ? "1 fila" : `${filas.length} filas`}
                </span>
                {filas.length > 0 && (
                  <BotonesDescarga
                    tabla={tablaDescarga}
                    className="sm:ms-auto"
                  />
                )}
              </div>

              {filas.length === 0 ? (
                <p className={claseVacio}>
                  {reporte.filas.length
                    ? "Nada coincide con la búsqueda."
                    : "No hay nadie en este reporte."}
                </p>
              ) : (
                <div className="max-w-full overflow-x-auto">
                  <Table>
                    <TableHeader className="border-b border-gray-100 dark:border-white/5">
                      <TableRow>
                        {reporte.columnas.map((c) => (
                          <TableCell
                            key={c.etiqueta}
                            isHeader
                            className={`${claseEncabezado} ${esCifra(c) ? "text-end" : ""}`}
                          >
                            {c.etiqueta}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
                      {pagina.map((f, n) => (
                        <TableRow key={n}>
                          {reporte.columnas.map((c, i) => (
                            <TableCell
                              key={c.etiqueta}
                              className={
                                esCifra(c)
                                  ? claseCifra
                                  : i === 0
                                    ? `${claseCelda} font-medium text-gray-800 dark:text-white/90`
                                    : claseCelda
                              }
                            >
                              {mostrar(c, f[i])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {conTotales && (
                        <TableRow className="border-t border-gray-200 dark:border-gray-800">
                          {reporte.columnas.map((c, i) => (
                            <TableCell
                              key={c.etiqueta}
                              className={`${esCifra(c) ? claseCifra : claseCelda} font-semibold text-gray-800 dark:text-white/90`}
                            >
                              {c.total
                                ? mostrar(c, total(i))
                                : i === 0
                                  ? "Total"
                                  : ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
              {hayPaginas && (
                <div className="mt-5">
                  <Paginacion {...paginacion} />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
