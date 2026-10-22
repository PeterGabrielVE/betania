// Qué columnas ve cada usuario en una tabla: oculta las que no le sirven y
// agrega las opcionales. Queda guardado en sus preferencias (en cualquier
// equipo) y las descargas llevan las mismas columnas.
import type { EleccionColumnas } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";

export type DefColumna = {
  clave: string; // [a-z0-9_]
  etiqueta: string;
  opcional?: boolean; // no sale salvo que la agregue
  fija?: boolean; // no se puede ocultar (el nombre de la persona)
};

// Una etiqueta como clave: "Cédula del familiar" -> "cedula_del_familiar".
export const claveDe = (etiqueta: string) =>
  etiqueta
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "columna";

export function useColumnas(tabla: string, defs: DefColumna[]) {
  const { sesion, guardarColumnas } = useAuth();
  const [error, setError] = useState("");
  const eleccion: EleccionColumnas | null = sesion?.autenticado
    ? (sesion.preferencias.columnas?.[tabla] ?? null)
    : null;
  const ocultas = eleccion?.ocultas ?? [];
  const agregadas = eleccion?.agregadas ?? [];

  const elegida = (d: DefColumna) =>
    d.fija ||
    (d.opcional ? agregadas.includes(d.clave) : !ocultas.includes(d.clave));
  // Una columna que no está en `defs` (p. ej. la de acciones) siempre se ve.
  const ve = (clave: string) => {
    const d = defs.find((x) => x.clave === clave);
    return !d || elegida(d);
  };
  const visibles = defs.filter(elegida);

  const guardar = (nueva: EleccionColumnas | null) => {
    setError("");
    guardarColumnas(tabla, nueva, eleccion).catch((e: Error) =>
      setError(`No se guardó: ${e.message}`),
    );
  };
  const cambiar = (clave: string, ver: boolean) => {
    const d = defs.find((x) => x.clave === clave);
    if (!d || d.fija) return;
    // Siempre queda al menos una a la vista.
    if (!ver && visibles.length <= 1) return;
    const quitar = (lista: string[]) => lista.filter((c) => c !== clave);
    const nueva = d.opcional
      ? { ocultas, agregadas: ver ? [...agregadas, clave] : quitar(agregadas) }
      : { ocultas: ver ? quitar(ocultas) : [...ocultas, clave], agregadas };
    guardar(nueva.ocultas.length || nueva.agregadas.length ? nueva : null);
  };

  return {
    ve,
    visibles,
    selector: {
      defs,
      elegida,
      cambiar,
      restablecer: () => guardar(null),
      personalizada: !!eleccion,
      cuantas: visibles.length,
      error,
    },
  };
}
