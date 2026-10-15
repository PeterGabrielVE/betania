import type { Modulo } from "@/api/client";
import Label from "@/components/form/Label";
import { claseControl } from "./estilos";
import {
  entradasDe,
  seccionesDe,
  type Entrada,
  type EstadoFormulario,
} from "./formulario";
import SelectorRemoto from "./SelectorRemoto";

interface CamposModuloProps {
  modulo: Modulo;
  estado: EstadoFormulario;
  onChange: (estado: EstadoFormulario) => void;
  errores: Record<string, string[]>;
  omitir?: string[]; // campos del modelo que no se muestran
}

// Los controles de un módulo, agrupados por sección. No envía nada: el
// formulario que lo usa decide qué hacer con los valores.
export default function CamposModulo({
  modulo,
  estado,
  onChange,
  errores,
  omitir,
}: CamposModuloProps) {
  const poner = (clave: string, valor: unknown, etiqueta?: string) =>
    onChange({
      valores: { ...estado.valores, [clave]: valor },
      etiquetas:
        etiqueta === undefined
          ? estado.etiquetas
          : { ...estado.etiquetas, [clave]: etiqueta },
    });

  const control = (entrada: Entrada, id: string) => {
    const valor = estado.valores[entrada.clave];
    const comunes = {
      id,
      name: entrada.clave,
      required: entrada.requerido,
      className: `${claseControl} w-full`,
    };
    switch (entrada.tipo) {
      case "fk":
        return (
          <SelectorRemoto
            recurso={entrada.recurso!}
            valor={(valor as string) || null}
            etiqueta={estado.etiquetas[entrada.clave] ?? ""}
            onChange={(pk, etiqueta) =>
              poner(entrada.clave, pk ?? "", etiqueta)
            }
          />
        );
      case "opcion":
        return (
          <select
            {...comunes}
            value={valor as string}
            onChange={(e) => poner(entrada.clave, e.target.value)}
          >
            {/* Los obligatorios dejan de ofrecer el vacío una vez elegidos. */}
            {(!valor || !entrada.requerido) && <option value="">—</option>}
            {entrada.opciones?.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        );
      case "bool":
        return (
          <input
            id={id}
            type="checkbox"
            checked={valor as boolean}
            onChange={(e) => poner(entrada.clave, e.target.checked)}
            className="size-5 rounded border-gray-300 text-brand-500"
          />
        );
      case "area":
      case "json":
        return (
          <textarea
            {...comunes}
            rows={entrada.tipo === "json" ? 4 : 2}
            value={valor as string}
            placeholder={entrada.tipo === "json" ? '{ "clave": "valor" }' : ""}
            onChange={(e) => poner(entrada.clave, e.target.value)}
            className={`${claseControl} h-auto w-full py-2.5 ${entrada.tipo === "json" ? "font-mono" : ""}`}
          />
        );
      default:
        return (
          <input
            {...comunes}
            type={
              entrada.tipo === "fecha"
                ? "date"
                : ["numero", "decimal", "cifra"].includes(entrada.tipo)
                  ? "number"
                  : entrada.tipo === "email"
                    ? "email"
                    : "text"
            }
            step={
              entrada.tipo === "decimal"
                ? "0.01"
                : entrada.tipo === "cifra"
                  ? "any"
                  : undefined
            }
            min={entrada.tipo === "numero" ? 0 : undefined}
            value={valor as string | number}
            onChange={(e) => poner(entrada.clave, e.target.value)}
          />
        );
    }
  };

  return (
    <div className="space-y-6">
      {seccionesDe(entradasDe(modulo, omitir)).map(([seccion, entradas]) => (
        <fieldset key={seccion}>
          {seccion && (
            <legend className="mb-4 w-full border-b border-gray-200 pb-2 text-theme-sm font-semibold tracking-wide text-gray-800 uppercase dark:border-gray-800 dark:text-white/90">
              {seccion}
            </legend>
          )}
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            {entradas.map((entrada) => {
              const id = `${modulo.slug}-${entrada.clave}`;
              // Las casillas van con su etiqueta al lado, como en el papel.
              if (entrada.tipo === "bool") {
                return (
                  <label
                    key={entrada.clave}
                    htmlFor={id}
                    className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-400"
                  >
                    {control(entrada, id)}
                    {entrada.etiqueta}
                  </label>
                );
              }
              return (
                <div
                  key={entrada.clave}
                  className={
                    entrada.tipo === "area" || entrada.tipo === "json"
                      ? "sm:col-span-2"
                      : ""
                  }
                >
                  <Label htmlFor={id}>
                    {entrada.etiqueta}
                    {entrada.requerido && (
                      <span className="text-error-500"> *</span>
                    )}
                  </Label>
                  {control(entrada, id)}
                  {entrada.ayuda && (
                    <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
                      {entrada.ayuda}
                    </p>
                  )}
                  {errores[entrada.clave]?.map((mensaje) => (
                    <p
                      key={mensaje}
                      className="mt-1 text-theme-xs text-error-500"
                    >
                      {mensaje}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
