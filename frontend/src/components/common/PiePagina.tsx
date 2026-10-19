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
  return (
    <footer
      className={cn(
        "px-4 py-5 text-center text-theme-xs",
        claro ? "text-white/50" : "text-gray-400 dark:text-gray-500",
        className,
      )}
    >
      © {new Date().getFullYear()} Betania · Gestión de retiros. Desarrollado
      por <span className="font-medium">Gabagabs</span>.
    </footer>
  );
}
