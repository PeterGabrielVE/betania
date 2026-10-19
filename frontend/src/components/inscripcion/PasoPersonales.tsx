// Paso "Datos personales": quién es, cómo localizarlo y de dónde es. Igual
// para caminantes y servidores.
import FotoPerfil from "@/components/common/FotoPerfil";
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  AreaTexto,
  Celular,
  Fecha,
  Grupo,
  Opciones,
  Texto,
  Ubicacion,
  type Lugar,
} from "./Campos";
import { EDAD_MINIMA, ETIQUETAS_PERSONA as E, SEXOS } from "./esquemaPersona";
import type { FotoDelRegistro } from "./useRegistroPersona";

export default function PasoPersonales({
  sensibles,
  paises,
  foto,
  sexoSugerido,
}: {
  sensibles: boolean; // si puede ver (y pedir) los datos confidenciales
  paises: Lugar[];
  foto: FotoDelRegistro; // la foto de perfil (se guarda con la persona)
  // En un retiro de hombres "M", de mujeres "F": se pone si no está indicado.
  sexoSugerido?: string;
}) {
  const { getValues, setValue } = useFormContext();
  const [sexo, primerNombre, primerApellido] = useWatch({
    name: ["sexo", "primer_nombre", "primer_apellido"],
  }) as string[];
  useEffect(() => {
    if (sexoSugerido && !getValues("sexo")) {
      setValue("sexo", sexoSugerido, { shouldDirty: true });
    }
  }, [sexoSugerido, getValues, setValue]);
  return (
    <div className="space-y-6">
      <FotoPerfil
        actual={foto.actual}
        sexo={sexo}
        nombre={[primerNombre, primerApellido].filter(Boolean).join(" ")}
        cambio={foto.cambio}
        onCambio={foto.setCambio}
      />
      <Grupo titulo="Nombres y apellidos">
        <Texto nombre="primer_nombre" etiqueta={E.primer_nombre} obligatorio />
        <Texto nombre="segundo_nombre" etiqueta={E.segundo_nombre} />
        <Texto
          nombre="primer_apellido"
          etiqueta={E.primer_apellido}
          obligatorio
        />
        <Texto nombre="segundo_apellido" etiqueta={E.segundo_apellido} />
      </Grupo>
      <Grupo>
        <Fecha
          nombre="fecha_nacimiento"
          etiqueta={E.fecha_nacimiento}
          pasada
          obligatorio
          ayuda={`Desde ${EDAD_MINIMA} años.`}
        />
        <Opciones
          nombre="sexo"
          etiqueta={E.sexo}
          obligatorio
          opciones={SEXOS}
        />
        {sensibles && <Texto nombre="ocupacion" etiqueta={E.ocupacion} />}
      </Grupo>
      <Grupo titulo="Cómo localizarlo">
        <Celular nombre="telefono" etiqueta={E.telefono} obligatorio />
        {sensibles && (
          <Texto
            nombre="telefono_casa"
            etiqueta={E.telefono_casa}
            tipo="tel"
            placeholder="Ej.: 0212-1234567"
          />
        )}
        <Texto nombre="email" etiqueta={E.email} tipo="email" />
      </Grupo>
      <Grupo titulo="De dónde es">
        <Ubicacion paises={paises} />
        {sensibles && (
          <AreaTexto
            nombre="direccion"
            etiqueta={E.direccion}
            placeholder="Ej.: Urb. La Florida, calle 3, casa 12"
          />
        )}
      </Grupo>
    </div>
  );
}
