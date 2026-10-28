import { ArrowDownIcon, ArrowUpIcon } from "@/icons";

// Título de una columna que se puede ordenar: un clic, de menor a mayor
// (A-Z, más antiguo primero); otro, de mayor a menor; otro, el orden de siempre.
export default function EncabezadoOrden({
  etiqueta,
  clave,
  orden,
  onOrdenar,
}: {
  etiqueta: string;
  clave: string;
  orden: string; // "columna", "-columna" o ""
  onOrdenar: (clave: string) => void;
}) {
  const sentido =
    orden === clave ? "asc" : orden === `-${clave}` ? "desc" : null;
  const siguiente =
    sentido === null
      ? "ascendente"
      : sentido === "asc"
        ? "descendente"
        : "el de siempre";
  const Icono = sentido === "desc" ? ArrowDownIcon : ArrowUpIcon;
  return (
    <button
      type="button"
      onClick={() => onOrdenar(clave)}
      className={`group/orden inline-flex items-center gap-1 whitespace-nowrap hover:text-gray-800 dark:hover:text-white/90 ${
        sentido ? "text-gray-800 dark:text-white/90" : ""
      }`}
      title={`Ordenar: ${siguiente}`}
      aria-label={`${etiqueta}. ${
        sentido === "asc"
          ? "Orden ascendente"
          : sentido === "desc"
            ? "Orden descendente"
            : "Sin ordenar"
      }. Cambiar a ${siguiente}.`}
    >
      {etiqueta}
      <Icono
        className={`size-3.5 shrink-0 ${
          sentido
            ? "text-brand-500"
            : "opacity-0 group-hover/orden:opacity-50 group-focus-visible/orden:opacity-50"
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
