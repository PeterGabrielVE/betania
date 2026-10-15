// Lo que se pide en los pasos propios del registro de un servidor.
import { api, type Pagina, type Registro } from "@/api/client";
import SelectorRemoto from "@/components/modulos/SelectorRemoto";
import { useEffect, useState } from "react";
import { Controller, get, useFormContext, useWatch } from "react-hook-form";
import { Grupo, Opciones, Relacion, Texto } from "./Campos";
import { TIPOS_DOCUMENTO } from "./esquemaPersona";
import {
  ETIQUETAS_SERVIDOR as E,
  TIPOS_PARTICIPACION,
} from "./esquemaServidor";

export function PasoIdentificacionServidor({
  persona,
  onPersona,
  onDocumento,
  avisoDocumento,
  etiquetas,
  onEtiqueta,
  onRetiro,
}: {
  persona: Registro | null;
  onPersona: (id: string | null) => void;
  onDocumento: () => void; // busca a la persona por su documento
  avisoDocumento: string;
  etiquetas: Record<string, string>;
  onEtiqueta: (nombre: string, etiqueta: string) => void;
  onRetiro: (id: string | null) => void;
}) {
  const { register } = useFormContext();
  return (
    <div className="space-y-6">
      <Grupo>
        <Relacion
          nombre="retiro"
          etiqueta={E.retiro}
          obligatorio
          recurso="retiros"
          placeholder="Buscar retiro…"
          etiquetas={etiquetas}
          onEtiqueta={onEtiqueta}
          onElegir={onRetiro}
        />
        <Opciones
          nombre="tipo"
          etiqueta={E.tipo}
          obligatorio
          opciones={TIPOS_PARTICIPACION}
          ayuda="Coordinador general: quien coordina todo el retiro."
        />
      </Grupo>
      <Grupo titulo="Documento de identidad">
        <Opciones
          nombre="tipo_documento"
          etiqueta={E.tipo_documento}
          obligatorio
          opciones={TIPOS_DOCUMENTO}
        />
        <Texto
          nombre="documento"
          etiqueta={E.documento}
          obligatorio
          placeholder="Ej.: 12345678"
          ayuda="Si ya está registrada, sus datos se cargan solos."
          registro={register("documento", { onBlur: onDocumento })}
        />
        {avisoDocumento && (
          <p
            className="rounded-lg bg-brand-25 px-4 py-3 text-theme-sm text-brand-600 sm:col-span-2 dark:bg-brand-500/10 dark:text-brand-400"
            role="status"
          >
            {avisoDocumento}
          </p>
        )}
      </Grupo>
      <div className="rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700">
        <p className="mb-1 text-theme-sm font-medium text-gray-800 dark:text-white/90">
          ¿No recuerdas el documento?
        </p>
        <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
          Muchos servidores ya fueron caminantes: búscalos por nombre o teléfono
          para no duplicarlos.
        </p>
        <SelectorRemoto
          recurso="personas"
          valor={persona?.id ?? null}
          etiqueta={persona?.etiqueta ?? ""}
          onChange={onPersona}
          placeholder="Buscar por nombre, documento o teléfono…"
          className="w-full sm:w-96"
        />
      </div>
    </div>
  );
}

type Area = { id: string; nombre: string };

// Las áreas de servicio para marcar, cada una con "Coordina esta área".
export function PasoServicio({
  onAreas,
}: {
  onAreas: (areas: Area[]) => void; // para mostrar sus nombres en el resumen
}) {
  const {
    control,
    setValue,
    trigger,
    formState: { errors },
  } = useFormContext();
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [tipo, coordina] = useWatch({
    control,
    name: ["tipo", "coordina"],
  }) as [string, string[]];

  useEffect(() => {
    let vigente = true;
    api<Pagina<Registro>>("/areas-servicio/?page_size=100")
      .then((d) => {
        if (!vigente) return;
        const lista = d.results.map((a) => ({
          id: a.id,
          nombre: a.nombre as string,
        }));
        setAreas(lista);
        onAreas(lista);
      })
      .catch(() => vigente && setAreas([]));
    return () => {
      vigente = false;
    };
    // Una vez: las áreas no cambian mientras se llena el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const error = get(errors, "areas")?.message as string | undefined;

  if (areas === null) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>
    );
  }
  if (areas.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Todavía no hay áreas de servicio. Créalas en Catálogos → Áreas de
        servicio.
      </p>
    );
  }
  return (
    <Controller
      control={control}
      name="areas"
      render={({ field }) => {
        const elegidas = (field.value as string[]) ?? [];
        const alternar = (id: string) => {
          const nuevas = elegidas.includes(id)
            ? elegidas.filter((a) => a !== id)
            : [...elegidas, id];
          field.onChange(nuevas);
          // Con el aviso a la vista, se recalcula al marcar o desmarcar.
          if (get(errors, "areas")) trigger("areas");
          // Si deja un área, deja también de coordinarla.
          setValue(
            "coordina",
            (coordina ?? []).filter((a) => nuevas.includes(a)),
          );
        };
        return (
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-400">
              {E.areas}
              {tipo === "servidor" && (
                <span className="text-error-500"> *</span>
              )}
            </legend>
            <p className="mb-4 text-theme-xs text-gray-500 dark:text-gray-400">
              Puede servir en varias. Marca «Coordina» en las que sea el
              responsable.
            </p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {areas.map((area) => {
                const elegida = elegidas.includes(area.id);
                const coordinaArea = (coordina ?? []).includes(area.id);
                return (
                  <li
                    key={area.id}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                      elegida
                        ? "border-brand-500 bg-brand-25 dark:border-brand-500/60 dark:bg-brand-500/10"
                        : "border-gray-200 dark:border-gray-800"
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      <input
                        type="checkbox"
                        name="areas"
                        value={area.id}
                        className="size-5 rounded border-gray-300 text-brand-500"
                        checked={elegida}
                        onChange={() => alternar(area.id)}
                        onBlur={field.onBlur}
                      />
                      {area.nombre}
                    </label>
                    {elegida && (
                      <label className="flex cursor-pointer items-center gap-2 text-theme-xs text-gray-600 dark:text-gray-400">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-gray-300 text-brand-500"
                          checked={coordinaArea}
                          onChange={() =>
                            setValue(
                              "coordina",
                              coordinaArea
                                ? coordina.filter((a) => a !== area.id)
                                : [...(coordina ?? []), area.id],
                            )
                          }
                        />
                        Coordina
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
            {error && (
              <p className="mt-2 text-theme-xs text-error-500" role="alert">
                {error}
              </p>
            )}
          </fieldset>
        );
      }}
    />
  );
}
