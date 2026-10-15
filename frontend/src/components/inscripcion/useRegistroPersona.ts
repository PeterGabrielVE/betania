// Lo común a registrar un caminante o un servidor: países (Venezuela por
// defecto), la parroquia del retiro, buscar a la persona por su documento y
// avisar si ya está en ese retiro.
import { api, type Pagina, type Registro } from "@/api/client";
import { useEffect, useRef, useState } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import type { Lugar } from "./Campos";
import { datosDePersona, normalizarDocumento } from "./esquemaPersona";

export type Para = "caminante" | "servidor";

// Si la persona ya está en el retiro (inscrita o en el equipo), por qué no
// puede registrarse otra vez; null si puede.
export async function conflictoEnRetiro(
  persona: Registro,
  retiro: string,
  para: Para,
): Promise<string | null> {
  const buscar = (recurso: string) =>
    api<Pagina<Registro>>(
      `/${recurso}/?retiro=${retiro}&search=${encodeURIComponent(
        persona.nombre as string,
      )}&page_size=50`,
    ).then((d) => d.results.find((r) => r.persona === persona.id));

  const inscripcion = await buscar("inscripciones");
  if (inscripcion && inscripcion.estado !== "cancelada") {
    return para === "caminante"
      ? "Ya está inscrita en este retiro."
      : "Está inscrita como caminante en este retiro.";
  }
  const equipo = await buscar("participaciones");
  if (equipo) {
    return para === "servidor"
      ? "Ya está en el equipo de este retiro."
      : "Ya está en el equipo de este retiro: no puede inscribirse como caminante.";
  }
  return null;
}

export function useRegistroPersona<T extends FieldValues>(
  formulario: UseFormReturn<T>,
  {
    retiroInicial,
    personaInicial, // al llegar desde la ficha de una persona
    vaciar, // valores vacíos de los campos de la persona (al cambiar de persona)
    datosExtra = () => ({}), // lo que además se carga de una persona registrada
  }: {
    retiroInicial?: string;
    personaInicial?: string;
    vaciar: (pais: string) => Record<string, unknown>;
    datosExtra?: (persona: Registro) => Record<string, unknown>;
  },
) {
  // Nombres de campo dinámicos: este hook sirve a formularios distintos.
  const getValues = (campo: string) =>
    formulario.getValues(campo as never) as unknown as string;
  const setValue = (campo: string, valor: unknown, validar = false) =>
    formulario.setValue(campo as never, valor as never, {
      shouldDirty: true,
      shouldValidate: validar,
    });

  const [paises, setPaises] = useState<Lugar[]>([]);
  const [venezuela, setVenezuela] = useState("");
  // Persona ya guardada (encontrada por documento o nombre, o creada en un
  // intento anterior).
  const [persona, setPersona] = useState<Registro | null>(null);
  const personaElegida = useRef(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  // La parroquia de una persona nueva es la del retiro; la de una ya
  // registrada se conserva.
  const usarParroquiaDe = (retiro: string) =>
    api<Registro>(`/retiros/${retiro}/`)
      .then((r) => {
        if (!personaElegida.current) setValue("parroquia", r.parroquia, true);
      })
      .catch((e: Error) => setError(e.message));

  const elegirPersona = async (id: string | null) => {
    setError("");
    setAviso("");
    if (!id) {
      olvidarPersona();
      return;
    }
    try {
      const registro = await api<Registro>(`/personas/${id}/`);
      setPersona(registro);
      personaElegida.current = true;
      const valores = { ...datosDePersona(registro), ...datosExtra(registro) };
      for (const [campo, valor] of Object.entries(valores)) {
        setValue(campo, valor);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Otra persona: se borra lo que se había cargado de la anterior (menos
  // `conservar`, los campos del primer paso) para no mezclar sus datos.
  const olvidarPersona = (conservar: string[] = []) => {
    const habia = personaElegida.current;
    setPersona(null);
    personaElegida.current = false;
    if (habia) {
      for (const [campo, valor] of Object.entries(vaciar(venezuela))) {
        if (!conservar.includes(campo)) setValue(campo, valor);
      }
    }
    const retiro = getValues("retiro");
    if (retiro) usarParroquiaDe(retiro);
  };

  // Si ya hay alguien registrado con ese documento, se cargan sus datos en vez
  // de crear a otra persona. Devuelve la persona encontrada (o null).
  const buscarPorDocumento = async (
    conservar: string[],
  ): Promise<Registro | null> => {
    const tipo = getValues("tipo_documento");
    const numero = normalizarDocumento(getValues("documento") ?? "");
    if (!numero) return null;
    if (persona?.documento === numero && persona.tipo_documento === tipo) {
      return persona;
    }
    try {
      const { results } = await api<Pagina<Registro>>(
        `/personas/?search=${encodeURIComponent(numero)}&page_size=20`,
      );
      const encontrada = results.find(
        (p) => p.documento === numero && p.tipo_documento === tipo,
      );
      if (encontrada) {
        await elegirPersona(encontrada.id);
        setAviso(
          `Ya está registrada: ${encontrada.nombre}. Se cargaron sus datos; revísalos en los pasos siguientes.`,
        );
        return encontrada;
      }
      olvidarPersona(conservar);
      setAviso("Persona nueva: completa sus datos en los pasos siguientes.");
    } catch (e) {
      setError((e as Error).message);
    }
    return null;
  };

  // Al abrir la pantalla: la persona o el retiro con que se llegó, y los
  // países (Venezuela por defecto).
  useEffect(() => {
    if (personaInicial) {
      // Fuera del cuerpo del efecto: elegirPersona cambia estado.
      Promise.resolve()
        .then(() => elegirPersona(personaInicial))
        .then(() =>
          setAviso("Se cargaron sus datos; revísalos en los pasos siguientes."),
        );
    } else if (retiroInicial) {
      usarParroquiaDe(retiroInicial);
    }
    api<Pagina<Registro>>("/paises/?page_size=100")
      .then((d) => {
        setPaises(
          d.results.map((p) => ({ id: p.id, nombre: p.nombre as string })),
        );
        const ve = d.results.find((p) => p.codigo === "VE")?.id ?? "";
        setVenezuela(ve);
        if (!getValues("pais")) setValue("pais", ve);
      })
      .catch((e: Error) => setError(e.message));
    // Solo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    paises,
    venezuela,
    persona,
    setPersona,
    aviso,
    setAviso,
    error,
    setError,
    usarParroquiaDe,
    elegirPersona,
    olvidarPersona,
    buscarPorDocumento,
  };
}
