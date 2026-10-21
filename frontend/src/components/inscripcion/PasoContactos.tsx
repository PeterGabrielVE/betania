// Los familiares de contacto (contactos.ts): el primero y, si hace falta, hasta
// cuatro más. Lo usan los formularios de caminante y de servidor.
import { claseEnlace } from "@/components/modulos/estilos";
import { PlusIcon, TrashBinIcon } from "@/icons";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Celular, Grupo, RelacionFamiliar, Texto } from "./Campos";
import { ETIQUETAS_CONTACTOS as E, OTROS_CONTACTOS } from "./contactos";
import { relacionesFamiliar, type Sexo } from "./esquema";

const DATOS = ["nombre", "relacion", "telefono"] as const;

// Para ofrecer "Esposa" o "Esposo": el sexo indicado en los datos personales
// o, si no, `sexo` (el del tipo de retiro); sin saberlo, ambos.
// `obligatorio`: si hay que dar al menos el primero (caminantes).
export default function PasoContactos({
  sexo,
  obligatorio = true,
}: {
  sexo?: Sexo;
  obligatorio?: boolean;
}) {
  const { setValue, clearErrors } = useFormContext();
  const indicado = useWatch({ name: "sexo" }) as string | undefined;
  const grupos = relacionesFamiliar(
    indicado === "M" ? "hombre" : indicado === "F" ? "mujer" : sexo,
  );
  const otros = useWatch({
    name: OTROS_CONTACTOS.flatMap((n) =>
      DATOS.map((d) => `contacto${n}_${d}`),
    ),
  }) as string[];
  // Cuántos familiares se ven: los que tienen datos y los que se agregaron.
  const conDatos = OTROS_CONTACTOS.reduce(
    (ultimo, n, i) =>
      otros.slice(i * DATOS.length, (i + 1) * DATOS.length).some(Boolean)
        ? n
        : ultimo,
    1,
  );
  const [agregados, setAgregados] = useState(1);
  const visibles = Math.max(agregados, conDatos);

  const quitar = (n: number) => {
    const campos = DATOS.map((d) => `contacto${n}_${d}`);
    for (const c of campos) setValue(c, "", { shouldDirty: true });
    clearErrors(campos);
    setAgregados(n - 1);
  };

  return (
    <div className="space-y-6">
      <Grupo
        titulo={obligatorio ? "Persona a quien llamar" : "Persona a quien llamar (opcional)"}
      >
        <Texto
          nombre="contacto_nombre"
          etiqueta={E.contacto_nombre}
          obligatorio={obligatorio}
        />
        <RelacionFamiliar
          nombre="contacto_relacion"
          etiqueta={E.contacto_relacion}
          obligatorio={obligatorio}
          grupos={grupos}
        />
        <Celular
          nombre="contacto_celular"
          etiqueta={E.contacto_celular}
          obligatorio={obligatorio}
          ayuda="Celular o teléfono de casa: al menos uno."
        />
        <Texto
          nombre="contacto_telefono"
          etiqueta={E.contacto_telefono}
          tipo="tel"
          placeholder="Ej.: 0212-1234567"
        />
        <Texto
          nombre="contacto_correo"
          etiqueta={E.contacto_correo}
          tipo="email"
          ancho
        />
      </Grupo>
      {OTROS_CONTACTOS.filter((n) => n <= visibles).map((n) => (
        <div key={n} className="space-y-3">
          <Grupo titulo={`Familiar ${n} (opcional)`}>
            <Texto nombre={`contacto${n}_nombre`} etiqueta="Nombre" />
            <RelacionFamiliar
              nombre={`contacto${n}_relacion`}
              etiqueta="Relación"
              grupos={grupos}
            />
            <Texto
              nombre={`contacto${n}_telefono`}
              etiqueta="Teléfono"
              tipo="tel"
            />
          </Grupo>
          {n === visibles && (
            <button
              type="button"
              onClick={() => quitar(n)}
              className="inline-flex items-center gap-1.5 text-theme-xs text-gray-500 hover:text-error-500 dark:text-gray-400"
            >
              <TrashBinIcon className="size-4" aria-hidden="true" />
              Quitar familiar {n}
            </button>
          )}
        </div>
      ))}
      {visibles < OTROS_CONTACTOS[OTROS_CONTACTOS.length - 1] ? (
        <button
          type="button"
          onClick={() => setAgregados(visibles + 1)}
          className={`inline-flex items-center gap-1.5 text-theme-sm font-medium ${claseEnlace}`}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          Agregar otro familiar
        </button>
      ) : (
        <p className="text-theme-xs text-gray-500 dark:text-gray-400">
          Ya están los cinco familiares de contacto que se pueden registrar.
        </p>
      )}
    </div>
  );
}
