// Formulario para registrar un servidor en el equipo de un retiro: la persona
// (esquemaPersona.ts), cómo participa (servidor o coordinador general) y en
// qué áreas sirve (y cuáles coordina).
import { z } from "zod";
import type { Paso } from "./esquema";
import {
  camposPersona,
  camposPersonaSensibles,
  ETIQUETAS_PERSONA,
  obligatorio,
  PASO_PERSONALES,
  reglasPersona,
  valoresPersona,
} from "./esquemaPersona";

export const TIPOS_PARTICIPACION = [
  { valor: "servidor", etiqueta: "Servidor" },
  { valor: "coordinador", etiqueta: "Coordinador general" },
];

const basicos = {
  ...camposPersona,
  retiro: obligatorio("Elige el retiro."),
  tipo: obligatorio("Elige cómo participa."),
  areas: z.array(z.string()), // ids de AreaServicio
  coordina: z.array(z.string()), // las de `areas` que coordina
};

const esquemaCompleto = z.object({ ...basicos, ...camposPersonaSensibles });
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
      // Un coordinador general puede no tener área; un servidor, al menos una.
      if (v.tipo === "servidor" && v.areas.length === 0) {
        falta("areas", "Elige al menos un área de servicio.");
      }
    },
    { when: (p) => typeof p.value === "object" && p.value !== null },
  ) as unknown as z.ZodType<ValoresServidor, ValoresServidor>;
}

export const ETIQUETAS_SERVIDOR: Record<keyof ValoresServidor, string> = {
  ...ETIQUETAS_PERSONA,
  retiro: "Retiro",
  tipo: "Participa como",
  areas: "Áreas de servicio",
  coordina: "Coordina",
};

const PASOS: Paso[] = [
  {
    id: "identificacion",
    titulo: "Identificación",
    descripcion: "Retiro y documento de identidad.",
    campos: ["retiro", "parroquia", "tipo", "tipo_documento", "documento"],
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
    id: "confirmar",
    titulo: "Confirmar",
    descripcion: "Revisa los datos y regístralo.",
    campos: [],
  },
];

export function pasosServidor(conSensibles: boolean): Paso[] {
  return PASOS.map((p) => ({
    ...p,
    campos: conSensibles ? p.campos : p.campos.filter((c) => c in basicos),
  }));
}

export function valoresServidor(retiro?: string, pais = ""): ValoresServidor {
  return {
    ...valoresPersona(pais),
    retiro: retiro ?? "",
    tipo: "servidor",
    areas: [],
    coordina: [],
  };
}

// Errores de /participaciones/ -> campo del formulario.
export function campoDeParticipacion(clave: string): string | null {
  if (clave === "persona") return "documento";
  return clave === "retiro" || clave === "tipo" ? clave : null;
}
