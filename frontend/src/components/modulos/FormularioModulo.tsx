import { api, ApiError, type Modulo, type Registro } from "@/api/client";
import Button from "@/components/ui/button/Button";
import { useState } from "react";
import CamposModulo from "./CamposModulo";
import { claseBoton } from "./estilos";
import { cuerpoDe, estadoInicial } from "./formulario";

interface FormularioModuloProps {
  modulo: Modulo;
  registro: Registro | null; // null = alta
  // Recibe lo guardado (p. ej. para abrir los permisos de un rol recién creado).
  onGuardado: (guardado: Registro) => void;
  onCancelar: () => void;
}

// Alta o edición de un registro de cualquier módulo.
export default function FormularioModulo({
  modulo,
  registro,
  onGuardado,
  onCancelar,
}: FormularioModuloProps) {
  const [estado, setEstado] = useState(() => estadoInicial(modulo, registro));
  const [errores, setErrores] = useState<Record<string, string[]>>({});
  const [general, setGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneral("");

    const { cuerpo, errores: locales } = cuerpoDe(
      modulo,
      estado.valores,
      registro,
    );
    setErrores(locales);
    if (Object.keys(locales).length) return;

    setEnviando(true);
    try {
      const guardado = await api<Registro>(
        registro ? `/${modulo.slug}/${registro.id}/` : `/${modulo.slug}/`,
        { method: registro ? "PATCH" : "POST", body: cuerpo },
      );
      onGuardado(guardado);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrores(err.campos);
        setGeneral(err.message);
      } else {
        setGeneral("No se pudo conectar con el servidor.");
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 sm:p-8">
      <h3 className="mb-6 text-xl font-semibold text-gray-800 dark:text-white/90">
        {registro ? "Editar" : "Agregar"} {modulo.singular}
      </h3>
      <CamposModulo
        modulo={modulo}
        estado={estado}
        onChange={setEstado}
        errores={errores}
      />
      {general && (
        <p className="mt-4 text-sm text-error-500" role="alert">
          {general}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className={claseBoton} onClick={onCancelar}>
          Cancelar
        </button>
        <Button size="sm" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
