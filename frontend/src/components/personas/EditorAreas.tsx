import {
  api,
  type FichaPersona,
  type Pagina,
  type Registro,
} from "@/api/client";
import { claseBoton } from "@/components/modulos/estilos";
import Button from "@/components/ui/button/Button";
import { useEffect, useState } from "react";

type Servicio = NonNullable<FichaPersona["servidor"]>[number];

// Las áreas en que sirve una persona en un retiro: marcar o desmarcar cada
// una y si la coordina. Al guardar se crean, cambian o borran sus
// asignaciones (/servicios/).
export default function EditorAreas({
  servicio,
  onListo,
  onCancelar,
}: {
  servicio: Servicio;
  onListo: () => void; // guardado: recargar la ficha
  onCancelar: () => void;
}) {
  const [areas, setAreas] = useState<{ id: string; nombre: string }[] | null>(
    null,
  );
  // área -> ¿la coordina? (solo las elegidas)
  const [elegidas, setElegidas] = useState<Map<string, boolean>>(
    () => new Map(servicio.areas.map((a) => [a.area, a.es_coordinador])),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    api<Pagina<Registro>>("/areas-servicio/?page_size=100")
      .then(
        (d) =>
          vigente &&
          setAreas(
            d.results.map((a) => ({ id: a.id, nombre: a.nombre as string })),
          ),
      )
      .catch((e: Error) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, []);

  const alternar = (area: string) =>
    setElegidas((actual) => {
      const nuevo = new Map(actual);
      if (nuevo.has(area)) nuevo.delete(area);
      else nuevo.set(area, false);
      return nuevo;
    });

  const coordinar = (area: string) =>
    setElegidas((actual) => new Map(actual).set(area, !actual.get(area)));

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      const antes = new Map(servicio.areas.map((a) => [a.area, a]));
      for (const asignacion of servicio.areas) {
        if (!elegidas.has(asignacion.area)) {
          await api(`/servicios/${asignacion.id}/`, { method: "DELETE" });
        } else if (
          elegidas.get(asignacion.area) !== asignacion.es_coordinador
        ) {
          await api(`/servicios/${asignacion.id}/`, {
            method: "PATCH",
            body: { es_coordinador: elegidas.get(asignacion.area) },
          });
        }
      }
      for (const [area, coordina] of elegidas) {
        if (!antes.has(area)) {
          await api("/servicios/", {
            method: "POST",
            body: {
              participacion: servicio.id,
              area,
              es_coordinador: coordina,
            },
          });
        }
      }
      onListo();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  if (areas === null) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {error || "Cargando…"}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {areas.map((area) => {
          const elegida = elegidas.has(area.id);
          return (
            <li
              key={area.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                elegida
                  ? "border-brand-500 bg-brand-25 dark:border-brand-500/60 dark:bg-brand-500/10"
                  : "border-gray-200 dark:border-gray-800"
              }`}
            >
              <label className="flex cursor-pointer items-center gap-2 text-theme-sm text-gray-800 dark:text-white/90">
                <input
                  type="checkbox"
                  className="size-4 rounded border-gray-300 text-brand-500"
                  checked={elegida}
                  onChange={() => alternar(area.id)}
                />
                {area.nombre}
              </label>
              {elegida && (
                <label className="flex cursor-pointer items-center gap-2 text-theme-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-gray-300 text-brand-500"
                    checked={!!elegidas.get(area.id)}
                    onChange={() => coordinar(area.id)}
                  />
                  Coordina
                </label>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="text-sm text-error-500" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={claseBoton} onClick={onCancelar}>
          Cancelar
        </button>
        <Button size="sm" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar áreas"}
        </Button>
      </div>
    </div>
  );
}
