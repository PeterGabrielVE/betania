// Piezas del tablero sobre caminantes y servidores: el anillo de confirmados,
// los anillos de tesorería (pago completo / abono parcial / sin abono), una ficha por
// estado y los indicadores de atención especial.
import type { Tablero } from "@/api/client";
import { claseTarjeta } from "@/components/modulos/estilos";
import { Link } from "react-router";

type Caminantes = NonNullable<Tablero["caminantes"]>;
type Conteo = { valor: string; etiqueta: string; total: number };

const porcentaje = (parte: number, total: number) =>
  total > 0 ? Math.round((parte / total) * 100) : 0;

function Encabezado({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
        {titulo}
      </h3>
      <p className="text-theme-xs text-gray-500 dark:text-gray-400">{nota}</p>
    </div>
  );
}

// Anillo con el % de caminantes que ya confirmaron su asistencia.
export function AnilloConfirmados({ caminantes }: { caminantes: Caminantes }) {
  const { confirmados, por_confirmar, inscritos } = caminantes;
  const fraccion = inscritos > 0 ? confirmados / inscritos : 0;
  const radio = 64;
  const vuelta = 2 * Math.PI * radio;
  return (
    <section className={`${claseTarjeta} h-full`}>
      <Encabezado
        titulo="Caminantes confirmados"
        nota="Confirmados frente a los que aún no confirman"
      />
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-40">
          <svg
            viewBox="0 0 160 160"
            className="size-40 -rotate-90"
            role="img"
            aria-label={`${porcentaje(confirmados, inscritos)}% confirmados: ${confirmados} de ${inscritos}`}
          >
            <circle
              cx="80"
              cy="80"
              r={radio}
              fill="none"
              strokeWidth="16"
              className="stroke-(--viz-pista)"
            />
            {confirmados > 0 && (
              <circle
                cx="80"
                cy="80"
                r={radio}
                fill="none"
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={`${fraccion * vuelta} ${vuelta}`}
                className="stroke-(--viz-serie) transition-all"
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-title-sm font-bold text-gray-800 tabular-nums dark:text-white/90">
              {porcentaje(confirmados, inscritos)}%
            </span>
            <span className="text-theme-xs text-gray-500 dark:text-gray-400">
              confirmados
            </span>
          </div>
        </div>
        <dl className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-theme-sm">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-(--viz-serie)" />
            <dt className="text-gray-500 dark:text-gray-400">Confirmados</dt>
            <dd className="font-semibold text-gray-800 tabular-nums dark:text-white/90">
              {confirmados}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-(--viz-pista) ring-1 ring-gray-300 dark:ring-gray-600" />
            <dt className="text-gray-500 dark:text-gray-400">Por confirmar</dt>
            <dd className="font-semibold text-gray-800 tabular-nums dark:text-white/90">
              {por_confirmar}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-gray-500 dark:text-gray-400">Total</dt>
            <dd className="font-semibold text-gray-800 tabular-nums dark:text-white/90">
              {inscritos}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

// Estados del pago, en el orden en que se dibujan en el anillo. "Sin abono"
// es la pista (lo que falta por llenar).
const ESTADOS_PAGO = [
  {
    valor: "pagado",
    nombre: "Pago completo",
    trazo: "stroke-(--viz-pagado)",
    punto: "bg-(--viz-pagado)",
  },
  {
    valor: "parcial",
    nombre: "Abono parcial",
    trazo: "stroke-(--viz-parcial)",
    punto: "bg-(--viz-parcial)",
  },
  {
    valor: "pendiente",
    nombre: "Sin abono",
    trazo: "",
    punto: "bg-(--viz-pista) ring-1 ring-gray-300 dark:ring-gray-600",
  },
];

// Un anillo por grupo: qué parte pagó completo, cuál abonó algo y cuál nada.
function AnilloPagos({ titulo, pagos }: { titulo: string; pagos: Conteo[] }) {
  const total = pagos.reduce((suma, p) => suma + p.total, 0);
  const cuantos = (valor: string) =>
    pagos.find((p) => p.valor === valor)?.total ?? 0;
  const radio = 52;
  const vuelta = 2 * Math.PI * radio;
  // Separación de 2px entre segmentos (si hay más de uno).
  const dibujados = ESTADOS_PAGO.filter((e) => e.trazo && cuantos(e.valor));
  const hueco =
    dibujados.length > 1 ||
    (dibujados.length === 1 && cuantos(dibujados[0].valor) < total)
      ? 2
      : 0;
  let inicio = 0;
  const segmentos = dibujados.map((e) => {
    const largo = (cuantos(e.valor) / total) * vuelta;
    const seg = { ...e, desde: inicio, largo: Math.max(largo - hueco, 0) };
    inicio += largo;
    return seg;
  });
  const completos = porcentaje(cuantos("pagado"), total);
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-theme-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
        {titulo}
      </p>
      <div className="relative size-32">
        <svg
          viewBox="0 0 128 128"
          className="size-32 -rotate-90"
          role="img"
          aria-label={`${titulo}: ${ESTADOS_PAGO.map((e) => `${cuantos(e.valor)} ${e.nombre.toLowerCase()}`).join(", ")}`}
        >
          <circle
            cx="64"
            cy="64"
            r={radio}
            fill="none"
            strokeWidth="14"
            className="stroke-(--viz-pista)"
          />
          {total > 0 &&
            segmentos.map((s) => (
              <circle
                key={s.valor}
                cx="64"
                cy="64"
                r={radio}
                fill="none"
                strokeWidth="14"
                strokeDasharray={`${s.largo} ${vuelta}`}
                strokeDashoffset={-s.desde}
                className={`${s.trazo} transition-all`}
              >
                <title>{`${s.nombre}: ${cuantos(s.valor)} de ${total}`}</title>
              </circle>
            ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-800 tabular-nums dark:text-white/90">
            {completos}%
          </span>
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">
            pago completo
          </span>
        </div>
      </div>
      <dl className="space-y-1 text-theme-sm">
        {ESTADOS_PAGO.map((e) => (
          <div key={e.valor} className="flex items-center gap-2">
            <span className={`size-2.5 shrink-0 rounded-full ${e.punto}`} />
            <dt className="text-gray-500 dark:text-gray-400">{e.nombre}</dt>
            <dd className="ms-auto ps-3 font-semibold text-gray-800 tabular-nums dark:text-white/90">
              {cuantos(e.valor)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Cuántos caminantes y servidores pagaron completo, abonaron una parte o no
// han abonado nada.
export function Tesoreria({
  retiroId,
  caminantes,
  servidores,
}: {
  retiroId: string;
  caminantes?: Conteo[];
  servidores?: Conteo[]; // solo si hay algo que cobrar a los servidores
}) {
  return (
    <section className={`${claseTarjeta} h-full`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <Encabezado titulo="Finanzas" nota="Estado de pagos de este retiro" />
        <Link
          to={`/control-pagos?retiro=${retiroId}`}
          className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
        >
          Control de pagos
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {caminantes && <AnilloPagos titulo="Caminantes" pagos={caminantes} />}
        {servidores && <AnilloPagos titulo="Servidores" pagos={servidores} />}
      </div>
    </section>
  );
}

const TONO_ESTADO: Record<string, string> = {
  solicitada:
    "border-blue-light-200 bg-blue-light-50 text-blue-light-700 dark:border-blue-light-500/30 dark:bg-blue-light-500/10 dark:text-blue-light-400",
  aceptada:
    "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400",
  lista_espera:
    "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400",
  confirmada:
    "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400",
  cancelada:
    "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400",
  servidores:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300",
};

// En plural, para leerse como "5 aceptados".
const PLURAL: Record<string, string> = {
  solicitada: "Solicitados",
  aceptada: "Aceptados",
  lista_espera: "Lista de espera",
  confirmada: "Confirmados",
};

type RetiroCorto = { id: string; etiqueta: string };

// Listado ya filtrado por el retiro (y lo demás que se pase): lo que abre
// cada ficha o indicador del tablero.
function enlace(
  ruta: string,
  retiro: RetiroCorto,
  filtros: Record<string, string>,
) {
  const p = new URLSearchParams({
    retiro: retiro.id,
    retiro__etiqueta: retiro.etiqueta,
    ...filtros,
  });
  return `${ruta}?${p}`;
}

// Al pasar el mouse o llegar con el teclado: se nota que lleva a la lista.
const claseEnlaceFicha =
  "transition hover:-translate-y-0.5 hover:shadow-theme-md focus:outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/30";

// Una ficha por estado de la inscripción, y los servidores del retiro. Cada
// una lleva a la lista de esas personas.
export function FichasPorEstado({
  retiro,
  caminantes,
  servidores,
}: {
  retiro: RetiroCorto;
  caminantes: Caminantes;
  // Los que van (sin los que cancelaron) y, si se sabe, cuántos confirmaron.
  servidores?: { total: number; confirmados?: number; por_confirmar?: number };
}) {
  const fichas = [
    ...caminantes.por_estado.map((e) => ({
      clave: e.estado,
      total: e.total,
      titulo: PLURAL[e.estado] ?? e.etiqueta,
      nota: "caminantes",
      a: enlace("/inscripciones", retiro, { estado: e.estado }),
    })),
    {
      clave: "cancelada",
      total: caminantes.cancelados,
      titulo: "Cancelados",
      nota: "caminantes",
      a: enlace("/inscripciones", retiro, { estado: "cancelada" }),
    },
    ...(servidores !== undefined
      ? [
          {
            clave: "servidores",
            total: servidores.total,
            titulo: "Servidores",
            nota:
              servidores.confirmados !== undefined
                ? `${servidores.confirmados} confirmados · ${servidores.por_confirmar} por confirmar`
                : "en este retiro",
            // Como el tablero: los que van (sin los que cancelaron).
            a: enlace("/participaciones", retiro, { f_vigente: "si" }),
          },
        ]
      : []),
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {fichas.map((f) => (
        <li key={f.clave}>
          <Link
            to={f.a}
            className={`flex h-full items-center gap-3 rounded-xl border px-4 py-3 ${TONO_ESTADO[f.clave]} ${claseEnlaceFicha}`}
            aria-label={`Ver ${f.titulo.toLowerCase()}: ${f.total}`}
          >
            <span className="text-2xl font-bold tabular-nums">{f.total}</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-theme-xs font-semibold uppercase">
                {f.titulo}
              </span>
              <span className="block text-theme-xs opacity-80">{f.nota}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Indicador({
  titulo,
  valor,
  nota,
  tono,
  a,
}: {
  titulo: string;
  valor: string | number;
  nota: string;
  tono: string;
  a: string; // la lista de esas personas
}) {
  return (
    <Link
      to={a}
      className={`block rounded-xl border px-4 py-4 ${tono} ${claseEnlaceFicha}`}
      aria-label={`Ver la lista: ${titulo.toLowerCase()} (${valor})`}
    >
      <p className="text-theme-xs font-semibold uppercase">{titulo}</p>
      <p className="mt-1 text-title-sm font-bold tabular-nums">{valor}</p>
      <p className="text-theme-xs opacity-80">{nota}</p>
    </Link>
  );
}

// % con pago entre los confirmados y a cuántos hay que atender de forma
// especial (salud, comida, requerimientos).
export function Indicadores({
  retiro,
  caminantes,
}: {
  retiro: RetiroCorto;
  caminantes: Caminantes;
}) {
  const { atencion, confirmados_pagados, confirmados } = caminantes;
  // Como el tablero: entre los inscritos (sin los que cancelaron).
  const vigentes = (filtro: string) =>
    enlace("/inscripciones", retiro, { f_vigente: "si", [filtro]: "si" });
  const deActivos = (n: number) =>
    `${porcentaje(n, atencion?.activos ?? 0)}% de los inscritos`;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {confirmados_pagados !== undefined && (
        <Indicador
          titulo="% con pago"
          valor={`${porcentaje(confirmados_pagados, confirmados)}%`}
          nota={`${confirmados_pagados} de ${confirmados} confirmados pagaron completo`}
          tono={TONO_ESTADO.confirmada}
          a={enlace("/inscripciones", retiro, {
            estado: "confirmada",
            f_estado_pago: "pagado",
          })}
        />
      )}
      {atencion && (
        <>
          <Indicador
            titulo="Salud o tratamiento"
            valor={atencion.salud}
            nota={deActivos(atencion.salud)}
            tono={TONO_ESTADO.cancelada}
            a={vigentes("f_salud")}
          />
          <Indicador
            titulo="Comida especial"
            valor={atencion.comida}
            nota={deActivos(atencion.comida)}
            tono={TONO_ESTADO.lista_espera}
            a={vigentes("f_comida")}
          />
          <Indicador
            titulo="Requerimientos especiales"
            valor={atencion.requerimientos}
            nota={deActivos(atencion.requerimientos)}
            tono={TONO_ESTADO.solicitada}
            a={vigentes("f_requerimientos")}
          />
        </>
      )}
    </div>
  );
}
