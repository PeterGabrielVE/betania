// Formulario de inscripción de un caminante (el de papel), paso a paso.
// Lo de la persona (documento, nombres, celular, de dónde es) está en
// esquemaPersona.ts; aquí, lo propio del caminante: familia, salud, contactos
// de emergencia y la inscripción al retiro.
import type { Registro } from "@/api/client";
import { z } from "zod";
import {
  camposPersona,
  camposPersonaSensibles,
  casilla,
  celular,
  comoTexto,
  correo,
  cuerpoPersona as cuerpoDeLaPersona,
  datosDePersona as datosDeLaPersona,
  ETIQUETAS_PERSONA,
  fijo,
  json,
  normalizarCelular,
  obligatorio,
  PASO_PERSONALES,
  reglasPersona,
  texto,
  valoresPersona,
} from "./esquemaPersona";

export {
  EDAD_MINIMA,
  normalizarDocumento,
  TIPOS_DOCUMENTO,
} from "./esquemaPersona";

export const ESTADOS_CIVILES = [
  "Soltero",
  "Casado",
  "Divorciado",
  "Viudo",
  "Unión libre",
];
export const TALLAS = ["S", "M", "L", "XL"];
// Con estos estados civiles se pide el nombre de la pareja.
export const CON_PAREJA = ["Casado", "Unión libre"];

// --------------------------------------------------------------------------- //
// Campos
// --------------------------------------------------------------------------- //
// Los que puede ver cualquiera que inscribe.
const basicos = {
  ...camposPersona,
  retiro: obligatorio("Elige el retiro."),
  estado: obligatorio("Elige el estado de la inscripción."),
  padrino: texto,
  notas: texto,
  consentimiento_datos: casilla.refine(
    (v) => v,
    "Hace falta la autorización para guardar sus datos.",
  ),
};

// Confidenciales: solo para los roles que ven datos sensibles (si no, la API
// los descarta, así que tampoco se piden).
const sensibles = {
  ...camposPersonaSensibles,
  // Familia y fe
  estado_civil: obligatorio("Elige el estado civil."),
  pareja_nombre: texto,
  pareja_telefono: fijo,
  pareja_celular: celular,
  pareja_correo: correo,
  hijos: texto.refine((v) => /^\d{0,2}$/.test(v), "Escribe un número."),
  edades_hijos: texto,
  bautismo: casilla,
  confirmacion: casilla,
  matrimonio: casilla,
  uncion: casilla,
  parroquia_asiste: texto,
  // Salud y alimentación
  condicion_medica: texto,
  tratamiento: texto,
  regimen_alimenticio: texto,
  requerimientos: texto,
  talla_camiseta: obligatorio("Elige la talla de camiseta."),
  // Contactos de emergencia
  contacto_nombre: obligatorio("Escribe a quién llamar en una emergencia."),
  contacto_relacion: obligatorio("Indica la relación (madre, esposa…)."),
  contacto_telefono: fijo,
  contacto_celular: celular,
  contacto_correo: correo,
  contacto2_nombre: texto,
  contacto2_relacion: texto,
  contacto2_telefono: fijo,
};

const esquemaCompleto = z.object({ ...basicos, ...sensibles });
export type Valores = z.infer<typeof esquemaCompleto>;
export type Campo = keyof Valores;

// Reglas que cruzan campos. Con `conSensibles` en false, los campos
// confidenciales no existen en el formulario y sus reglas no se aplican.
function cruzadas(
  v: Partial<Valores>,
  ctx: z.RefinementCtx,
  conSensibles: boolean,
  conEstados: (pais: string) => boolean,
) {
  const falta = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  reglasPersona(v, falta, conEstados);
  if (!conSensibles) return;
  if (CON_PAREJA.includes(v.estado_civil ?? "") && !v.pareja_nombre) {
    falta("pareja_nombre", "Escribe el nombre de la pareja.");
  }
  if (!v.contacto_telefono && !v.contacto_celular) {
    falta("contacto_celular", "Escribe al menos un teléfono del contacto.");
  }
  // El segundo contacto es opcional, pero si se empieza hay que completarlo.
  if (v.contacto2_relacion || v.contacto2_telefono || v.contacto2_nombre) {
    if (!v.contacto2_nombre) falta("contacto2_nombre", "Escribe su nombre.");
    if (!v.contacto2_telefono) {
      falta("contacto2_telefono", "Escribe su teléfono.");
    }
  }
}

