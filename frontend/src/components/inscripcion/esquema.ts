// Formulario de inscripción de un caminante (el de papel), paso a paso.
// Aquí está todo lo que no es de pantalla: los pasos, las reglas de cada campo
// (zod), los valores iniciales y la conversión a lo que espera la API.
import type { Registro } from "@/api/client";
import { z } from "zod";

// --------------------------------------------------------------------------- //
// Reglas reutilizables
// --------------------------------------------------------------------------- //
const texto = z.string().trim();
const obligatorio = (mensaje: string) => texto.min(1, mensaje);
const correo = texto.refine(
  (v) => v === "" || z.email().safeParse(v).success,
  "Escribe un correo válido.",
);
const casilla = z.boolean();

// Teléfono fijo o de otro país: números, espacios, guiones, paréntesis o +.
const FIJO = /^\+?[\d\s().-]{7,20}$/;
const fijo = texto.refine(
  (v) => v === "" || FIJO.test(v),
  "Escribe un teléfono válido, p. ej. 0212-1234567.",
);

// Celulares de Venezuela: operadora + 7 dígitos ("0414-1234567"); de otro país,
// con su código ("+57 300 1234567"). Ver CampoCelular.
export const OPERADORAS = ["0412", "0414", "0416", "0422", "0424", "0426"];
export const EXTRANJERO = "ext";
const CELULAR_VE = new RegExp(`^(${OPERADORAS.join("|")})-\\d{7}$`);
const CELULAR_EXTRANJERO = /^\+\d[\d\s-]{6,18}$/;

function mensajeCelular(v: string): string | null {
  if (v === "" || CELULAR_VE.test(v) || CELULAR_EXTRANJERO.test(v)) return null;
  if (v.startsWith("-")) return "Elige la operadora.";
  if (/^04\d{2}-/.test(v))
    return "El número lleva 7 dígitos después de la operadora.";
  return "Escribe el número con el código del país, p. ej. +57 300 1234567.";
}
const celular = texto.superRefine((v, ctx) => {
  const mensaje = mensajeCelular(v);
  if (mensaje) ctx.addIssue({ code: "custom", message: mensaje });
});

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
export const EDAD_MINIMA = 18;

function edad(nacimiento: string, hoy = new Date()): number {
  const [a, m, d] = nacimiento.split("-").map(Number);
  const cumplio =
    hoy.getMonth() + 1 > m || (hoy.getMonth() + 1 === m && hoy.getDate() >= d);
  return hoy.getFullYear() - a - (cumplio ? 0 : 1);
}

// --------------------------------------------------------------------------- //
// Campos
// --------------------------------------------------------------------------- //
// Los que puede ver cualquiera que inscribe.
const basicos = {
  // Paso "Identificación"
  retiro: obligatorio("Elige el retiro."),
  // Sale del retiro (o de la persona ya registrada); no se muestra.
  parroquia: obligatorio("Elige el retiro para saber la parroquia."),
  estado: obligatorio("Elige el estado de la inscripción."),
  tipo_documento: obligatorio("Elige el tipo de documento."),
  documento: obligatorio("Escribe el número de documento."),
  padrino: texto,
  // Paso "Datos personales"
  nombre: obligatorio("Escribe los nombres y apellidos.").refine(
    (v) => v.split(/\s+/).length >= 2,
    "Escribe nombres y apellidos.",
  ),
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
  // Persona.telefono es el celular, el teléfono principal.
  telefono: obligatorio("Escribe el celular.").pipe(celular),
  email: correo,
  pais: obligatorio("Elige el país."),
  // El estado geográfico (Persona.estado); "estado" es el de la inscripción.
  entidad: texto,
  ciudad: texto,
  // Paso "Confirmar"
  notas: texto,
  consentimiento_datos: casilla.refine(
    (v) => v,
    "Hace falta la autorización para guardar sus datos.",
  ),
};

