import type { FiltroAvanzado } from "@/api/client";
import { CloseIcon } from "@/icons";
import { useEffect, useState } from "react";
import { claseBoton, claseBotonPrincipal, claseControl } from "./estilos";
import {
  parametros,
  resumenFiltros,
  type ValoresFiltros,
} from "./filtrosAvanzados";
import SelectorRemoto from "./SelectorRemoto";

const claseEtiqueta =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

function Control({
  f,
  valores,
  poner,
}: {
  f: FiltroAvanzado;
  valores: ValoresFiltros;
  poner: (cambios: ValoresFiltros) => void;
}) {
  const base = `f_${f.nombre}`;
  const id = `filtro-${f.nombre}`;
  if (f.tipo === "rango_numero" || f.tipo === "rango_fecha") {
    const [a, b] = parametros(f);
    const tipo = f.tipo === "rango_numero" ? "number" : "date";
    return (
      <fieldset>
        <legend className={claseEtiqueta}>{f.etiqueta}</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            [a, "Desde"],
            [b, "Hasta"],
          ].map(([p, texto]) => (
            <label key={p} className="block">
              <span className="mb-1 block text-theme-xs text-gray-500 dark:text-gray-400">
                {texto}
              </span>
              <input
                type={tipo}
                min={tipo === "number" ? 0 : undefined}
                max={tipo === "number" ? 120 : undefined}
                className={`${claseControl} w-full`}
                value={valores[p] ?? ""}
                onChange={(e) => poner({ [p]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (f.tipo === "opciones") {
    const elegidos = new Set((valores[base] ?? "").split(",").filter(Boolean));
    const alternar = (v: string) => {
      const nuevo = new Set(elegidos);
      if (nuevo.has(v)) nuevo.delete(v);
      else nuevo.add(v);
      // En el orden de las opciones.
      poner({
        [base]: (f.opciones ?? [])
          .map((o) => o.valor)
          .filter((x) => nuevo.has(x))
          .join(","),
      });
    };
    return (
      <fieldset>
        <legend className={claseEtiqueta}>{f.etiqueta}</legend>
        <div className="flex flex-wrap gap-2">
          {f.opciones?.map((o) => {
            const marcado = elegidos.has(o.valor);
            return (
              <button
                key={o.valor}
                type="button"
                aria-pressed={marcado}
                onClick={() => alternar(o.valor)}
                className={`rounded-full border px-3 py-1.5 text-theme-xs font-medium transition ${
                  marcado
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-300"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                }`}
              >
                {o.etiqueta}
              </button>
            );
          })}
        </div>
        {f.ayuda && (
          <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
            {f.ayuda}
          </p>
        )}
      </fieldset>
    );
  }
  if (f.tipo === "si_no") {
    const valor = valores[base] ?? "";
    return (
      <fieldset>
        <legend className={claseEtiqueta}>{f.etiqueta}</legend>
        <div className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
          {[
            ["", "Todos"],
            ["si", "Sí"],
            ["no", "No"],
          ].map(([v, texto]) => (
            <button
              key={v}
              type="button"
              aria-pressed={valor === v}
              onClick={() => poner({ [base]: v })}
              className={`rounded-md px-4 py-1.5 text-theme-sm font-medium ${
                valor === v
                  ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white"
                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  // fk
  return (
    <div>
      <label htmlFor={id} className={claseEtiqueta}>
        {f.etiqueta}
      </label>
      <SelectorRemoto
        recurso={f.recurso!}
        valor={valores[base] || null}
        etiqueta={valores[`${base}__etiqueta`] ?? ""}
        onChange={(v, etiqueta) =>
          poner({ [base]: v ?? "", [`${base}__etiqueta`]: v ? etiqueta : "" })
        }
        placeholder="Buscar…"
      />
      {f.ayuda && (
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
          {f.ayuda}
        </p>
      )}
    </div>
  );
}

// Panel lateral con los filtros del módulo, por secciones. Se trabaja sobre
// una copia y solo se aplica al pulsar "Aplicar".
export default function PanelFiltros({
  abierto,
  filtros,
  valores,
  onCerrar,
  onAplicar,
}: {
  abierto: boolean;
  filtros: FiltroAvanzado[];
  valores: ValoresFiltros;
  onCerrar: () => void;
  onAplicar: (valores: ValoresFiltros) => void;
}) {
  const [borrador, setBorrador] = useState(valores);
  // Al abrir, parte de lo aplicado.
  const [abiertoAntes, setAbiertoAntes] = useState(abierto);
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto);
    if (abierto) setBorrador(valores);
  }

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierto, onCerrar]);

  const secciones = filtros.reduce<Record<string, FiltroAvanzado[]>>(
    (acc, f) => ({ ...acc, [f.seccion]: [...(acc[f.seccion] ?? []), f] }),
    {},
  );
  const cuantos = resumenFiltros(filtros, borrador).length;
  const poner = (cambios: ValoresFiltros) =>
    setBorrador((b) => ({ ...b, ...cambios }));

  return (
    <div
      className={`fixed inset-0 z-99999 ${abierto ? "" : "pointer-events-none"}`}
      aria-hidden={!abierto}
    >
      <div
        className={`absolute inset-0 bg-gray-900/40 backdrop-blur-[2px] transition-opacity ${
          abierto ? "opacity-100" : "opacity-0"
        }`}
        onClick={onCerrar}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-filtros-titulo"
        className={`absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white shadow-theme-xl transition-transform duration-200 dark:bg-gray-900 ${
          abierto ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2
            id="panel-filtros-titulo"
            className="text-lg font-semibold text-gray-800 dark:text-white/90"
          >
            Filtros
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            className="flex size-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            aria-label="Cerrar filtros"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {abierto &&
            Object.entries(secciones).map(([seccion, lista]) => (
              <section key={seccion}>
                <h3 className="mb-3 text-theme-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {seccion}
                </h3>
                <div className="space-y-4">
                  {lista.map((f) => (
                    <Control
                      key={f.nombre}
                      f={f}
                      valores={borrador}
                      poner={poner}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
        <div className="flex gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <button
            type="button"
            className={`${claseBoton} flex-1`}
            onClick={() => setBorrador({})}
          >
            Limpiar
          </button>
          <button
            type="button"
            className={`${claseBotonPrincipal} flex-1`}
            onClick={() => onAplicar(borrador)}
          >
            Aplicar{cuantos > 0 && ` (${cuantos})`}
          </button>
        </div>
      </aside>
    </div>
  );
}
