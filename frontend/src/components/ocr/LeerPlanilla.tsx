import { subirArchivo } from "@/api/client";
import { claseBoton, claseBotonPrincipal } from "@/components/modulos/estilos";
import { Modal } from "@/components/ui/modal";
import { CamaraIcon, EscanearIcon } from "@/icons";
import { useRef, useState } from "react";
import { CON_NOMBRE, ETIQUETAS_OCR, SOLO_REFERENCIA } from "./etiquetas";

export type CampoLeido = { valor: unknown; texto: string; confianza: number };
type Resultado = { campos: Record<string, CampoLeido>; texto: string };

// Confianza de Tesseract en esa línea: alta (≥ 80), media o baja (< 60).
function nivel(confianza: number) {
  if (confianza >= 80)
    return {
      texto: "Alta",
      clase:
        "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400",
    };
  if (confianza >= 60)
    return {
      texto: "Media",
      clase:
        "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400",
    };
  return {
    texto: "Baja",
    clase:
      "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
  };
}

function mostrar(clave: string, c: CampoLeido): string {
  if (CON_NOMBRE.has(clave)) return c.texto;
  if (typeof c.valor === "boolean") return c.valor ? "Sí" : "No";
  if (clave === "duerme") return c.valor === "si" ? "Sí" : "No";
  if (Array.isArray(c.valor)) return c.valor.join(", ").replace(/_/g, " ");
  if (clave === "fecha_nacimiento" && typeof c.valor === "string") {
    const [a, m, d] = c.valor.split("-");
    return `${d}/${m}/${a}`;
  }
  return String(c.valor);
}

const claseOpcion =
  "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-sm font-medium text-gray-700 hover:border-brand-400 hover:bg-brand-25 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-brand-500/10";

