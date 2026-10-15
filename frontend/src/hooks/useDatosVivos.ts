import { api } from "@/api/client";
import { useCallback, useEffect, useState } from "react";

// Cada cuánto se vuelve a consultar mientras la pantalla está a la vista.
export const ACTUALIZAR_CADA_MS = 30_000;

// Consulta `ruta` de la API y la repite cada ACTUALIZAR_CADA_MS (y al volver a
// la pestaña), para que los pagos y cambios que registran otros aparezcan sin
// recargar. Si falla una actualización, queda a la vista lo último que llegó.
export function useDatosVivos<T>(ruta: string) {
  const [estado, setEstado] = useState<{
    ruta?: string;
    datos?: T;
    error?: Error;
    hora?: Date;
  }>({});
  const [consultando, setConsultando] = useState(false);

  const cargar = useCallback(
    (vigente: () => boolean = () => true) =>
      api<T>(ruta)
        .then((datos) => {
          if (vigente()) setEstado({ ruta, datos, hora: new Date() });
        })
        .catch((error: Error) => {
          // Lo anterior se conserva solo si es de esta misma ruta.
          if (vigente()) {
            setEstado((e) =>
              e.ruta === ruta ? { ...e, error } : { ruta, error },
            );
          }
        }),
    [ruta],
  );

  useEffect(() => {
    let activo = true;
    const vigente = () => activo;
    cargar(vigente);
    const actualizar = () => {
      if (!document.hidden) cargar(vigente);
    };
    const intervalo = setInterval(actualizar, ACTUALIZAR_CADA_MS);
    document.addEventListener("visibilitychange", actualizar);
    return () => {
      activo = false;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", actualizar);
    };
  }, [cargar]);

  const actualizar = () => {
    setConsultando(true);
    cargar().finally(() => setConsultando(false));
  };

  return {
    // Lo último que llegó; puede ser de la ruta anterior mientras carga la nueva.
    datos: estado.datos,
    // true cuando `datos` y `error` corresponden a la ruta actual.
    alDia: estado.ruta === ruta,
    error: estado.error,
    hora: estado.hora,
    consultando,
    actualizar,
  };
}
