import { api, ApiError, type Registro } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Asistente from "@/components/inscripcion/Asistente";
import {
  campoDeInscripcion,
  crearEsquema,
  cuerpoInscripcion,
  cuerpoPersona,
  datosDePersona,
  pasosPara,
  valoresIniciales,
  type Valores,
} from "@/components/inscripcion/esquema";
import { campoDePersona } from "@/components/inscripcion/esquemaPersona";
import PasoPersonales from "@/components/inscripcion/PasoPersonales";
import {
  PasoConfirmar,
  PasoContactos,
  PasoFamilia,
  PasoIdentificacion,
  PasoSalud,
} from "@/components/inscripcion/PasosFormulario";
import { useAsistente } from "@/components/inscripcion/useAsistente";
import {
  conflictoEnRetiro,
  useRegistroPersona,
} from "@/components/inscripcion/useRegistroPersona";
import { claseEnlace } from "@/components/modulos/estilos";
import { useAuth } from "@/context/AuthContext";
import { CheckCircleIcon } from "@/icons";
import NotFound from "@/pages/OtherPage/NotFound";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { FormProvider, useForm, type FieldErrors } from "react-hook-form";
import { Link, useLocation } from "react-router";

type RetiroElegido = { id: string; etiqueta: string };

// El formulario de inscripción para caminantes (el de papel), paso a paso:
// cada paso se valida (zod) antes de seguir; al final se revisa todo y se
// guardan la persona y su inscripción al retiro.
export default function InscribirCaminante() {
  const { modulos } = useAuth();
  const personas = modulos.find((m) => m.slug === "personas");
  const inscripciones = modulos.find((m) => m.slug === "inscripciones");
  // Al llegar desde el panel de un retiro, ese retiro ya viene elegido.
  const retiroInicial = (
    useLocation().state as { retiro?: RetiroElegido } | null
  )?.retiro;

  // Los datos confidenciales solo se piden a quien puede verlos (la API los
  // descarta para los demás).
  const sensibles =
    !!personas?.campos.some((c) => c.nombre === "datos_sensibles") &&
    !!inscripciones?.campos.some((c) => c.nombre === "salud_alimentacion");
  const pasos = useMemo(() => pasosPara(sensibles), [sensibles]);
  const estados =
    inscripciones?.campos.find((c) => c.nombre === "estado")?.opciones ?? [];

  // Venezuela pide estado y ciudad de la lista; el id llega con los países.
  const [venezuela, setVenezuela] = useState("");
  const esquema = useMemo(
    () => crearEsquema(sensibles, (pais) => pais === venezuela),
    [sensibles, venezuela],
  );
  const formulario = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales(retiroInicial?.id),
    // Avisa al salir de cada campo y, ya con error, mientras se corrige.
    mode: "onTouched",
  });
  const { getValues, setError, reset, handleSubmit, formState } = formulario;

  const asistente = useAsistente(pasos, formulario);
  const registro = useRegistroPersona(formulario, {
    retiroInicial: retiroInicial?.id,
    vaciar: (pais) => valoresIniciales(getValues("retiro"), pais),
    datosExtra: datosDePersona,
  });
  if (registro.venezuela !== venezuela) setVenezuela(registro.venezuela);

  // Texto visible de las relaciones elegidas (retiro, padrino).
  const [etiquetas, setEtiquetas] = useState<Record<string, string>>(
    retiroInicial ? { retiro: retiroInicial.etiqueta } : {},
  );
  const [hecho, setHecho] = useState<{
    etiqueta: string;
    retiro: string;
  } | null>(null);

  if (!personas?.puede_agregar || !inscripciones?.puede_agregar) {
    return <NotFound />;
  }

  const { persona } = registro;

  // Del primer paso se sigue solo si la persona no está ya en ese retiro.
  const siguiente = async () => {
    if (!(await asistente.validarActual())) return;
    if (asistente.actual === 0) {
      const encontrada = await registro.buscarPorDocumento(pasos[0].campos);
      if (encontrada) {
        const conflicto = await conflictoEnRetiro(
          encontrada,
          getValues("retiro"),
          "caminante",
        );
        if (conflicto) {
          setError("documento", { message: conflicto }, { shouldFocus: true });
          return;
        }
      }
    }
    asistente.irA(asistente.actual + 1);
  };

  const errorDeApi = (
    err: unknown,
    campoDe: (clave: string) => string | null,
    prefijo = "",
  ) => {
    if (err instanceof ApiError) {
      const marcados: string[] = [];
      for (const [clave, mensajes] of Object.entries(err.campos)) {
        const campo = campoDe(clave);
        if (campo) {
          setError(campo as keyof Valores, { message: mensajes.join(" ") });
          marcados.push(campo);
        }
      }
      asistente.alPrimero(marcados);
    }
    registro.setError(`${prefijo}${(err as Error).message}`);
  };

  const guardar = async (v: Valores) => {
    registro.setError("");
    let guardada: Registro;
    try {
      // 1. La persona: se crea, o se actualiza si ya existía.
      guardada = await api<Registro>(
        persona ? `/personas/${persona.id}/` : "/personas/",
        {
          method: persona ? "PATCH" : "POST",
          body: cuerpoPersona(v, sensibles, persona),
        },
      );
      // Si la inscripción falla, al reintentar no se duplica la persona.
      registro.setPersona(guardada);
    } catch (err) {
      errorDeApi(err, campoDePersona);
      return;
    }
    try {
      // 2. Su inscripción al retiro.
      const inscripcion = await api<Registro>("/inscripciones/", {
        method: "POST",
        body: cuerpoInscripcion(v, guardada.id, sensibles),
      });
      setHecho({ etiqueta: inscripcion.etiqueta, retiro: v.retiro });
      empezarDeNuevo(v.retiro);
    } catch (err) {
      errorDeApi(
        err,
        campoDeInscripcion,
        "Los datos de la persona se guardaron, pero no la inscripción: ",
      );
    }
  };

  const alFallar = (fallos: FieldErrors<Valores>) =>
    asistente.alPrimero(Object.keys(fallos));

  // Formulario vacío; el retiro se conserva para inscribir al siguiente.
  const empezarDeNuevo = (retiro = getValues("retiro")) => {
    reset(valoresIniciales(retiro, venezuela));
    setEtiquetas((e) => ({ retiro: e.retiro ?? "" }));
    registro.setPersona(null);
    registro.olvidarPersona();
    registro.setAviso("");
    registro.setError("");
    asistente.reiniciar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const contenido: Record<string, React.ReactNode> = {
    identificacion: (
      <PasoIdentificacion
        persona={persona}
        onPersona={registro.elegirPersona}
        onDocumento={() => registro.buscarPorDocumento(pasos[0].campos)}
        avisoDocumento={registro.aviso}
        etiquetas={etiquetas}
        onEtiqueta={(nombre, etiqueta) =>
          setEtiquetas((e) => ({ ...e, [nombre]: etiqueta }))
        }
        onRetiro={(id) => id && registro.usarParroquiaDe(id)}
        estados={estados}
      />
    ),
    personales: (
      <PasoPersonales sensibles={sensibles} paises={registro.paises} />
    ),
    familia: <PasoFamilia />,
    salud: <PasoSalud />,
    contactos: <PasoContactos />,
    confirmar: (
      <PasoConfirmar
        pasos={pasos}
        etiquetas={etiquetas}
        estados={estados}
        onIr={asistente.irA}
      />
    ),
  };

  return (
    <>
      <PageMeta
        title="Inscribir caminante | Betania"
        description="Formulario de inscripción para caminantes, paso a paso"
      />
      <PageBreadcrumb pageTitle="Inscribir caminante" />

      {hecho && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-success-500/30 bg-success-50 px-5 py-4 dark:bg-success-500/15">
          <CheckCircleIcon className="size-6 shrink-0 text-success-600 dark:text-success-500" />
          <p className="min-w-0 flex-1 text-sm text-success-700 dark:text-success-500">
            Inscripción registrada: <strong>{hecho.etiqueta}</strong>. El
            formulario quedó listo para el siguiente caminante del mismo retiro.
          </p>
          <Link
            to={`/retiros/${hecho.retiro}`}
            className={`text-sm font-medium ${claseEnlace}`}
          >
            Ver panel del retiro
          </Link>
        </div>
      )}

      <FormProvider {...formulario}>
        <form
          noValidate
          onSubmit={(e) => {
            // Enter en un campo avanza de paso; solo el último guarda.
            if (!asistente.ultimo) {
              e.preventDefault();
              siguiente();
              return;
            }
            handleSubmit(guardar, alFallar)(e);
          }}
          className="space-y-6"
        >
          <Asistente
            pasos={pasos}
            asistente={asistente}
            general={registro.error}
            guardando={formState.isSubmitting}
            textoGuardar="Registrar inscripción"
            onEmpezarDeNuevo={() => {
              setHecho(null);
              empezarDeNuevo();
            }}
          >
            {contenido[pasos[asistente.actual].id]}
          </Asistente>
        </form>
      </FormProvider>
    </>
  );
}
