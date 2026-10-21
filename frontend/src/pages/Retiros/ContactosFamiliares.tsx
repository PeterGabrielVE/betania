import PantallaError from "@/components/estados/PantallaError";
import { EsqueletoPanel } from "@/components/estados/Esqueleto";
import {
  type ContactosRetiro,
  type FilaContactos,
  type TablaDescarga,
} from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Telefono from "@/components/common/Telefono";
import BotonesDescarga from "@/components/modulos/BotonesDescarga";
import Paginacion from "@/components/modulos/Paginacion";
import { usePaginas } from "@/components/modulos/usePaginas";
import { claseControl, claseTarjeta } from "@/components/modulos/estilos";
import Actualizacion from "@/components/retiros/Actualizacion";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDatosVivos } from "@/hooks/useDatosVivos";
import { fecha } from "@/utils/formato";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

const claseVacio = "text-sm text-gray-500 dark:text-gray-400";
const claseEncabezado =
  "px-3 py-3 text-start text-theme-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400";
const claseCelda =
  "px-3 py-3 text-start align-top text-theme-sm text-gray-600 dark:text-gray-400";

const QUIENES = [
  { valor: "", etiqueta: "Caminantes y servidores" },
  { valor: "caminante", etiqueta: "Solo caminantes" },
  { valor: "servidor", etiqueta: "Solo servidores" },
];

// "José Pérez" y "jose perez" coinciden.
const plano = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
const digitos = (t: string) => t.replace(/\D/g, "");

type Filtros = { nombre: string; cedula: string; cama: string; quien: string };

function cumple(f: FilaContactos, filtros: Filtros) {
  const nombre = plano(filtros.nombre);
  const cedula = digitos(filtros.cedula);
  const cama = plano(filtros.cama);
  const esCaminante = f.tipo === "Caminante";
  return (
    !f.cancelado &&
    (!filtros.quien || (filtros.quien === "caminante") === esCaminante) &&
    // Cada palabra en cualquier orden: "perez ana" encuentra a "Ana Pérez".
    nombre.split(/\s+/).every((p) => plano(f.persona).includes(p)) &&
    (!cedula || digitos(f.documento).includes(cedula)) &&
    (!cama || plano(f.cama) === cama)
  );
}

