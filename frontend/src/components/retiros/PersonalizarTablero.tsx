import type { Resumen } from "@/api/client";
import Checkbox from "@/components/form/input/Checkbox";
import { claseBoton, claseEnlace } from "@/components/modulos/estilos";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { useAuth } from "@/context/AuthContext";
import { SettingsAltIcon } from "@/icons";
import { SECCIONES } from "@/pages/Retiros/seccionesTablero";
import { useState } from "react";

// Menú "Personalizar" del tablero: qué secciones ver. Cada cambio se ve al
// instante y queda guardado para el usuario (en cualquier equipo).
export default function PersonalizarTablero({ resumen }: { resumen: Resumen }) {
  const { sesion, guardarTablero } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");
  const ocultos = sesion?.autenticado
    ? sesion.preferencias.tablero_ocultos
    : [];
  const disponibles = SECCIONES.filter((s) => s.hay(resumen));
  const cuantasOcultas = disponibles.filter((s) =>
    ocultos.includes(s.clave),
  ).length;

  const guardar = (nuevos: string[]) => {
    setError("");
    guardarTablero(nuevos, ocultos).catch((e: Error) =>
      setError(`No se guardó: ${e.message}`),
    );
  };
  const cambiar = (clave: string, ver: boolean) =>
    guardar(ver ? ocultos.filter((c) => c !== clave) : [...ocultos, clave]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className={`dropdown-toggle inline-flex items-center gap-2 ${claseBoton}`}
        aria-expanded={abierto}
        aria-haspopup="dialog"
      >
        <SettingsAltIcon className="size-4" aria-hidden="true" />
        Personalizar
        {cuantasOcultas > 0 && (
          <span className="rounded-full bg-gray-100 px-1.5 text-theme-xs text-gray-600 tabular-nums dark:bg-gray-800 dark:text-gray-400">
            {cuantasOcultas} {cuantasOcultas === 1 ? "oculta" : "ocultas"}
          </span>
        )}
      </button>
      <Dropdown
        isOpen={abierto}
        onClose={() => setAbierto(false)}
        // En el celular el botón queda a la izquierda: abre hacia la derecha.
        className="inset-s-0 inset-e-auto w-72 max-w-[calc(100vw-2rem)] p-4 sm:inset-s-auto sm:inset-e-0"
      >
        <div role="dialog" aria-label="Secciones del tablero">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
              Qué ver en el tablero
            </p>
            {cuantasOcultas > 0 && (
              <button
                type="button"
                className={`text-theme-xs ${claseEnlace}`}
                onClick={() => guardar([])}
              >
                Mostrar todo
              </button>
            )}
          </div>
          {(["Del retiro", "En general"] as const).map((grupo) => {
            const del = disponibles.filter((s) => s.grupo === grupo);
            if (!del.length) return null;
            return (
              <fieldset key={grupo} className="mb-3 last:mb-0">
                <legend className="mb-2 text-theme-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {grupo}
                </legend>
                <div className="space-y-2.5">
                  {del.map((s) => (
                    <Checkbox
                      key={s.clave}
                      label={s.titulo}
                      checked={!ocultos.includes(s.clave)}
                      onChange={(ver) => cambiar(s.clave, ver)}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
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
