// Formulario para registrar un servidor en el equipo de un retiro: la persona
// (esquemaPersona.ts), cómo participa (servidor o coordinador general), en
// qué áreas sirve (y cuáles coordina) y sus familiares de contacto.
import type { Registro } from "@/api/client";
import { z } from "zod";
import {
  CAMPOS_CONTACTOS,
  camposContactos,
  cuerpoContactos,
  datosDeContactos,
  ETIQUETAS_CONTACTOS,
  reglasContactos,
  vaciosContactos,
} from "./contactos";
import type { Paso } from "./esquema";
import {
  camposPersona,
  camposPersonaSensibles,
  ETIQUETAS_PERSONA,
  obligatorio,
  texto,
  PASO_PERSONALES,
  reglasPersona,
  valoresPersona,
} from "./esquemaPersona";

// Turnos del fin de semana, camisas y tallas (los mismos de TURNOS_SERVICIO,
// CAMISAS_SERVICIO y TALLAS_CAMISA en retiros/models.py). Un turno se guarda
// como "viernes_manana".
export const DIAS_SERVICIO = [
  {
    dia: "viernes",
    etiqueta: "Viernes",
    turnos: [
      ["manana", "Mañana"],
      ["tarde", "Tarde"],
      ["noche", "Noche"],
    ],
  },
  {
    dia: "sabado",
    etiqueta: "Sábado",
    turnos: [
      ["manana", "Mañana"],
      ["tarde", "Tarde"],
      ["noche", "Noche"],
    ],
  },
  {
    dia: "domingo",
    etiqueta: "Domingo",
    turnos: [
      ["manana", "Mañana"],
      ["tarde", "Tarde"],
    ],
  },
];
export const CAMISAS = [
  { valor: "azul", etiqueta: "Azul de servicio" },
  { valor: "blanca", etiqueta: "Blanca de servicio" },
  { valor: "polo", etiqueta: "Polo de la Rosa" },
];
export const TALLAS_CAMISA = [
  { valor: "S", etiqueta: "Pequeña" },
  { valor: "M", etiqueta: "Mediana" },
  { valor: "L", etiqueta: "Grande" },
  { valor: "XL", etiqueta: "X Grande" },
  { valor: "XXL", etiqueta: "XX Grande" },
  { valor: "XXXL", etiqueta: "XXX Grande" },
];

export const TIPOS_PARTICIPACION = [
  { valor: "servidor", etiqueta: "Servidor" },
  { valor: "coordinador", etiqueta: "Coordinador general" },
];

const basicos = {
  ...camposPersona,
  retiro: obligatorio("Elige el retiro."),
  tipo: obligatorio("Elige cómo participa."),
  // Va entre los caminantes como uno más (sale en sus listados).
  lider_oculto: z.boolean(),
  mesa: texto.max(10, "Máximo 10 caracteres."), // la del líder oculto
  areas: z.array(z.string()), // ids de AreaServicio
  coordina: z.array(z.string()), // las de `areas` que coordina
  // "si" o "no" (vacío: todavía no responde).
  duerme: z
    .string()
    .refine(
      (v) => ["si", "no"].includes(v),
      "Indica si dormirá en la casa de retiro.",
    ),
  cama: texto.max(10, "Máximo 10 caracteres."),
  turnos: z
    .array(z.string())
    .min(1, "Marca al menos un turno en que pueda servir."),
  camisas: z.array(z.string()),
  tallas: z.array(z.string()),
};

// Confidenciales: los contactos van en Participacion.contacto_emergencia.
const esquemaCompleto = z.object({
  ...basicos,
  ...camposPersonaSensibles,
  ...camposContactos(false),
});
export type ValoresServidor = z.infer<typeof esquemaCompleto>;

export function crearEsquemaServidor(
  conSensibles: boolean,
  conEstados: (pais: string) => boolean,
) {
  const base = conSensibles ? esquemaCompleto : z.object(basicos);
  return base.superRefine(
    (v, ctx) => {
      const falta = (path: string, message: string) =>
        ctx.addIssue({ code: "custom", path: [path], message });
      reglasPersona(v as Partial<ValoresServidor>, falta, conEstados);
      if (conSensibles) reglasContactos(v as Partial<ValoresServidor>, falta, false);
      // Un coordinador general puede no tener área; un servidor, al menos una.
      if (v.tipo === "servidor" && v.areas.length === 0) {
        falta("areas", "Elige al menos un área de servicio.");
      }
      if (v.camisas.length > 0 && v.tallas.length === 0) {
        falta("tallas", "Elige la talla de la camisa.");
      }
    },
    { when: (p) => typeof p.value === "object" && p.value !== null },
  ) as unknown as z.ZodType<ValoresServidor, ValoresServidor>;
}

export const ETIQUETAS_SERVIDOR: Record<keyof ValoresServidor, string> = {
  ...ETIQUETAS_PERSONA,
  ...ETIQUETAS_CONTACTOS,
  retiro: "Retiro",
  tipo: "Participa como",
  lider_oculto: "Líder oculto",
  mesa: "Número de mesa",
  areas: "Áreas de servicio",
  coordina: "Coordina",
  duerme: "Dormirá en la casa de retiro",
  cama: "Número de cama",
  turnos: "Turnos en que puede servir",
  camisas: "Camisas que necesita",
  tallas: "Tallas",
};

