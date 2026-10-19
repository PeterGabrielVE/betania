import { cn } from "@/utils";

// Pie de todas las páginas: el año sale del reloj, así no hay que cambiarlo.
// `claro`: texto claro, para fondos oscuros (el login en el celular).
export default function PiePagina({
  claro,
  className,
}: {
  claro?: boolean;
  className?: string;
}) {
  const anio = new Date().getFullYear();
  const autor = <span className="font-medium">Gabagabs</span>;
  return (
    <footer
      className={cn(
        "px-4 py-5 text-center text-theme-xs",
        claro ? "text-white/50" : "text-gray-400 dark:text-gray-500",
        className,
      )}
    >
      {/* En el celular, la versión corta: que quepa en una línea. */}
      <span className="sm:hidden">
        © {anio} Betania · Desarrollado por {autor}
      </span>
      <span className="max-sm:hidden">
        © {anio} Betania · Gestión de retiros. Desarrollado por {autor}.
      </span>
    </footer>
  );
}
