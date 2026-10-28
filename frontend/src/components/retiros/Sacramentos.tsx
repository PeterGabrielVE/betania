// Conteo y gráficas del reporte de sacramentos: cuántos recibieron cada uno,
// cuántos tiene cada persona y a qué parroquia asisten. Todo sale de las filas
// que se ven (con la búsqueda y los filtros aplicados).
import type { ColumnaReporte, TablaDescarga } from "@/api/client";
import BotonesDescarga from "@/components/modulos/BotonesDescarga";
import { claseTarjeta } from "@/components/modulos/estilos";
import { useTheme } from "@/context/ThemeContext";
import type { ApexOptions } from "apexcharts";
import Chart from "react-apexcharts";

type Celda = string | number | null;

const claseTitulo =
  "mb-1 text-theme-sm font-semibold text-gray-800 dark:text-white/90";
const claseNota = "text-theme-xs text-gray-500 dark:text-gray-400";

// Paleta categórica (validada en claro y oscuro) y el gris de "Otras".
const SERIES = {
  claro: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"],
  oscuro: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"],
};
const GRIS = { claro: "#98a2b3", oscuro: "#667085" };

// Los tres sacramentos de la iniciación cristiana.
const INICIACION = ["Bautismo", "Primera comunión", "Confirmación"];

const porcentaje = (n: number, total: number) =>
  total ? `${Math.round((n / total) * 100)} %` : "0 %";

function Cifra({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: number;
  detalle?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <p className={claseNota}>{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-800 tabular-nums dark:text-white/90">
        {valor}
      </p>
      {detalle && <p className={claseNota}>{detalle}</p>}
    </div>
  );
}

// Un anillo: la parte de quienes lo recibieron, sobre la pista del total.
function Anillo({
  etiqueta,
  si,
  total,
  elegido,
  onElegir,
}: {
  etiqueta: string;
  si: number;
  total: number;
  elegido: boolean;
  onElegir: () => void;
}) {
  const radio = 34;
  const largo = 2 * Math.PI * radio;
  const parte = total ? si / total : 0;
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={elegido}
      title={`${etiqueta}: ${si} de ${total} lo recibieron (${porcentaje(si, total)}). Clic para ver solo a quienes lo tienen.`}
      className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition ${
        elegido
          ? "border-brand-500 bg-brand-25 dark:border-brand-500/60 dark:bg-brand-500/10"
          : "border-gray-200 hover:border-brand-300 dark:border-gray-800 dark:hover:border-brand-800"
      }`}
    >
      <svg viewBox="0 0 80 80" className="size-20" aria-hidden="true">
        <circle
          cx="40"
          cy="40"
          r={radio}
          fill="none"
          strokeWidth="8"
          className="stroke-(--viz-pista)"
        />
        {si > 0 && (
          <circle
            cx="40"
            cy="40"
            r={radio}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${largo * parte} ${largo}`}
            transform="rotate(-90 40 40)"
            className="stroke-(--viz-serie)"
          />
        )}
        <text
          x="40"
          y="45"
          textAnchor="middle"
          className="fill-gray-800 text-[15px] font-semibold dark:fill-white/90"
        >
          {porcentaje(si, total).replace(" ", "")}
        </text>
      </svg>
      <span className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
        {etiqueta}
      </span>
      <span className={`${claseNota} tabular-nums`}>
        {si} de {total}
      </span>
    </button>
  );
}

