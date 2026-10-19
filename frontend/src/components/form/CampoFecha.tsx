import { CalenderIcon } from "@/icons";
import { cn } from "@/utils";
import { aFechaISO, fecha } from "@/utils/formato";
import { useEffect, useRef, useState } from "react";

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "min" | "max"
> & {
  value: string; // "2026-03-14" o "" (lo que va y viene de la API)
  onChange: (iso: string) => void;
  min?: string; // "aaaa-mm-dd"
  max?: string;
};

// "14032026" mientras se escribe -> "14/03/2026": las barras se ponen solas.
function conBarras(texto: string): string {
  // Pegada o escrita con separadores ("1/3/2026", "2026-03-14"): tal cual.
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return fecha(texto);
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(texto)) {
    const iso = aFechaISO(texto);
    return iso ? fecha(iso) : texto;
  }
  const d = texto.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
}

// Campo de fecha que se ve siempre dd/mm/aaaa, en el celular y en la
// computadora (el <input type="date"> del navegador cambia de formato según
// su idioma: en uno en inglés sale mm/dd/aaaa). Se escribe con el teclado
// numérico o se elige en el calendario del sistema (el botón).
export default function CampoFecha({
  value,
  onChange,
  min,
  max,
  className,
  disabled,
  ...props
}: Props) {
  const [texto, setTexto] = useState(() => fecha(value).replace("—", ""));
  // Lo último que se avisó hacia afuera: si `value` cambia por otra razón
  // (se cargó el registro, se limpió el filtro), el texto se pone al día.
  const avisado = useRef(value);
  const campo = useRef<HTMLInputElement>(null);
  const calendario = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value !== avisado.current) {
      avisado.current = value;
      setTexto(value ? fecha(value) : "");
    }
  }, [value]);

  const avisar = (iso: string) => {
    if (iso !== avisado.current) {
      avisado.current = iso;
      onChange(iso);
    }
  };

  const escribir = (nuevo: string) => {
    const t = conBarras(nuevo);
    setTexto(t);
    const iso = aFechaISO(t);
    let mensaje = "";
    if (t && !iso) {
      mensaje =
        t.length === 10
          ? "Esa fecha no existe."
          : "Escribe la fecha como dd/mm/aaaa.";
    } else if (iso && min && iso < min) {
      mensaje = `La fecha no puede ser antes del ${fecha(min)}.`;
    } else if (iso && max && iso > max) {
      mensaje = `La fecha no puede ser después del ${fecha(max)}.`;
    }
    campo.current?.setCustomValidity(mensaje);
    avisar(iso);
  };

  const abrirCalendario = () => {
    const c = calendario.current;
    if (!c) return;
    try {
      c.showPicker();
    } catch {
      c.focus(); // navegadores sin showPicker
    }
  };

  return (
    <div className="relative">
      <input
        {...props}
        ref={campo}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        disabled={disabled}
        className={cn(className, "pe-11")}
        value={texto}
        onChange={(e) => escribir(e.target.value)}
      />
      {/* El calendario del sistema: invisible, debajo del botón, para que se
          abra pegado al campo. */}
      <input
        ref={calendario}
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        min={min}
        max={max}
        className="pointer-events-none absolute inset-e-0 bottom-0 h-full w-10 opacity-0"
        value={aFechaISO(texto)}
        onChange={(e) => escribir(e.target.value)}
      />
      <button
        type="button"
        onClick={abrirCalendario}
        disabled={disabled}
        className="absolute inset-e-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
        aria-label="Elegir en el calendario"
        title="Elegir en el calendario"
      >
        <CalenderIcon className="size-5" />
      </button>
    </div>
  );
}
