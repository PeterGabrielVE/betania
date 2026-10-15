import { api, ApiError, type Registro } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import CamposModulo from "@/components/modulos/CamposModulo";
import { claseBoton, claseTarjeta } from "@/components/modulos/estilos";
import {
  cuerpoDe,
  estadoInicial,
  type EstadoFormulario,
} from "@/components/modulos/formulario";
import SelectorRemoto from "@/components/modulos/SelectorRemoto";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import NotFound from "@/pages/OtherPage/NotFound";
import { useState } from "react";
import { Link, useLocation } from "react-router";

type Errores = Record<string, string[]>;

// El formulario de inscripción para caminantes (el de papel) en una sola
// pantalla: guarda los datos de la persona y su inscripción al retiro.
export default function InscribirCaminante() {
  const { modulos } = useAuth();
  const personas = modulos.find((m) => m.slug === "personas");
  const inscripciones = modulos.find((m) => m.slug === "inscripciones");
  // Al llegar desde el panel de un retiro, ese retiro ya viene elegido.
  const retiro = (useLocation().state as { retiro?: Registro } | null)?.retiro;

  const inscripcionVacia = (): EstadoFormulario => {
    if (!inscripciones) return { valores: {}, etiquetas: {} };
    const estado = estadoInicial(inscripciones, null);
    if (retiro) {
      estado.valores.retiro = retiro.id;
      estado.etiquetas.retiro = retiro.etiqueta;
    }
    return estado;
  };

  // Persona ya guardada (elegida en el buscador o creada en un intento anterior).
  const [persona, setPersona] = useState<Registro | null>(null);
  const [datosPersona, setDatosPersona] = useState(() =>
    personas ? estadoInicial(personas, null) : { valores: {}, etiquetas: {} },
  );
  const [datosInscripcion, setDatosInscripcion] = useState(inscripcionVacia);
  const [erroresPersona, setErroresPersona] = useState<Errores>({});
  const [erroresInscripcion, setErroresInscripcion] = useState<Errores>({});
  const [general, setGeneral] = useState("");
  const [hecho, setHecho] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!personas?.puede_agregar || !inscripciones?.puede_agregar) {
    return <NotFound />;
  }

  const elegirPersona = async (id: string | null) => {
    setGeneral("");
    setErroresPersona({});
    if (!id) {
      setPersona(null);
      setDatosPersona(estadoInicial(personas, null));
      return;
    }
    try {
      const registro = await api<Registro>(`/personas/${id}/`);
      setPersona(registro);
      setDatosPersona(estadoInicial(personas, registro));
    } catch (e) {
      setGeneral((e as Error).message);
    }
  };

  const limpiar = () => {
    setPersona(null);
    setDatosPersona(estadoInicial(personas, null));
    setDatosInscripcion(inscripcionVacia());
    setErroresPersona({});
    setErroresInscripcion({});
    setGeneral("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneral("");
    setHecho("");
    setErroresPersona({});
    setErroresInscripcion({});
    setEnviando(true);

    let guardada: Registro;
    try {
      // 1. La persona: se crea, o se actualiza si ya existía.
      guardada = await api<Registro>(
        persona ? `/personas/${persona.id}/` : "/personas/",
        {
          method: persona ? "PATCH" : "POST",
          body: cuerpoDe(personas, datosPersona.valores, persona).cuerpo,
        },
      );
      // Si la inscripción falla, al reintentar no se duplica la persona.
      setPersona(guardada);
    } catch (err) {
      if (err instanceof ApiError) setErroresPersona(err.campos);
      setGeneral((err as Error).message);
      setEnviando(false);
      return;
    }

    try {
      // 2. Su inscripción al retiro.
      const { cuerpo } = cuerpoDe(
        inscripciones,
        datosInscripcion.valores,
        null,
        ["persona"],
      );
      const inscripcion = await api<Registro>("/inscripciones/", {
        method: "POST",
        body: { ...cuerpo, persona: guardada.id },
      });
      limpiar();
      setHecho(`Inscripción registrada: ${inscripcion.etiqueta}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiError) setErroresInscripcion(err.campos);
      setGeneral(
        `Los datos de la persona se guardaron, pero no la inscripción: ${(err as Error).message}`,
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Inscribir caminante | Betania"
        description="Formulario de inscripción para caminantes"
      />
      <PageBreadcrumb pageTitle="Inscribir caminante" />
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Las inscripciones ya registradas se consultan y editan en{" "}
        <Link
          to="/inscripciones"
          className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
        >
          Ver inscripciones
        </Link>
        .
      </p>

      {hecho && (
        <p className="mb-4 rounded-xl border border-success-500/30 bg-success-50 px-5 py-3 text-sm text-success-600 dark:bg-success-500/15 dark:text-success-500">
          {hecho}.{" "}
          <Link to="/inscripciones" className="underline">
            Ver inscripciones
          </Link>
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={claseTarjeta}>
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            ¿La persona ya está registrada? Búscala para no duplicarla; si no,
            llena sus datos abajo.
          </p>
          <SelectorRemoto
            recurso="personas"
            valor={persona?.id ?? null}
            etiqueta={persona?.etiqueta ?? ""}
            onChange={elegirPersona}
            placeholder="Buscar por nombre, teléfono o correo…"
            className="w-full sm:w-96"
          />
        </div>

        <div className={claseTarjeta}>
          <CamposModulo
            modulo={personas}
            estado={datosPersona}
            onChange={setDatosPersona}
            errores={erroresPersona}
          />
        </div>

        <div className={claseTarjeta}>
          <CamposModulo
            modulo={inscripciones}
            estado={datosInscripcion}
            onChange={setDatosInscripcion}
            errores={erroresInscripcion}
            omitir={["persona"]}
          />
        </div>

        {general && (
          <p className="text-sm text-error-500" role="alert">
            {general}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className={claseBoton} onClick={limpiar}>
            Limpiar
          </button>
          <Button size="sm" disabled={enviando}>
            {enviando ? "Guardando…" : "Registrar inscripción"}
          </Button>
        </div>
      </form>
    </>
  );
}
