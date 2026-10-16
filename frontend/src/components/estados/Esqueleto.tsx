import { claseTarjeta } from "@/components/modulos/estilos";

// Formas grises que pulsan mientras llegan los datos, con la silueta de la
// pantalla que viene (así no salta todo al cargar).

export function Bloque({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200/80 dark:bg-white/5 ${className}`}
    />
  );
}

// Envoltura accesible: los lectores de pantalla oyen "Cargando…".
function Cargando({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">Cargando…</span>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  );
}

function Metrica() {
  return (
    <div className={claseTarjeta}>
      <Bloque className="size-12 rounded-xl" />
      <Bloque className="mt-5 h-3.5 w-24" />
      <Bloque className="mt-3 h-7 w-32" />
      <Bloque className="mt-2 h-3 w-40" />
    </div>
  );
}

export function EsqueletoTabla({
  filas = 6,
  columnas = 5,
  conTarjeta = true,
}: {
  filas?: number;
  columnas?: number;
  conTarjeta?: boolean;
}) {
  const contenido = (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <Bloque className="h-11 w-full sm:w-64" />
        <Bloque className="h-11 w-40" />
        <Bloque className="h-11 w-32" />
      </div>
      <div className="divide-y divide-gray-100 dark:divide-white/5">
        <div className="flex gap-4 py-3">
          {Array.from({ length: columnas }, (_, i) => (
            <Bloque key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: filas }, (_, f) => (
          <div key={f} className="flex items-center gap-4 py-4">
            {Array.from({ length: columnas }, (_, c) => (
              <Bloque
                key={c}
                className={`h-4 flex-1 ${c === 0 ? "max-w-48" : ""} ${(f + c) % 3 === 0 ? "opacity-70" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
  return (
    <Cargando>
      {conTarjeta ? <div className={claseTarjeta}>{contenido}</div> : contenido}
    </Cargando>
  );
}

// Inicio: cifras, dos gráficas y listas.
export function EsqueletoTablero() {
  return (
    <Cargando className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Bloque className="h-11 w-72" />
        <Bloque className="h-9 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Metrica key={i} />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className={`${claseTarjeta} col-span-12 md:col-span-5`}>
          <Bloque className="h-5 w-48" />
          <Bloque className="mx-auto mt-8 size-40 rounded-full" />
        </div>
        <div className={`${claseTarjeta} col-span-12 md:col-span-7`}>
          <Bloque className="h-5 w-32" />
          <div className="mt-8 grid grid-cols-2 gap-6">
            <Bloque className="mx-auto size-32 rounded-full" />
            <Bloque className="mx-auto size-32 rounded-full" />
          </div>
        </div>
      </div>
    </Cargando>
  );
}

// Panel de un retiro / control de pagos: cifras y una tabla.
export function EsqueletoPanel({ cifras = 4 }: { cifras?: number }) {
  return (
    <Cargando className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Bloque className="h-7 w-64" />
        <div className="flex gap-2">
          <Bloque className="h-10 w-32" />
          <Bloque className="h-10 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
        {Array.from({ length: cifras }, (_, i) => (
          <Metrica key={i} />
        ))}
      </div>
      <EsqueletoTabla />
    </Cargando>
  );
}

// Ficha de una persona: encabezado con avatar y tarjetas de datos.
export function EsqueletoFicha() {
  return (
    <Cargando className="space-y-6">
      <div className={`${claseTarjeta} flex items-center gap-5`}>
        <Bloque className="size-16 shrink-0 rounded-full" />
        <div className="flex-1 space-y-3">
          <Bloque className="h-6 w-64" />
          <Bloque className="h-4 w-80 max-w-full" />
          <Bloque className="h-4 w-48" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1].map((t) => (
          <div key={t} className={`${claseTarjeta} space-y-4`}>
            <Bloque className="h-5 w-40" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Bloque className="h-3 w-24" />
                <Bloque className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Cargando>
  );
}

// Formulario por pasos: la barra de pasos y campos en dos columnas.
export function EsqueletoFormulario() {
  return (
    <Cargando className="space-y-6">
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <Bloque key={i} className="h-14 min-w-40 flex-1 rounded-xl" />
        ))}
      </div>
      <div className={claseTarjeta}>
        <Bloque className="h-6 w-56" />
        <Bloque className="mt-2 h-4 w-80 max-w-full" />
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Bloque className="h-3.5 w-28" />
              <Bloque className="h-11 w-full" />
            </div>
          ))}
        </div>
      </div>
    </Cargando>
  );
}

// Unas líneas, para lo que carga dentro de una tarjeta.
export function EsqueletoLineas({ lineas = 3 }: { lineas?: number }) {
  return (
    <Cargando className="space-y-3">
      {Array.from({ length: lineas }, (_, i) => (
        <Bloque key={i} className={`h-4 ${i % 2 ? "w-2/3" : "w-full"}`} />
      ))}
    </Cargando>
  );
}

// Al abrir la app, mientras se consulta la sesión.
export function CargaInicial() {
  return (
    <div
      role="status"
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white dark:bg-gray-900"
    >
      <img
        src="/images/logo/betania.svg"
        alt=""
        className="size-12 animate-pulse"
      />
      <div className="h-1 w-40 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
        <div className="barra-carga h-full w-1/3 rounded-full bg-brand-500" />
      </div>
      <span className="text-sm text-gray-500 dark:text-gray-400">
        Cargando Betania…
      </span>
    </div>
  );
}
