import { api, ApiError, type Pagina, type Registro } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import BarraPasos from "@/components/inscripcion/BarraPasos";
import {
  campoDeError,
  crearEsquema,
  cuerpoInscripcion,
  cuerpoPersona,
  datosDePersona,
  normalizarDocumento,
  pasosPara,
  valoresIniciales,
  type Campo,
  type Valores,
} from "@/components/inscripcion/esquema";
import {
  PasoConfirmar,
  PasoContactos,
  PasoFamilia,
  PasoIdentificacion,
  PasoPersonales,
  PasoSalud,
} from "@/components/inscripcion/PasosFormulario";
import {
  claseBoton,
  claseEnlace,
  claseTarjeta,
} from "@/components/modulos/estilos";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { CheckCircleIcon } from "@/icons";
import NotFound from "@/pages/OtherPage/NotFound";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
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
  // Países para elegir; Venezuela va por defecto y es la que pide estado y ciudad.
  const [paises, setPaises] = useState<{ id: string; nombre: string }[]>([]);
  const [venezuela, setVenezuela] = useState("");
  const esquema = useMemo(
    () => crearEsquema(sensibles, (pais) => pais === venezuela),
    [sensibles, venezuela],
  );
  const estados =
    inscripciones?.campos.find((c) => c.nombre === "estado")?.opciones ?? [];

  const formulario = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales(retiroInicial?.id),
    // Avisa al salir de cada campo y, ya con error, mientras se corrige.
    mode: "onTouched",
  });
  const {
    trigger,
    setValue,
    getValues,
    setError,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = formulario;

  const [actual, setActual] = useState(0);
  const [alcanzado, setAlcanzado] = useState(0);
  // Persona ya guardada (elegida en el buscador o creada en un intento anterior).
  const [persona, setPersona] = useState<Registro | null>(null);
  // Texto visible de las relaciones elegidas (retiro, padrino).
  const [etiquetas, setEtiquetas] = useState<Record<string, string>>(
    retiroInicial ? { retiro: retiroInicial.etiqueta } : {},
  );
  const [general, setGeneral] = useState("");
  const [avisoDocumento, setAvisoDocumento] = useState("");
  const [hecho, setHecho] = useState<{
    etiqueta: string;
    retiro: string;
  } | null>(null);
  const tarjeta = useRef<HTMLDivElement>(null);

  // La parroquia de una persona nueva es la del retiro; la de una ya
  // registrada se conserva.
  const personaElegida = useRef(false);
  const usarParroquiaDe = (retiro: string) =>
    api<Registro>(`/retiros/${retiro}/`)
      .then((r) => {
        if (!personaElegida.current) {
          setValue("parroquia", r.parroquia as string, {
            shouldValidate: true,
          });
        }
      })
      .catch((e: Error) => setGeneral(e.message));

  useEffect(() => {
    if (retiroInicial) usarParroquiaDe(retiroInicial.id);
    api<Pagina<Registro>>("/paises/?page_size=100")
      .then((d) => {
        setPaises(
          d.results.map((p) => ({ id: p.id, nombre: p.nombre as string })),
        );
        const ve = d.results.find((p) => p.codigo === "VE")?.id ?? "";
        setVenezuela(ve);
        if (!getValues("pais")) setValue("pais", ve);
      })
      .catch((e: Error) => setGeneral(e.message));
    // Solo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conErrores = useMemo(
    () =>
      new Set(
        pasos
          .map((p, i) => (p.campos.some((c) => errors[c]) ? i : -1))
          .filter((i) => i >= 0),
      ),
    [pasos, errors],
  );

  if (!personas?.puede_agregar || !inscripciones?.puede_agregar) {
    return <NotFound />;
  }

  const irA = (indice: number) => {
    setActual(indice);
    setAlcanzado((a) => Math.max(a, indice));
    tarjeta.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Avanzar exige que el paso actual esté completo.
  const siguiente = async () => {
    const valido = await trigger(pasos[actual].campos, { shouldFocus: true });
    if (!valido) return;
    if (actual === 0) await buscarPorDocumento();
    irA(actual + 1);
  };

  const ir = async (indice: number) => {
    if (indice <= actual) return irA(indice);
    if (await trigger(pasos[actual].campos, { shouldFocus: true })) {
      irA(indice);
    }
  };

  // Si ya hay alguien registrado con ese documento, se cargan sus datos en vez
  // de crear a otra persona.
  const buscarPorDocumento = async () => {
    const tipo = getValues("tipo_documento");
    const numero = normalizarDocumento(getValues("documento"));
    if (!numero) return;
    if (persona?.documento === numero && persona.tipo_documento === tipo)
      return;
    try {
      const { results } = await api<Pagina<Registro>>(
        `/personas/?search=${encodeURIComponent(numero)}&page_size=20`,
      );
      const encontrada = results.find(
        (p) => p.documento === numero && p.tipo_documento === tipo,
      );
      if (encontrada) {
        await elegirPersona(encontrada.id);
        setAvisoDocumento(
          `Ya está registrada: ${encontrada.nombre}. Se cargaron sus datos; revísalos en los pasos siguientes.`,
        );
      } else {
        if (persona) {
          // Otro documento: es otra persona. Se borra lo que se había cargado
          // de la anterior (menos lo de este paso) para no mezclar sus datos.
          setPersona(null);
          personaElegida.current = false;
          const limpios = valoresIniciales(getValues("retiro"), venezuela);
          for (const campo of Object.keys(limpios) as Campo[]) {
            if (!pasos[0].campos.includes(campo)) {
              setValue(campo, limpios[campo] as never);
            }
          }
          const retiro = getValues("retiro");
          if (retiro) usarParroquiaDe(retiro);
        }
        setAvisoDocumento(
          "Persona nueva: completa sus datos en los pasos siguientes.",
        );
      }
    } catch (e) {
      setGeneral((e as Error).message);
    }
  };

  const elegirPersona = async (id: string | null) => {
    setGeneral("");
    setAvisoDocumento("");
    if (!id) {
      setPersona(null);
      personaElegida.current = false;
      const retiro = getValues("retiro");
      if (retiro) usarParroquiaDe(retiro);
      return;
    }
    try {
      const registro = await api<Registro>(`/personas/${id}/`);
      setPersona(registro);
      personaElegida.current = true;
      for (const [campo, valor] of Object.entries(datosDePersona(registro))) {
        setValue(campo as Campo, valor as never, { shouldDirty: true });
      }
    } catch (e) {
      setGeneral((e as Error).message);
    }
  };

  // Lleva al primer paso con errores.
  const alPrimerError = (campos: string[]) => {
    const indice = pasos.findIndex((p) =>
      p.campos.some((c) => campos.includes(c)),
    );
    if (indice >= 0) irA(indice);
  };

  const errorDeApi = (
    err: unknown,
    de: "persona" | "inscripcion",
    prefijo = "",
  ) => {
    if (err instanceof ApiError) {
      const marcados: string[] = [];
      for (const [clave, mensajes] of Object.entries(err.campos)) {
        const campo = campoDeError(clave, de);
        if (campo) {
          setError(campo, { message: mensajes.join(" ") });
          marcados.push(campo);
        }
      }
      alPrimerError(marcados);
    }
    setGeneral(`${prefijo}${(err as Error).message}`);
  };

  const guardar = async (v: Valores) => {
    setGeneral("");
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
      setPersona(guardada);
    } catch (err) {
      errorDeApi(err, "persona");
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
        "inscripcion",
        "Los datos de la persona se guardaron, pero no la inscripción: ",
      );
    }
  };

  const alFallar = (fallos: FieldErrors<Valores>) =>
    alPrimerError(Object.keys(fallos));

  // Formulario vacío; el retiro se conserva para inscribir al siguiente.
  const empezarDeNuevo = (retiro = getValues("retiro")) => {
    reset(valoresIniciales(retiro, venezuela));
    setAvisoDocumento("");
    setEtiquetas((e) => ({ retiro: e.retiro ?? "" }));
    setPersona(null);
    personaElegida.current = false;
    if (retiro) usarParroquiaDe(retiro);
    setGeneral("");
    setActual(0);
    setAlcanzado(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const ultimo = actual === pasos.length - 1;
  const paso = pasos[actual];
  const contenido: Record<string, React.ReactNode> = {
    identificacion: (
      <PasoIdentificacion
        persona={persona}
        onPersona={elegirPersona}
        onDocumento={buscarPorDocumento}
        avisoDocumento={avisoDocumento}
        etiquetas={etiquetas}
        onEtiqueta={(nombre, etiqueta) =>
          setEtiquetas((e) => ({ ...e, [nombre]: etiqueta }))
        }
        onRetiro={(id) => id && usarParroquiaDe(id)}
        estados={estados}
      />
    ),
    personales: <PasoPersonales sensibles={sensibles} paises={paises} />,
    familia: <PasoFamilia />,
    salud: <PasoSalud />,
    contactos: <PasoContactos />,
    confirmar: (
      <PasoConfirmar
        pasos={pasos}
        etiquetas={etiquetas}
        estados={estados}
        onIr={irA}
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
            if (!ultimo) {
              e.preventDefault();
              siguiente();
              return;
            }
            handleSubmit(guardar, alFallar)(e);
          }}
          className="space-y-6"
        >
          <BarraPasos
            pasos={pasos}
            actual={actual}
            alcanzado={alcanzado}
            conErrores={conErrores}
            onIr={ir}
          />

          <div ref={tarjeta} className={`${claseTarjeta} scroll-mt-24`}>
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {paso.titulo}
              </h3>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                {paso.descripcion} Los campos con{" "}
                <span className="text-error-500">*</span> son obligatorios.
              </p>
            </div>
            {contenido[paso.id]}
          </div>

          {general && (
            <p
              className="rounded-xl border border-error-500/30 bg-error-50 px-5 py-3 text-sm text-error-600 dark:bg-error-500/15 dark:text-error-500"
              role="alert"
            >
              {general}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className={claseBoton}
              onClick={() => {
                setHecho(null);
                empezarDeNuevo();
              }}
            >
              Empezar de nuevo
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                className={claseBoton}
                disabled={actual === 0}
                onClick={() => irA(actual - 1)}
              >
                Anterior
              </button>
              {ultimo ? (
                <Button size="sm" disabled={isSubmitting}>
                  {isSubmitting ? "Guardando…" : "Registrar inscripción"}
                </Button>
              ) : (
                <Button size="sm">Siguiente</Button>
              )}
            </div>
          </div>
        </form>
      </FormProvider>
    </>
  );
}