// `conEstados(pais)`: si ese país tiene estados cargados (ver sembrar_geografia).
export function crearEsquema(
  conSensibles: boolean,
  conEstados: (pais: string) => boolean,
) {
  const base = conSensibles ? esquemaCompleto : z.object(basicos);
  return base.superRefine(
    (v, ctx) => cruzadas(v as Partial<Valores>, ctx, conSensibles, conEstados),
    // Siempre, aunque haya campos con error en otros pasos: así cada paso
    // muestra sus propios avisos al validarlo.
    { when: (p) => typeof p.value === "object" && p.value !== null },
  ) as unknown as z.ZodType<Valores, Valores>;
}

// Nombre de cada campo, en el formulario y en el resumen.
export const ETIQUETAS: Record<Campo, string> = {
  ...ETIQUETAS_PERSONA,
  retiro: "Retiro",
  estado: "Estado de la inscripción",
  padrino: "Quién lo invitó",
  estado_civil: "Estado civil",
  pareja_nombre: "Nombre de la pareja",
  pareja_telefono: "Teléfono de la pareja",
  pareja_celular: "Celular de la pareja",
  pareja_correo: "Correo de la pareja",
  hijos: "Número de hijos",
  edades_hijos: "Edades de los hijos",
  bautismo: "Bautismo",
  confirmacion: "Confirmación",
  matrimonio: "Matrimonio",
  uncion: "Unción de los enfermos",
  parroquia_asiste: "Parroquia a la que asiste",
  condicion_medica: "Condición médica",
  tratamiento: "Tratamiento o medicamentos",
  regimen_alimenticio: "Alimentación especial",
  requerimientos: "Requerimientos especiales",
  talla_camiseta: "Talla de camiseta",
  contacto_nombre: "Nombre",
  contacto_relacion: "Relación",
  contacto_telefono: "Teléfono de casa",
  contacto_celular: "Celular",
  contacto_correo: "Correo",
  contacto2_nombre: "Nombre",
  contacto2_relacion: "Relación",
  contacto2_telefono: "Teléfono",
  notas: "Comentario",
  consentimiento_datos: "Autoriza el uso de sus datos",
};

// --------------------------------------------------------------------------- //
// Pasos
// --------------------------------------------------------------------------- //
export type Paso = {
  id: string;
  titulo: string;
  descripcion: string;
  campos: string[]; // los que se validan al pasar al siguiente
  soloSensibles?: boolean;
};

export const PASOS: Paso[] = [
  {
    id: "identificacion",
    titulo: "Identificación",
    descripcion: "Retiro y documento de identidad.",
    campos: [
      "retiro",
      "parroquia",
      "estado",
      "tipo_documento",
      "documento",
      "padrino",
    ],
  },
  {
    id: "personales",
    titulo: "Datos personales",
    descripcion: "Quién es, de dónde es y cómo localizarlo.",
    campos: PASO_PERSONALES,
  },
  {
    id: "familia",
    titulo: "Familia y fe",
    descripcion: "Estado civil, hijos y sacramentos.",
    soloSensibles: true,
    campos: [
      "estado_civil",
      "pareja_nombre",
      "pareja_telefono",
      "pareja_celular",
      "pareja_correo",
      "hijos",
      "edades_hijos",
      "bautismo",
      "confirmacion",
      "matrimonio",
      "uncion",
      "parroquia_asiste",
    ],
  },
  {
    id: "salud",
    titulo: "Salud",
    descripcion: "Tratamientos, comida especial y talla.",
    soloSensibles: true,
    campos: [
      "condicion_medica",
      "tratamiento",
      "regimen_alimenticio",
      "requerimientos",
      "talla_camiseta",
    ],
  },
  {
    id: "contactos",
    titulo: "Contactos",
    descripcion: "A quién llamar en una emergencia.",
    soloSensibles: true,
    campos: [
      "contacto_nombre",
      "contacto_relacion",
      "contacto_celular",
      "contacto_telefono",
      "contacto_correo",
      "contacto2_nombre",
      "contacto2_relacion",
      "contacto2_telefono",
    ],
  },
  {
    id: "confirmar",
    titulo: "Confirmar",
    descripcion: "Revisa los datos y regístralos.",
    campos: ["notas", "consentimiento_datos"],
  },
];