// Leer una planilla en papel (foto o PDF) y proponer sus datos para el
// formulario. El OCR es local (Tesseract) y con letra a mano se equivoca:
// se elige qué usar y después todo se revisa en los pasos.
export default function LeerPlanilla({
  tipo,
  onAplicar,
}: {
  tipo: "caminante" | "servidor";
  onAplicar: (valores: Record<string, unknown>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<"" | "leyendo" | "listo">("");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [verTexto, setVerTexto] = useState(false);
  const camara = useRef<HTMLInputElement>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const cerrar = () => {
    setAbierto(false);
    setEstado("");
    setError("");
    setResultado(null);
    setVerTexto(false);
  };

  const leer = async (f: File | undefined) => {
    if (!f) return;
    setEstado("leyendo");
    setError("");
    const datos = new FormData();
    datos.append("archivo", f);
    datos.append("tipo", tipo);
    try {
      const r = await subirArchivo<Resultado>("/ocr/planilla/", datos);
      setResultado(r);
      // Por omisión, lo leído con confianza media o alta.
      setElegidos(
        new Set(
          Object.entries(r.campos)
            .filter(([k, c]) => c.confianza >= 60 && !SOLO_REFERENCIA.has(k))
            .map(([k]) => k),
        ),
      );
      setEstado("listo");
    } catch (e) {
      setError((e as Error).message);
      setEstado("");
    }
  };

  const campos = resultado ? Object.entries(resultado.campos) : [];
  const alternar = (k: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <>
      <button
        type="button"
        className={`${claseBoton} inline-flex items-center gap-2`}
        onClick={() => setAbierto(true)}
      >
        <EscanearIcon className="size-5" aria-hidden="true" />
        Leer planilla
      </button>

      <Modal isOpen={abierto} onClose={cerrar} className="m-4 max-w-2xl">
        <div className="p-6">
          <h3 className="mb-1 pe-12 text-lg font-semibold text-gray-800 dark:text-white/90">
            Leer planilla
          </h3>
          <p className="mb-5 pe-12 text-theme-sm text-gray-500 dark:text-gray-400">
            Toma una foto de la planilla de{" "}
            {tipo === "caminante" ? "inscripción" : "servidor"} o súbela
            escaneada. Se lee en el propio sistema; revisa lo leído antes de
            usarlo, sobre todo si está escrita a mano.
          </p>

          {estado !== "listo" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={estado === "leyendo"}
                  onClick={() => camara.current?.click()}
                  className={claseOpcion}
                >
                  <CamaraIcon
                    className="size-8 text-brand-500"
                    aria-hidden="true"
                  />
                  Tomar foto
                  <span className="text-theme-xs font-normal text-gray-500">
                    Con la cámara del celular
                  </span>
                </button>
                <button
                  type="button"
                  disabled={estado === "leyendo"}
                  onClick={() => archivo.current?.click()}
                  className={claseOpcion}
                >
                  <EscanearIcon
                    className="size-8 text-brand-500"
                    aria-hidden="true"
                  />
                  Subir imagen o PDF
                  <span className="text-theme-xs font-normal text-gray-500">
                    JPG, PNG o PDF escaneado
                  </span>
                </button>
              </div>
              <input
                ref={camara}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => leer(e.target.files?.[0])}
              />
              <input
                ref={archivo}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => leer(e.target.files?.[0])}
              />
              {estado === "leyendo" && (
                <p
                  className="mt-5 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"
                  role="status"
                >
                  <span className="size-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  Leyendo la planilla… puede tardar unos segundos.
                </p>
              )}
              {error && (
                <p className="mt-4 text-sm text-error-500" role="alert">
                  {error}
                </p>
              )}
              <p className="mt-5 text-theme-xs text-gray-500 dark:text-gray-400">
                Para leer mejor: la hoja de frente, con buena luz, sin sombras y
                completa en la foto. La letra de molde se lee mucho mejor que la
                cursiva.
              </p>
            </>
          )}

          {estado === "listo" && resultado && (
            <>
              {campos.length === 0 ? (
                <p className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
                  No se reconoció ningún dato. Prueba con otra foto (más luz, de
                  frente) o llena el formulario a mano; el texto leído está
                  abajo.
                </p>
              ) : (
                <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="w-full text-theme-sm">
                    <thead className="sticky top-0 bg-gray-50 text-theme-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                      <tr>
                        <th className="w-10 px-3 py-2" />
                        <th className="px-3 py-2 text-start font-medium">
                          Campo
                        </th>
                        <th className="px-3 py-2 text-start font-medium">
                          Leído
                        </th>
                        <th className="px-3 py-2 text-start font-medium">
                          Confianza
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                      {campos.map(([clave, c]) => {
                        const n = nivel(c.confianza);
                        const valor = mostrar(clave, c);
                        return (
                          <tr
                            key={clave}
                            className={elegidos.has(clave) ? "" : "opacity-60"}
                          >
                            <td className="px-3 py-2">
                              {!SOLO_REFERENCIA.has(clave) && (
                                <input
                                  type="checkbox"
                                  className="size-4"
                                  checked={elegidos.has(clave)}
                                  onChange={() => alternar(clave)}
                                  aria-label={`Usar ${ETIQUETAS_OCR[clave] ?? clave}`}
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                              {ETIQUETAS_OCR[clave] ?? clave}
                            </td>
                            <td className="px-3 py-2 font-medium break-words text-gray-800 dark:text-white/90">
                              {valor}
                              {c.texto &&
                                c.texto !== valor &&
                                !CON_NOMBRE.has(clave) && (
                                  <span className="block text-theme-xs font-normal text-gray-400">
                                    leído: «{c.texto}»
                                  </span>
                                )}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-theme-xs font-medium ${n.clase}`}
                              >
                                {n.texto}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                type="button"
                className="mt-3 text-theme-xs text-brand-500 hover:text-brand-600"
                onClick={() => setVerTexto((v) => !v)}
                aria-expanded={verTexto}
              >
                {verTexto
                  ? "Ocultar el texto leído"
                  : "Ver todo el texto leído"}
              </button>
              {verTexto && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 text-theme-xs whitespace-pre-wrap text-gray-700 dark:bg-white/5 dark:text-gray-300">
                  {resultado.texto || "(no se leyó texto)"}
                </pre>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className={claseBoton}
                  onClick={() => {
                    setEstado("");
                    setResultado(null);
                  }}
                >
                  Leer otra
                </button>
                <button
                  type="button"
                  className={claseBotonPrincipal}
                  disabled={elegidos.size === 0}
                  onClick={() => {
                    onAplicar(
                      Object.fromEntries(
                        [...elegidos].map((k) => [
                          k,
                          resultado.campos[k].valor,
                        ]),
                      ),
                    );
                    cerrar();
                  }}
                >
                  Llenar el formulario ({elegidos.size})
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
