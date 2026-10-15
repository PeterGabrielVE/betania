// Lo que se pide en cada paso del formulario de inscripción.
import { api, type Registro } from "@/api/client";
import SelectorRemoto from "@/components/modulos/SelectorRemoto";
import { fecha } from "@/utils/formato";
import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  AreaTexto,
  Casilla,
  Celular,
  Grupo,
  Opciones,
  Relacion,
  Texto,
  Ubicacion,
  type Lugar,
} from "./Campos";
import {
  CON_PAREJA,
  EDAD_MINIMA,
  ESTADOS_CIVILES,
  ETIQUETAS as E,
  normalizarDocumento,
  TALLAS,
  TIPOS_DOCUMENTO,
  type Campo,
  type Paso,
  type Valores,
} from "./esquema";

type Opcion = { valor: string; etiqueta: string };
const comoOpciones = (lista: string[]): Opcion[] =>
  lista.map((v) => ({ valor: v, etiqueta: v }));

export function PasoIdentificacion({
  persona,
  onPersona,
  onDocumento,
  avisoDocumento,
  etiquetas,
  onEtiqueta,
  onRetiro,
  estados,
}: {
  persona: Registro | null;
  onPersona: (id: string | null) => void;
  onDocumento: () => void; // busca a la persona por su documento
  avisoDocumento: string;
  etiquetas: Record<string, string>;
  onEtiqueta: (nombre: string, etiqueta: string) => void;
  onRetiro: (id: string | null) => void;
  estados: Opcion[];
}) {
  const { register } = useFormContext<Valores>();
  return (
    <div className="space-y-6">
      <Grupo>
        <Relacion
          nombre="retiro"
          etiqueta={E.retiro}
          obligatorio
          recurso="retiros"
          placeholder="Buscar retiro…"
          etiquetas={etiquetas}
          onEtiqueta={onEtiqueta}
          onElegir={onRetiro}
        />
        <Opciones
          nombre="estado"
          etiqueta={E.estado}
          obligatorio
          opciones={estados}
        />
      </Grupo>
      <Grupo titulo="Documento de identidad">
        <Opciones
          nombre="tipo_documento"
          etiqueta={E.tipo_documento}
          obligatorio
          opciones={TIPOS_DOCUMENTO}
        />
        <Texto
          nombre="documento"
          etiqueta={E.documento}
          obligatorio
          placeholder="Ej.: 12345678"
          ayuda="Si ya está registrada, sus datos se cargan solos."
          registro={register("documento", { onBlur: onDocumento })}
        />
        {avisoDocumento && (
          <p
            className="rounded-lg bg-brand-25 px-4 py-3 text-theme-sm text-brand-600 sm:col-span-2 dark:bg-brand-500/10 dark:text-brand-400"
            role="status"
          >
            {avisoDocumento}
          </p>
        )}
      </Grupo>
      <div className="rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700">
        <p className="mb-1 text-theme-sm font-medium text-gray-800 dark:text-white/90">
          ¿No recuerdas el documento?
        </p>
        <p className="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
          Si la persona ya está registrada, también puedes buscarla por nombre o
          teléfono para no duplicarla.
        </p>
        <SelectorRemoto
          recurso="personas"
          valor={persona?.id ?? null}
          etiqueta={persona?.etiqueta ?? ""}
          onChange={onPersona}
          placeholder="Buscar por nombre, documento o teléfono…"
          className="w-full sm:w-96"
        />
      </div>
      <Grupo>
        <Relacion
          nombre="padrino"
          etiqueta={E.padrino}
          recurso="personas"
          placeholder="Buscar persona…"
          ayuda="Opcional. Quien le habló del retiro."
          etiquetas={etiquetas}
          onEtiqueta={onEtiqueta}
        />
      </Grupo>
    </div>
  );
}

