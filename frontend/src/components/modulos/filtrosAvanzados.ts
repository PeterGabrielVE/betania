import type { FiltroAvanzado } from "@/api/client";
import { fecha } from "@/utils/formato";

// Valores aplicados: parámetro de la API ("f_edad_min") -> valor. Las
// relaciones guardan además su texto en "<parámetro>__etiqueta".
export type ValoresFiltros = Record<string, string>;

// Los parámetros que usa un filtro.
export function parametros(f: FiltroAvanzado): string[] {
  const base = `f_${f.nombre}`;
  if (f.tipo === "rango_numero") return [`${base}_min`, `${base}_max`];
  if (f.tipo === "rango_fecha") return [`${base}_desde`, `${base}_hasta`];
  return [base];
}

// Lo que se ve de un filtro aplicado: "Edad: 18 a 30", "Pago: Pagado, Parcial"…
export function resumenFiltros(
  filtros: FiltroAvanzado[],
  valores: ValoresFiltros,
): { nombre: string; texto: string }[] {
  const partes: { nombre: string; texto: string }[] = [];
  for (const f of filtros) {
    const [a, b] = parametros(f).map((p) => valores[p] ?? "");
    let texto = "";
    if (f.tipo === "rango_numero" && (a || b)) {
      texto = a && b ? `${a} a ${b}` : a ? `desde ${a}` : `hasta ${b}`;
    } else if (f.tipo === "rango_fecha" && (a || b)) {
      texto =
        a && b
          ? `${fecha(a)} a ${fecha(b)}`
          : a
            ? `desde ${fecha(a)}`
            : `hasta ${fecha(b)}`;
    } else if (f.tipo === "opciones" && a) {
      texto = a
        .split(",")
        .map((v) => f.opciones?.find((o) => o.valor === v)?.etiqueta ?? v)
        .join(", ");
    } else if (f.tipo === "si_no" && a) {
      texto = a === "si" ? "Sí" : "No";
    } else if (f.tipo === "fk" && a) {
      texto = valores[`f_${f.nombre}__etiqueta`] || "elegido";
    }
    if (texto)
      partes.push({ nombre: f.nombre, texto: `${f.etiqueta}: ${texto}` });
  }
  return partes;
}

// Para la URL de la API: solo los parámetros (sin las etiquetas).
export function parametrosFiltros(valores: ValoresFiltros): [string, string][] {
  return Object.entries(valores).filter(
    ([k, v]) => v && !k.endsWith("__etiqueta"),
  );
}

// Quita un filtro (todos sus parámetros).
export function sinFiltro(
  filtros: FiltroAvanzado[],
  valores: ValoresFiltros,
  nombre: string,
): ValoresFiltros {
  const f = filtros.find((x) => x.nombre === nombre);
  if (!f) return valores;
  const nuevo = { ...valores };
  for (const p of parametros(f)) {
    delete nuevo[p];
    delete nuevo[`${p}__etiqueta`];
  }
  return nuevo;
}
