import Tooltip from "@/components/ui/tooltip/Tooltip";
import { CopiadoIcon, CopiarIcon, LlamarIcon, WhatsappIcon } from "@/icons";
import { copiar } from "@/utils/portapapeles";
import { enlaceLlamar, enlaceWhatsApp } from "@/utils/telefono";
import { useEffect, useState } from "react";

const claseAccion =
  "flex size-6 items-center justify-center rounded-md transition focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40";
const claseGris =
  "text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200";

// Que un clic en la acción no abra la fila o la tarjeta donde está.
const soloEsto = (e: React.MouseEvent) => e.stopPropagation();

// Un teléfono con sus acciones: copiarlo, llamar y escribir por WhatsApp
// (esta última solo en celulares; un fijo no tiene WhatsApp).
export default function Telefono({
  numero,
  className = "",
}: {
  numero: string;
  className?: string;
}) {
  const [estado, setEstado] = useState<"" | "copiado" | "error">("");

  useEffect(() => {
    if (!estado) return;
    const t = setTimeout(() => setEstado(""), 1800);
    return () => clearTimeout(t);
  }, [estado]);

  if (!numero) return null;
  const whatsapp = enlaceWhatsApp(numero);
  const textoCopiar =
    estado === "copiado"
      ? "¡Copiado!"
      : estado === "error"
        ? "No se pudo copiar"
        : "Copiar teléfono";

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}
    >
      <span>{numero}</span>
      <span className="inline-flex items-center">
        <Tooltip texto={textoCopiar}>
          {(id) => (
            <button
              type="button"
              aria-label={`Copiar ${numero}`}
              aria-describedby={id}
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setEstado((await copiar(numero)) ? "copiado" : "error");
              }}
              className={`${claseAccion} ${
                estado === "copiado"
                  ? "text-success-600 dark:text-success-500"
                  : claseGris
              }`}
            >
              {estado === "copiado" ? (
                <CopiadoIcon className="size-4" aria-hidden="true" />
              ) : (
                <CopiarIcon className="size-4" aria-hidden="true" />
              )}
            </button>
          )}
        </Tooltip>
        <Tooltip texto="Llamar">
          {(id) => (
            <a
              href={enlaceLlamar(numero)}
              aria-label={`Llamar al ${numero}`}
              aria-describedby={id}
              onClick={soloEsto}
              className={`${claseAccion} ${claseGris}`}
            >
              <LlamarIcon className="size-4" aria-hidden="true" />
            </a>
          )}
        </Tooltip>
        {whatsapp && (
          <Tooltip texto="Escribir por WhatsApp">
            {(id) => (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp al ${numero} (se abre en otra pestaña)`}
                aria-describedby={id}
                onClick={soloEsto}
                className={`${claseAccion} text-gray-400 hover:bg-success-50 hover:text-success-600 dark:hover:bg-success-500/10 dark:hover:text-success-500`}
              >
                <WhatsappIcon className="size-4" aria-hidden="true" />
              </a>
            )}
          </Tooltip>
        )}
      </span>
      {/* Para lectores de pantalla. */}
      <span className="sr-only" role="status">
        {estado === "copiado" ? `${numero} copiado` : ""}
      </span>
    </span>
  );
}
