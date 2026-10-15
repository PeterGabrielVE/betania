// Controles del formulario de inscripción, conectados a react-hook-form: cada
// uno muestra su etiqueta, si es obligatorio y el error de zod debajo.
import Label from "@/components/form/Label";
import { claseControl } from "@/components/modulos/estilos";
import SelectorRemoto from "@/components/modulos/SelectorRemoto";
import { api, type Pagina, type Registro } from "@/api/client";
import { useEffect, useState } from "react";
import {
  Controller,
  get,
  useFormContext,
  useWatch,
  type FieldValues,
  type UseFormRegister,
} from "react-hook-form";
import { EXTRANJERO, OPERADORAS, OTRA_CIUDAD } from "./esquemaPersona";

// Sirven a más de un formulario (caminante, servidor): el campo es su nombre.
type NombreCampo = string;

type Base = {
  nombre: NombreCampo;
  etiqueta: string;
  obligatorio?: boolean;
  ayuda?: string;
  ancho?: boolean; // ocupa las dos columnas
};

function Envoltura({
  nombre,
  etiqueta,
  obligatorio,
  ayuda,
  ancho,
  children,
}: Base & { children: React.ReactNode }) {
  const {
    formState: { errors },
  } = useFormContext();
  const error = get(errors, nombre)?.message as string | undefined;
  return (
    <div className={ancho ? "sm:col-span-2" : ""}>
      <Label htmlFor={`insc-${nombre}`}>
        {etiqueta}
        {obligatorio && <span className="text-error-500"> *</span>}
      </Label>
      {children}
      {error ? (
        <p
          id={`insc-${nombre}-error`}
          className="mt-1 text-theme-xs text-error-500"
          role="alert"
        >
          {error}
        </p>
      ) : (
        ayuda && (
          <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}

// Borde rojo en los controles con error.
// `ancho`: "w-full" salvo en controles que comparten fila (el celular).
function claseDe(error: boolean, extra = "", ancho = "w-full") {
  return `${claseControl} ${ancho} ${extra} ${
    error ? "border-error-500 focus:border-error-500 dark:border-error-500" : ""
  }`;
}

function useCampo(nombre: NombreCampo) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = !!get(errors, nombre);
  return {
    error,
    props: {
      id: `insc-${nombre}`,
      "aria-invalid": error,
      "aria-describedby": error ? `insc-${nombre}-error` : undefined,
      ...register(nombre),
    },
  };
}

export function Texto({
  tipo = "text",
  placeholder,
  registro,
  ...base
}: Base & {
  // Para pasar opciones propias a register (p. ej. onBlur).
  registro?: ReturnType<UseFormRegister<FieldValues>>;
  tipo?: "text" | "email" | "tel" | "date" | "number";
  placeholder?: string;
}) {
  const { error, props } = useCampo(base.nombre);
  return (
    <Envoltura {...base}>
      <input
        type={tipo}
        placeholder={placeholder}
        min={tipo === "number" ? 0 : undefined}
        max={
          tipo === "date" ? new Date().toISOString().slice(0, 10) : undefined
        }
        inputMode={tipo === "tel" ? "tel" : undefined}
        className={claseDe(error)}
        {...props}
        {...registro}
      />
    </Envoltura>
  );
}

export function AreaTexto({
  placeholder,
  ...base
}: Base & { placeholder?: string }) {
  const { error, props } = useCampo(base.nombre);
  return (
    <Envoltura {...base} ancho>
      <textarea
        rows={2}
        placeholder={placeholder}
        className={claseDe(error, "h-auto py-2.5")}
        {...props}
      />
    </Envoltura>
  );
}

export function Opciones({
  opciones,
  ...base
}: Base & { opciones: { valor: string; etiqueta: string }[] }) {
  const { error, props } = useCampo(base.nombre);
  return (
    <Envoltura {...base}>
      <select className={claseDe(error)} {...props}>
        <option value="">Elegir…</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </Envoltura>
  );
}

export function Casilla({
  nombre,
  etiqueta,
  descripcion,
}: {
  nombre: NombreCampo;
  etiqueta: string;
  descripcion?: string;
}) {
  const { error, props } = useCampo(nombre);
  const {
    formState: { errors },
  } = useFormContext();
  const mensaje = get(errors, nombre)?.message as string | undefined;
  return (
    <div>
      <label
        htmlFor={props.id}
        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm dark:border-gray-800 ${
          error ? "border-error-500" : "border-gray-200"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 rounded border-gray-300 text-brand-500"
          {...props}
        />
        <span>
          <span className="font-medium text-gray-800 dark:text-white/90">
            {etiqueta}
          </span>
          {descripcion && (
            <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
              {descripcion}
            </span>
          )}
        </span>
      </label>
      {mensaje && (
        <p
          id={`insc-${nombre}-error`}
          className="mt-1 text-theme-xs text-error-500"
          role="alert"
        >
          {mensaje}
        </p>
      )}
    </div>
  );
}

// Una relación (retiro, padrino): busca en la API mientras se escribe. Guarda
// el id en el formulario y el texto visible en `etiquetas`.
export function Relacion({
  recurso,
  etiquetas,
  onEtiqueta,
  onElegir,
  placeholder,
  ...base
}: Base & {
  recurso: string;
  etiquetas: Record<string, string>;
  onEtiqueta: (nombre: string, etiqueta: string) => void;
  onElegir?: (id: string | null) => void;
  placeholder?: string;
}) {
  const { control } = useFormContext();
  return (
    <Envoltura {...base}>
      <Controller
        control={control}
        name={base.nombre}
        render={({ field }) => (
          <SelectorRemoto
            recurso={recurso}
            valor={(field.value as string) || null}
            etiqueta={etiquetas[base.nombre] ?? ""}
            placeholder={placeholder}
            onChange={(id, etiqueta) => {
              onEtiqueta(base.nombre, etiqueta);
              field.onChange(id ?? "");
              field.onBlur();
              onElegir?.(id);
            }}
          />
        )}
      />
    </Envoltura>
  );
}

// Rejilla de dos columnas con un subtítulo opcional.
export function Grupo({
  titulo,
  children,
}: {
  titulo?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      {titulo && (
        <legend className="mb-4 w-full border-b border-gray-200 pb-2 text-theme-sm font-semibold text-gray-800 dark:border-gray-800 dark:text-white/90">
          {titulo}
        </legend>
      )}
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        {children}
      </div>
    </fieldset>
  );
}

// --------------------------------------------------------------------------- //
// Celular: operadora venezolana + 7 dígitos, u otro país con su código.
// El valor queda en un solo campo: "0414-1234567" o "+57 300 1234567".
// --------------------------------------------------------------------------- //
function separarCelular(valor: string): { prefijo: string; numero: string } {
  const venezolano = /^(04\d{2})-?(\d*)$/.exec(valor);
  if (venezolano) return { prefijo: venezolano[1], numero: venezolano[2] };
  // Número sin operadora todavía.
  if (valor.startsWith("-")) return { prefijo: "", numero: valor.slice(1) };
  if (valor) return { prefijo: EXTRANJERO, numero: valor };
  return { prefijo: "", numero: "" };
}

export function Celular(base: Base) {
  const {
    control,
    formState: { errors },
  } = useFormContext();
  const error = !!get(errors, base.nombre);
  return (
    <Envoltura {...base}>
      <Controller
        control={control}
        name={base.nombre}
        render={({ field }) => {
          const { prefijo, numero } = separarCelular(
            (field.value as string) ?? "",
          );
          const extranjero = prefijo === EXTRANJERO;
          const unir = (p: string, n: string) =>
            p === EXTRANJERO ? n || "+" : p || n ? `${p}-${n}` : "";
          return (
            <div className="flex gap-2">
              <select
                aria-label={`${base.etiqueta}: operadora`}
                className={claseDe(error, "shrink-0 px-3", "w-32")}
                value={prefijo}
                onBlur={field.onBlur}
                onChange={(e) =>
                  field.onChange(
                    unir(
                      e.target.value,
                      e.target.value === EXTRANJERO || extranjero ? "" : numero,
                    ),
                  )
                }
              >
                <option value="">Operadora</option>
                {OPERADORAS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                <option value={EXTRANJERO}>Otro país</option>
              </select>
              <input
                id={`insc-${base.nombre}`}
                name={base.nombre}
                ref={field.ref}
                type="tel"
                inputMode={extranjero ? "tel" : "numeric"}
                maxLength={extranjero ? 20 : 7}
                placeholder={extranjero ? "+57 300 1234567" : "1234567"}
                aria-invalid={error}
                aria-describedby={
                  error ? `insc-${base.nombre}-error` : undefined
                }
                className={claseDe(error, "min-w-0 flex-1", "")}
                value={numero}
                onBlur={field.onBlur}
                onChange={(e) =>
                  field.onChange(
                    unir(
                      prefijo,
                      extranjero
                        ? e.target.value
                        : e.target.value.replace(/\D/g, ""),
                    ),
                  )
                }
              />
            </div>
          );
        }}
      />
    </Envoltura>
  );
}

// --------------------------------------------------------------------------- //
// País, estado y ciudad: cada lista depende de la anterior.
// --------------------------------------------------------------------------- //
export type Lugar = { id: string; nombre: string };

function useLugares(recurso: string, filtro: string, valor: string) {
  const [lugares, setLugares] = useState<{ clave: string; filas: Lugar[] }>({
    clave: "",
    filas: [],
  });
  const clave = valor ? `/${recurso}/?${filtro}=${valor}&page_size=100` : "";
  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    api<Pagina<Registro>>(clave)
      .then((d) => {
        if (vigente) {
          setLugares({
            clave,
            filas: d.results.map((r) => ({
              id: r.id,
              nombre: r.nombre as string,
            })),
          });
        }
      })
      .catch(() => vigente && setLugares({ clave, filas: [] }));
    return () => {
      vigente = false;
    };
  }, [clave]);
  return {
    filas: lugares.clave === clave ? lugares.filas : [],
    cargando: !!clave && lugares.clave !== clave,
  };
}

// País (Venezuela por defecto), estado y ciudad. Para Venezuela, estado y
// ciudad salen de la lista; si la ciudad no aparece, se escribe («Otra
// ciudad»). Para otro país, estado/provincia y ciudad se escriben.
export function Ubicacion({ paises }: { paises: Lugar[] }) {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext();
  const [pais, entidad, ciudad] = useWatch({
    control,
    name: ["pais", "entidad", "ciudad"],
  }) as string[];
  const estados = useLugares("estados", "pais", pais);
  const ciudades = useLugares("ciudades", "estado", entidad);
  // «Otra ciudad» elegida (la ciudad se escribe en ciudad_texto).
  const escribirCiudad = ciudad === OTRA_CIUDAD;
  const conLista = estados.cargando || estados.filas.length > 0;

  const lista = (
    nombre: NombreCampo,
    etiqueta: string,
    filas: Lugar[],
    cargando: boolean,
    alCambiar?: (valor: string) => void,
    otra = false,
  ) => {
    const error = !!get(errors, nombre);
    return (
      <Envoltura nombre={nombre} etiqueta={etiqueta} obligatorio>
        <select
          id={`insc-${nombre}`}
          aria-invalid={error}
          className={claseDe(error)}
          disabled={cargando}
          {...register(nombre, {
            onChange: (e) => alCambiar?.(e.target.value),
          })}
        >
          <option value="">{cargando ? "Cargando…" : "Elegir…"}</option>
          {filas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
          {otra && (
            <option value={OTRA_CIUDAD}>Otra ciudad (escribirla)</option>
          )}
        </select>
      </Envoltura>
    );
  };

  const limpiar = (campos: NombreCampo[]) =>
    campos.forEach((c) => setValue(c, ""));

  return (
    <>
      {lista("pais", "País", paises, paises.length === 0, () => {
        limpiar(["entidad", "ciudad", "estado_texto", "ciudad_texto"]);
      })}
      {conLista ? (
        <>
          {lista("entidad", "Estado", estados.filas, estados.cargando, () => {
            limpiar(["ciudad", "ciudad_texto"]);
          })}
          {lista(
            "ciudad",
            "Ciudad",
            ciudades.filas,
            ciudades.cargando || !entidad,
            (valor) => {
              if (valor !== OTRA_CIUDAD) limpiar(["ciudad_texto"]);
            },
            true,
          )}
          {escribirCiudad && (
            <Texto
              nombre="ciudad_texto"
              etiqueta="Escribe la ciudad"
              obligatorio
              placeholder="Ej.: El Junquito"
            />
          )}
        </>
      ) : (
        pais && (
          <>
            <Texto
              nombre="estado_texto"
              etiqueta="Estado / provincia"
              placeholder="Ej.: Antioquia"
            />
            <Texto
              nombre="ciudad_texto"
              etiqueta="Ciudad"
              obligatorio
              placeholder="Ej.: Medellín"
            />
          </>
        )
      )}
    </>
  );
}
