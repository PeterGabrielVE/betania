import { descargar, type TablaDescarga } from "@/api/client";
import { FileExcelIcon, FilePdfIcon } from "@/icons";
import { useState } from "react";
import { claseBoton } from "./estilos";

type Formato = "xlsx" | "pdf";

const FORMATOS: {
  formato: Formato;
  texto: string;
  icono: React.ReactNode;
}[] = [
  {
    formato: "xlsx",
    texto: "Excel",
    icono: (
      <FileExcelIcon
        className="size-5 text-success-600 dark:text-success-500"
        aria-hidden="true"
      />
    ),
  },
  {
    formato: "pdf",
    texto: "PDF",
    icono: (
      <FilePdfIcon
        className="size-5 text-error-600 dark:text-error-500"
        aria-hidden="true"
      />
    ),
  },
];

// Descargar una tabla en Excel o PDF. `ruta`: la de un listado
// (/<modulo>/exportar/?…), que el servidor arma completo con sus filtros;
// `tabla`: una armada en el navegador (las del panel de un retiro).
export default function BotonesDescarga({
  ruta,
  tabla,
  className = "",
}: {
  ruta?: (formato: Formato) => string;
  tabla?: () => TablaDescarga;
  className?: string;
}) {
  const [enCurso, setEnCurso] = useState<Formato | null>(null);
  const [error, setError] = useState("");

  const bajar = async (formato: Formato) => {
    setEnCurso(formato);
    setError("");
    try {
      if (ruta) await descargar(ruta(formato));
      else if (tabla) await descargar("/exportar/", { ...tabla(), formato });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnCurso(null);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {FORMATOS.map(({ formato, texto, icono }) => (
        <button
          key={formato}
          type="button"
          className={`${claseBoton} inline-flex items-center gap-2`}
          disabled={enCurso !== null}
          onClick={() => bajar(formato)}
          title={`Descargar en ${texto}`}
        >
          {icono}
          {enCurso === formato ? "Preparando…" : texto}
        </button>
      ))}
      {error && (
        <span className="text-theme-xs text-error-500" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
