import { api, subirArchivo } from "@/api/client";
import {
  claseBoton,
  claseBotonPrincipal,
  claseControl,
} from "@/components/modulos/estilos";
import SelectorRemoto from "@/components/modulos/SelectorRemoto";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext";
import { CamaraIcon, EscanearIcon } from "@/icons";
import { useRef, useState } from "react";

type Fila = Record<string, string | number | undefined> & { nombre: string };
type Como = "caminantes" | "servidores" | "personas";
type Resultado = {
  resultados: {
    fila: number;
    estado: string;
    nombre?: string;
    mensaje: string;
  }[];
  creados: number;
  existentes: number;
  errores: number;
};

// Columnas que se pueden corregir antes de cargar (las que trajo la hoja).
const COLUMNAS: [string, string][] = [
  ["nombre", "Nombre y apellido"],
  ["documento", "Cédula"],
  ["telefono", "Celular"],
  ["edad", "Edad"],
  ["talla", "Talla"],
  ["salud", "Dieta o tratamiento"],
  ["direccion", "Dirección"],
  ["contacto_nombre", "Contacto"],
  ["contacto_celular", "Celular del contacto"],
  ["area", "Equipo / área"],
  // Control de pago de servidores: lo que le toca y lo que lleva abonado.
  ["monto", "Monto"],
  ["abono", "Abonado"],
];

const COLOR: Record<string, string> = {
  creado: "text-success-700 dark:text-success-400",
  existente: "text-gray-500 dark:text-gray-400",
  error: "text-error-600 dark:text-error-400",
};

