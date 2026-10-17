// Lo que se pide de una persona al registrarla, sea caminante o servidor:
// documento, nombres, celular, de dónde es. Las reglas (zod), los valores
// iniciales y la conversión a lo que espera la API (Persona).
import type { Registro } from "@/api/client";
import { z } from "zod";

// --------------------------------------------------------------------------- //
// Reglas reutilizables
// --------------------------------------------------------------------------- //
export const texto = z.string().trim();
export const obligatorio = (mensaje: string) => texto.min(1, mensaje);
export const correo = texto.refine(
  (v) => v === "" || z.email().safeParse(v).success,
  "Escribe un correo válido.",
);
export const casilla = z.boolean();

// Nombres y apellidos: letras (con acentos), espacios, apóstrofo y guion.
const NOMBRE = /^[\p{L}][\p{L}' -]*$/u;
const nombre = texto.refine(
  (v) => v === "" || NOMBRE.test(v),
  "Solo letras, sin números ni signos.",
);

// Teléfono fijo o de otro país: números, espacios, guiones, paréntesis o +.
const FIJO = /^\+?[\d\s().-]{7,20}$/;
export const fijo = texto.refine(
  (v) => v === "" || FIJO.test(v),
  "Escribe un teléfono válido, p. ej. 0212-1234567.",
);

// Celulares de Venezuela: operadora + 7 dígitos ("0414-1234567"); de otro país,
// con su código ("+57 300 1234567"). Ver Celular en Campos.tsx.
export const OPERADORAS = ["0412", "0414", "0416", "0422", "0424", "0426"];
export const EXTRANJERO = "ext";
const CELULAR_VE = new RegExp(`^(${OPERADORAS.join("|")})-\\d{7}$`);
const CELULAR_EXTRANJERO = /^\+\d[\d\s-]{6,18}$/;

function mensajeCelular(v: string): string | null {
  if (v === "" || CELULAR_VE.test(v) || CELULAR_EXTRANJERO.test(v)) return null;
  if (v.startsWith("-")) return "Elige la operadora.";
  if (/^04\d{2}-/.test(v)) {
    return "El número lleva 7 dígitos después de la operadora.";
  }
  return "Escribe el número con el código del país, p. ej. +57 300 1234567.";
}
export const celular = texto.superRefine((v, ctx) => {
  const mensaje = mensajeCelular(v);
  if (mensaje) ctx.addIssue({ code: "custom", message: mensaje });
});

export const SEXOS = [
  { valor: "M", etiqueta: "Masculino" },
  { valor: "F", etiqueta: "Femenino" },
];

export const TIPOS_DOCUMENTO = [
  { valor: "V", etiqueta: "Cédula venezolana (V)" },
  { valor: "E", etiqueta: "Cédula de extranjero (E)" },
  { valor: "P", etiqueta: "Pasaporte" },
];
// "V-12.345.678" -> "12345678" (igual que Persona.normalizar_documento).
export function normalizarDocumento(documento: string): string {
  return documento
    .trim()
    .toUpperCase()
    .replace(/^[VEP]-|[\s.-]/g, "");
}

export const EDAD_MINIMA = 18;
// Valor de "ciudad" cuando no está en la lista y se escribe en ciudad_texto.
export const OTRA_CIUDAD = "__otra";

function edad(nacimiento: string, hoy = new Date()): number {
  const [a, m, d] = nacimiento.split("-").map(Number);
  const cumplio =
    hoy.getMonth() + 1 > m || (hoy.getMonth() + 1 === m && hoy.getDate() >= d);
  return hoy.getFullYear() - a - (cumplio ? 0 : 1);
}

// --------------------------------------------------------------------------- //
// Campos
// --------------------------------------------------------------------------- //
// Los que puede ver cualquiera que registra.
export const camposPersona = {
  // Sale del retiro (o de la persona ya registrada); no se muestra.
  parroquia: obligatorio("Elige el retiro para saber la parroquia."),
  tipo_documento: obligatorio("Elige el tipo de documento."),
  documento: obligatorio("Escribe el número de documento."),
  primer_nombre: obligatorio("Escribe el primer nombre.").pipe(nombre),
  segundo_nombre: nombre,
  primer_apellido: obligatorio("Escribe el primer apellido.").pipe(nombre),
  segundo_apellido: nombre,
  fecha_nacimiento: obligatorio("Indica la fecha de nacimiento.")
    .refine(
      (v) => !Number.isNaN(Date.parse(v)) && Date.parse(v) <= Date.now(),
      "La fecha de nacimiento no puede ser futura.",
    )
    .refine(
      (v) => edad(v) >= EDAD_MINIMA,
      `Debe tener al menos ${EDAD_MINIMA} años.`,
    )
    .refine((v) => edad(v) <= 100, "Revisa la fecha de nacimiento."),
  // Para el avatar por defecto; en un retiro de hombres o de mujeres viene
  // puesto (ver sexoDeRetiro).
  sexo: obligatorio("Indica el sexo."),
  // Persona.telefono es el celular, el teléfono principal.
  telefono: obligatorio("Escribe el celular.").pipe(celular),
  email: correo,
  pais: obligatorio("Elige el país."),
  // El estado geográfico (Persona.estado); en el formulario del caminante,
  // "estado" es el de la inscripción.
  entidad: texto,
  ciudad: texto,
  // Lo que no está en los catálogos: un país sin estados cargados, o una
  // ciudad que no aparece en la lista.
  estado_texto: texto,
  ciudad_texto: texto,
};

// Confidenciales: solo para los roles que ven datos sensibles.
export const camposPersonaSensibles = {
  telefono_casa: fijo,
  direccion: texto,
  ocupacion: texto,
};

export type ValoresPersona = z.infer<
  z.ZodObject<typeof camposPersona & typeof camposPersonaSensibles>
>;

export type Falta = (campo: string, mensaje: string) => void;

// Reglas de la persona que cruzan campos. `conEstados(pais)`: si ese país
// tiene estados cargados (Venezuela; ver sembrar_geografia).
export function reglasPersona(
  v: Partial<ValoresPersona>,
  falta: Falta,
  conEstados: (pais: string) => boolean,
) {
  // Cédula: solo números; pasaporte: letras y números.
  const documento = normalizarDocumento(v.documento ?? "");
  if (documento) {
    if (v.tipo_documento === "P") {
      if (!/^[A-Z0-9]{5,20}$/.test(documento)) {
        falta("documento", "El pasaporte lleva de 5 a 20 letras o números.");
      }
    } else if (!/^\d{5,9}$/.test(documento)) {
      falta("documento", "La cédula lleva solo números (de 5 a 9 cifras).");
    }
  }
  if (!v.pais) return;
  if (conEstados(v.pais)) {
    // Venezuela: estado de la lista; la ciudad, de la lista o escrita.
    if (!v.entidad) falta("entidad", "Elige el estado.");
    else if (!v.ciudad) {
      falta("ciudad", "Elige la ciudad, o «Otra ciudad» para escribirla.");
    } else if (v.ciudad === OTRA_CIUDAD && !v.ciudad_texto) {
      falta("ciudad_texto", "Escribe la ciudad.");
    }
  } else if (!v.ciudad_texto) {
    // Del extranjero: se escribe.
    falta("ciudad_texto", "Escribe la ciudad.");
  }
}

// Nombre de cada campo, en el formulario y en el resumen.
export const ETIQUETAS_PERSONA: Record<keyof ValoresPersona, string> = {
  parroquia: "Parroquia",
  tipo_documento: "Tipo de documento",
  documento: "Número de documento",
  primer_nombre: "Primer nombre",
  segundo_nombre: "Segundo nombre",
  primer_apellido: "Primer apellido",
  segundo_apellido: "Segundo apellido",
  fecha_nacimiento: "Fecha de nacimiento",
  sexo: "Sexo",
  telefono: "Celular",
  email: "Correo",
  pais: "País",
  entidad: "Estado",
  ciudad: "Ciudad",
  estado_texto: "Estado / provincia",
  ciudad_texto: "Ciudad",
  telefono_casa: "Teléfono de casa",
  direccion: "Sector / urbanización / dirección",
  ocupacion: "Ocupación",
};

// Los campos del paso "Datos personales".
export const PASO_PERSONALES: (keyof ValoresPersona)[] = [
  "primer_nombre",
  "segundo_nombre",
  "primer_apellido",
  "segundo_apellido",
  "fecha_nacimiento",
  "sexo",
  "ocupacion",
  "telefono",
  "telefono_casa",
  "email",
  "pais",
  "entidad",
  "ciudad",
  "estado_texto",
  "ciudad_texto",
  "direccion",
];

// --------------------------------------------------------------------------- //
// Valores iniciales y conversión a la API
// --------------------------------------------------------------------------- //
export function valoresPersona(pais = ""): ValoresPersona {
  const vacios = Object.fromEntries(
    [...Object.keys(camposPersona), ...Object.keys(camposPersonaSensibles)].map(
      (c) => [c, ""],
    ),
  ) as ValoresPersona;
  return { ...vacios, tipo_documento: "V", pais };
}

export const comoTexto = (valor: unknown) =>
  valor === undefined || valor === null ? "" : String(valor);

// "04141234567" o "0414 123 4567" -> "0414-1234567".
export function normalizarCelular(valor: unknown): string {
  const t = comoTexto(valor).trim();
  const ve = /^(04\d{2})[\s-]*(\d{3})[\s-]*(\d{4})$/.exec(t);
  return ve ? `${ve[1]}-${ve[2]}${ve[3]}` : t;
}

// Los datos de una persona ya registrada, para no volver a escribirlos.
export function datosDePersona(persona: Registro): Partial<ValoresPersona> {
  const datos = (persona.datos_sensibles ?? {}) as Record<string, unknown>;
  const valores: Partial<ValoresPersona> = {
    tipo_documento: comoTexto(persona.tipo_documento) || "V",
    documento: comoTexto(persona.documento),
    primer_nombre: comoTexto(persona.primer_nombre),
    segundo_nombre: comoTexto(persona.segundo_nombre),
    primer_apellido: comoTexto(persona.primer_apellido),
    segundo_apellido: comoTexto(persona.segundo_apellido),
    fecha_nacimiento: comoTexto(persona.fecha_nacimiento),
    sexo: comoTexto(persona.sexo),
    telefono: normalizarCelular(persona.telefono),
    email: comoTexto(persona.email),
    parroquia: comoTexto(persona.parroquia),
    entidad: comoTexto(persona.estado),
    // Con la ciudad escrita (no estaba en la lista), «Otra ciudad».
    ciudad:
      comoTexto(persona.ciudad) ||
      (persona.estado && persona.ciudad_texto ? OTRA_CIUDAD : ""),
    estado_texto: comoTexto(persona.estado_texto),
    ciudad_texto: comoTexto(persona.ciudad_texto),
    telefono_casa: comoTexto(datos.telefono_casa),
    direccion: comoTexto(datos.direccion),
    ocupacion: comoTexto(datos.ocupacion),
  };
  // Sin país registrado se conserva el del formulario (Venezuela).
  if (persona.pais) valores.pais = comoTexto(persona.pais);
  return valores;
}

// Un objeto JSON sin los vacíos, sobre lo que ya tenía (para no borrar datos
// que este formulario no pide).
export function json(
  anterior: unknown,
  pares: [string, unknown][],
): Record<string, unknown> {
  const objeto = { ...((anterior ?? {}) as Record<string, unknown>) };
  for (const [clave, valor] of pares) {
    if (valor === "" || valor === false) delete objeto[clave];
    else objeto[clave] = valor;
  }
  return objeto;
}

// Cuerpo de POST/PATCH /personas/. `masSensibles`: otros datos de
// datos_sensibles que pide el formulario (familia, sacramentos…).
export function cuerpoPersona(
  v: ValoresPersona,
  conSensibles: boolean,
  anterior: Registro | null,
  masSensibles: [string, unknown][] = [],
) {
  return {
    tipo_documento: v.tipo_documento,
    documento: normalizarDocumento(v.documento),
    primer_nombre: v.primer_nombre,
    segundo_nombre: v.segundo_nombre,
    primer_apellido: v.primer_apellido,
    segundo_apellido: v.segundo_apellido,
    parroquia: v.parroquia,
    fecha_nacimiento: v.fecha_nacimiento || null,
    sexo: v.sexo,
    telefono: v.telefono,
    email: v.email,
    pais: v.pais || null,
    estado: v.entidad || null,
    // Una ciudad elegida de la lista y una escrita no van juntas.
    ciudad: v.ciudad && v.ciudad !== OTRA_CIUDAD ? v.ciudad : null,
    estado_texto: v.entidad ? "" : v.estado_texto,
    ciudad_texto: v.ciudad && v.ciudad !== OTRA_CIUDAD ? "" : v.ciudad_texto,
    ...(conSensibles && {
      datos_sensibles: json(anterior?.datos_sensibles, [
        ["telefono_casa", v.telefono_casa],
        ["direccion", v.direccion],
        ["ocupacion", v.ocupacion],
        ...masSensibles,
      ]),
    }),
  };
}

// Errores de la API de /personas/ -> campo del formulario.
export function campoDePersona(clave: string): string | null {
  if (clave === "estado") return "entidad";
  if (clave === "datos_sensibles") return "direccion";
  if (clave === "nombre") return "primer_nombre";
  return clave in camposPersona || clave in camposPersonaSensibles
    ? clave
    : null;
}
