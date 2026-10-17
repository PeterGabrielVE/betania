import { CamaraIcon, TrashBinIcon } from "@/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar";
import { FOTO_MAX_MB, problemaFoto, type CambioFoto } from "./fotos";

const claseBoton =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 focus:outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]";

// Elegir, tomar o quitar la foto de perfil en un formulario. No la sube:
// el formulario la guarda con guardarFoto() después de guardar a la persona.
export default function FotoPerfil({
  actual,
  sexo,
  nombre,
  cambio,
  onCambio,
}: {
  actual?: string | null; // la que ya tiene guardada
  sexo?: string;
  nombre?: string;
  cambio: CambioFoto;
  onCambio: (cambio: CambioFoto) => void;
}) {
  const elegir = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  // En celulares y tabletas se ofrece además abrir la cámara.
  const tactil = useMemo(
    () => window.matchMedia?.("(pointer: coarse)").matches ?? false,
    [],
  );
  const vista = useMemo(
    () => (cambio.archivo ? URL.createObjectURL(cambio.archivo) : null),
    [cambio.archivo],
  );
  useEffect(
    () => () => {
      if (vista) URL.revokeObjectURL(vista);
    },
    [vista],
  );

  const foto = vista ?? (cambio.quitar ? null : actual);
  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // para poder elegir la misma otra vez
    if (!archivo) return;
    const problema = problemaFoto(archivo);
    setError(problema ?? "");
    if (!problema) onCambio({ archivo });
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar foto={foto} sexo={sexo} nombre={nombre} tamano="lg" />
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={claseBoton}
            onClick={() => elegir.current?.click()}
          >
            {foto ? "Cambiar foto" : "Subir foto"}
          </button>
          {tactil && (
            <button
              type="button"
              className={claseBoton}
              onClick={() => camara.current?.click()}
            >
              <CamaraIcon className="size-4" aria-hidden="true" />
              Tomar foto
            </button>
          )}
          {foto && (
            <button
              type="button"
              className={`${claseBoton} text-error-600 dark:text-error-500`}
              onClick={() => {
                setError("");
                onCambio({ quitar: !!actual });
              }}
            >
              <TrashBinIcon className="size-4" aria-hidden="true" />
              Quitar
            </button>
          )}
        </div>
        <p
          className={`mt-1.5 text-theme-xs ${error ? "text-error-500" : "text-gray-500 dark:text-gray-400"}`}
          role={error ? "alert" : undefined}
        >
          {error ||
            (cambio.archivo
              ? "Se guardará con los demás datos."
              : `Opcional. JPG, PNG o WEBP de hasta ${FOTO_MAX_MB} MB; se recorta en cuadrado.`)}
        </p>
        <input
          ref={elegir}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={alElegir}
        />
        <input
          ref={camara}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={alElegir}
        />
      </div>
    </div>
  );
}
