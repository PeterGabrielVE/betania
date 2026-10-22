import { CheckLineIcon } from "@/icons";
import type { Paso } from "./esquema";

// Los pasos del formulario como pestañas. Se puede volver a cualquier paso ya
// visitado; para avanzar hay que completar el actual (botón "Siguiente").
export default function BarraPasos({
  pasos,
  actual,
  alcanzado,
  conErrores,
  onIr,
}: {
  pasos: Paso[];
  actual: number;
  alcanzado: number; // el paso más lejano visitado
  conErrores: Set<number>;
  onIr: (indice: number) => void;
}) {
  return (
    <>
      {/* Celular: "Paso 2 de 6" y una barra de avance. */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3">
          <select
            value={actual}
            onChange={(e) => onIr(Number(e.target.value))}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-theme-sm font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            aria-label="Ir al paso"
          >
            {pasos.map((p, i) => (
              <option key={p.id} value={i} disabled={i > alcanzado}>
                {i + 1}. {p.titulo}
              </option>
            ))}
          </select>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">
            Paso {actual + 1} de {pasos.length}
          </p>
        </div>
        <div
          className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={pasos.length}
          aria-valuenow={actual + 1}
          aria-label="Avance del formulario"
        >
          <div
            className="h-1.5 rounded-full bg-brand-500 transition-all"
            style={{ width: `${((actual + 1) / pasos.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Escritorio: todas las pestañas. */}
      <ol className="hidden gap-2 md:flex" role="tablist">
        {pasos.map((p, i) => {
          const hecho = i < actual && i <= alcanzado && !conErrores.has(i);
          const disponible = i <= alcanzado;
          const esActual = i === actual;
          return (
            <li key={p.id} className="min-w-0 flex-1">
              <button
                type="button"
                role="tab"
                aria-selected={esActual}
                disabled={!disponible}
                onClick={() => onIr(i)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors disabled:cursor-not-allowed ${
                  esActual
                    ? "border-brand-500 bg-brand-25 dark:border-brand-500/60 dark:bg-brand-500/10"
                    : "border-gray-200 hover:bg-gray-50 disabled:hover:bg-transparent dark:border-gray-800 dark:hover:bg-white/5"
                }`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-theme-sm font-semibold ${
                    conErrores.has(i)
                      ? "bg-error-500 text-white"
                      : hecho
                        ? "bg-success-500 text-white"
                        : esActual
                          ? "bg-brand-500 text-white"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {hecho ? <CheckLineIcon className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-theme-sm leading-tight font-medium ${
                      disponible
                        ? "text-gray-800 dark:text-white/90"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {p.titulo}
                  </span>
                  <span className="mt-0.5 hidden truncate text-theme-xs text-gray-500 2xl:block dark:text-gray-400">
                    {p.descripcion}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