const PASOS: Paso[] = [
  {
    id: "identificacion",
    titulo: "Identificación",
    descripcion: "Retiro y documento de identidad.",
    campos: [
      "retiro",
      "parroquia",
      "tipo",
      "lider_oculto",
      "mesa",
      "tipo_documento",
      "documento",
    ],
  },
  {
    id: "personales",
    titulo: "Datos personales",
    descripcion: "Quién es, de dónde es y cómo localizarlo.",
    campos: PASO_PERSONALES,
  },
  {
    id: "servicio",
    titulo: "Servicio",
    descripcion: "En qué áreas sirve y cuáles coordina.",
    campos: ["areas", "coordina"],
  },
  {
    id: "disponibilidad",
    titulo: "Disponibilidad",
    descripcion: "Si duerme en la casa, cuándo puede servir y su camisa.",
    campos: ["duerme", "cama", "turnos", "camisas", "tallas"],
  },
  {
    id: "contactos",
    titulo: "Contactos",
    descripcion: "Familiares a quien llamar en una emergencia.",
    soloSensibles: true,
    campos: CAMPOS_CONTACTOS,
  },
  {
    id: "confirmar",
    titulo: "Confirmar",
    descripcion: "Revisa los datos y regístralo.",
    campos: [],
  },
];

export function pasosServidor(conSensibles: boolean): Paso[] {
  return PASOS.filter((p) => conSensibles || !p.soloSensibles).map((p) => ({
    ...p,
    campos: conSensibles ? p.campos : p.campos.filter((c) => c in basicos),
  }));
}

export function valoresServidor(retiro?: string, pais = ""): ValoresServidor {
  return {
    ...valoresPersona(pais),
    ...vaciosContactos(),
    retiro: retiro ?? "",
    tipo: "servidor",
    lider_oculto: false,
    mesa: "",
    areas: [],
    coordina: [],
    duerme: "",
    cama: "",
    turnos: [],
    camisas: [],
    tallas: [],
  };
}

// Lo de disponibilidad para POST /participaciones/: cada lista como {clave: true}.
// Con `conSensibles`, también los contactos.
export function cuerpoDisponibilidad(v: ValoresServidor, conSensibles: boolean) {
  const marcadas = (claves: string[]) =>
    Object.fromEntries(claves.map((c) => [c, true]));
  return {
    lider_oculto: v.lider_oculto,
    // Solo el líder oculto come en una mesa de caminantes.
    mesa: v.lider_oculto ? v.mesa : "",
    duerme_en_casa: v.duerme === "si",
    // Quien no duerme en la casa no tiene cama.
    cama: v.duerme === "si" ? v.cama : "",
    disponibilidad: marcadas(v.turnos),
    camisas: marcadas(v.camisas),
    tallas_camisa: marcadas(v.tallas),
    ...(conSensibles && { contacto_emergencia: cuerpoContactos(v) }),
  };
}

// "Vie: mañana, tarde · Sáb: todo el día" (como Participacion.resumen_turnos).
export function resumenTurnos(turnos: string[]): string {
  return DIAS_SERVICIO.map((d) => {
    const elegidos = d.turnos.filter(([t]) => turnos.includes(`${d.dia}_${t}`));
    if (elegidos.length === 0) return "";
    const todo = elegidos.length === d.turnos.length;
    return `${d.etiqueta}: ${
      todo ? "todo el día" : elegidos.map(([, e]) => e.toLowerCase()).join(", ")
    }`;
  })
    .filter(Boolean)
    .join(" · ");
}

// Un servidor ya registrado (su participación y sus áreas), para editarlo.
export function datosDeParticipacion(
  p: Registro,
  servicios: Registro[],
): Partial<ValoresServidor> {
  const marcadas = (valor: unknown) =>
    Object.entries((valor ?? {}) as Record<string, unknown>)
      .filter(([, v]) => v)
      .map(([clave]) => clave);
  return {
    retiro: String(p.retiro),
    tipo: String(p.tipo),
    lider_oculto: Boolean(p.lider_oculto),
    mesa: String(p.mesa ?? ""),
    duerme:
      p.duerme_en_casa === true ? "si" : p.duerme_en_casa === false ? "no" : "",
    cama: String(p.cama ?? ""),
    turnos: marcadas(p.disponibilidad),
    camisas: marcadas(p.camisas),
    tallas: marcadas(p.tallas_camisa),
    // Sin permiso para verlos no llegan (y tampoco se piden).
    ...(p.contacto_emergencia !== undefined &&
      datosDeContactos(p.contacto_emergencia)),
    areas: servicios.map((s) => String(s.area)),
    coordina: servicios
      .filter((s) => s.es_coordinador)
      .map((s) => String(s.area)),
  };
}

// Errores de /participaciones/ -> campo del formulario.
export function campoDeParticipacion(clave: string): string | null {
  if (clave === "persona") return "documento";
  return clave === "retiro" || clave === "tipo" ? clave : null;
}
