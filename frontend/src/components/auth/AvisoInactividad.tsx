import {
  api,
  marcarActividad,
  ultimaActividad,
  ultimaEnServidor,
} from "@/api/client";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext";
import { TimeIcon } from "@/icons";
import { useCallback, useEffect, useRef, useState } from "react";

// Cuánto antes del cierre aparece el aviso.
const AVISO_MS = 2 * 60_000;
// El servidor guarda la actividad a lo sumo cada 30 s (retiros/seguridad.py):
// se cierra aquí 30 s antes para no llegar después que él.
const MARGEN_MS = 30_000;
// Si el usuario trabaja sin hacer peticiones (llenando un formulario largo),
// se le avisa al servidor a lo sumo una vez por minuto que sigue ahí.
const LATIDO_MS = 60_000;
// Mover el ratón dispara muchos eventos: se anota uno cada 5 s.
const ANOTAR_CADA_MS = 5_000;
const EVENTOS = [
  "mousemove",
  "mousedown",
  "keydown",
  "wheel",
  "scroll",
  "touchstart",
] as const;

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Cierra la sesión tras `inactividad_minutos` sin actividad y, 2 minutos
// antes, pregunta si se quiere seguir conectado. Cuenta desde la última
// petición que el servidor registró (así cierra a la misma hora que él), y la
// actividad de cualquier pestaña abierta cuenta para todas (localStorage).
export default function AvisoInactividad() {
  const { sesion, logout, cerrarPorInactividad } = useAuth();
  const minutos = sesion?.autenticado ? sesion.inactividad_minutos : 0;
  // Lo que falta para el cierre mientras se muestra el aviso; null: sin aviso.
  const [restante, setRestante] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const avisando = useRef(false);
  const cerrando = useRef(false);
  const latiendo = useRef(false);

  useEffect(() => {
    if (!minutos) return;
    const limite = minutos * 60_000 - MARGEN_MS;
    marcarActividad(); // abrir la app ya es actividad
    let anotada = 0;

    const actividad = () => {
      // Con el aviso a la vista solo cuentan sus botones.
      if (avisando.current) return;
      const ahora = Date.now();
      if (ahora - anotada < ANOTAR_CADA_MS) return;
      anotada = ahora;
      marcarActividad();
    };

    const revisar = () => {
      if (cerrando.current) return;
      if (
        !avisando.current &&
        !latiendo.current &&
        ultimaActividad() - ultimaEnServidor() >= LATIDO_MS
      ) {
        latiendo.current = true;
        api("/auth/actividad/", { method: "POST" })
          .catch(() => undefined)
          .finally(() => (latiendo.current = false));
      }
      const falta = ultimaEnServidor() + limite - Date.now();
      if (falta <= 0) {
        cerrando.current = true;
        avisando.current = false;
        setRestante(null);
        cerrarPorInactividad();
      } else if (falta <= AVISO_MS) {
        avisando.current = true;
        setRestante(falta);
      } else if (avisando.current) {
        // Siguió conectado en otra pestaña.
        avisando.current = false;
        setRestante(null);
      }
    };

    EVENTOS.forEach((e) =>
      window.addEventListener(e, actividad, { passive: true, capture: true }),
    );
    // Otra pestaña anotó actividad o una petición: se revisa en el acto.
    window.addEventListener("storage", revisar);
    document.addEventListener("visibilitychange", revisar);
    const intervalo = setInterval(revisar, 1000);
    return () => {
      EVENTOS.forEach((e) =>
        window.removeEventListener(e, actividad, { capture: true }),
      );
      window.removeEventListener("storage", revisar);
      document.removeEventListener("visibilitychange", revisar);
      clearInterval(intervalo);
    };
  }, [minutos, cerrarPorInactividad]);

  const seguir = useCallback(async () => {
    setEnviando(true);
    try {
      // Renueva la sesión en el servidor (y anota la petición).
      await api("/auth/actividad/", { method: "POST" });
      marcarActividad();
      avisando.current = false;
      setRestante(null);
    } catch {
      // 401: ya venció; AuthContext lleva a iniciar sesión.
    } finally {
      setEnviando(false);
    }
  }, []);

  const salir = useCallback(() => {
    cerrando.current = true;
    setRestante(null);
    logout();
  }, [logout]);

  if (restante === null) return null;

  return (
    <Modal
      isOpen
      onClose={seguir}
      showCloseButton={false}
      className="m-4 max-w-md"
    >
      <div
        role="alertdialog"
        aria-labelledby="aviso-inactividad"
        className="p-6"
      >
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400">
          <TimeIcon className="size-6" aria-hidden="true" />
        </div>
        <h3
          id="aviso-inactividad"
          className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90"
        >
          ¿Sigues ahí?
        </h3>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          Por seguridad, tu sesión se cerrará en{" "}
          <span className="font-semibold text-gray-800 tabular-nums dark:text-white/90">
            {mmss(restante)}
          </span>{" "}
          por inactividad. Lo que no hayas guardado se perderá.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button size="sm" variant="outline" onClick={salir}>
            Cerrar sesión
          </Button>
          <Button size="sm" onClick={seguir} disabled={enviando}>
            Seguir conectado
          </Button>
        </div>
      </div>
    </Modal>
  );
}