// Torta de a qué parroquia asisten: las cinco con más gente y el resto junto.
function TortaParroquias({ valores }: { valores: string[] }) {
  const { theme } = useTheme();
  const oscuro = theme === "dark";
  const conteo = new Map<string, number>();
  for (const v of valores) {
    const clave = v.trim() || "Sin indicar";
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  const sinIndicar = conteo.get("Sin indicar") ?? 0;
  conteo.delete("Sin indicar");
  const ordenadas = [...conteo.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"),
  );
  const principales = ordenadas.slice(0, 5);
  const otras = ordenadas.slice(5).reduce((s, [, n]) => s + n, 0);
  const paleta = SERIES[oscuro ? "oscuro" : "claro"];
  const gris = GRIS[oscuro ? "oscuro" : "claro"];
  const porciones = [
    ...principales.map(([etiqueta, total], i) => ({
      etiqueta,
      total,
      color: paleta[i],
    })),
    ...(otras ? [{ etiqueta: "Otras", total: otras, color: gris }] : []),
    ...(sinIndicar
      ? [{ etiqueta: "Sin indicar", total: sinIndicar, color: gris }]
      : []),
  ];
  const total = valores.length;
  if (porciones.length === 0) return null;

  const opciones: ApexOptions = {
    chart: {
      type: "donut",
      fontFamily: "Outfit, sans-serif",
      animations: { enabled: false },
      background: "transparent",
    },
    theme: { mode: oscuro ? "dark" : "light" },
    labels: porciones.map((p) => p.etiqueta),
    colors: porciones.map((p) => p.color),
    // Separación del color de la superficie entre porciones.
    stroke: { width: 2, colors: [oscuro ? "#101828" : "#ffffff"] },
    legend: { show: false },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "62%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Personas",
              color: oscuro ? "#98a2b3" : "#667085",
              formatter: () => String(total),
            },
            value: { color: oscuro ? "#ffffffe6" : "#1d2939" },
          },
        },
      },
    },
    tooltip: {
      theme: oscuro ? "dark" : "light",
      y: { formatter: (v) => `${v} (${porcentaje(v, total)})` },
    },
  };
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
      <Chart
        key={theme}
        options={opciones}
        series={porciones.map((p) => p.total)}
        type="donut"
        height={200}
      />
      {/* Leyenda con cifras: el color nunca va solo. */}
      <ul className="space-y-1.5 text-theme-sm">
        {porciones.map((p) => (
          <li key={p.etiqueta} className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ background: p.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
              {p.etiqueta}
            </span>
            <span className="font-medium text-gray-800 tabular-nums dark:text-white/90">
              {p.total}
            </span>
            <span className={`${claseNota} w-10 text-end tabular-nums`}>
              {porcentaje(p.total, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Columnas: cuántas personas tienen 0, 1, 2… sacramentos.
function ColumnasPorCantidad({
  cantidades,
  maximo,
}: {
  cantidades: number[];
  maximo: number;
}) {
  const { theme } = useTheme();
  const oscuro = theme === "dark";
  const tenue = oscuro ? "#98a2b3" : "#667085";
  const conteo = Array.from(
    { length: maximo + 1 },
    (_, n) => cantidades.filter((c) => c === n).length,
  );
  const opciones: ApexOptions = {
    chart: {
      type: "bar",
      fontFamily: "Outfit, sans-serif",
      toolbar: { show: false },
      animations: { enabled: false },
      background: "transparent",
    },
    theme: { mode: oscuro ? "dark" : "light" },
    colors: [oscuro ? "#3987e5" : "#2a78d6"],
    plotOptions: {
      bar: {
        columnWidth: "55%",
        borderRadius: 4,
        borderRadiusApplication: "end",
        dataLabels: { position: "top" },
      },
    },
    dataLabels: {
      enabled: true,
      offsetY: -18,
      style: { colors: [oscuro ? "#d0d5dd" : "#475467"], fontWeight: 500 },
      formatter: (v: number) => (v ? String(v) : ""),
    },
    grid: {
      borderColor: oscuro ? "#1d2939" : "#f2f4f7",
      xaxis: { lines: { show: false } },
    },
    xaxis: {
      categories: conteo.map((_, n) => String(n)),
      title: {
        text: "Sacramentos recibidos",
        style: { color: tenue, fontWeight: 400 },
      },
      labels: { style: { colors: tenue } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: {
        style: { colors: tenue },
        formatter: (v) => String(Math.round(v)),
      },
    },
    tooltip: {
      theme: oscuro ? "dark" : "light",
      x: {
        formatter: (v) =>
          `${v} ${Number(v) === 1 ? "sacramento" : "sacramentos"}`,
      },
      y: {
        formatter: (v) => `${v} ${v === 1 ? "persona" : "personas"}`,
        title: { formatter: () => "" },
      },
    },
  };
  return (
    <Chart
      key={theme}
      options={opciones}
      series={[{ name: "Personas", data: conteo }]}
      type="bar"
      height={240}
    />
  );
}

export default function ResumenSacramentos({
  columnas,
  filas,
  elegido,
  onElegir,
  titulo,
}: {
  columnas: ColumnaReporte[];
  filas: Celda[][];
  elegido: number | null; // índice de la columna del sacramento filtrado
  onElegir: (indice: number | null) => void;
  titulo: string; // para la descarga del conteo
}) {
  const indices = columnas.flatMap((c, i) =>
    c.grupo === "sacramento" ? [i] : [],
  );
  const parroquia = columnas.findIndex((c) =>
    c.etiqueta.toLowerCase().startsWith("parroquia"),
  );
  const total = filas.length;
  const tiene = (f: Celda[], i: number) => f[i] === "Sí";
  const conteo = indices.map((i) => ({
    indice: i,
    etiqueta: columnas[i].etiqueta,
    si: filas.filter((f) => tiene(f, i)).length,
  }));
  const cantidades = filas.map(
    (f) => indices.filter((i) => tiene(f, i)).length,
  );
  const iniciacion = indices.filter((i) =>
    INICIACION.includes(columnas[i].etiqueta),
  );
  const completa = filas.filter((f) =>
    iniciacion.every((i) => tiene(f, i)),
  ).length;
  const ninguno = cantidades.filter((c) => c === 0).length;

  if (total === 0) return null;

  const tablaDescarga = (): TablaDescarga => ({
    titulo: `Conteo de sacramentos · ${titulo}`,
    subtitulo: `${total} personas`,
    columnas: ["Sacramento", "Lo recibieron", "No lo recibieron", "Porcentaje"],
    filas: conteo.map((c) => [
      c.etiqueta,
      c.si,
      total - c.si,
      porcentaje(c.si, total),
    ]),
  });

  return (
    <div className="mb-6 space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cifra etiqueta="Personas" valor={total} />
        {iniciacion.length === INICIACION.length && (
          <Cifra
            etiqueta="Iniciación cristiana completa"
            valor={completa}
            detalle={`${porcentaje(completa, total)} · bautismo, primera comunión y confirmación`}
          />
        )}
        <Cifra
          etiqueta="Sin ningún sacramento"
          valor={ninguno}
          detalle={porcentaje(ninguno, total)}
        />
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={claseTitulo}>Cuántos recibieron cada sacramento</p>
            <p className={claseNota}>
              Clic en uno para ver solo a quienes lo tienen.
            </p>
          </div>
          <BotonesDescarga tabla={tablaDescarga} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {conteo.map((c) => (
            <Anillo
              key={c.indice}
              etiqueta={c.etiqueta}
              si={c.si}
              total={total}
              elegido={elegido === c.indice}
              onElegir={() => onElegir(elegido === c.indice ? null : c.indice)}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={claseTarjeta}>
          <p className={claseTitulo}>Cuántos sacramentos tiene cada persona</p>
          <p className={claseNota}>
            Personas según cuántos de los {indices.length} sacramentos han
            recibido.
          </p>
          <ColumnasPorCantidad
            cantidades={cantidades}
            maximo={indices.length}
          />
        </div>
        {parroquia >= 0 && (
          <div className={claseTarjeta}>
            <p className={claseTitulo}>A qué parroquia asisten</p>
            <p className={`${claseNota} mb-4`}>
              Las cinco con más personas; las demás, juntas en «Otras».
            </p>
            <TortaParroquias
              valores={filas.map((f) => String(f[parroquia] ?? ""))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
