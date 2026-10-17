// Foto de perfil de una persona (ver retiros/api/fotos.py): lo que se eligió
// en el formulario y cómo guardarlo cuando la persona ya tiene id.
import { api, subirArchivo } from "@/api/client";

export const FOTO_MAX_MB = 10;

// Sin cambios: {}; una foto nueva: { archivo }; quitarla: { quitar: true }.
export type CambioFoto = { archivo?: File; quitar?: boolean };

// Por qué no sirve el archivo elegido, o null.
export function problemaFoto(archivo: File): string | null {
  if (!archivo.type.startsWith("image/"))
    return "Elige una imagen (JPG, PNG o WEBP).";
  if (archivo.size > FOTO_MAX_MB * 1024 * 1024) {
    return `La foto pesa más de ${FOTO_MAX_MB} MB.`;
  }
  return null;
}

// Aplica el cambio a la persona. Devuelve la dirección de la foto (null si
// no tiene) o undefined si no había nada que hacer.
export async function guardarFoto(
  persona: string,
  cambio: CambioFoto,
): Promise<string | null | undefined> {
  const ruta = `/personas/${persona}/foto/`;
  if (cambio.archivo) {
    const datos = new FormData();
    datos.append("foto", cambio.archivo);
    return (await subirArchivo<{ foto: string }>(ruta, datos)).foto;
  }
  if (cambio.quitar) {
    await api(ruta, { method: "DELETE" });
    return null;
  }
  return undefined;
}