export function pasosPara(conSensibles: boolean): Paso[] {
  return PASOS.filter((p) => conSensibles || !p.soloSensibles).map((p) => ({
    ...p,
    campos: conSensibles ? p.campos : p.campos.filter((c) => c in basicos),
  }));
}

// --------------------------------------------------------------------------- //
// Valores iniciales y conversión a la API
// --------------------------------------------------------------------------- //
// Lo de Persona.datos_sensibles que pide este formulario además de lo común,
// y las claves de Inscripcion.salud_alimentacion y contacto_emergencia (ver
// retiros/api/modulos.py).
const FAMILIA = [
  "estado_civil",
  "pareja_nombre",
  "pareja_telefono",
  "pareja_celular",
  "pareja_correo",
  "hijos",
  "edades_hijos",
  "bautismo",
  "confirmacion",
  "matrimonio",
  "uncion",
  "parroquia_asiste",
] as const;
const SALUD = [
  "condicion_medica",
  "tratamiento",
  "regimen_alimenticio",
  "requerimientos",
  "talla_camiseta",
] as const;
// Campo del formulario -> clave en contacto_emergencia.
const CONTACTO: [Campo, string][] = [
  ["contacto_nombre", "nombre"],
  ["contacto_relacion", "relacion"],
  ["contacto_telefono", "telefono"],
  ["contacto_celular", "celular"],
  ["contacto_correo", "correo"],
  ["contacto2_nombre", "nombre2"],
  ["contacto2_relacion", "relacion2"],
  ["contacto2_telefono", "telefono2"],
];
const BOOLEANOS = new Set<string>([
  "bautismo",
  "confirmacion",
  "matrimonio",
  "uncion",
  "consentimiento_datos",
]);

export function valoresIniciales(retiro?: string, pais = ""): Valores {
  const vacios = Object.fromEntries(
    Object.keys(esquemaCompleto.shape).map((c) => [
      c,
      BOOLEANOS.has(c) ? false : "",
    ]),
  ) as Valores;
  return {
    ...vacios,
    ...valoresPersona(pais),
    retiro: retiro ?? "",
    estado: "solicitada",
  };
}

export function datosDePersona(persona: Registro): Partial<Valores> {
  const datos = (persona.datos_sensibles ?? {}) as Record<string, unknown>;
  const familia = Object.fromEntries(
    FAMILIA.map((c) => [
      c,
      BOOLEANOS.has(c)
        ? Boolean(datos[c])
        : c === "pareja_celular"
          ? normalizarCelular(datos[c])
          : comoTexto(datos[c]),
    ]),
  );
  return { ...datosDeLaPersona(persona), ...familia };
}

export function cuerpoPersona(
  v: Valores,
  conSensibles: boolean,
  anterior: Registro | null,
) {
  return cuerpoDeLaPersona(
    v,
    conSensibles,
    anterior,
    FAMILIA.map((c) => [
      c,
      c === "hijos" && v.hijos !== "" ? Number(v.hijos) : v[c],
    ]),
  );
}

export function cuerpoInscripcion(
  v: Valores,
  persona: string,
  conSensibles: boolean,
) {
  return {
    retiro: v.retiro,
    persona,
    padrino: v.padrino || null,
    estado: v.estado,
    notas: v.notas,
    consentimiento_datos: v.consentimiento_datos,
    ...(conSensibles && {
      salud_alimentacion: json(
        {},
        SALUD.map((c) => [c, v[c]]),
      ),
      contacto_emergencia: json(
        {},
        CONTACTO.map(([campo, clave]) => [clave, v[campo]]),
      ),
    }),
  };
}

// Errores de la inscripción (/inscripciones/) -> campo del formulario.
export function campoDeInscripcion(clave: string): string | null {
  if (clave === "salud_alimentacion") return "talla_camiseta";
  if (clave === "contacto_emergencia") return "contacto_nombre";
  if (clave === "persona") return "documento";
  return clave in esquemaCompleto.shape ? clave : null;
}
