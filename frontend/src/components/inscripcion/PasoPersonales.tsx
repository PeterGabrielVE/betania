// Paso "Datos personales": quién es, cómo localizarlo y de dónde es. Igual
// para caminantes y servidores.
import {
  AreaTexto,
  Celular,
  Grupo,
  Texto,
  Ubicacion,
  type Lugar,
} from "./Campos";
import { EDAD_MINIMA, ETIQUETAS_PERSONA as E } from "./esquemaPersona";

export default function PasoPersonales({
  sensibles,
  paises,
}: {
  sensibles: boolean; // si puede ver (y pedir) los datos confidenciales
  paises: Lugar[];
}) {
  return (
    <div className="space-y-6">
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
        <Texto
          nombre="fecha_nacimiento"
          etiqueta={E.fecha_nacimiento}
          tipo="date"
          obligatorio
          ayuda={`Desde ${EDAD_MINIMA} años.`}
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
