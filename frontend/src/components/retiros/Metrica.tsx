import { claseTarjeta } from "@/components/modulos/estilos";

interface MetricaProps {
  icono: React.ReactNode;
  etiqueta: string;
  valor: string | number;
  detalle?: string;
  // Debajo de la cifra, p. ej. un <Medidor>.
  children?: React.ReactNode;
}

// Tarjeta con una cifra: las del inicio y las del panel de un retiro.
export default function Metrica({
  icono,
  etiqueta,
  valor,
  detalle,
  children,
}: MetricaProps) {
  return (
    <div className={claseTarjeta}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90">
        {icono}
      </div>
      <div className="mt-5">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {etiqueta}
        </span>
        <h4 className="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
          {valor}
        </h4>
        {detalle && (
          <span className="mt-1 block text-theme-xs text-gray-500 dark:text-gray-400">
            {detalle}
          </span>
        )}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}
