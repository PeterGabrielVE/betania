import { api, type Pagina, type Registro } from "@/api/client";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useEffect, useRef, useState } from "react";
import { claseControl } from "./estilos";

interface SelectorRemotoProps {
  recurso: string; // slug del módulo donde se busca
  valor: string | null;
  etiqueta: string; // texto del valor actual
  onChange: (valor: string | null, etiqueta: string) => void;
  placeholder?: string;
  className?: string;
}

// Selector de una relación: busca en el listado del módulo mientras se escribe,
// así no hay que cargar miles de personas en un <select>.
export default function SelectorRemoto({
  recurso,
  valor,
  etiqueta,
  onChange,
  placeholder = "Buscar…",
  className = "w-full",
}: SelectorRemotoProps) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<{
    clave: string;
    filas: Registro[];
  }>({ clave: "", filas: [] });
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setAbierto(false));

  const clave = `/${recurso}/?search=${encodeURIComponent(texto)}`;

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    const espera = setTimeout(() => {
      api<Pagina<Registro>>(clave)
        .then((d) => vigente && setResultado({ clave, filas: d.results }))
        .catch(() => vigente && setResultado({ clave, filas: [] }));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [abierto, clave]);

  const cargando = resultado.clave !== clave;

  const elegir = (id: string | null, nombre: string) => {
    onChange(id, nombre);
    setAbierto(false);
    setTexto("");
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <div className="relative">
        <input
          type="text"
          value={abierto ? texto : etiqueta}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setAbierto(true)}
          placeholder={abierto && etiqueta ? etiqueta : placeholder}
          className={`${claseControl} w-full pe-9`}
        />
        {valor && (
          <button
            type="button"
            aria-label="Quitar"
            onClick={() => elegir(null, "")}
            className="absolute inset-e-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            ×
          </button>
        )}
      </div>
      {abierto && (
        <ul className="absolute z-40 mt-1 max-h-60 w-full min-w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark">
          {resultado.filas.map((fila) => (
            <li key={fila.id}>
              <button
                type="button"
                onClick={() => elegir(fila.id, fila.etiqueta)}
                className={`block w-full px-4 py-2 text-start hover:bg-gray-100 dark:hover:bg-white/5 ${
                  fila.id === valor
                    ? "font-medium text-brand-500"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {fila.etiqueta}
              </button>
            </li>
          ))}
          {resultado.filas.length === 0 && (
            <li className="px-4 py-2 text-gray-500 dark:text-gray-400">
              {cargando ? "Buscando…" : "Sin resultados"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
