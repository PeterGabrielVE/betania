import { claseTarjeta } from "@/components/modulos/estilos";

interface MetricaProps {
  icono: React.ReactNode;
  etiqueta: string;
  valor: string | number;
  detalle?: string;
  // Debajo de la cifra, p. ej. un <Medidor>.
  children?: React.ReactNode;
}

// Las cifras largas (montos en bolívares) van más pequeñas para que quepan en
// la tarjeta, aun con seis por fila.
function tamanoCifra(valor: string | number) {
  const largo = String(valor).length;
  if (largo <= 9) return "text-title-sm";
  if (largo <= 12) return "text-2xl";
  return "text-xl";
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
    // min-w-0: en la cuadrícula, que la tarjeta se ajuste a su columna y no la
    // ensanche (si no, empuja las demás fuera de la pantalla).
    <div className={`${claseTarjeta} min-w-0`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white/90">
        {icono}
      </div>
      <div className="mt-5">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {etiqueta}
        </span>
        <h4
          className={`mt-2 font-bold wrap-break-word text-gray-800 tabular-nums dark:text-white/90 ${tamanoCifra(valor)}`}
        >
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
