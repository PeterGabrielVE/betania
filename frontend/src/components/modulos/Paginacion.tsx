import { ChevronLeftIcon } from "@/icons";
import { claseControl } from "./estilos";
import { TAMANOS_PAGINA } from "./paginas";

// Páginas a mostrar: la primera, la última y las vecinas de la actual; los
// saltos se marcan con "…".
function paginasVisibles(actual: number, total: number): (number | "…")[] {
  const numeros = [...new Set([1, actual - 1, actual, actual + 1, total])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  return numeros.flatMap((n, i) =>
    i > 0 && n - numeros[i - 1] > 1 ? (["…", n] as const) : [n],
  );
}

const claseBotonPagina =
  "flex size-9 items-center justify-center rounded-lg border text-theme-sm font-medium disabled:cursor-not-allowed disabled:opacity-40";
const claseNormal =
  "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5";
const claseActual = "border-brand-500 bg-brand-500 text-white";

export default function Paginacion({
  pagina,
  total,
  porPagina,
  cargando,
  onPagina,
  onPorPagina,
}: {
  pagina: number;
  total: number; // registros en total
  porPagina: number;
  cargando: boolean;
  onPagina: (pagina: number) => void;
  onPorPagina: (porPagina: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  return (
    <div className="flex flex-col gap-3 text-theme-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:text-gray-400">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Mostrando{" "}
          <strong className="font-medium text-gray-800 dark:text-white/90">
            {desde}–{hasta}
          </strong>{" "}
          de{" "}
          <strong className="font-medium text-gray-800 dark:text-white/90">
            {total}
          </strong>
        </span>
        <label className="flex items-center gap-2">
          <select
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
            className={`${claseControl} h-9 px-2`}
          >
            {TAMANOS_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          por página
        </label>
      </div>

      {paginas > 1 && (
        <nav className="flex items-center gap-1.5" aria-label="Paginación">
          <button
            type="button"
            className={`${claseBotonPagina} ${claseNormal}`}
            disabled={pagina <= 1 || cargando}
            onClick={() => onPagina(pagina - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeftIcon className="size-4 rtl:rotate-180" />
          </button>
          {/* En pantallas chicas basta con "3 / 12". */}
          <span className="px-2 sm:hidden">
            {pagina} / {paginas}
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            {paginasVisibles(pagina, paginas).map((n, i) =>
              n === "…" ? (
                <span key={`salto-${i}`} className="px-1">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  className={`${claseBotonPagina} ${n === pagina ? claseActual : claseNormal}`}
                  disabled={cargando}
                  aria-current={n === pagina ? "page" : undefined}
                  onClick={() => onPagina(n)}
                >
                  {n}
                </button>
              ),
            )}
          </span>
          <button
            type="button"
            className={`${claseBotonPagina} ${claseNormal}`}
            disabled={pagina >= paginas || cargando}
            onClick={() => onPagina(pagina + 1)}
            aria-label="Página siguiente"
          >
            <ChevronLeftIcon className="size-4 rotate-180 rtl:rotate-0" />
          </button>
        </nav>
      )}
    </div>
  );
}
