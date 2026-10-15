// Lo que se va a guardar, por paso, con un enlace para corregir cada parte.
// Lo usan los formularios de caminante y de servidor.
import { api, type Registro } from "@/api/client";
import { fecha } from "@/utils/formato";
import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import type { Paso } from "./esquema";
import {
  normalizarDocumento,
  OTRA_CIUDAD,
  TIPOS_DOCUMENTO,
} from "./esquemaPersona";

// Nombre de un país, estado o ciudad a partir de su id.
function useNombre(recurso: string, id: string) {
  const [nombre, setNombre] = useState({ id: "", nombre: "" });
  const valido = !!id && id !== OTRA_CIUDAD;
  useEffect(() => {
    if (!valido) return;
    let vigente = true;
    api<Registro>(`/${recurso}/${id}/`)
      .then((r) => vigente && setNombre({ id, nombre: r.nombre as string }))
      .catch(() => vigente && setNombre({ id, nombre: "" }));
    return () => {
      vigente = false;
    };
  }, [recurso, id, valido]);
  return valido && nombre.id === id ? nombre.nombre : "";
}

export default function Resumen({
  pasos,
  titulos,
  formatear = () => undefined,
  onIr,
}: {
  pasos: Paso[]; // sin el último (el de confirmar)
  titulos: Record<string, string>; // nombre de cada campo
  // Para los campos propios de cada formulario (retiro, estado, áreas…):
  // el texto a mostrar, o undefined para el formato común.
  formatear?: (campo: string, valor: unknown) => string | undefined;
  onIr: (indice: number) => void;
}) {
  const { getValues } = useFormContext();
  const valores = getValues() as Record<string, unknown>;
  const lugares: Record<string, string> = {
    pais: useNombre("paises", valores.pais as string),
    entidad: useNombre("estados", valores.entidad as string),
    ciudad: useNombre("ciudades", valores.ciudad as string),
  };

  const mostrar = (campo: string): string => {
    const v = valores[campo];
    const propio = formatear(campo, v);
    if (propio !== undefined) return propio;
    if (typeof v === "boolean") return v ? "Sí" : "";
    if (!v) return "";
    if (campo in lugares) return lugares[campo];
    if (campo === "tipo_documento") {
      return TIPOS_DOCUMENTO.find((t) => t.valor === v)?.etiqueta ?? String(v);
    }
    if (campo === "documento") return normalizarDocumento(String(v));
    if (campo === "fecha_nacimiento") return fecha(String(v));
    return Array.isArray(v) ? v.join(", ") : String(v);
  };

  return (
    <div className="space-y-4">
      {pasos.map((paso, i) => {
        const datos = paso.campos
          .filter((c) => c !== "parroquia")
          .map((c) => [c, mostrar(c)] as const)
          .filter(([, v]) => v);
        return (
          <section
            key={paso.id}
            className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                {paso.titulo}
              </h4>
              <button
                type="button"
                onClick={() => onIr(i)}
                className="text-theme-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
              >
                Editar
              </button>
            </div>
            {datos.length === 0 ? (
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                Sin datos.
              </p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {datos.map(([campo, valor]) => (
                  <div key={campo} className="min-w-0">
                    <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                      {titulos[campo] ?? campo}
                    </dt>
                    <dd className="text-theme-sm break-words whitespace-pre-line text-gray-800 dark:text-white/90">
                      {valor}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}
