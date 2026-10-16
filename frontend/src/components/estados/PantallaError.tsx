import { ApiError, SIN_CONEXION } from "@/api/client";
import GridShape from "@/components/common/GridShape";
import PageMeta from "@/components/common/PageMeta";
import { claseBoton, claseBotonPrincipal } from "@/components/modulos/estilos";
import { Link } from "react-router";

type Tipo =
  | "no_encontrado"
  | "sin_acceso"
  | "sin_sesion"
  | "sin_conexion"
  | "no_disponible"
  | "fallo";

const TEXTOS: Record<
  Tipo,
  { titulo: string; mensaje: string; imagen: string; reintentar: boolean }
> = {
  no_encontrado: {
    titulo: "No encontramos esta página",
    mensaje:
      "Puede que se haya movido, eliminado o que el enlace esté mal escrito.",
    imagen: "404",
    reintentar: false,
  },
  sin_acceso: {
    titulo: "No tienes acceso",
    mensaje:
      "Tu rol no permite ver esta sección. Si crees que es un error, pide acceso a la coordinación.",
    imagen: "404",
    reintentar: false,
  },
  sin_sesion: {
    titulo: "Tu sesión terminó",
    mensaje: "Vuelve a iniciar sesión para continuar.",
    imagen: "404",
    reintentar: false,
  },
  sin_conexion: {
    titulo: "Sin conexión",
    mensaje:
      "No pudimos comunicarnos con el sistema. Revisa tu conexión a internet e intenta de nuevo.",
    imagen: "503",
    reintentar: true,
  },
  no_disponible: {
    titulo: "Sistema no disponible",
    mensaje:
      "El sistema no responde en este momento. Intenta de nuevo en unos minutos; si sigue igual, avisa a quien administra Betania.",
    imagen: "500",
    reintentar: true,
  },
  fallo: {
    titulo: "Algo salió mal",
    mensaje:
      "Ocurrió un error inesperado en esta pantalla. Recarga la página para continuar.",
    imagen: "500",
    reintentar: true,
  },
};

function tipoDeError(error: unknown): Tipo {
  if (error instanceof ApiError) {
    if (error.status === 404) return "no_encontrado";
    if (error.status === 403) return "sin_acceso";
    if (error.status === 401) return "sin_sesion";
    if (error.status === SIN_CONEXION) return "sin_conexion";
    if (error.status >= 500) return "no_disponible";
  }
  return "fallo";
}

// Pantalla de error según qué pasó (404, sin acceso, sin conexión, sistema
// no disponible…). `completa`: ocupa toda la ventana (fuera del menú).
export default function PantallaError({
  error,
  tipo,
  onReintentar,
  completa = false,
}: {
  error?: unknown;
  tipo?: Tipo;
  onReintentar?: () => void;
  completa?: boolean;
}) {
  const clase = tipo ?? tipoDeError(error);
  const t = TEXTOS[clase];
  const codigo =
    error instanceof ApiError && error.status >= 400 ? error.status : null;
  // 502, 503 y 504 (el servidor caído o en mantenimiento): su ilustración.
  const imagen =
    clase === "no_disponible" && codigo && codigo !== 500 ? "503" : t.imagen;
  const reintentar = onReintentar ?? (() => window.location.reload());

  return (
    <>
      <PageMeta title={`${t.titulo} | Betania`} description={t.mensaje} />
      <div
        role={
          clase === "fallo" || clase === "no_disponible" ? "alert" : undefined
        }
        className={`relative z-1 flex flex-col items-center justify-center overflow-hidden px-6 text-center ${
          completa
            ? "min-h-screen bg-white dark:bg-gray-900"
            : "min-h-[65vh] py-10"
        }`}
      >
        {completa && <GridShape />}
        <img
          src={`/images/error/${imagen}.svg`}
          alt=""
          className="w-full max-w-72 dark:hidden"
        />
        <img
          src={`/images/error/${imagen}-dark.svg`}
          alt=""
          className="hidden w-full max-w-72 dark:block"
        />
        <h1 className="mt-8 text-title-sm font-bold text-gray-800 dark:text-white/90">
          {t.titulo}
        </h1>
        <p className="mt-3 max-w-md text-base text-gray-600 dark:text-gray-400">
          {t.mensaje}
        </p>
        {codigo && (
          <p className="mt-2 text-theme-xs text-gray-400">Código {codigo}</p>
        )}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {t.reintentar && (
            <button
              type="button"
              className={claseBotonPrincipal}
              onClick={reintentar}
            >
              Reintentar
            </button>
          )}
          {clase === "sin_sesion" ? (
            <Link to="/signin" className={claseBotonPrincipal}>
              Iniciar sesión
            </Link>
          ) : (
            <Link to="/" className={claseBoton}>
              Volver al inicio
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
