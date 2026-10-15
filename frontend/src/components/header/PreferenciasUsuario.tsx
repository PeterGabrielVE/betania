import { api, type Pagina, type Registro } from "@/api/client";
import { claseControl } from "@/components/modulos/estilos";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";

// En el encabezado: la edición (retiro) con la que trabaja el usuario y la
// moneda en que ve los montos. Se guardan como preferencias suyas y el
// sistema las usa por defecto (tablero, formularios, filtros).
export default function PreferenciasUsuario() {
  const { sesion, modulos, cambiarPreferencias } = useAuth();
  const [retiros, setRetiros] = useState<{ id: string; nombre: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const veRetiros = modulos.some((m) => m.slug === "retiros");

  useEffect(() => {
    if (!veRetiros) return;
    let vigente = true;
    api<Pagina<Registro>>("/retiros/?page_size=100")
      .then((d) => {
        if (vigente) {
          setRetiros(
            d.results.map((r) => ({
              id: r.id,
              nombre: (r.nombre as string) || r.etiqueta,
            })),
          );
        }
      })
      .catch(() => vigente && setRetiros([]));
    return () => {
      vigente = false;
    };
  }, [veRetiros]);

  if (!sesion?.autenticado) return null;
  const { preferencias: pref, monedas } = sesion;

  const cambiar = async (datos: {
    retiro?: string | null;
    moneda?: string;
  }) => {
    setGuardando(true);
    setError("");
    try {
      await cambiarPreferencias(datos);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const clase = `${claseControl} h-10 py-0 ps-3 pe-8 text-theme-sm`;
  const aviso =
    error ||
    pref.aviso ||
    (pref.moneda_vista !== sesion.moneda
      ? `Montos en ${pref.moneda_vista} con la tasa BCV del día: 1 ${sesion.moneda} = ${pref.factor.toLocaleString(sesion.region, { maximumFractionDigits: 2 })} ${pref.moneda_vista}. Se guardan en ${sesion.moneda}.`
      : "");

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
      {veRetiros && (
        <select
          aria-label="Edición con la que trabajas"
          title="Edición con la que trabajas: va por defecto en el inicio, los formularios y los filtros."
          className={`${clase} w-full sm:w-56`}
          value={pref.retiro?.id ?? ""}
          disabled={guardando}
          onChange={(e) => cambiar({ retiro: e.target.value || null })}
        >
          <option value="">Edición: la próxima</option>
          {/* Si la elegida no está en la lista (p. ej. muy vieja), igual se ve. */}
          {pref.retiro && !retiros.some((r) => r.id === pref.retiro!.id) && (
            <option value={pref.retiro.id}>{pref.retiro.etiqueta}</option>
          )}
          {retiros.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Moneda en que ves los montos"
        title={aviso || "Moneda en que ves los montos"}
        className={`${clase} w-full sm:w-auto ${pref.aviso || error ? "border-warning-500" : ""}`}
        value={pref.moneda}
        disabled={guardando}
        onChange={(e) => cambiar({ moneda: e.target.value })}
      >
        {monedas.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.valor} · {m.etiqueta}
          </option>
        ))}
      </select>
      {(pref.aviso || error) && (
        <span className="text-theme-xs text-warning-600 dark:text-warning-500">
          {error || pref.aviso}
        </span>
      )}
    </div>
  );
}