// Leer la foto de un listado (como "Listado de caminantes" o "Control de
// pago servidores") y cargar a esas personas, revisando antes cada fila.
export default function DialogoListado({
  como: comoInicial,
  onCerrar,
  onCargado,
}: {
  como: Como;
  onCerrar: () => void;
  onCargado: () => void;
}) {
  const { sesion } = useAuth();
  const preferido = sesion?.autenticado ? sesion.preferencias.retiro : null;
  const [estado, setEstado] = useState<
    "" | "leyendo" | "revisar" | "cargando" | "hecho"
  >("");
  const [error, setError] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [columnas, setColumnas] = useState<string[]>([]);
  const [como, setComo] = useState<Como>(comoInicial);
  const [retiro, setRetiro] = useState({
    id: preferido?.id ?? "",
    etiqueta: preferido?.etiqueta ?? "",
  });
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const camara = useRef<HTMLInputElement>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const leer = async (f: File | undefined) => {
    if (!f) return;
    setEstado("leyendo");
    setError("");
    const datos = new FormData();
    datos.append("archivo", f);
    try {
      const r = await subirArchivo<{ columnas: string[]; filas: Fila[] }>(
        "/ocr/listado/",
        datos,
      );
      setFilas(r.filas);
      // Las columnas que trajo la hoja (el nombre, siempre).
      setColumnas(
        COLUMNAS.map(([c]) => c).filter(
          (c) => c === "nombre" || r.columnas.includes(c),
        ),
      );
      setEstado("revisar");
    } catch (e) {
      setError((e as Error).message);
      setEstado("");
    }
  };

  const cargar = async () => {
    setEstado("cargando");
    setError("");
    try {
      const r = await api<Resultado>("/ocr/listado/importar/", {
        method: "POST",
        body: { retiro: retiro.id, como, filas },
      });
      setResultado(r);
      setEstado("hecho");
      onCargado();
    } catch (e) {
      setError((e as Error).message);
      setEstado("revisar");
    }
  };

  const cambiar = (i: number, campo: string, valor: string) =>
    setFilas((fs) =>
      fs.map((f, n) => (n === i ? { ...f, [campo]: valor } : f)),
    );

  return (
    <Modal isOpen onClose={onCerrar} className="m-4 max-w-5xl">
      <div className="p-6">
        <h3 className="mb-1 pe-12 text-lg font-semibold text-gray-800 dark:text-white/90">
          Leer listado
        </h3>
        <p className="mb-5 pe-12 text-theme-sm text-gray-500 dark:text-gray-400">
          Una foto de una hoja con varias personas (por ejemplo, el listado de
          caminantes o el control de pago de servidores). Se reconocen las
          columnas por sus encabezados; corrige lo leído antes de cargar.
        </p>

        {(estado === "" || estado === "leyendo") && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  ref: camara,
                  Icono: CamaraIcon,
                  titulo: "Tomar foto",
                  nota: "Con la cámara del celular",
                },
                {
                  ref: archivo,
                  Icono: EscanearIcon,
                  titulo: "Subir imagen o PDF",
                  nota: "JPG, PNG o PDF escaneado",
                },
              ].map(({ ref, Icono, titulo, nota }) => (
                <button
                  key={titulo}
                  type="button"
                  disabled={estado === "leyendo"}
                  onClick={() => ref.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-sm font-medium text-gray-700 hover:border-brand-400 hover:bg-brand-25 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-brand-500/10"
                >
                  <Icono className="size-8 text-brand-500" aria-hidden="true" />
                  {titulo}
                  <span className="text-theme-xs font-normal text-gray-500">
                    {nota}
                  </span>
                </button>
              ))}
            </div>
            <input
              ref={camara}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => leer(e.target.files?.[0])}
            />
            <input
              ref={archivo}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => leer(e.target.files?.[0])}
            />
            {estado === "leyendo" && (
              <p
                className="mt-5 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"
                role="status"
              >
                <span className="size-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                Leyendo el listado… puede tardar unos segundos.
              </p>
            )}
          </>
        )}

        {(estado === "revisar" || estado === "cargando") && (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Retiro
                </span>
                <SelectorRemoto
                  recurso="retiros"
                  valor={retiro.id || null}
                  etiqueta={retiro.etiqueta}
                  onChange={(id, etiqueta) =>
                    setRetiro({ id: id ?? "", etiqueta })
                  }
                  placeholder="Buscar retiro…"
                />
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Cargarlas como
                </span>
                <select
                  className={`${claseControl} w-full`}
                  value={como}
                  onChange={(e) => setComo(e.target.value as Como)}
                >
                  <option value="caminantes">Caminantes del retiro</option>
                  <option value="servidores">Servidores del retiro</option>
                  <option value="personas">
                    Solo personas (sin inscribir)
                  </option>
                </select>
              </label>
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="w-full min-w-[720px] text-theme-sm">
                <thead className="sticky top-0 bg-gray-50 text-theme-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                  <tr>
                    <th className="px-2 py-2 text-start font-medium">#</th>
                    {columnas.map((c) => (
                      <th
                        key={c}
                        className="px-2 py-2 text-start font-medium whitespace-nowrap"
                      >
                        {COLUMNAS.find(([k]) => k === c)?.[1]}
                      </th>
                    ))}
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {filas.map((f, i) => (
                    <tr
                      key={i}
                      className={
                        Number(f.confianza ?? 100) < 60
                          ? "bg-warning-25 dark:bg-warning-500/5"
                          : ""
                      }
                    >
                      <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                      {columnas.map((c) => (
                        <td key={c} className="px-1 py-1">
                          <input
                            className="w-full min-w-24 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-theme-sm text-gray-800 hover:border-gray-200 focus:border-brand-300 focus:outline-hidden dark:text-white/90 dark:hover:border-gray-700"
                            value={String(f[c] ?? "")}
                            onChange={(e) => cambiar(i, c, e.target.value)}
                            aria-label={`${COLUMNAS.find(([k]) => k === c)?.[1]} de la fila ${i + 1}`}
                          />
                        </td>
                      ))}
                      <td className="px-2">
                        <button
                          type="button"
                          className="rounded p-1 text-gray-400 hover:bg-error-50 hover:text-error-600"
                          onClick={() =>
                            setFilas((fs) => fs.filter((_, n) => n !== i))
                          }
                          aria-label={`Quitar la fila ${i + 1}`}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
              Las filas resaltadas se leyeron con poca confianza. La edad es
              solo referencia (la fecha de nacimiento se completa en la ficha).
              Una persona ya registrada (misma cédula) no se duplica.
            </p>
          </>
        )}

        {estado === "hecho" && resultado && (
          <>
            <p className="mb-3 rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/15 dark:text-success-400">
              {resultado.creados} cargadas, {resultado.existentes} ya estaban
              {resultado.errores > 0 && `, ${resultado.errores} con errores`}.
            </p>
            <ul className="max-h-[50vh] space-y-1 overflow-y-auto text-theme-sm">
              {resultado.resultados.map((r) => (
                <li key={r.fila} className={COLOR[r.estado]}>
                  Fila {r.fila}
                  {r.nombre && ` · ${r.nombre}`}: {r.mensaje}
                </li>
              ))}
            </ul>
          </>
        )}

        {error && (
          <p className="mt-4 text-sm text-error-500" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {estado === "hecho" ? (
            <button
              type="button"
              className={claseBotonPrincipal}
              onClick={onCerrar}
            >
              Listo
            </button>
          ) : (
            <>
              <button type="button" className={claseBoton} onClick={onCerrar}>
                Volver
              </button>
              {(estado === "revisar" || estado === "cargando") && (
                <button
                  type="button"
                  className={claseBotonPrincipal}
                  disabled={
                    estado === "cargando" || filas.length === 0 || !retiro.id
                  }
                  onClick={cargar}
                >
                  {estado === "cargando"
                    ? "Cargando…"
                    : `Cargar ${filas.length} ${filas.length === 1 ? "fila" : "filas"}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
