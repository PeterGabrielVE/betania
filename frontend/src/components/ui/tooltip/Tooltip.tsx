import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Texto corto sobre un control al pasar el mouse o al llegar con el teclado;
// los lectores de pantalla lo leen como su descripción. Se dibuja en el
// <body> (posición fija) para que no lo recorte una tabla con desplazamiento,
// y si no cabe arriba va debajo.
export default function Tooltip({
  texto,
  children,
}: {
  texto: string;
  // Recibe el id para enlazarlo con aria-describedby.
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{
    x: number;
    y: number;
    abajo: boolean;
  } | null>(null);

  const mostrar = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const abajo = r.top < 44;
    setPos({ x: r.left + r.width / 2, y: abajo ? r.bottom : r.top, abajo });
  };
  const ocultar = () => setPos(null);

  // Al desplazar la página el tooltip quedaría fuera de su sitio.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", ocultar, true);
    return () => window.removeEventListener("scroll", ocultar, true);
  }, [pos]);

  return (
    <span
      ref={ref}
      className="inline-flex"
      onMouseEnter={mostrar}
      onMouseLeave={ocultar}
      onFocus={mostrar}
      onBlur={ocultar}
    >
      {children(id)}
      {createPortal(
        <span
          id={id}
          role="tooltip"
          style={
            pos ? { left: pos.x, top: pos.y } : { left: -9999, top: -9999 }
          }
          className={`pointer-events-none fixed z-[100000] -translate-x-1/2 rounded-md bg-gray-900 px-2.5 py-1.5 text-theme-xs font-medium whitespace-nowrap text-white shadow-theme-md transition-opacity dark:bg-gray-700 ${
            pos?.abajo ? "mt-2" : "-mt-2 -translate-y-full"
          } ${pos ? "opacity-100" : "opacity-0"}`}
        >
          {texto}
        </span>,
        document.body,
      )}
    </span>
  );
}