export function PasoPersonales({
  sensibles,
  paises,
}: {
  sensibles: boolean;
  paises: Lugar[];
}) {
  return (
    <div className="space-y-6">
      <Grupo>
        <Texto nombre="nombre" etiqueta={E.nombre} obligatorio ancho />
        <Texto
          nombre="fecha_nacimiento"
          etiqueta={E.fecha_nacimiento}
          tipo="date"
          obligatorio
          ayuda={`Desde ${EDAD_MINIMA} años.`}
        />
        {sensibles && <Texto nombre="ocupacion" etiqueta={E.ocupacion} />}
      </Grupo>
      <Grupo titulo="Cómo localizarlo">
        <Celular nombre="telefono" etiqueta={E.telefono} obligatorio />
        {sensibles && (
          <Texto
            nombre="telefono_casa"
            etiqueta={E.telefono_casa}
            tipo="tel"
            placeholder="Ej.: 0212-1234567"
          />
        )}
        <Texto nombre="email" etiqueta={E.email} tipo="email" />
      </Grupo>
      <Grupo titulo="De dónde es">
        <Ubicacion paises={paises} />
        {sensibles && (
          <AreaTexto
            nombre="direccion"
            etiqueta={E.direccion}
            placeholder="Ej.: Urb. La Florida, calle 3, casa 12"
          />
        )}
      </Grupo>
    </div>
  );
}

export function PasoFamilia() {
  const estadoCivil = useWatch<Valores, "estado_civil">({
    name: "estado_civil",
  });
  const conPareja = CON_PAREJA.includes(estadoCivil);
  return (
    <div className="space-y-6">
      <Grupo>
        <Opciones
          nombre="estado_civil"
          etiqueta={E.estado_civil}
          obligatorio
          opciones={comoOpciones(ESTADOS_CIVILES)}
        />
      </Grupo>
      {conPareja && (
        <Grupo titulo="Pareja">
          <Texto
            nombre="pareja_nombre"
            etiqueta={E.pareja_nombre}
            obligatorio
            ancho
          />
          <Texto
            nombre="pareja_telefono"
            etiqueta={E.pareja_telefono}
            tipo="tel"
          />
          <Celular nombre="pareja_celular" etiqueta={E.pareja_celular} />
          <Texto
            nombre="pareja_correo"
            etiqueta={E.pareja_correo}
            tipo="email"
          />
        </Grupo>
      )}
      <Grupo titulo="Hijos">
        <Texto nombre="hijos" etiqueta={E.hijos} tipo="number" />
        <Texto
          nombre="edades_hijos"
          etiqueta={E.edades_hijos}
          placeholder="Ej.: 4, 9 y 15"
        />
      </Grupo>
      <Grupo titulo="Sacramentos">
        <Casilla nombre="bautismo" etiqueta={E.bautismo} />
        <Casilla nombre="confirmacion" etiqueta={E.confirmacion} />
        <Casilla nombre="matrimonio" etiqueta={E.matrimonio} />
        <Casilla nombre="uncion" etiqueta={E.uncion} />
        <Texto nombre="parroquia_asiste" etiqueta={E.parroquia_asiste} ancho />
      </Grupo>
    </div>
  );
}

export function PasoSalud() {
  return (
    <div className="space-y-6">
      <p className="text-theme-sm text-gray-500 dark:text-gray-400">
        Si algo no aplica, déjalo vacío. Esta información solo la ven
        coordinación y logística.
      </p>
      <Grupo>
        <AreaTexto
          nombre="condicion_medica"
          etiqueta={E.condicion_medica}
          placeholder="Ej.: diabetes, hipertensión, alergias…"
        />
        <AreaTexto
          nombre="tratamiento"
          etiqueta={E.tratamiento}
          placeholder="Qué toma y a qué hora"
        />
        <AreaTexto
          nombre="regimen_alimenticio"
          etiqueta={E.regimen_alimenticio}
          placeholder="Ej.: sin gluten, vegetariano, sin sal…"
        />
        <AreaTexto
          nombre="requerimientos"
          etiqueta={E.requerimientos}
          placeholder="Ej.: silla de ruedas, cama baja, no puede subir escaleras…"
        />
        <Opciones
          nombre="talla_camiseta"
          etiqueta={E.talla_camiseta}
          obligatorio
          opciones={comoOpciones(TALLAS)}
        />
      </Grupo>
    </div>
  );
}

