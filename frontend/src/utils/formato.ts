// Moneda y formato regional: los fija el servidor (MONEDA y REGION en .env) y
// llegan con la sesión. Ver AuthContext.
let region: string;
// La moneda en que el usuario ve los montos y el factor para pasar a ella un
// monto en la moneda base (ver Preferencias).
let monedaVista: string;
let factorVista = 1;
const formatosDinero = new Map<string, Intl.NumberFormat>();

export function configurarFormato(
  nuevaRegion: string,
  moneda: string,
  vista = moneda,
  factor = 1,
) {
  region = nuevaRegion;
  monedaVista = vista;
  factorVista = factor;
  formatosDinero.clear();
}

configurarFormato("es-VE", "USD");

// Las fechas se muestran siempre dd/mm/aaaa ("14/03/2026"), en el celular y en
// la computadora, sin depender del idioma del navegador.
const dos = (n: number) => String(n).padStart(2, "0");

// Acepta fechas ("2026-03-14") y fechas con hora de la API. Solo se usa el día
// que trae el texto, para que no se recorra al convertir de zona horaria.
export function fecha(valor: string | null | undefined): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor ?? "");
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : "—";
}

// Solo día y mes ("14/03"): cumpleaños, vencimientos de este año.
export function diaYMes(valor: string | null | undefined): string {
  return fecha(valor).slice(0, 5);
}

// Fecha y hora de un momento (auditoría, último acceso), en la hora local:
// "14/03/2026 2:30 p. m.".
export function fechaHora(valor: string | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  const hora = d.toLocaleTimeString(region, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${hora}`;
}

// Lo que se escribe en un campo de fecha ("14/03/2026", "14032026") a lo que
// espera la API ("2026-03-14"); "" si no es una fecha completa y real.
export function aFechaISO(texto: string): string {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(texto.trim());
  if (!m) return "";
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (
    f.getUTCFullYear() !== a ||
    f.getUTCMonth() !== mes - 1 ||
    f.getUTCDate() !== d
  ) {
    return ""; // 31/02, 00/13…
  }
  return `${a}-${dos(mes)}-${dos(d)}`;
}

// Un monto en la moneda base, en la moneda que el usuario está viendo, para
// una descarga (ver CeldaDescarga).
export function montoVista(valor: number | null | undefined) {
  return { monto: (valor ?? 0) * factorVista, moneda: monedaVista };
}

// Sin `moneda`, el monto está en la moneda base (cuotas, totales,
// equivalentes) y se muestra en la que eligió el usuario. Con `moneda`, se
// muestra tal cual (el monto de un pago en la moneda en que se hizo).
export function dinero(valor: number | null, moneda?: string): string {
  if (moneda === undefined) {
    moneda = monedaVista;
    valor = valor === null ? null : valor * factorVista;
  }
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
  // Servidor
  por_confirmar: "warning",
  confirmado: "success",
  cancelado: "error",
  // Pago de la cuota
  pagado: "success",
  parcial: "warning",
  pendiente: "light",
};

export function colorEstado(estado: string): ColorBadge {
  return coloresEstado[estado] ?? "light";
}
