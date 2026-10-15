// Navegación de un formulario por pasos: en cuál va, hasta cuál llegó y qué
// pasos tienen errores. Avanzar exige que el paso actual sea válido.
import { useMemo, useRef, useState } from "react";
import type { FieldErrors, FieldValues, UseFormReturn } from "react-hook-form";
import type { Paso } from "./esquema";

export function useAsistente<T extends FieldValues>(
  pasos: Paso[],
  formulario: UseFormReturn<T>,
) {
  const [actual, setActual] = useState(0);
  const [alcanzado, setAlcanzado] = useState(0);
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

  // Volver a un paso anterior es libre; adelantarse exige el actual válido.
  const ir = async (indice: number) => {
    if (indice <= actual || (await validarActual())) irA(indice);
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
