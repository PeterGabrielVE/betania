// Clases compartidas por los controles de los módulos (mismo aspecto que InputField).
export const claseControl =
  "h-11 rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";

export const claseBoton =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5";

// El botón principal de una barra (Agregar, Confirmar…): mismo alto y relleno
// que claseBoton, para que queden parejos en la misma fila.
export const claseBotonPrincipal =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-brand-500 bg-brand-500 px-3 py-2 text-sm font-medium text-white shadow-theme-xs transition hover:border-brand-600 hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

export const claseTarjeta =
  "rounded-2xl border border-gray-200 bg-white p-5 md:p-6 dark:border-gray-800 dark:bg-white/3";

export const claseEnlace =
  "text-brand-500 hover:text-brand-600 dark:text-brand-400";
