// Moneda y formato regional: los fija el servidor (MONEDA y REGION en .env) y
// llegan con la sesión. Ver AuthContext.
let region: string;
let monedaBase: string;
let formatoFecha: Intl.DateTimeFormat;
const formatosDinero = new Map<string, Intl.NumberFormat>();

export function configurarFormato(nuevaRegion: string, moneda: string) {
  region = nuevaRegion;
  monedaBase = moneda;
  formatosDinero.clear();
  formatoFecha = new Intl.DateTimeFormat(region, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

configurarFormato("es-VE", "USD");

// Acepta fechas ("2026-03-14") y fechas con hora de la API. Solo se usa el día
// que trae el texto, para que no se recorra al convertir de zona horaria.
export function fecha(valor: string | null): string {
  return valor ? formatoFecha.format(new Date(valor.slice(0, 10))) : "—";
}

// Sin `moneda`, el monto está en la moneda base (cuotas, totales, equivalentes).
export function dinero(valor: number | null, moneda = monedaBase): string {
  let formato = formatosDinero.get(moneda);
  if (!formato) {
    formato = new Intl.NumberFormat(region, {
      style: "currency",
      currency: moneda,
    });
    formatosDinero.set(moneda, formato);
  }
  return formato.format(valor ?? 0);
}

type ColorBadge =
  "primary" | "success" | "error" | "warning" | "info" | "light";

const coloresEstado: Record<string, ColorBadge> = {
  // Retiro
  planeacion: "light",
  inscripciones: "info",
  en_curso: "success",
  finalizado: "primary",
  // Inscripción
  solicitada: "info",
  aceptada: "primary",
  lista_espera: "warning",
  confirmada: "success",
  cancelada: "error",
  // Pago de la cuota
  pagado: "success",
  parcial: "warning",
  pendiente: "light",
};

export function colorEstado(estado: string): ColorBadge {
  return coloresEstado[estado] ?? "light";
}
