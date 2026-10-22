// Navegación de un formulario por pasos: en cuál va, hasta cuál llegó y qué
// pasos tienen errores. Avanzar exige que el paso actual sea válido.
import { useMemo, useRef, useState } from "react";
import type { FieldErrors, FieldValues, UseFormReturn } from "react-hook-form";
import type { Paso } from "./esquema";

// `libre` (al editar algo ya guardado): todos los pasos se abren directo,
// sin pasar por los anteriores. `inicial`: el id del paso con que abre.
export function useAsistente<T extends FieldValues>(
  pasos: Paso[],
  formulario: UseFormReturn<T>,
  { libre = false, inicial = "" }: { libre?: boolean; inicial?: string } = {},
) {
  const [actual, setActual] = useState(() =>
    Math.max(0, pasos.findIndex((p) => p.id === inicial)),
  );
  const [visitado, setAlcanzado] = useState(0);
  const alcanzado = libre ? pasos.length - 1 : Math.max(visitado, actual);
  const tarjeta = useRef<HTMLDivElement>(null);
  const errores = formulario.formState.errors as FieldErrors;

  const conErrores = useMemo(
    () =>
      new Set(
        pasos
          .map((p, i) => (p.campos.some((c) => errores[c]) ? i : -1))
          .filter((i) => i >= 0),
      ),
    [pasos, errores],
  );

  const irA = (indice: number) => {
    setActual(indice);
    setAlcanzado((a) => Math.max(a, indice));
    tarjeta.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const validarActual = () =>
    formulario.trigger(pasos[actual].campos as never, { shouldFocus: true });

  // Volver a un paso anterior es libre; adelantarse exige el actual válido
  // (salvo al editar: al guardar se valida todo y se va al que tenga errores).
  const ir = async (indice: number) => {
    if (libre || indice <= actual || (await validarActual())) irA(indice);
  };

  // Lleva al primer paso que tenga alguno de estos campos.
  const alPrimero = (campos: string[]) => {
    const indice = pasos.findIndex((p) =>
      p.campos.some((c) => campos.includes(c)),
    );
    if (indice >= 0) irA(indice);
  };

  const reiniciar = () => {
    setActual(0);
    setAlcanzado(0);
  };

  return {
    actual,
    alcanzado,
    conErrores,
    tarjeta,
    ultimo: actual === pasos.length - 1,
    irA,
    ir,
    validarActual,
    alPrimero,
    reiniciar,
  };
}
