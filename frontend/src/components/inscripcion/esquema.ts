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
import {
  CAMPOS_CONTACTOS,
  camposContactos,
  cuerpoContactos,
  datosDeContactos,
  ETIQUETAS_CONTACTOS,
  reglasContactos,
} from "./contactos";

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

// Relación del familiar de contacto con el caminante. La pareja depende de
// si el retiro es de hombres (su esposa) o de mujeres (su esposo); el resto
// va en masculino y femenino porque el familiar puede ser cualquiera.
export type Sexo = "hombre" | "mujer";
export function sexoDelRetiro(etiqueta = ""): Sexo | undefined {
  if (/mujer/i.test(etiqueta)) return "mujer";
  if (/hombre/i.test(etiqueta)) return "hombre";
  return undefined;
}
// El sexo de la persona que sugiere el retiro: "M", "F" o undefined.
export function sexoSugerido(etiqueta = ""): string | undefined {
  const sexo = sexoDelRetiro(etiqueta);
  return sexo === "hombre" ? "M" : sexo === "mujer" ? "F" : undefined;
}

export function relacionesFamiliar(sexo?: Sexo) {
  const pareja =
    sexo === "hombre"
      ? ["Esposa", "Novia", "Pareja"]
      : sexo === "mujer"
        ? ["Esposo", "Novio", "Pareja"]
        : ["Esposa", "Esposo", "Novia", "Novio", "Pareja"];
  return [
    { grupo: "Pareja", opciones: pareja },
    {
      grupo: "Familia cercana",
      opciones: ["Madre", "Padre", "Hija", "Hijo", "Hermana", "Hermano"],
    },
    {
      grupo: "Otros familiares",
      opciones: [
        "Abuela",
        "Abuelo",
        "Nieta",
        "Nieto",
        "Tía",
        "Tío",
        "Prima",
        "Primo",
        "Sobrina",
        "Sobrino",
        "Cuñada",
        "Cuñado",
        "Suegra",
        "Suegro",
        "Nuera",
        "Yerno",
        "Madrastra",
        "Padrastro",
      ],
    },
    {
      grupo: "Fuera de la familia",
      opciones: [
        "Amiga",
        "Amigo",
        "Vecina",
        "Vecino",
        "Compañera de trabajo",
        "Compañero de trabajo",
        "Madrina",
        "Padrino",
      ],
    },
  ];
}

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
  // Opcionales: los asigna logística, a veces después de inscribirlo.
  cama: texto.max(10, "Máximo 10 caracteres."),
  mesa: texto.max(10, "Máximo 10 caracteres."),
  notas: texto,
  consentimiento_datos: casilla.refine(
    (v) => v,
    "Hace falta la autorización para guardar sus datos.",
  ),
};

// Confidenciales: solo para los roles que ven datos sensibles (si no, la API
// los descarta, así que tampoco se piden).
// Familia y fe (Persona.datos_sensibles): también los pide "Editar persona".
export const camposFamilia = {
  estado_civil: obligatorio("Elige el estado civil."),
  pareja_nombre: texto,
  pareja_telefono: fijo,
  pareja_celular: celular,
  pareja_correo: correo,
  hijos: texto.refine((v) => /^\d{0,2}$/.test(v), "Escribe un número."),
  edades_hijos: texto,
  bautismo: casilla,
  primera_comunion: casilla,
  confirmacion: casilla,
  matrimonio: casilla,
  orden_sacerdotal: casilla,
  uncion: casilla,
  parroquia_asiste: texto,
};

const sensibles = {
  ...camposPersonaSensibles,
  ...camposFamilia,
  // Salud y alimentación
  condicion_medica: texto,
  tratamiento: texto,
  regimen_alimenticio: texto,
  requerimientos: texto,
  talla_camiseta: obligatorio("Elige la talla de camiseta."),
  ...camposContactos(true),
};

const esquemaCompleto = z.object({ ...basicos, ...sensibles });
export type Valores = z.infer<typeof esquemaCompleto>;
export type Campo = keyof Valores;