// Confidenciales: solo para los roles que ven datos sensibles (si no, la API
// los descarta, así que tampoco se piden).
const sensibles = {
  // Datos personales
  telefono_casa: fijo,
  direccion: texto,
  ocupacion: texto,
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
  const falta = (path: Campo, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

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
  // En un país con estados cargados (Venezuela) se pide estado y ciudad.
  if (v.pais && conEstados(v.pais)) {
    if (!v.entidad) falta("entidad", "Elige el estado.");
    else if (!v.ciudad) falta("ciudad", "Elige la ciudad.");
  }
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
  retiro: "Retiro",
  parroquia: "Parroquia",
  estado: "Estado de la inscripción",
  tipo_documento: "Tipo de documento",
  documento: "Número de documento",
  padrino: "Quién lo invitó",
  nombre: "Nombres y apellidos",
  fecha_nacimiento: "Fecha de nacimiento",
  telefono: "Celular",
  email: "Correo",
  pais: "País",
  entidad: "Estado",
  ciudad: "Ciudad",
  telefono_casa: "Teléfono de casa",
  direccion: "Sector / urbanización / dirección",
  ocupacion: "Ocupación",
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
  campos: Campo[]; // los que se validan al pasar al siguiente
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
    campos: [
      "nombre",
      "fecha_nacimiento",
      "telefono",
      "telefono_casa",
      "email",
      "pais",
      "entidad",
      "ciudad",
      "direccion",
      "ocupacion",
    ],
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
// Claves de Persona.datos_sensibles, Inscripcion.salud_alimentacion y
// Inscripcion.contacto_emergencia (ver retiros/api/modulos.py).
const DATOS_SENSIBLES = [
  "telefono_casa",
  "direccion",
  "ocupacion",
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
  const valores = Object.fromEntries(
    Object.keys(esquemaCompleto.shape).map((c) => [
      c,
      BOOLEANOS.has(c) ? false : "",
    ]),
  ) as Valores;
  return {
    ...valores,
    retiro: retiro ?? "",
    estado: "solicitada",
    tipo_documento: "V",
    pais,
  };
}

const comoTexto = (valor: unknown) =>
  valor === undefined || valor === null ? "" : String(valor);

// "04141234567" o "0414 123 4567" -> "0414-1234567".
function normalizarCelular(valor: unknown): string {
  const texto = comoTexto(valor).trim();
  const ve = /^(04\d{2})[\s-]*(\d{3})[\s-]*(\d{4})$/.exec(texto);
  return ve ? `${ve[1]}-${ve[2]}${ve[3]}` : texto;
}

// Los datos de una persona ya registrada, para no volver a escribirlos.
export function datosDePersona(persona: Registro): Partial<Valores> {
  const datos = (persona.datos_sensibles ?? {}) as Record<string, unknown>;
  const valores: Record<string, unknown> = {
    tipo_documento: persona.tipo_documento || "V",
    documento: comoTexto(persona.documento),
    nombre: comoTexto(persona.nombre),
    fecha_nacimiento: comoTexto(persona.fecha_nacimiento),
    telefono: normalizarCelular(persona.telefono),
    email: comoTexto(persona.email),
    parroquia: comoTexto(persona.parroquia),
    entidad: comoTexto(persona.estado),
    ciudad: comoTexto(persona.ciudad),
  };
  // Sin país registrado se conserva el que ya tenía el formulario (Venezuela).
  if (persona.pais) valores.pais = persona.pais;
  for (const clave of DATOS_SENSIBLES) {
    valores[clave] = BOOLEANOS.has(clave)
      ? Boolean(datos[clave])
      : clave === "pareja_celular"
        ? normalizarCelular(datos[clave])
        : comoTexto(datos[clave]);
  }
  return valores as Partial<Valores>;
}

// Un objeto JSON sin los vacíos, sobre lo que ya tenía (para no borrar datos
// que este formulario no pide).
function json(
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

export function cuerpoPersona(
  v: Valores,
  conSensibles: boolean,
  anterior: Registro | null,
) {
  return {
    tipo_documento: v.tipo_documento,
    documento: normalizarDocumento(v.documento),
    nombre: v.nombre,
    parroquia: v.parroquia,
    fecha_nacimiento: v.fecha_nacimiento || null,
    telefono: v.telefono,
    email: v.email,
    pais: v.pais || null,
    estado: v.entidad || null,
    ciudad: v.ciudad || null,
    ...(conSensibles && {
      datos_sensibles: json(
        anterior?.datos_sensibles,
        DATOS_SENSIBLES.map((c) => [
          c,
          c === "hijos" && v.hijos !== "" ? Number(v.hijos) : v[c],
        ]),
      ),
    }),
  };
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

// Errores de la API ({campo: ["mensaje"]}) -> campo del formulario. `de`
// dice si vienen de guardar la persona o la inscripción.
export function campoDeError(
  clave: string,
  de: "persona" | "inscripcion",
): Campo | null {
  if (de === "persona" && clave === "estado") return "entidad";
  if (clave === "datos_sensibles") return "direccion";
  if (clave === "salud_alimentacion") return "talla_camiseta";
  if (clave === "contacto_emergencia") return "contacto_nombre";
  if (clave === "persona") return "documento";
  return clave in esquemaCompleto.shape ? (clave as Campo) : null;
}
