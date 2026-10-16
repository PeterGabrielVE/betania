// Qué puede registrar el usuario: un caminante (con su inscripción), un
// servidor (con sus áreas) o solo la persona.
export function opcionesNuevaPersona(
  modulos: { slug: string; puede_agregar: boolean }[],
) {
  const puede = (...slugs: string[]) =>
    slugs.every((s) => modulos.find((m) => m.slug === s)?.puede_agregar);
  return {
    caminante: puede("personas", "inscripciones"),
    servidor: puede("personas", "participaciones", "servicios"),
  };
}