// Con estos estados civiles se pide el nombre de la pareja.
export function reglasFamilia(
  v: { estado_civil?: string; pareja_nombre?: string },
  falta: (campo: string, mensaje: string) => void,
) {
  if (CON_PAREJA.includes(v.estado_civil ?? "") && !v.pareja_nombre) {
    falta("pareja_nombre", "Escribe el nombre de la pareja.");
  }
}

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
  reglasFamilia(v, falta);
  reglasContactos(v, falta, true);
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
  cama: "Número de cama",
  mesa: "Número de mesa",
  estado_civil: "Estado civil",
  pareja_nombre: "Nombre de la pareja",
  pareja_telefono: "Teléfono de la pareja",
  pareja_celular: "Celular de la pareja",
  pareja_correo: "Correo de la pareja",
  hijos: "Número de hijos",
  edades_hijos: "Edades de los hijos",
  bautismo: "Bautismo",
  primera_comunion: "Primera comunión",
  confirmacion: "Confirmación",
  matrimonio: "Matrimonio",
  orden_sacerdotal: "Orden sacerdotal",
  uncion: "Unción de los enfermos",
  parroquia_asiste: "Parroquia a la que asiste",
  condicion_medica: "Condición médica",
  tratamiento: "Tratamiento o medicamentos",
  regimen_alimenticio: "Alimentación especial",
  requerimientos: "Requerimientos especiales",
  talla_camiseta: "Talla de camiseta",
  ...ETIQUETAS_CONTACTOS,
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
      "cama",
      "mesa",
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
      "primera_comunion",
      "confirmacion",
      "matrimonio",
      "orden_sacerdotal",
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
    campos: CAMPOS_CONTACTOS,
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
  "primera_comunion",
  "confirmacion",
  "matrimonio",
  "orden_sacerdotal",
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
const BOOLEANOS = new Set<string>([
  "bautismo",
  "primera_comunion",
  "confirmacion",
  "matrimonio",
  "orden_sacerdotal",
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

// Familia y fe de una persona registrada, para el formulario.
export function datosDeFamilia(persona: Registro): Record<string, unknown> {
  const datos = (persona.datos_sensibles ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    FAMILIA.map((c) => [
      c,
      BOOLEANOS.has(c)
        ? Boolean(datos[c])
        : c === "pareja_celular"
          ? normalizarCelular(datos[c])
          : comoTexto(datos[c]),
    ]),
  );
}

export function datosDePersona(persona: Registro): Partial<Valores> {
  return { ...datosDeLaPersona(persona), ...datosDeFamilia(persona) };
}

// Familia y fe para guardarlo en Persona.datos_sensibles.
export function paresFamilia(v: Record<string, unknown>): [string, unknown][] {
  return FAMILIA.map((c) => [
    c,
    c === "hijos" && v.hijos !== "" ? Number(v.hijos) : v[c],
  ]);
}

// Una inscripción guardada, para editarla en el formulario.
export function datosDeInscripcion(ins: Registro): Partial<Valores> {
  const salud = (ins.salud_alimentacion ?? {}) as Record<string, unknown>;
  return {
    retiro: comoTexto(ins.retiro),
    estado: comoTexto(ins.estado),
    padrino: comoTexto(ins.padrino),
    cama: comoTexto(ins.cama),
    mesa: comoTexto(ins.mesa),
    notas: comoTexto(ins.notas),
    consentimiento_datos: Boolean(ins.consentimiento_datos),
    ...Object.fromEntries(SALUD.map((c) => [c, comoTexto(salud[c])])),
    ...datosDeContactos(ins.contacto_emergencia),
  };
}

export function cuerpoPersona(
  v: Valores,
  conSensibles: boolean,
  anterior: Registro | null,
) {
  return cuerpoDeLaPersona(v, conSensibles, anterior, paresFamilia(v));
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
    cama: v.cama,
    mesa: v.mesa,
    notas: v.notas,
    consentimiento_datos: v.consentimiento_datos,
    ...(conSensibles && {
      salud_alimentacion: json(
        {},
        SALUD.map((c) => [c, v[c]]),
      ),
      contacto_emergencia: cuerpoContactos(v),
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
