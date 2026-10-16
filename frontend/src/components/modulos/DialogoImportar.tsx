import { ApiError, descargar } from "@/api/client";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { FileExcelIcon } from "@/icons";
import { useState } from "react";
import { claseBoton, claseControl } from "./estilos";

type Resultado = {
  guardado: boolean;
  filas: number;
  nuevas: number;
  actualizadas: number;
  sin_cambios: number;
  errores: { fila: number; mensaje: string }[];
  total_errores: number;
};

// Las columnas que entiende la importación (ver retiros/reportes.py).
const COLUMNAS = [
  "tipo_documento",
  "documento",
  "nombre",
  "primer_nombre",
  "segundo_nombre",
  "primer_apellido",
  "segundo_apellido",
  "telefono",
  "email",
  "fecha_nacimiento",
  "parroquia",
];

function csrfToken() {
  const c = document.cookie.split("; ").find((x) => x.startsWith("csrftoken="));
  return c ? decodeURIComponent(c.split("=")[1]) : "";
}

async function subir(archivo: File, confirmar: boolean): Promise<Resultado> {
  const datos = new FormData();
  datos.append("archivo", archivo);
  const res = await fetch(
    `/api/personas/importar/${confirmar ? "?confirmar=1" : ""}`,
    {
      method: "POST",
      body: datos,
      credentials: "same-origin",
      headers: { "X-CSRFToken": csrfToken() },
    },
  );
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (cuerpo as { detail?: string } | null)?.detail ??
        `Error ${res.status} al subir el archivo.`,
    );
  }
  return cuerpo as Resultado;
}

// Importar personas de un Excel o CSV: primero muestra qué pasaría (nuevas,
// actualizadas, errores por fila) y solo guarda al confirmar. No duplica:
// casa por documento, correo o teléfono.
export default function DialogoImportar({
  onCerrar,
  onImportado,
}: {
  onCerrar: () => void;
  onImportado: () => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<Resultado | null>(null);
  const [hecho, setHecho] = useState<Resultado | null>(null);
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const correr = async (confirmar: boolean) => {
    if (!archivo) return;
    setTrabajando(true);
    setError("");
    try {
      const r = await subir(archivo, confirmar);
      if (confirmar) {
        setHecho(r);
        onImportado();
      } else {
        setVista(r);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTrabajando(false);
    }
  };

  const plantilla = () =>
    descargar("/exportar/", {
      formato: "xlsx",
      titulo: "Plantilla de personas",
      subtitulo:
        "Llena desde la fila 5. Documento sin puntos; fecha como AAAA-MM-DD; tipo de documento V, E o P.",
      columnas: COLUMNAS,
      filas: [],
    }).catch((e: Error) => setError(e.message));

  const r = hecho ?? vista;
  return (
    <Modal isOpen onClose={onCerrar} className="m-4 max-w-lg">
      <div className="p-6">
        <h3 className="mb-1 pe-12 text-lg font-semibold text-gray-800 dark:text-white/90">
          Importar personas
        </h3>
        <p className="mb-5 pe-12 text-theme-sm text-gray-500 dark:text-gray-400">
          Desde un Excel (.xlsx) o CSV con una fila por persona. Si ya está
          registrada (mismo documento, correo o teléfono), se actualiza en vez
          de duplicarse.
        </p>

        {!hecho && (
          <>
            <button
              type="button"
              className={`${claseBoton} mb-4 inline-flex items-center gap-2`}
              onClick={plantilla}
            >
              <FileExcelIcon
                className="size-5 text-success-600 dark:text-success-500"
                aria-hidden="true"
              />
              Descargar la plantilla
            </button>
            <label
              htmlFor="importar-archivo"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              Archivo
            </label>
            <input
              id="importar-archivo"
              type="file"
              accept=".xlsx,.csv"
              className={`${claseControl} w-full py-2`}
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setVista(null);
                setError("");
              }}
            />
            {archivo && !vista && (
              <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
                Primero se revisa; nada se guarda hasta que confirmes.
              </p>
            )}
          </>
        )}

        {r && (
          <div className="mt-5 space-y-3">
            <p
              className={`rounded-lg px-4 py-3 text-sm ${
                hecho
                  ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
                  : "bg-gray-50 text-gray-700 dark:bg-white/5 dark:text-gray-300"
              }`}
            >
              {hecho ? "Importadas" : "Del archivo"} {r.filas} filas:{" "}
              <strong>{r.nuevas}</strong> nuevas,{" "}
              <strong>{r.actualizadas}</strong> se actualizan
              {r.sin_cambios > 0 && `, ${r.sin_cambios} sin cambios`}
              {r.total_errores > 0 && (
                <>
                  , <strong>{r.total_errores}</strong> con errores
                </>
              )}
              .
            </p>
            {r.errores.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-error-200 p-3 text-theme-xs text-error-600 dark:border-error-500/30 dark:text-error-400">
                {r.errores.map((e, i) => (
                  <li key={i}>
                    Fila {e.fila}: {e.mensaje}
                  </li>
                ))}
              </ul>
            )}
            {!hecho && r.total_errores > 0 && (
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                Corrige esas filas en el archivo y vuelve a subirlo: no se
                importa nada mientras haya errores.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-error-500" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {hecho ? (
            <Button size="sm" onClick={onCerrar}>
              Listo
            </Button>
          ) : (
            <>
              <button type="button" className={claseBoton} onClick={onCerrar}>
                Volver
              </button>
              {vista && vista.total_errores === 0 ? (
                <Button
                  size="sm"
                  disabled={trabajando}
                  onClick={() => correr(true)}
                >
                  {trabajando ? "Importando…" : `Importar ${vista.filas} filas`}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={!archivo || trabajando}
                  onClick={() => correr(false)}
                >
                  {trabajando ? "Revisando…" : "Revisar archivo"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
