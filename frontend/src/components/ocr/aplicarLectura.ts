import type { Registro } from "@/api/client";
import type { FieldValues, UseFormReturn } from "react-hook-form";

const vacio = (v: unknown) =>
  v === undefined ||
  v === null ||
  v === "" ||
  (Array.isArray(v) && v.length === 0);

// Pone en el formulario lo elegido de una planilla leída. Si la cédula ya está
// registrada, primero se cargan los datos guardados de esa persona y la
// planilla solo completa lo que quede vacío. Devuelve cuántos campos llenó.
export async function aplicarLectura<T extends FieldValues>(
  formulario: UseFormReturn<T>,
  leidos: Record<string, unknown>,
  {
    buscarPorDocumento,
  }: {
    // Busca a la persona por el documento ya escrito en el formulario.
    buscarPorDocumento?: () => Promise<Registro | null>;
  } = {},
): Promise<{ llenados: number; registrada: boolean }> {
  // Nombres de campo dinámicos: sirve a los formularios de caminante y servidor.
  const leer = (c: string) => formulario.getValues(c as never) as unknown;
  const poner = (c: string, v: unknown) =>
    formulario.setValue(c as never, v as never, {
      shouldDirty: true,
      shouldValidate: false,
    });
  const valores = { ...leidos };
  const existentes = formulario.getValues() as Record<string, unknown>;
  let llenados = 0;

  // "Quién lo invitó" es una persona registrada: el nombre leído va al comentario.
  if (valores.padrino_nombre && "notas" in existentes) {
    const notas = String(leer("notas") ?? "");
    poner(
      "notas",
      [notas, `Invitado por: ${valores.padrino_nombre}`]
        .filter(Boolean)
        .join("\n"),
    );
    llenados++;
  }
  delete valores.padrino_nombre;

  let registrada = false;
  if (valores.documento && buscarPorDocumento) {
    poner("tipo_documento", valores.tipo_documento ?? "V");
    poner("documento", valores.documento);
    llenados++;
    registrada = !!(await buscarPorDocumento());
  }
  delete valores.documento;
  delete valores.tipo_documento;

  for (const [campo, valor] of Object.entries(valores)) {
    if (!(campo in existentes) || vacio(valor)) continue;
    // De una persona ya registrada se conserva lo guardado.
    if (registrada && !vacio(leer(campo))) continue;
    poner(campo, valor);
    llenados++;
  }
  return { llenados, registrada };
}
