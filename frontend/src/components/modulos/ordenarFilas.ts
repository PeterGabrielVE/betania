import type { CeldaDescarga } from "@/api/client";

// Para las tablas que se arman en el navegador: compara dos celdas (números
// como números, "B-10" después de "B-2"); los vacíos van siempre al final.
export function ordenarFilas<T>(
  filas: T[],
  orden: string,
  valor: (fila: T, clave: string) => CeldaDescarga,
): T[] {
  if (!orden) return filas;
  const desc = orden.startsWith("-");
  const clave = desc ? orden.slice(1) : orden;
  const comparable = (v: CeldaDescarga) =>
    v !== null && typeof v === "object" ? v.monto : v;
  return [...filas].sort((a, b) => {
    const x = comparable(valor(a, clave));
    const y = comparable(valor(b, clave));
    const vacioX = x === null || x === "";
    const vacioY = y === null || y === "";
    if (vacioX || vacioY) return vacioX === vacioY ? 0 : vacioX ? 1 : -1;
    const r =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), "es", { numeric: true });
    return desc ? -r : r;
  });
}
