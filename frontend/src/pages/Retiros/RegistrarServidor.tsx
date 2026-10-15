import { api, ApiError, type Registro } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Asistente from "@/components/inscripcion/Asistente";
import {
  campoDePersona,
  cuerpoPersona,
} from "@/components/inscripcion/esquemaPersona";
import {
  campoDeParticipacion,
  crearEsquemaServidor,
  ETIQUETAS_SERVIDOR,
  pasosServidor,
  TIPOS_PARTICIPACION,
  valoresServidor,
  type ValoresServidor,
} from "@/components/inscripcion/esquemaServidor";
import PasoPersonales from "@/components/inscripcion/PasoPersonales";
import {
  PasoIdentificacionServidor,
  PasoServicio,
} from "@/components/inscripcion/PasosServidor";
import Resumen from "@/components/inscripcion/Resumen";
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

// Registrar a una persona en el equipo de un retiro, paso a paso: quién es,
// cómo participa y en qué áreas sirve. Guarda la persona, su participación y
// una asignación por área.
export default function RegistrarServidor() {
  const { modulos } = useAuth();
  const puede = (slug: string) =>
    !!modulos.find((m) => m.slug === slug)?.puede_agregar;
  const personas = modulos.find((m) => m.slug === "personas");
  const retiroInicial = (
    useLocation().state as { retiro?: RetiroElegido } | null
  )?.retiro;

  const sensibles = !!personas?.campos.some(
    (c) => c.nombre === "datos_sensibles",
  );
  const pasos = useMemo(() => pasosServidor(sensibles), [sensibles]);
  const [venezuela, setVenezuela] = useState("");
  const esquema = useMemo(
    () => crearEsquemaServidor(sensibles, (pais) => pais === venezuela),
    [sensibles, venezuela],
  );
  const formulario = useForm<ValoresServidor>({
    resolver: zodResolver(esquema),
    defaultValues: valoresServidor(retiroInicial?.id),
    mode: "onTouched",
  });
  const { getValues, setError, reset, handleSubmit, formState } = formulario;

  const asistente = useAsistente(pasos, formulario);
  const registro = useRegistroPersona(formulario, {
    retiroInicial: retiroInicial?.id,
    vaciar: (pais) => valoresServidor(getValues("retiro"), pais),
  });
  if (registro.venezuela !== venezuela) setVenezuela(registro.venezuela);

  const [etiquetas, setEtiquetas] = useState<Record<string, string>>(
    retiroInicial ? { retiro: retiroInicial.etiqueta } : {},
  );
  const [areas, setAreas] = useState<{ id: string; nombre: string }[]>([]);
  const [hecho, setHecho] = useState<{
    nombre: string;
    detalle: string;
    retiro: string;
  } | null>(null);

  if (!puede("personas") || !puede("participaciones") || !puede("servicios")) {
    return <NotFound />;
  }

  const { persona } = registro;
  const nombreArea = (id: string) => areas.find((a) => a.id === id)?.nombre;

  const siguiente = async () => {
    if (!(await asistente.validarActual())) return;
    if (asistente.actual === 0) {
      const encontrada = await registro.buscarPorDocumento(pasos[0].campos);
      if (encontrada) {
        const conflicto = await conflictoEnRetiro(
          encontrada,
          getValues("retiro"),
          "servidor",
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
          setError(campo as keyof ValoresServidor, {
            message: mensajes.join(" "),
          });
          marcados.push(campo);
        }
      }
      asistente.alPrimero(marcados);
    }
    registro.setError(`${prefijo}${(err as Error).message}`);
  };

  const guardar = async (v: ValoresServidor) => {
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
      registro.setPersona(guardada);
    } catch (err) {
      errorDeApi(err, campoDePersona);
      return;
    }
    let participacion: Registro;
    try {
      // 2. Su lugar en el equipo del retiro.
      participacion = await api<Registro>("/participaciones/", {
        method: "POST",
        body: { retiro: v.retiro, persona: guardada.id, tipo: v.tipo },
      });
    } catch (err) {
      errorDeApi(
        err,
        campoDeParticipacion,
        "Los datos de la persona se guardaron, pero no su lugar en el equipo: ",
      );
      return;
    }
    // 3. Una asignación por área.
    const fallidas: string[] = [];
    for (const area of v.areas) {
      try {
        await api("/servicios/", {
          method: "POST",
          body: {
            participacion: participacion.id,
            area,
            es_coordinador: v.coordina.includes(area),
          },
        });
      } catch {
        fallidas.push(nombreArea(area) ?? area);
      }
    }
    const tipo = TIPOS_PARTICIPACION.find((t) => t.valor === v.tipo)?.etiqueta;
    setHecho({
      nombre: guardada.nombre as string,
      detalle: [
        tipo,
        v.areas
          .map((a) =>
            v.coordina.includes(a)
              ? `${nombreArea(a)} (coordina)`
              : nombreArea(a),
          )
          .join(", "),
      ]
        .filter(Boolean)
        .join(" · "),
      retiro: v.retiro,
    });
    if (fallidas.length) {
      registro.setError(
        `Se registró en el equipo, pero no en: ${fallidas.join(", ")}. Agrégalas en Servidores por área.`,
      );
    }
    empezarDeNuevo(v.retiro, !fallidas.length);
  };

  const alFallar = (fallos: FieldErrors<ValoresServidor>) =>
    asistente.alPrimero(Object.keys(fallos));

  const empezarDeNuevo = (
    retiro = getValues("retiro"),
    limpiarError = true,
  ) => {
    reset(valoresServidor(retiro, venezuela));
    setEtiquetas((e) => ({ retiro: e.retiro ?? "" }));
    registro.setPersona(null);
    registro.olvidarPersona();
    registro.setAviso("");
    if (limpiarError) registro.setError("");
    asistente.reiniciar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const contenido: Record<string, React.ReactNode> = {
    identificacion: (
      <PasoIdentificacionServidor
        persona={persona}
        onPersona={registro.elegirPersona}
        onDocumento={() => registro.buscarPorDocumento(pasos[0].campos)}
        avisoDocumento={registro.aviso}
        etiquetas={etiquetas}
        onEtiqueta={(nombre, etiqueta) =>
          setEtiquetas((e) => ({ ...e, [nombre]: etiqueta }))
        }
        onRetiro={(id) => id && registro.usarParroquiaDe(id)}
      />
    ),
    personales: (
      <PasoPersonales sensibles={sensibles} paises={registro.paises} />
    ),
    servicio: <PasoServicio onAreas={setAreas} />,
    confirmar: (
      <Resumen
        pasos={pasos.slice(0, -1)}
        titulos={ETIQUETAS_SERVIDOR}
        onIr={asistente.irA}
        formatear={(campo, valor) => {
          if (campo === "retiro") return valor ? etiquetas.retiro : "";
          if (campo === "tipo") {
            return TIPOS_PARTICIPACION.find((t) => t.valor === valor)?.etiqueta;
          }
          if (campo === "areas" || campo === "coordina") {
            return (valor as string[]).map(nombreArea).join(", ");
          }
          return undefined;
        }}
      />
    ),
  };

  return (
    <>
      <PageMeta
        title="Registrar servidor | Betania"
        description="Registrar a un servidor en el equipo de un retiro, paso a paso"
      />
      <PageBreadcrumb pageTitle="Registrar servidor" />

      {hecho && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-success-500/30 bg-success-50 px-5 py-4 dark:bg-success-500/15">
          <CheckCircleIcon className="size-6 shrink-0 text-success-600 dark:text-success-500" />
          <p className="min-w-0 flex-1 text-sm text-success-700 dark:text-success-500">
            Servidor registrado: <strong>{hecho.nombre}</strong> ·{" "}
            {hecho.detalle}. El formulario quedó listo para el siguiente.
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
            textoGuardar="Registrar servidor"
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
