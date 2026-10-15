// Confirmar o cancelar la asistencia de caminantes (inscripciones) y
// servidores (participaciones). Lo usan el panel, la ficha y los listados.
import { api, ApiError } from "@/api/client";

export type Quien = "caminante" | "servidor";

// Qué estado es "confirmado", "canceló" y a cuál vuelve al reactivarlo.
export const ASISTENCIA: Record<
  Quien,
  { modulo: string; confirmado: string; cancelado: string; reactivado: string }
> = {
  caminante: {
    modulo: "inscripciones",
    confirmado: "confirmada",
    cancelado: "cancelada",
    reactivado: "aceptada",
  },
  servidor: {
    modulo: "participaciones",
    confirmado: "confirmado",
    cancelado: "cancelado",
    reactivado: "por_confirmar",
  },
};

// Cambia el estado de asistencia de una o varias inscripciones (caminantes) o
// participaciones (servidores). Devuelve los nombres que no se pudieron.
export async function cambiarAsistencia(
  quien: Quien,
  ids: string[],
  estado: string,
  motivo = "",
): Promise<string[]> {
  const fallidos: string[] = [];
  for (const id of ids) {
    try {
      await api(`/${ASISTENCIA[quien].modulo}/${id}/`, {
        method: "PATCH",
        body: { estado, motivo_cancelacion: motivo },
      });
    } catch (e) {
      // El motivo concreto ("Ya está en el equipo…"), no "Revisa los campos".
      const porCampo =
        e instanceof ApiError ? Object.values(e.campos).flat().join(" ") : "";
      fallidos.push(porCampo || (e as Error).message);
    }
  }
  return fallidos;
}
