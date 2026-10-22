import Checkbox from "@/components/form/input/Checkbox";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { TableIcon } from "@/icons";
import { useState } from "react";
import { claseBoton, claseEnlace } from "./estilos";
import type { useColumnas } from "./useColumnas";

// Menú "Columnas" de una tabla (ver useColumnas): marcar las que se ven y
// agregar las opcionales. Cada cambio se ve al instante y queda guardado.
export default function SelectorColumnas({
  defs,
  elegida,
  cambiar,
  restablecer,
  personalizada,
  cuantas,
  error,
}: ReturnType<typeof useColumnas>["selector"]) {
  const [abierto, setAbierto] = useState(false);
  const grupos = [
    { titulo: "Columnas", lista: defs.filter((d) => !d.opcional) },
    { titulo: "Agregar columnas", lista: defs.filter((d) => d.opcional) },
  ].filter((g) => g.lista.length);
  if (defs.length < 2) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className={`dropdown-toggle inline-flex items-center gap-2 ${claseBoton}`}
        aria-expanded={abierto}
        aria-haspopup="dialog"
      >
        <TableIcon className="size-4" aria-hidden="true" />
        Columnas
        <span className="rounded-full bg-gray-100 px-1.5 text-theme-xs text-gray-600 tabular-nums dark:bg-gray-800 dark:text-gray-400">
          {cuantas}
        </span>
      </button>
      <Dropdown
        isOpen={abierto}
        onClose={() => setAbierto(false)}
        // En el celular el botón queda a la izquierda: abre hacia la derecha.
        className="inset-s-0 inset-e-auto max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto p-4 sm:inset-s-auto sm:inset-e-0"
      >
        <div role="dialog" aria-label="Columnas de la tabla">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
              Qué columnas ver
            </p>
            {personalizada && (
              <button
                type="button"
                className={`text-theme-xs ${claseEnlace}`}
                onClick={restablecer}
              >
                Restablecer
              </button>
            )}
          </div>
          {grupos.map((g) => (
            <fieldset key={g.titulo} className="mb-3 last:mb-0">
              {grupos.length > 1 && (
                <legend className="mb-2 text-theme-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {g.titulo}
                </legend>
              )}
              <div className="space-y-2.5">
                {g.lista.map((d) => {
                  const marcada = elegida(d);
                  return (
                    <Checkbox
                      key={d.clave}
                      label={d.etiqueta || "(sin título)"}
                      checked={marcada}
                      // La fija y la última a la vista no se pueden quitar.
                      disabled={d.fija || (marcada && cuantas <= 1)}
                      onChange={(ver) => cambiar(d.clave, ver)}
                    />
                  );
                })}
              </div>
            </fieldset>
          ))}
          <p className="mt-3 text-theme-xs text-gray-500 dark:text-gray-400">
            Las descargas en Excel y PDF llevan las mismas columnas.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-theme-xs text-error-500">
              {error}
            </p>
          )}
        </div>
      </Dropdown>
    </div>
  );
}
