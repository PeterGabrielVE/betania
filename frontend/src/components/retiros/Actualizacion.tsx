import { claseBoton } from "@/components/modulos/estilos";
import { ACTUALIZAR_CADA_MS } from "@/hooks/useDatosVivos";

const formatoHora = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

// "Actualizado 3:15 p. m." + botón para actualizar ya (ver useDatosVivos).
export default function Actualizacion({
  hora,
  error,
  consultando,
  onActualizar,
}: {
  hora?: Date;
  error?: Error;
  consultando: boolean;
  onActualizar: () => void;
}) {
  return (
    <>
      <span
        className="text-xs text-gray-500 dark:text-gray-400"
        title={`Se actualiza solo cada ${ACTUALIZAR_CADA_MS / 1000} segundos`}
      >
        {error || !hora
          ? "No se pudo actualizar"
          : `Actualizado ${formatoHora.format(hora)}`}
      </span>
      <button
        type="button"
        className={claseBoton}
        onClick={onActualizar}
        disabled={consultando}
      >
        {consultando ? "Actualizando…" : "Actualizar"}
      </button>
    </>
  );
}
