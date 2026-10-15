// Gráficas del tablero. Los colores salen de las variables --viz-* de index.css
// (claro y oscuro); el texto nunca va en el color de la serie.
import { useTheme } from "@/context/ThemeContext";
import { dinero, fecha } from "@/utils/formato";
import type { ApexOptions } from "apexcharts";
import { useState } from "react";
import Chart from "react-apexcharts";

const claseVacio = "text-sm text-gray-500 dark:text-gray-400";

export type Segmento = {
  clave: string;
  etiqueta: string;
  total: number;
  color: string; // p. ej. "var(--viz-bueno)"
};

// Partes de un total en una sola barra, con la leyenda siempre visible (cifra y
// porcentaje), para que el color nunca sea lo único que distingue cada parte.
// Al pasar el mouse por un tramo se resalta su renglón en la leyenda.
export function BarraApilada({
  segmentos,
  descripcion,
}: {
  segmentos: Segmento[];
  descripcion: string;
}) {
  const [activo, setActivo] = useState<string | null>(null);
  const total = segmentos.reduce((suma, s) => suma + s.total, 0);
  if (total === 0) return <p className={claseVacio}>Sin datos todavía.</p>;
  const porcentaje = (n: number) => `${Math.round((n / total) * 100)}%`;

  return (
    <div>
      <div
        className="flex h-3 w-full gap-0.5"
        role="img"
        aria-label={`${descripcion}: ${segmentos
          .map((s) => `${s.etiqueta} ${s.total}`)
          .join(", ")}`}
      >
        {segmentos
          .filter((s) => s.total > 0)
          .map((s) => (
            <div
              key={s.clave}
              className="h-full transition-opacity first:rounded-s last:rounded-e"
              style={{
                flexGrow: s.total,
                background: s.color,
                opacity: activo && activo !== s.clave ? 0.35 : 1,
              }}
              title={`${s.etiqueta}: ${s.total} (${porcentaje(s.total)})`}
              onMouseEnter={() => setActivo(s.clave)}
              onMouseLeave={() => setActivo(null)}
            />
          ))}
      </div>
      <ul className="mt-4 space-y-2 text-theme-sm">
        {segmentos.map((s) => (
          <li
            key={s.clave}
            className={`flex items-center gap-2 rounded px-1 transition-colors ${
              activo === s.clave ? "bg-gray-100 dark:bg-white/5" : ""
            }`}
            onMouseEnter={() => setActivo(s.clave)}
            onMouseLeave={() => setActivo(null)}
          >
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="text-gray-700 dark:text-gray-400">
              {s.etiqueta}
            </span>
            <span className="ms-auto font-medium text-gray-800 tabular-nums dark:text-white/90">
              {s.total}
            </span>
            <span className="w-10 text-end text-theme-xs text-gray-500 tabular-nums dark:text-gray-400">
              {porcentaje(s.total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Cuánto de un máximo se lleva (cupo, cuotas cobradas).
export function Medidor({
  valor,
  maximo,
  descripcion,
}: {
  valor: number;
  maximo: number;
  descripcion: string;
}) {
  const fraccion = maximo > 0 ? Math.min(valor / maximo, 1) : 0;
  return (
    <div
      className="h-2 w-full rounded bg-(--viz-pista)"
      role="meter"
      aria-label={descripcion}
      aria-valuemin={0}
      aria-valuemax={maximo}
      aria-valuenow={valor}
    >
      <div
        className="h-2 rounded bg-(--viz-serie)"
        style={{ width: `${fraccion * 100}%` }}
      />
    </div>
  );
}

// Comparar cantidades (servidores por área, gastos por categoría): un solo
// tono, la cifra al final de cada barra. Pasadas `maximoFilas`, el resto se
// junta en "Otras".
export function BarrasHorizontales({
  filas,
  formato = String,
  maximoFilas = 8,
}: {
  filas: { etiqueta: string; total: number }[];
  formato?: (n: number) => string;
  maximoFilas?: number;
}) {
  const conValor = filas.filter((f) => f.total > 0);
  if (conValor.length === 0) {
    return <p className={claseVacio}>Sin datos todavía.</p>;
  }
  const visibles =
    conValor.length > maximoFilas
      ? [
          ...conValor.slice(0, maximoFilas - 1),
          {
            etiqueta: "Otras",
            total: conValor
              .slice(maximoFilas - 1)
              .reduce((suma, f) => suma + f.total, 0),
          },
        ]
      : conValor;
  const mayor = Math.max(...visibles.map((f) => f.total));
  return (
    <ul className="space-y-1">
      {visibles.map((f) => (
        <li
          key={f.etiqueta}
          className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded px-1 py-1 text-theme-sm hover:bg-gray-50 dark:hover:bg-white/5"
          title={`${f.etiqueta}: ${formato(f.total)}`}
        >
          <span className="truncate text-gray-700 dark:text-gray-400">
            {f.etiqueta}
          </span>
          <span className="h-2.5">
            <span
              className="block h-full rounded-e bg-(--viz-serie)"
              style={{ width: `${(f.total / mayor) * 100}%` }}
            />
          </span>
          <span className="font-medium text-gray-800 tabular-nums dark:text-white/90">
            {formato(f.total)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Ingresos acumulados en el tiempo, con la línea de lo que se espera reunir en
// cuotas (si se conoce). Un solo eje: los dos son montos en la moneda base.
export function GraficaRecaudacion({
  puntos,
  esperado,
}: {
  puntos: { fecha: string; total: number }[];
  esperado?: number;
}) {
  const { theme } = useTheme();
  const oscuro = theme === "dark";
  if (puntos.length === 0) {
    return <p className={claseVacio}>Todavía no hay pagos registrados.</p>;
  }
  const serie = oscuro ? "#3987e5" : "#2a78d6";
  const tenue = oscuro ? "#98a2b3" : "#667085";
  const rejilla = oscuro ? "#1d2939" : "#f2f4f7";

  const opciones: ApexOptions = {
    chart: {
      type: "area",
      fontFamily: "Outfit, sans-serif",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      background: "transparent",
    },
    theme: { mode: oscuro ? "dark" : "light" },
    colors: [serie],
    stroke: { curve: "stepline", width: 2 },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.3, opacityTo: 0.02 },
    },
    markers: {
      size: puntos.length === 1 ? 5 : 0,
      hover: { size: 5 },
      strokeColors: oscuro ? "#101828" : "#ffffff",
      strokeWidth: 2,
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: {
      borderColor: rejilla,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    xaxis: {
      type: "datetime",
      labels: { style: { colors: tenue }, datetimeUTC: true },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      min: 0,
      max: esperado
        ? Math.max(esperado, puntos.at(-1)!.total) * 1.05
        : undefined,
      labels: {
        style: { colors: tenue },
        formatter: (v) => dinero(v),
      },
    },
    tooltip: {
      theme: oscuro ? "dark" : "light",
      x: { formatter: (v) => fecha(new Date(v).toISOString()) },
      y: {
        formatter: (v) => dinero(v),
        title: { formatter: () => "Acumulado" },
      },
    },
    annotations: esperado
      ? {
          yaxis: [
            {
              y: esperado,
              borderColor: tenue,
              strokeDashArray: 4,
              label: {
                text: `Cuotas esperadas: ${dinero(esperado)}`,
                position: "left",
                textAnchor: "start",
                borderWidth: 0,
                style: {
                  color: tenue,
                  background: "transparent",
                  fontSize: "11px",
                },
              },
            },
          ],
        }
      : undefined,
  };

  return (
    <Chart
      // Cambiar de tema cambia todas las opciones: se vuelve a dibujar.
      key={theme}
      options={opciones}
      series={[
        {
          name: "Acumulado",
          data: puntos.map((p) => [Date.parse(p.fecha), p.total]),
        },
      ]}
      type="area"
      height={280}
    />
  );
}
