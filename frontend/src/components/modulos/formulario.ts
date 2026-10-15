import type { Campo, Modulo, Registro } from "@/api/client";

// Un control del formulario: un campo del modelo o un dato dentro de un campo
// JSON (Campo.subcampos), que se pide por separado y se guarda en ese JSON.
export type Entrada = Campo & {
  clave: string; // "nombre" o "datos_sensibles.celular"
  json?: string; // campo JSON al que pertenece
};

export type Valores = Record<string, unknown>;

export type EstadoFormulario = {
  valores: Valores; // por Entrada.clave
  etiquetas: Record<string, string>; // texto visible de cada relación elegida
};

export function entradasDe(modulo: Modulo, omitir: string[] = []): Entrada[] {
  return modulo.campos
    .filter((campo) => !omitir.includes(campo.nombre))
    .flatMap((campo): Entrada[] =>
      campo.subcampos
        ? campo.subcampos.map((sub) => ({
            ...sub,
            clave: `${campo.nombre}.${sub.nombre}`,
            json: campo.nombre,
          }))
        : [{ ...campo, clave: campo.nombre }],
    );
}

// Agrupa las entradas por sección, en el orden en que aparece cada sección.
export function seccionesDe(entradas: Entrada[]): [string, Entrada[]][] {
  const grupos = new Map<string, Entrada[]>();
  for (const entrada of entradas) {
    const seccion = entrada.seccion ?? "";
    grupos.set(seccion, [...(grupos.get(seccion) ?? []), entrada]);
  }
  return [...grupos];
}

function valorInicial(entrada: Entrada, registro: Registro | null): unknown {
  const porDefecto = entrada.fijo ?? entrada.predeterminado;
  if (!registro && porDefecto) return porDefecto.valor;
  const valor = entrada.json
    ? (registro?.[entrada.json] as Valores | undefined)?.[entrada.nombre]
    : registro?.[entrada.nombre];
  if (entrada.tipo === "json") {
    return valor && Object.keys(valor as object).length
      ? JSON.stringify(valor, null, 2)
      : "";
  }
  if (entrada.tipo === "bool") return Boolean(valor);
  return valor ?? "";
}

export function estadoInicial(
  modulo: Modulo,
  registro: Registro | null,
): EstadoFormulario {
  const entradas = entradasDe(modulo);
  return {
    valores: Object.fromEntries(
      entradas.map((e) => [e.clave, valorInicial(e, registro)]),
    ),
    etiquetas: Object.fromEntries(
      entradas
        .filter((e) => e.tipo === "fk")
        .map((e) => [
          e.clave,
          !registro && (e.fijo ?? e.predeterminado)
            ? (e.fijo ?? e.predeterminado)!.etiqueta
            : ((registro?.[`${e.nombre}_etiqueta`] as string) ?? ""),
        ]),
    ),
  };
}

// Convierte lo que hay en un control a lo que espera la API.
function paraEnviar(entrada: Entrada, valor: unknown): unknown {
  switch (entrada.tipo) {
    case "json":
      return valor ? JSON.parse(valor as string) : {};
    case "fk":
    case "fecha":
    case "cifra":
      return valor === "" ? null : valor;
    case "opcion":
    case "numero":
    case "decimal":
      // Vacío = no se envía, y el servidor aplica el predeterminado del modelo.
      return valor === "" ? undefined : valor;
    default:
      return valor;
  }
}

// Arma el cuerpo de la petición. `registro` es el que se edita (o null): de
// ahí se conservan los datos de cada JSON que el formulario no muestra.
export function cuerpoDe(
  modulo: Modulo,
  valores: Valores,
  registro: Registro | null,
  omitir: string[] = [],
): { cuerpo: Valores; errores: Record<string, string[]> } {
  const cuerpo: Valores = {};
  const errores: Record<string, string[]> = {};

  for (const entrada of entradasDe(modulo, omitir)) {
    const valor = valores[entrada.clave];
    if (entrada.json) {
      const objeto = (cuerpo[entrada.json] ??= {
        ...(registro?.[entrada.json] as Valores | undefined),
      }) as Valores;
      if (valor === "" || valor === false) {
        delete objeto[entrada.nombre];
      } else {
        objeto[entrada.nombre] = valor;
      }
      continue;
    }
    try {
      cuerpo[entrada.clave] = paraEnviar(entrada, valor);
    } catch {
      errores[entrada.clave] = ["No es JSON válido."];
    }
  }
  return { cuerpo, errores };
}
