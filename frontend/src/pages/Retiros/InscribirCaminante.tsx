import LeerPlanilla from "@/components/ocr/LeerPlanilla";
import { aplicarLectura } from "@/components/ocr/aplicarLectura";
import PantallaError from "@/components/estados/PantallaError";
import { EsqueletoFormulario } from "@/components/estados/Esqueleto";
import { api, ApiError, type Registro } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Asistente from "@/components/inscripcion/Asistente";
import {
  campoDeInscripcion,
  crearEsquema,
  cuerpoInscripcion,
  cuerpoPersona,
  datosDeInscripcion,
  datosDePersona,
  pasosPara,
  sexoDelRetiro,
  sexoSugerido,
  valoresIniciales,
  type Valores,
} from "@/components/inscripcion/esquema";
import { campoDePersona } from "@/components/inscripcion/esquemaPersona";
import PasoContactos from "@/components/inscripcion/PasoContactos";
import PasoPersonales from "@/components/inscripcion/PasoPersonales";
import {
  PasoConfirmar,
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
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, type FieldErrors } from "react-hook-form";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";

type RetiroElegido = { id: string; etiqueta: string };

// El formulario de inscripción para caminantes (el de papel), paso a paso:
// cada paso se valida (zod) antes de seguir; al final se revisa todo y se
// guardan la persona y su inscripción al retiro. Con ?inscripcion=<id> edita
// esa inscripción (y los datos de su persona); al guardar vuelve a ?volver=.
export default function InscribirCaminante() {
  const { modulos } = useAuth();
  const personas = modulos.find((m) => m.slug === "personas");
  const inscripciones = modulos.find((m) => m.slug === "inscripciones");
  const navigate = useNavigate();
  const [parametros] = useSearchParams();
  const editando = parametros.get("inscripcion");
  const volver = parametros.get("volver");
  // Desde el panel de un retiro llega el retiro; desde la ficha, la persona.
  // Si no, la edición preferida.
  const estado = useLocation().state as {
    retiro?: RetiroElegido;
    persona?: string;
  } | null;
  const desdePanel = estado?.retiro;
  const { sesion } = useAuth();
  const retiroInicial =
    desdePanel ??
    (sesion?.autenticado ? sesion.preferencias.retiro : null) ??
    undefined;

  // Los datos confidenciales solo se piden a quien puede verlos (la API los
  // descarta para los demás).
  const sensibles =
    !!personas?.campos.some((c) => c.nombre === "datos_sensibles") &&
    !!inscripciones?.campos.some((c) => c.nombre === "salud_alimentacion");
  const pasos = useMemo(() => pasosPara(sensibles), [sensibles]);
  // Resultado de llenar el formulario con una planilla leída.
  const [avisoLectura, setAvisoLectura] = useState("");
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

  const asistente = useAsistente(pasos, formulario, {
    libre: !!editando,
    inicial: parametros.get("paso") ?? "",
  });
  const registro = useRegistroPersona(formulario, {
    retiroInicial: retiroInicial?.id,
    personaInicial: estado?.persona,
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
  // Editando: la inscripción tal como está guardada (null mientras llega).
  const [original, setOriginal] = useState<Registro | null>(null);

  useEffect(() => {
    if (!editando) return;
    api<Registro>(`/inscripciones/${editando}/`)
      .then(async (ins) => {
        await registro.elegirPersona(ins.persona as string);
        for (const [campo, valor] of Object.entries(datosDeInscripcion(ins))) {
          formulario.setValue(campo as keyof Valores, valor as never);
        }
        setEtiquetas({
          retiro: ins.retiro_etiqueta as string,
          padrino: (ins.padrino_etiqueta as string) ?? "",
        });
        registro.setAviso("");
        setOriginal(ins);
      })
      .catch((e: Error) => {
        registro.setError(e.message);
        registro.setErrorCarga(e);
      });
    // Solo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  const puede = editando
    ? personas?.puede_cambiar && inscripciones?.puede_cambiar
    : personas?.puede_agregar && inscripciones?.puede_agregar;
  if (!puede) return <NotFound />;
  if (editando && !original) {
    return registro.errorCarga ? (
      <PantallaError error={registro.errorCarga} />
    ) : (
      <EsqueletoFormulario />
    );
  }

  // Al terminar de editar, de vuelta a donde se vino (o a la ficha).
  const salir = (persona?: string) =>
    navigate(
      volver?.startsWith("/")
        ? volver
        : persona
          ? `/personas/${persona}`
          : "/inscripciones",
    );

  const { persona } = registro;

  // Del primer paso se sigue solo si la persona no está ya en ese retiro.
  const siguiente = async () => {
    if (!(await asistente.validarActual())) return;
    if (asistente.actual === 0 && !editando) {
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
      await registro.guardarFoto(guardada);
    } catch (err) {
      registro.setError((err as Error).message);
      return;
    }
    try {
      // 2. Su inscripción al retiro (o los cambios, si se edita).
      const inscripcion = await api<Registro>(
        editando ? `/inscripciones/${editando}/` : "/inscripciones/",
        {
          method: editando ? "PATCH" : "POST",
          body: cuerpoInscripcion(v, guardada.id, sensibles),
        },
      );
      if (editando) {
        salir(guardada.id);
        return;
      }
      setHecho({ etiqueta: inscripcion.etiqueta, retiro: v.retiro });
      empezarDeNuevo(v.retiro);
    } catch (err) {
      errorDeApi(
        err,
        campoDeInscripcion,
        editando
          ? "Los datos de la persona se guardaron, pero no los cambios de la inscripción: "
          : "Los datos de la persona se guardaron, pero no la inscripción: ",
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
        onDocumento={() =>
          // Editando no se busca a otra persona: se corrige el documento.
          !editando && registro.buscarPorDocumento(pasos[0].campos)
        }
        avisoDocumento={registro.aviso}
        etiquetas={etiquetas}
        onEtiqueta={(nombre, etiqueta) =>
          setEtiquetas((e) => ({ ...e, [nombre]: etiqueta }))
        }
        onRetiro={(id) => id && registro.usarParroquiaDe(id)}
        estados={estados}
        edicion={!!editando}
      />
    ),
    personales: (
      <PasoPersonales
        sensibles={sensibles}
        paises={registro.paises}
        foto={registro.foto}
        sexoSugerido={sexoSugerido(etiquetas.retiro)}
      />
    ),
    familia: <PasoFamilia />,
    salud: <PasoSalud />,
    contactos: <PasoContactos sexo={sexoDelRetiro(etiquetas.retiro)} />,
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
        title={`${editando ? "Editar inscripción" : "Inscribir caminante"} | Betania`}
        description="Formulario de inscripción para caminantes, paso a paso"
      />
      <PageBreadcrumb
        pageTitle={
          editando
            ? `Editar inscripción · ${registro.persona?.nombre ?? ""}`
            : "Inscribir caminante"
        }
      />

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

      {/* Llenar desde la planilla en papel (OCR en el propio sistema). */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        {avisoLectura ? (
          <p
            className="me-auto text-sm text-success-700 dark:text-success-500"
            role="status"
          >
            {avisoLectura}
          </p>
        ) : (
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">
            ¿Tienes la planilla en papel?
          </span>
        )}
        <LeerPlanilla
          tipo="caminante"
          onAplicar={async (leidos) => {
            const r = await aplicarLectura(formulario, leidos, {
              buscarPorDocumento: editando
                ? undefined
                : () => registro.buscarPorDocumento(pasos[0].campos),
            });
            setAvisoLectura(
              r.registrada
                ? `Ya estaba registrada: se conservaron sus datos y la planilla completó ${r.llenados} campos. Revísalos en cada paso.`
                : `Se llenaron ${r.llenados} campos con la planilla. Revísalos en cada paso antes de guardar.`,
            );
          }}
        />
      </div>

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
            textoGuardar={
              editando ? "Guardar cambios" : "Registrar inscripción"
            }
            textoReiniciar={editando ? "Cancelar" : undefined}
            onGuardarYa={
              editando ? () => handleSubmit(guardar, alFallar)() : undefined
            }
            onEmpezarDeNuevo={() => {
              if (editando) return salir(original?.persona as string);
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
