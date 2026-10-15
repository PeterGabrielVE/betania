import { cn } from "@/utils";

interface LogoProps {
  soloIcono?: boolean; // barra lateral plegada
  claro?: boolean; // texto blanco, para fondos oscuros
  className?: string;
}

// Nombre y logo del sistema. El dibujo está en public/images/logo/betania.svg:
// para cambiar el logo basta con reemplazar ese archivo.
export default function Logo({ soloIcono, claro, className }: LogoProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <img src="/images/logo/betania.svg" alt="Betania" className="size-8" />
      {!soloIcono && (
        <span
          className={cn(
            "text-2xl font-semibold tracking-tight",
            claro ? "text-white" : "text-gray-800 dark:text-white/90",
          )}
        >
          Betania
        </span>
      )}
    </span>
  );
}