// A quién llamar por cada caminante y servidor de un retiro (los que no
// cancelaron), para ubicarlos por nombre, cédula o cama.
export default function ContactosFamiliares() {
  const [busqueda, setBusqueda] = useSearchParams();
  const elegido = busqueda.get("retiro") ?? "";
  const { datos, alDia, error, hora, consultando, actualizar } =
    useDatosVivos<ContactosRetiro>(
      `/contactos/${elegido ? `?retiro=${encodeURIComponent(elegido)}` : ""}`,
    );
  const [filtros, setFiltros] = useState<Filtros>({
    nombre: "",
    cedula: "",
    cama: "",
    quien: "",
  });
  const poner = (campo: keyof Filtros, valor: string) =>
    setFiltros((f) => ({ ...f, [campo]: valor }));

  const visibles = (datos?.filas ?? []).filter((f) => cumple(f, filtros));
  const paginas = usePaginas();
  const { pagina, hayPaginas, paginacion } = paginas.de(
    visibles,
    JSON.stringify(filtros),
  );

  // Una fila por familiar (y una sin familiar para quien no tiene).
  const tablaDescarga = (): TablaDescarga => ({
    titulo: `Contactos familiares · ${datos?.retiro?.etiqueta ?? ""}`,
    subtitulo: [
      filtros.quien && QUIENES.find((q) => q.valor === filtros.quien)?.etiqueta,
      filtros.nombre.trim() && `Nombre: «${filtros.nombre.trim()}»`,
      filtros.cedula.trim() && `Cédula: ${filtros.cedula.trim()}`,
      filtros.cama.trim() && `Cama: ${filtros.cama.trim()}`,
    ]
      .filter(Boolean)
      .join(" · "),
    columnas: [
      "Nombres y apellidos",
      "Participa como",
      "Cédula",
      "Cama",
      "Familiar",
      "Relación",
      "Teléfono del familiar",
    ],
    filas: visibles.flatMap((f) => {
      const persona = [f.persona, f.tipo, f.documento, f.cama];
      return f.contactos.length
        ? f.contactos.map((c) => [...persona, c.nombre, c.relacion, c.telefono])
        : [[...persona, "", "", ""]];
    }),
  });

  return (
    <>
      <PageMeta
        title="Contactos familiares | Betania"
        description="A quién llamar por cada caminante y servidor de un retiro"
      />
      <PageBreadcrumb pageTitle="Contactos familiares" />

      {!datos && error ? (
        <PantallaError error={error} onReintentar={actualizar} />
      ) : !alDia || !datos ? (
        <EsqueletoPanel />
      ) : !datos.retiro ? (
        <p className={claseVacio}>Todavía no hay retiros.</p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <select
              value={datos.retiro.id}
              onChange={(e) =>
                setBusqueda({ retiro: e.target.value }, { replace: true })
              }
              className={`${claseControl} w-full font-medium sm:w-auto`}
              aria-label="Retiro"
            >
              {datos.retiros.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.etiqueta} · {fecha(r.fecha_inicio)}
                </option>
              ))}
            </select>
            <Actualizacion
              hora={hora}
              error={error}
              consultando={consultando}
              onActualizar={actualizar}
            />
          </div>

          <section className={claseTarjeta}>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                type="search"
                placeholder="Nombres y apellidos…"
                aria-label="Nombres y apellidos"
                value={filtros.nombre}
                onChange={(e) => poner("nombre", e.target.value)}
                className={`${claseControl} w-full`}
              />
              <input
                type="search"
                inputMode="numeric"
                placeholder="Cédula…"
                aria-label="Cédula"
                value={filtros.cedula}
                onChange={(e) => poner("cedula", e.target.value)}
                className={`${claseControl} w-full`}
              />
              <input
                type="search"
                placeholder="Número de cama…"
                aria-label="Número de cama"
                value={filtros.cama}
                onChange={(e) => poner("cama", e.target.value)}
                className={`${claseControl} w-full`}
              />
              <select
                value={filtros.quien}
                onChange={(e) => poner("quien", e.target.value)}
                className={`${claseControl} w-full`}
                aria-label="Quiénes"
              >
                {QUIENES.map((q) => (
                  <option key={q.valor} value={q.valor}>
                    {q.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className={claseVacio}>
                {visibles.length === 1
                  ? "1 persona"
                  : `${visibles.length} personas`}
                {" · "}
                {visibles.filter((f) => !f.contactos.length).length} sin
                familiar de contacto
              </p>
              {visibles.length > 0 && <BotonesDescarga tabla={tablaDescarga} />}
            </div>

            {visibles.length === 0 ? (
              <p className={claseVacio}>Nadie coincide con la búsqueda.</p>
            ) : (
              <div className="max-w-full overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-white/5">
                    <TableRow>
                      {[
                        "Nombres y apellidos",
                        "Participa como",
                        "Cédula",
                        "Cama",
                        "Familiares de contacto",
                      ].map((t) => (
                        <TableCell key={t} isHeader className={claseEncabezado}>
                          {t}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
                    {pagina.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell
                          className={`${claseCelda} font-medium whitespace-nowrap text-gray-800 dark:text-white/90`}
                        >
                          <Link
                            to={`/personas/${f.persona_id}`}
                            className="hover:text-brand-500"
                          >
                            {f.persona}
                          </Link>
                        </TableCell>
                        <TableCell className={`${claseCelda} whitespace-nowrap`}>
                          {f.tipo}
                        </TableCell>
                        <TableCell className={`${claseCelda} whitespace-nowrap`}>
                          {f.documento || "—"}
                        </TableCell>
                        <TableCell className={`${claseCelda} whitespace-nowrap`}>
                          {f.cama || "—"}
                        </TableCell>
                        <TableCell className={claseCelda}>
                          {f.contactos.length === 0 ? (
                            <span className="text-warning-600 dark:text-orange-400">
                              Sin familiar de contacto
                            </span>
                          ) : (
                            <ul className="space-y-1">
                              {f.contactos.map((c, i) => (
                                <li key={i}>
                                  {c.nombre || "Sin nombre"}
                                  {c.relacion && ` (${c.relacion})`}
                                  {c.telefono &&
                                    // Puede traer dos: cada uno se copia aparte.
                                    c.telefono.split(" / ").map((t) => (
                                      <span key={t}>
                                        {" · "}
                                        <Telefono numero={t} />
                                      </span>
                                    ))}
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
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
          </section>
        </>
      )}
    </>
  );
}
