import PantallaError from "@/components/estados/PantallaError";
import { EsqueletoFormulario } from "@/components/estados/Esqueleto";
import {
  api,
  ApiError,
  type FichaPersona,
  type Registro,
} from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Asistente from "@/components/inscripcion/Asistente";
import { Grupo, Opciones, Texto } from "@/components/inscripcion/Campos";
import {
  camposFamilia,
  datosDeFamilia,
  ETIQUETAS,
  paresFamilia,
  PASOS,
  reglasFamilia,
  type Paso,
} from "@/components/inscripcion/esquema";
import {
  campoDePersona,
  camposPersona,
  camposPersonaSensibles,
  cuerpoPersona,
  PASO_PERSONALES,
  reglasPersona,
  TIPOS_DOCUMENTO,
  valoresPersona,
  type ValoresPersona,
} from "@/components/inscripcion/esquemaPersona";
import PasoPersonales from "@/components/inscripcion/PasoPersonales";
import { PasoFamilia } from "@/components/inscripcion/PasosFormulario";
import Resumen from "@/components/inscripcion/Resumen";
import { useAsistente } from "@/components/inscripcion/useAsistente";
import { useRegistroPersona } from "@/components/inscripcion/useRegistroPersona";
import { useAuth } from "@/context/AuthContext";
import NotFound from "@/pages/OtherPage/NotFound";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, type FieldErrors } from "react-hook-form";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { z } from "zod";

type Valores = ValoresPersona & Record<string, unknown>;

// Los pasos de este formulario: el documento, los datos personales y, con
// acceso confidencial, familia y fe (los mismos del de caminantes).
function pasosPersona(sensibles: boolean): Paso[] {
  const familia = PASOS.find((p) => p.id === "familia")!;
  const pasos: Paso[] = [
    {
      id: "identificacion",
      titulo: "Identificación",
      descripcion: "Documento de identidad.",
      campos: ["tipo_documento", "documento"],
    },
    {
      id: "personales",
      titulo: "Datos personales",
      descripcion: "Quién es, de dónde es y cómo localizarlo.",
      campos: sensibles
        ? PASO_PERSONALES
        : PASO_PERSONALES.filter((c) => c in camposPersona),
    },
    ...(sensibles ? [familia] : []),
    {
      id: "confirmar",
      titulo: "Confirmar",
      descripcion: "Revisa los datos y guárdalos.",
      campos: [],
    },
  ];
  return pasos;
}

function crearEsquemaEdicion(
  sensibles: boolean,
  conEstados: (pais: string) => boolean,
) {
  const base = z.object({
    ...camposPersona,
    ...(sensibles ? { ...camposPersonaSensibles, ...camposFamilia } : {}),
  });
  return base.superRefine(
    (v, ctx) => {
      const falta = (path: string, message: string) =>
        ctx.addIssue({ code: "custom", path: [path], message });
      reglasPersona(v as Partial<ValoresPersona>, falta, conEstados);
      if (sensibles) reglasFamilia(v as Record<string, string>, falta);
    },
    { when: (p) => typeof p.value === "object" && p.value !== null },
  ) as unknown as z.ZodType<Valores, Valores>;
}

// Si la persona es caminante o servidor, a qué formulario completo ir: el de
// su inscripción (o su lugar en el equipo) en la edición preferida o, si no,
// en el retiro más reciente. Así se edita con los mismos pasos con que se
// inscribió, salud y contactos incluidos. null: no lo es (o no hay permiso).
function formularioCompleto(
  ficha: FichaPersona,
  preferido: string | undefined,
  puede: (slug: string) => boolean,
): string | null {
  const opciones = [
    ...(puede("inscripciones") ? (ficha.caminante ?? []) : []).map((c) => ({
      ruta: `/inscribir?inscripcion=${c.id}`,
      retiro: c.retiro,
      orden: 0,
    })),
    ...(puede("participaciones") ? (ficha.servidor ?? []) : []).map((s) => ({
      ruta: `/registrar-servidor?participacion=${s.id}`,
      retiro: s.retiro,
      orden: 1,
    })),
  ];
  opciones.sort(
    (a, b) =>
      Number(b.retiro.id === preferido) - Number(a.retiro.id === preferido) ||
      b.retiro.fecha_inicio.localeCompare(a.retiro.fecha_inicio) ||
      a.orden - b.orden,
  );
  return opciones[0]?.ruta ?? null;
}

