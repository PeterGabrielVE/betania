// El marco de un formulario por pasos: pestañas, la tarjeta del paso actual,
// el error general y los botones Anterior / Siguiente / Guardar.
import {
  claseBoton,
  claseBotonPrincipal,
  claseTarjeta,
} from "@/components/modulos/estilos";
import Button from "@/components/ui/button/Button";
import BarraPasos from "./BarraPasos";
import type { Paso } from "./esquema";
import type { useAsistente } from "./useAsistente";

export default function Asistente({
  pasos,
  asistente,
  general,
  guardando,
  textoGuardar,
  onEmpezarDeNuevo,
  textoReiniciar = "Empezar de nuevo",
  onGuardarYa,
  children,
}: {
  pasos: Paso[];
  asistente: ReturnType<typeof useAsistente>;
  general: string; // error que no es de un campo
  guardando: boolean;
  textoGuardar: string;
  onEmpezarDeNuevo: () => void;
  textoReiniciar?: string; // al editar: "Cancelar"
  // Al editar: guardar desde cualquier paso, sin llegar al último.
  onGuardarYa?: () => void;
  children: React.ReactNode; // el contenido del paso actual
}) {
  const { actual, alcanzado, conErrores, tarjeta, ultimo, ir, irA } = asistente;
  const paso = pasos[actual];
  return (
    <>
      <BarraPasos
        pasos={pasos}
        actual={actual}
        alcanzado={alcanzado}
        conErrores={conErrores}
        onIr={ir}
      />

      <div ref={tarjeta} className={`${claseTarjeta} scroll-mt-24`}>
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {paso.titulo}
          </h3>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            {paso.descripcion} Los campos con{" "}
            <span className="text-error-500">*</span> son obligatorios.
          </p>
        </div>
        {children}
      </div>

      {general && (
        <p
          className="rounded-xl border border-error-500/30 bg-error-50 px-5 py-3 text-sm text-error-600 dark:bg-error-500/15 dark:text-error-500"
          role="alert"
        >
          {general}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={claseBoton} onClick={onEmpezarDeNuevo}>
          {textoReiniciar}
        </button>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={claseBoton}
            disabled={actual === 0}
            onClick={() => irA(actual - 1)}
          >
            Anterior
          </button>
          {/* Ambos envían el formulario: "Siguiente" valida y avanza. */}
          {ultimo ? (
            <Button size="sm" disabled={guardando}>
              {guardando ? "Guardando…" : textoGuardar}
            </Button>
          ) : (
            <>
              <Button size="sm" variant={onGuardarYa ? "outline" : "primary"}>
                Siguiente
              </Button>
              {onGuardarYa && (
                // type="button": no envía el formulario (eso es "Siguiente").
                <button
                  type="button"
                  className={claseBotonPrincipal}
                  disabled={guardando}
                  onClick={onGuardarYa}
                >
                  {guardando ? "Guardando…" : textoGuardar}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
