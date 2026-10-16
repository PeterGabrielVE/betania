import Tooltip from "@/components/ui/tooltip/Tooltip";
import { FilterXIcon } from "@/icons";

// Quitar la búsqueda y los filtros: ícono del alto de los controles de la
// fila, con su nombre en un tooltip.
export default function BotonLimpiarFiltros({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Tooltip texto="Limpiar filtros">
      {(id) => (
        <button
          type="button"
          onClick={onClick}
          aria-label="Limpiar filtros"
          aria-describedby={id}
          className="flex size-11 items-center justify-center rounded-lg border border-gray-300 text-gray-500 shadow-theme-xs transition hover:border-error-300 hover:bg-error-50 hover:text-error-600 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:text-gray-400 dark:hover:border-error-500/40 dark:hover:bg-error-500/10 dark:hover:text-error-400"
        >
          <FilterXIcon className="size-5" aria-hidden="true" />
        </button>
      )}
    </Tooltip>
  );
}
