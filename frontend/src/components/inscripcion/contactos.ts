// Familiares de contacto de un caminante o de un servidor: hasta cinco (como
// SUFIJOS_CONTACTO en retiros/models.py). El primero con nombre, relación,
// celular, teléfono y correo; los otros, con nombre, relación y teléfono
// (contacto2_nombre... contacto5_telefono).
import { z } from "zod";
import {
  celular,
  comoTexto,
  correo,
  fijo,
  json,
  normalizarCelular,
  obligatorio,
  texto,
} from "./esquemaPersona";

export const OTROS_CONTACTOS = [2, 3, 4, 5] as const;
type Otro = (typeof OTROS_CONTACTOS)[number];

function otroContacto<N extends Otro>(n: N) {
  return {
    [`contacto${n}_nombre`]: texto,
    [`contacto${n}_relacion`]: texto,
    [`contacto${n}_telefono`]: fijo,
  } as Record<`contacto${N}_${"nombre" | "relacion" | "telefono"}`, typeof texto>;
}

// Del caminante, el primero es obligatorio; del servidor, todos son opcionales.
export function camposContactos(primeroObligatorio: boolean) {
  return {
    contacto_nombre: primeroObligatorio
      ? obligatorio("Escribe a quién llamar en una emergencia.")
      : texto,
    contacto_relacion: primeroObligatorio
      ? obligatorio("Elige la relación (madre, esposa…).")
      : texto,
    contacto_telefono: fijo,
    contacto_celular: celular,
    contacto_correo: correo,
    ...otroContacto(2),
    ...otroContacto(3),
    ...otroContacto(4),
    ...otroContacto(5),
  };
}
const todos = z.object(camposContactos(true));
export type ValoresContactos = z.infer<typeof todos>;
export type CampoContacto = keyof ValoresContactos;
export const CAMPOS_CONTACTOS = Object.keys(todos.shape) as CampoContacto[];

export function reglasContactos(
  v: Partial<ValoresContactos>,
  falta: (campo: string, mensaje: string) => void,
  primeroObligatorio: boolean,
) {
  const empezado =
    v.contacto_nombre ||
    v.contacto_relacion ||
    v.contacto_telefono ||
    v.contacto_celular ||
    v.contacto_correo;
  if (primeroObligatorio || empezado) {
    if (!primeroObligatorio && !v.contacto_nombre) {
      falta("contacto_nombre", "Escribe su nombre.");
    }
    if (!v.contacto_telefono && !v.contacto_celular) {
      falta("contacto_celular", "Escribe al menos un teléfono del contacto.");
    }
  }
  // Los otros son opcionales, pero si se empieza uno hay que completarlo.
  for (const n of OTROS_CONTACTOS) {
    const nombre = v[`contacto${n}_nombre`];
    const telefono = v[`contacto${n}_telefono`];
    if (nombre || telefono || v[`contacto${n}_relacion`]) {
      if (!nombre) falta(`contacto${n}_nombre`, "Escribe su nombre.");
      if (!telefono) falta(`contacto${n}_telefono`, "Escribe su teléfono.");
    }
  }
}

export const ETIQUETAS_CONTACTOS: Record<CampoContacto, string> = {
  contacto_nombre: "Nombre",
  contacto_relacion: "Relación",
  contacto_telefono: "Teléfono de casa",
  contacto_celular: "Celular",
  contacto_correo: "Correo",
  ...(Object.fromEntries(
    OTROS_CONTACTOS.flatMap((n) => [
      [`contacto${n}_nombre`, "Nombre"],
      [`contacto${n}_relacion`, "Relación"],
      [`contacto${n}_telefono`, "Teléfono"],
    ]),
  ) as Record<Exclude<CampoContacto, `contacto_${string}`>, string>),
};

// En el resumen, los de cada familiar se distinguen de los del primero.
export function titulosConContactos(
  etiquetas: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(etiquetas).map(([campo, titulo]) => {
      const n = /^contacto(\d)_/.exec(campo)?.[1];
      return [campo, n ? `Familiar ${n}: ${titulo.toLowerCase()}` : titulo];
    }),
  );
}

// Campo del formulario -> clave en contacto_emergencia ("contacto3_nombre" ->
// "nombre3").
function clave(campo: CampoContacto) {
  const [, n, dato] = /^contacto(\d?)_(\w+)$/.exec(campo)!;
  return `${dato}${n}`;
}

export function vaciosContactos(): ValoresContactos {
  return Object.fromEntries(
    CAMPOS_CONTACTOS.map((c) => [c, ""]),
  ) as ValoresContactos;
}

// El contacto_emergencia guardado, para el formulario.
export function datosDeContactos(contacto: unknown): ValoresContactos {
  const datos = (contacto ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    CAMPOS_CONTACTOS.map((c) => [
      c,
      c === "contacto_celular"
        ? normalizarCelular(datos[clave(c)])
        : comoTexto(datos[clave(c)]),
    ]),
  ) as ValoresContactos;
}

// Para guardarlo en contacto_emergencia.
export function cuerpoContactos(v: Partial<ValoresContactos>) {
  return json(
    {},
    CAMPOS_CONTACTOS.map((c) => [clave(c), v[c]]),
  );
}
