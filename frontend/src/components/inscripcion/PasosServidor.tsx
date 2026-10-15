// Lo que se pide en los pasos propios del registro de un servidor.
import { api, type Pagina, type Registro } from "@/api/client";
import SelectorRemoto from "@/components/modulos/SelectorRemoto";
import { useEffect, useState } from "react";
import { Controller, get, useFormContext, useWatch } from "react-hook-form";
import { Grupo, Opciones, Relacion, Texto } from "./Campos";
import { TIPOS_DOCUMENTO } from "./esquemaPersona";
import {
  CAMISAS,
  DIAS_SERVICIO,
  ETIQUETAS_SERVIDOR as E,
  TALLAS_CAMISA,
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

// Casillas de una lista (turnos, camisas, tallas) guardada como string[].
function Marcas({
  nombre,
  opciones,
  onCambio,
}: {
  nombre: string;
  opciones: { valor: string; etiqueta: string }[];
  onCambio?: (nuevas: string[]) => void;
}) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={nombre}
      render={({ field }) => {
        const marcadas = (field.value as string[]) ?? [];
        return (
          <div className="flex flex-wrap gap-2">
            {opciones.map((o) => {
              const marcada = marcadas.includes(o.valor);
              return (
                <label
                  key={o.valor}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-theme-sm ${
                    marcada
                      ? "border-brand-500 bg-brand-25 text-gray-800 dark:border-brand-500/60 dark:bg-brand-500/10 dark:text-white/90"
                      : "border-gray-200 text-gray-700 dark:border-gray-800 dark:text-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    name={nombre}
                    value={o.valor}
                    className="size-4 rounded border-gray-300 text-brand-500"
                    checked={marcada}
                    onBlur={field.onBlur}
                    onChange={() => {
                      const nuevas = marcada
                        ? marcadas.filter((m) => m !== o.valor)
                        : [...marcadas, o.valor];
                      field.onChange(nuevas);
                      onCambio?.(nuevas);
                    }}
                  />
                  {o.etiqueta}
                </label>
              );
            })}
          </div>
        );
      }}
    />
  );
}

function Pregunta({
  titulo,
  obligatorio,
  nombre,
  children,
}: {
  titulo: string;
  obligatorio?: boolean;
  nombre: string; // para mostrar su error
  children: React.ReactNode;
}) {
  const {
    formState: { errors },
  } = useFormContext();
  const error = get(errors, nombre)?.message as string | undefined;
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-400">
        {titulo}
        {obligatorio && <span className="text-error-500"> *</span>}
      </legend>
      {children}
      {error && (
        <p className="mt-2 text-theme-xs text-error-500" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

// Si dormirá en la casa, los turnos del fin de semana en que puede servir y
// la camisa que necesita.
export function PasoDisponibilidad() {
  const { register, control, setValue, trigger, formState } = useFormContext();
  const turnos = (useWatch({ control, name: "turnos" }) as string[]) ?? [];
  // Con un aviso a la vista, se recalcula al cambiar.
  const revalidar = (campo: string) => {
    if (get(formState.errors, campo)) trigger(campo);
  };

  const ponerTurnos = (nuevos: string[]) => {
    setValue("turnos", nuevos, { shouldDirty: true });
    revalidar("turnos");
  };

  return (
    <div className="space-y-8">
      <Pregunta titulo={E.duerme} obligatorio nombre="duerme">
        <div className="flex gap-6">
          {[
            ["si", "Sí"],
            ["no", "No"],
          ].map(([valor, etiqueta]) => (
            <label
              key={valor}
              className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-white/90"
            >
              <input
                type="radio"
                value={valor}
                className="size-4 border-gray-300 text-brand-500"
                {...register("duerme", { onChange: () => revalidar("duerme") })}
              />
              {etiqueta}
            </label>
          ))}
        </div>
      </Pregunta>

      <Pregunta
        titulo="Marca los turnos del fin de semana en que puede servir"
        obligatorio
        nombre="turnos"
      >
        <div className="space-y-3">
          {DIAS_SERVICIO.map((d) => {
            const claves = d.turnos.map(([t]) => `${d.dia}_${t}`);
            const todo = claves.every((c) => turnos.includes(c));
            return (
              <div
                key={d.dia}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
              >
                <span className="w-20 shrink-0 text-sm font-medium text-gray-800 dark:text-white/90">
                  {d.etiqueta}
                </span>
                {/* FULL: todos los turnos del día. */}
                <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-theme-sm font-medium text-gray-700 dark:bg-white/5 dark:text-gray-300">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-gray-300 text-brand-500"
                    checked={todo}
                    onChange={() =>
                      ponerTurnos(
                        todo
                          ? turnos.filter((t) => !claves.includes(t))
                          : [...new Set([...turnos, ...claves])],
                      )
                    }
                  />
                  Todo el día
                </label>
                {d.turnos.map(([t, etiqueta]) => {
                  const clave = `${d.dia}_${t}`;
                  return (
                    <label
                      key={clave}
                      className="flex cursor-pointer items-center gap-2 px-2 py-2 text-theme-sm text-gray-700 dark:text-gray-300"
                    >
                      <input
                        type="checkbox"
                        name="turnos"
                        value={clave}
                        className="size-4 rounded border-gray-300 text-brand-500"
                        checked={turnos.includes(clave)}
                        onChange={() =>
                          ponerTurnos(
                            turnos.includes(clave)
                              ? turnos.filter((x) => x !== clave)
                              : [...turnos, clave],
                          )
                        }
                      />
                      {etiqueta}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Pregunta>

      <Pregunta titulo="Necesita camisa para servir" nombre="camisas">
        <Marcas
          nombre="camisas"
          opciones={CAMISAS}
          onCambio={(nuevas) => {
            if (nuevas.length === 0) setValue("tallas", []);
            revalidar("tallas");
          }}
        />
      </Pregunta>

      <Pregunta titulo="Talla de camisa que necesita" nombre="tallas">
        <Marcas
          nombre="tallas"
          opciones={TALLAS_CAMISA}
          onCambio={() => revalidar("tallas")}
        />
      </Pregunta>
    </div>
  );
}