export function PasoContactos() {
  return (
    <div className="space-y-6">
      <Grupo titulo="Persona a quien llamar">
        <Texto
          nombre="contacto_nombre"
          etiqueta={E.contacto_nombre}
          obligatorio
        />
        <Texto
          nombre="contacto_relacion"
          etiqueta={E.contacto_relacion}
          obligatorio
          placeholder="Ej.: madre, esposa, hermano"
        />
        <Celular
          nombre="contacto_celular"
          etiqueta={E.contacto_celular}
          obligatorio
          ayuda="Celular o teléfono de casa: al menos uno."
        />
        <Texto
          nombre="contacto_telefono"
          etiqueta={E.contacto_telefono}
          tipo="tel"
          placeholder="Ej.: 0212-1234567"
        />
        <Texto
          nombre="contacto_correo"
          etiqueta={E.contacto_correo}
          tipo="email"
          ancho
        />
      </Grupo>
      <Grupo titulo="Otro familiar (opcional)">
        <Texto nombre="contacto2_nombre" etiqueta={E.contacto2_nombre} />
        <Texto nombre="contacto2_relacion" etiqueta={E.contacto2_relacion} />
        <Texto
          nombre="contacto2_telefono"
          etiqueta={E.contacto2_telefono}
          tipo="tel"
        />
      </Grupo>
    </div>
  );
}

// Nombre de un país, estado o ciudad a partir de su id.
function useNombre(recurso: string, id: string) {
  const [nombre, setNombre] = useState<{ id: string; nombre: string }>({
    id: "",
    nombre: "",
  });
  useEffect(() => {
    if (!id) return;
    let vigente = true;
    api<Registro>(`/${recurso}/${id}/`)
      .then((r) => vigente && setNombre({ id, nombre: r.nombre as string }))
      .catch(() => vigente && setNombre({ id, nombre: "" }));
    return () => {
      vigente = false;
    };
  }, [recurso, id]);
  return nombre.id === id ? nombre.nombre : "";
}

// Lo que se va a guardar, por paso, con un enlace para corregir cada parte.
function Resumen({
  pasos,
  etiquetas,
  estados,
  onIr,
}: {
  pasos: Paso[];
  etiquetas: Record<string, string>;
  estados: Opcion[];
  onIr: (indice: number) => void;
}) {
  const { getValues } = useFormContext<Valores>();
  const valores = getValues();
  const lugares: Partial<Record<Campo, string>> = {
    pais: useNombre("paises", valores.pais),
    entidad: useNombre("estados", valores.entidad),
    ciudad: useNombre("ciudades", valores.ciudad),
  };
  const mostrar = (campo: Campo): string => {
    const v = valores[campo];
    if (typeof v === "boolean") return v ? "Sí" : "";
    if (!v) return "";
    if (campo in lugares) return lugares[campo] ?? "";
    if (campo === "tipo_documento") {
      return TIPOS_DOCUMENTO.find((t) => t.valor === v)?.etiqueta ?? v;
    }
    if (campo === "documento") return normalizarDocumento(v);
    if (campo === "retiro" || campo === "padrino")
      return etiquetas[campo] ?? "";
    if (campo === "estado") {
      return estados.find((o) => o.valor === v)?.etiqueta ?? v;
    }
    if (campo === "fecha_nacimiento") return fecha(v);
    return v;
  };

  return (
    <div className="space-y-4">
      {pasos.slice(0, -1).map((paso, i) => {
        const datos = paso.campos
          .filter((c) => c !== "parroquia")
          .map((c) => [c, mostrar(c)] as const)
          .filter(([, v]) => v);
        return (
          <section
            key={paso.id}
            className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                {paso.titulo}
              </h4>
              <button
                type="button"
                onClick={() => onIr(i)}
                className="text-theme-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
              >
                Editar
              </button>
            </div>
            {datos.length === 0 ? (
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                Sin datos.
              </p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {datos.map(([campo, valor]) => (
                  <div key={campo} className="min-w-0">
                    <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                      {campo.startsWith("contacto2_")
                        ? `Otro familiar: ${E[campo].toLowerCase()}`
                        : E[campo]}
                    </dt>
                    <dd className="text-theme-sm break-words whitespace-pre-line text-gray-800 dark:text-white/90">
                      {valor}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function PasoConfirmar(props: {
  pasos: Paso[];
  etiquetas: Record<string, string>;
  estados: Opcion[];
  onIr: (indice: number) => void;
}) {
  return (
    <div className="space-y-6">
      <Resumen {...props} />
      <Grupo>
        <AreaTexto
          nombre="notas"
          etiqueta={E.notas}
          placeholder="Algo más que coordinación deba saber"
        />
      </Grupo>
      <Casilla
        nombre="consentimiento_datos"
        etiqueta="La persona autoriza el uso de sus datos *"
        descripcion="Sus datos solo se usan para organizar el retiro y contactarla; los de salud y contacto los ven únicamente coordinación y logística."
      />
    </div>
  );
}
