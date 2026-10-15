// Lo que se pide en cada paso del formulario de inscripción.
import SelectorRemoto from "@/components/modulos/SelectorRemoto";
import type { Registro } from "@/api/client";
import { useFormContext, useWatch } from "react-hook-form";
import {
  AreaTexto,
  Casilla,
  Celular,
  Grupo,
  Opciones,
  Relacion,
  Texto,
} from "./Campos";
import {
  CON_PAREJA,
  ESTADOS_CIVILES,
  ETIQUETAS as E,
  TALLAS,
  TIPOS_DOCUMENTO,
  type Paso,
  type Valores,
} from "./esquema";
import Resumen from "./Resumen";

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

export function PasoConfirmar({
  pasos,
  etiquetas,
  estados,
  onIr,
}: {
  pasos: Paso[];
  etiquetas: Record<string, string>; // texto del retiro y del padrino
  estados: Opcion[];
  onIr: (indice: number) => void;
}) {
  // Los del segundo contacto se distinguen del primero.
  const titulos: Record<string, string> = Object.fromEntries(
    Object.entries(E).map(([campo, titulo]) => [
      campo,
      campo.startsWith("contacto2_")
        ? `Otro familiar: ${titulo.toLowerCase()}`
        : titulo,
    ]),
  );
  return (
    <div className="space-y-6">
      <Resumen
        pasos={pasos.slice(0, -1)}
        titulos={titulos}
        onIr={onIr}
        formatear={(campo, valor) => {
          if (campo === "retiro" || campo === "padrino") {
            return valor ? (etiquetas[campo] ?? "") : "";
          }
          if (campo === "estado") {
            return estados.find((o) => o.valor === valor)?.etiqueta;
          }
          return undefined;
        }}
      />
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