// Editar los datos de una persona con el mismo formulario por pasos con que se
// registra (no el formulario genérico). Al guardar vuelve a ?volver= o a su
// ficha. Un caminante o servidor se edita en su formulario completo (ver
// formularioCompleto).
export default function EditarPersona() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [parametros] = useSearchParams();
  const volver = parametros.get("volver");
  const { modulos, sesion } = useAuth();
  // undefined mientras se averigua; null: se edita aquí.
  const [completo, setCompleto] = useState<string | null | undefined>();
  const preferido = sesion?.autenticado
    ? sesion.preferencias.retiro?.id
    : undefined;
  useEffect(() => {
    let vigente = true;
    const puede = (slug: string) =>
      !!modulos.find((m) => m.slug === slug)?.puede_cambiar;
    api<FichaPersona>(`/personas/${id}/ficha/`)
      .then((ficha) => {
        if (!vigente) return;
        const ruta = formularioCompleto(ficha, preferido, puede);
        if (ruta) {
          const regreso = encodeURIComponent(volver ?? `/personas/${id}`);
          navigate(`${ruta}&volver=${regreso}`, { replace: true });
        }
        setCompleto(ruta);
      })
      .catch(() => vigente && setCompleto(null));
    return () => {
      vigente = false;
    };
    // Solo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const personas = modulos.find((m) => m.slug === "personas");
  const sensibles = !!personas?.campos.some(
    (c) => c.nombre === "datos_sensibles",
  );
  const pasos = useMemo(() => pasosPersona(sensibles), [sensibles]);
  const [venezuela, setVenezuela] = useState("");
  const esquema = useMemo(
    () => crearEsquemaEdicion(sensibles, (pais) => pais === venezuela),
    [sensibles, venezuela],
  );
  const formulario = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: valoresPersona() as Valores,
    mode: "onTouched",
  });
  const asistente = useAsistente(pasos, formulario);
  const registro = useRegistroPersona(formulario, {
    personaInicial: id,
    vaciar: () => ({}),
    datosExtra: sensibles ? datosDeFamilia : undefined,
  });
  if (registro.venezuela !== venezuela) setVenezuela(registro.venezuela);

  if (!personas?.puede_cambiar) return <NotFound />;
  const { persona } = registro;
  if (completo !== null && !registro.errorCarga) return <EsqueletoFormulario />;
  if (!persona) {
    return registro.errorCarga ? (
      <PantallaError error={registro.errorCarga} />
    ) : (
      <EsqueletoFormulario />
    );
  }

  const salir = () =>
    navigate(volver?.startsWith("/") ? volver : `/personas/${persona.id}`);

  const guardar = async (v: Valores) => {
    registro.setError("");
    try {
      const guardada = await api<Registro>(`/personas/${persona.id}/`, {
        method: "PATCH",
        body: cuerpoPersona(
          v,
          sensibles,
          persona,
          sensibles ? paresFamilia(v) : [],
        ),
      });
      await registro.guardarFoto(guardada);
      salir();
    } catch (err) {
      if (err instanceof ApiError) {
        const marcados: string[] = [];
        for (const [clave, mensajes] of Object.entries(err.campos)) {
          const campo = campoDePersona(clave);
          if (campo) {
            formulario.setError(campo as keyof Valores, {
              message: mensajes.join(" "),
            });
            marcados.push(campo);
          }
        }
        asistente.alPrimero(marcados);
      }
      registro.setError((err as Error).message);
    }
  };

  const contenido: Record<string, React.ReactNode> = {
    identificacion: (
      <Grupo>
        <Opciones
          nombre="tipo_documento"
          etiqueta={ETIQUETAS.tipo_documento}
          obligatorio
          opciones={TIPOS_DOCUMENTO}
        />
        <Texto
          nombre="documento"
          etiqueta={ETIQUETAS.documento}
          obligatorio
          placeholder="Ej.: 12345678"
        />
      </Grupo>
    ),
    personales: (
      <PasoPersonales
        sensibles={sensibles}
        paises={registro.paises}
        foto={registro.foto}
      />
    ),
    familia: <PasoFamilia />,
    confirmar: (
      <Resumen
        pasos={pasos.slice(0, -1)}
        titulos={ETIQUETAS}
        onIr={asistente.irA}
      />
    ),
  };

  return (
    <>
      <PageMeta
        title={`Editar ${persona.nombre} | Betania`}
        description={`Editar los datos de ${persona.nombre}`}
      />
      <PageBreadcrumb pageTitle={`Editar · ${persona.nombre}`} />
      <FormProvider {...formulario}>
        <form
          noValidate
          onSubmit={(e) => {
            if (!asistente.ultimo) {
              e.preventDefault();
              asistente
                .validarActual()
                .then((ok) => ok && asistente.irA(asistente.actual + 1));
              return;
            }
            formulario.handleSubmit(guardar, (fallos: FieldErrors<Valores>) =>
              asistente.alPrimero(Object.keys(fallos)),
            )(e);
          }}
          className="space-y-6"
        >
          <Asistente
            pasos={pasos}
            asistente={asistente}
            general={registro.error}
            guardando={formulario.formState.isSubmitting}
            textoGuardar="Guardar cambios"
            textoReiniciar="Cancelar"
            onEmpezarDeNuevo={salir}
          >
            {contenido[pasos[asistente.actual].id]}
          </Asistente>
        </form>
      </FormProvider>
    </>
  );
}
