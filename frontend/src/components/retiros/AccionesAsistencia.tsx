import { claseBoton, claseControl } from "@/components/modulos/estilos";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";
import { ASISTENCIA, cambiarAsistencia, type Quien } from "./asistencia";

// Ventana corta para cancelar: el motivo es opcional.
export function DialogoCancelar({
  abierto,
  titulo,
  onCerrar,
  onConfirmar,
}: {
  abierto: boolean;
  titulo: string; // "Cancelar la asistencia de Ana Pérez"
  onCerrar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  return (
    <Modal isOpen={abierto} onClose={onCerrar} className="m-4 max-w-md">
      <div className="p-6">
        {/* pe-12: espacio para la X de cerrar. */}
        <h3 className="mb-1 pe-12 text-lg font-semibold text-gray-800 dark:text-white/90">
          {titulo}
        </h3>
        <p className="mb-4 pe-12 text-theme-sm text-gray-500 dark:text-gray-400">
          Queda en el historial y deja de contar en el retiro. Se puede
          reactivar después.
        </p>
        <label
          htmlFor="motivo-cancelacion"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
        >
          Motivo (opcional)
        </label>
        <input
          id="motivo-cancelacion"
          className={`${claseControl} w-full`}
          placeholder="Ej.: enfermedad, viaje, trabajo…"
          maxLength={200}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          autoFocus
        />
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={claseBoton} onClick={onCerrar}>
            Volver
          </button>
          <Button
            size="sm"
            disabled={enviando}
            className="bg-error-500 hover:bg-error-600"
            onClick={async () => {
              setEnviando(true);
              await onConfirmar(motivo.trim());
              setEnviando(false);
              setMotivo("");
            }}
          >
            {enviando ? "Guardando…" : "Cancelar asistencia"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const claseAccion =
  "rounded-md px-2 py-1 text-theme-xs font-medium transition-colors disabled:opacity-40";

// Confirmar / Cancelar / Reactivar la asistencia de un caminante o servidor,
// sin abrir su formulario. Solo con permiso para cambiarla.
export default function AccionesAsistencia({
  quien,
  id,
  nombre,
  estado,
  onCambio,
}: {
  quien: Quien;
  id: string; // de la inscripción o de la participación
  nombre: string;
  estado: string;
  onCambio: () => void; // ya guardado: recargar
}) {
  const { modulos } = useAuth();
  const [cancelando, setCancelando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const e = ASISTENCIA[quien];
  const puede = modulos.find((m) => m.slug === e.modulo)?.puede_cambiar;
  if (!puede) return null;

  const poner = async (nuevo: string, motivo = "") => {
    setGuardando(true);
    setError("");
    const fallidos = await cambiarAsistencia(quien, [id], nuevo, motivo);
    setGuardando(false);
    if (fallidos.length) setError(fallidos[0]);
    else onCambio();
  };

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {estado === e.cancelado ? (
        <button
          type="button"
          className={`${claseAccion} text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10`}
          disabled={guardando}
          onClick={() => poner(e.reactivado)}
        >
          Reactivar
        </button>
      ) : (
        <>
          {estado !== e.confirmado && (
            <button
              type="button"
              className={`${claseAccion} text-success-700 hover:bg-success-50 dark:text-success-400 dark:hover:bg-success-500/10`}
              disabled={guardando}
              onClick={() => poner(e.confirmado)}
            >
              Confirmar
            </button>
          )}
          <button
            type="button"
            className={`${claseAccion} text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/10`}
            disabled={guardando}
            onClick={() => setCancelando(true)}
          >
            Cancelar
          </button>
        </>
      )}
      {error && (
        <span className="text-theme-xs text-error-500" role="alert">
          {error}
        </span>
      )}
      <DialogoCancelar
        abierto={cancelando}
        titulo={`Cancelar la asistencia de ${nombre}`}
        onCerrar={() => setCancelando(false)}
        onConfirmar={async (motivo) => {
          await poner(e.cancelado, motivo);
          setCancelando(false);
        }}
      />
    </span>
  );
}
