import LeerPlanilla from "@/components/ocr/LeerPlanilla";
import { aplicarLectura } from "@/components/ocr/aplicarLectura";
import PantallaError from "@/components/estados/PantallaError";
import { EsqueletoFormulario } from "@/components/estados/Esqueleto";
import { api, ApiError, type Pagina, type Registro } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Asistente from "@/components/inscripcion/Asistente";
import {
  campoDePersona,
  cuerpoPersona,
} from "@/components/inscripcion/esquemaPersona";
import {
  campoDeParticipacion,
  CAMISAS,
  crearEsquemaServidor,
  cuerpoDisponibilidad,
  datosDeParticipacion,
  ETIQUETAS_SERVIDOR,
  resumenTurnos,
  TALLAS_CAMISA,
  pasosServidor,
  TIPOS_PARTICIPACION,
  valoresServidor,
  type ValoresServidor,
} from "@/components/inscripcion/esquemaServidor";
import PasoPersonales from "@/components/inscripcion/PasoPersonales";
import {
  PasoDisponibilidad,
  PasoIdentificacionServidor,
  PasoServicio,
} from "@/components/inscripcion/PasosServidor";
import Resumen from "@/components/inscripcion/Resumen";
import { sexoSugerido } from "@/components/inscripcion/esquema";
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

// Registrar a una persona en el equipo de un retiro, paso a paso: quién es,
// cómo participa y en qué áreas sirve. Guarda la persona, su participación y
// una asignación por área. Con ?participacion=<id> edita ese servidor (sus
// datos, cómo participa, sus áreas y su disponibilidad); al guardar vuelve a
// ?volver=.
export default function RegistrarServidor() {
  const { modulos } = useAuth();
  const navigate = useNavigate();
  const [parametros] = useSearchParams();
  const editando = parametros.get("participacion");
  const volver = parametros.get("volver");
  const puede = (slug: string) => {
    const m = modulos.find((x) => x.slug === slug);
    return !!(editando ? m?.puede_cambiar : m?.puede_agregar);
  };
  const personas = modulos.find((m) => m.slug === "personas");
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

  const sensibles = !!personas?.campos.some(
    (c) => c.nombre === "datos_sensibles",
  );
  const pasos = useMemo(() => pasosServidor(sensibles), [sensibles]);
  // Resultado de llenar el formulario con una planilla leída.
  const [avisoLectura, setAvisoLectura] = useState("");
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
    personaInicial: estado?.persona,
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
  // Editando: la participación y sus asignaciones de área tal como están.
  const [original, setOriginal] = useState<{
    participacion: Registro;
    servicios: Registro[];
  } | null>(null);

  useEffect(() => {
    if (!editando) return;
    Promise.all([
      api<Registro>(`/participaciones/${editando}/`),
      api<Pagina<Registro>>(
        `/servicios/?participacion=${editando}&page_size=100`,
      ),
    ])
      .then(async ([participacion, { results: servicios }]) => {
        await registro.elegirPersona(participacion.persona as string);
        const valores = datosDeParticipacion(participacion, servicios);
        for (const [campo, valor] of Object.entries(valores)) {
          formulario.setValue(campo as keyof ValoresServidor, valor as never);
        }
        setEtiquetas({ retiro: participacion.retiro_etiqueta as string });
        registro.setAviso("");
        setOriginal({ participacion, servicios });
      })
      .catch((e: Error) => {
        registro.setError(e.message);
        registro.setErrorCarga(e);
      });
    // Solo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  if (!puede("personas") || !puede("participaciones") || !puede("servicios")) {
    return <NotFound />;
  }
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
          : "/participaciones",
    );

  const { persona } = registro;
  const nombreArea = (id: string) => areas.find((a) => a.id === id)?.nombre;

  const siguiente = async () => {
    if (!(await asistente.validarActual())) return;
    if (asistente.actual === 0 && !editando) {
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
    try {
      await registro.guardarFoto(guardada);
    } catch (err) {
      registro.setError((err as Error).message);
      return;
    }
    let participacion: Registro;
    try {
      // 2. Su lugar en el equipo del retiro (o los cambios, si se edita).
      participacion = await api<Registro>(
        editando ? `/participaciones/${editando}/` : "/participaciones/",
        {
          method: editando ? "PATCH" : "POST",
          body: {
            retiro: v.retiro,
            persona: guardada.id,
            tipo: v.tipo,
            ...cuerpoDisponibilidad(v),
          },
        },
      );
    } catch (err) {
      errorDeApi(
        err,
        campoDeParticipacion,
        "Los datos de la persona se guardaron, pero no su lugar en el equipo: ",
      );
      return;
    }
    // 3. Una asignación por área. Editando: se borran las que dejó, se
    // actualiza si coordina y se crean las nuevas.
    const fallidas: string[] = [];
    const antes = new Map(
      (original?.servicios ?? []).map((s) => [String(s.area), s]),
    );
    for (const [area, asignacion] of antes) {
      try {
        if (!v.areas.includes(area)) {
          await api(`/servicios/${asignacion.id}/`, { method: "DELETE" });
        } else if (v.coordina.includes(area) !== asignacion.es_coordinador) {
          await api(`/servicios/${asignacion.id}/`, {
            method: "PATCH",
            body: { es_coordinador: v.coordina.includes(area) },
          });
        }
      } catch {
        fallidas.push(nombreArea(area) ?? area);
      }
    }
    for (const area of v.areas.filter((a) => !antes.has(a))) {
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
    if (editando) {
      if (fallidas.length) {
        registro.setError(
          `Se guardaron los cambios, salvo en las áreas: ${fallidas.join(", ")}.`,
        );
        return;
      }
      salir(guardada.id);
      return;
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
        `Se registró en el equipo, pero no en: ${fallidas.join(", ")}. Agrégalas desde la ficha de la persona.`,
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
        onDocumento={() =>
          // Editando no se busca a otra persona: se corrige el documento.
          !editando && registro.buscarPorDocumento(pasos[0].campos)
        }
        edicion={!!editando}
        avisoDocumento={registro.aviso}
        etiquetas={etiquetas}
        onEtiqueta={(nombre, etiqueta) =>
          setEtiquetas((e) => ({ ...e, [nombre]: etiqueta }))
        }
        onRetiro={(id) => id && registro.usarParroquiaDe(id)}
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
    servicio: <PasoServicio onAreas={setAreas} />,
    disponibilidad: <PasoDisponibilidad />,
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
          if (campo === "duerme") {
            return valor === "si" ? "Sí" : valor === "no" ? "No" : "";
          }
          if (campo === "turnos") return resumenTurnos(valor as string[]);
          if (campo === "camisas" || campo === "tallas") {
            const lista = campo === "camisas" ? CAMISAS : TALLAS_CAMISA;
            return (valor as string[])
              .map((c) => lista.find((o) => o.valor === c)?.etiqueta ?? c)
              .join(", ");
          }
          return undefined;
        }}
      />
    ),
  };

  return (
    <>
      <PageMeta
        title={`${editando ? "Editar servidor" : "Registrar servidor"} | Betania`}
        description="Registrar a un servidor en el equipo de un retiro, paso a paso"
      />
      <PageBreadcrumb
        pageTitle={
          editando
            ? `Editar servidor · ${registro.persona?.nombre ?? ""}`
            : "Registrar servidor"
        }
      />

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
          tipo="servidor"
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
            textoGuardar={editando ? "Guardar cambios" : "Registrar servidor"}
            textoReiniciar={editando ? "Cancelar" : undefined}
            onEmpezarDeNuevo={() => {
              if (editando) {
                return salir(original?.participacion.persona as string);
              }
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
