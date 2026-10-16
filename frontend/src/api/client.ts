// Cliente de la API de Django (retiros/api.py). Usa la cookie de sesión, así
// que todas las peticiones van al mismo origen.

export class ApiError extends Error {
  status: number;
  // Errores por campo de un formulario: { campo: ["mensaje", ...] }
  campos: Record<string, string[]>;

  constructor(status: number, message: string, campos = {}) {
    super(message);
    this.status = status;
    this.campos = campos;
  }
}

function csrfToken(): string {
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith("csrftoken="));
  return cookie ? decodeURIComponent(cookie.split("=")[1]) : "";
}

function aError(status: number, datos: unknown): ApiError {
  if (Array.isArray(datos)) {
    return new ApiError(status, datos.join(" "));
  }
  if (datos && typeof datos === "object") {
    const { detail, non_field_errors, ...campos } = datos as Record<
      string,
      unknown
    >;
    const general = detail ?? non_field_errors;
    const mensaje = Array.isArray(general)
      ? general.join(" ")
      : typeof general === "string"
        ? general
        : "Revisa los campos marcados.";
    return new ApiError(status, mensaje, campos as Record<string, string[]>);
  }
  return new ApiError(status, `Error ${status} al consultar el servidor.`);
}

export async function api<T>(
  ruta: string,
  opciones: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  } = {},
): Promise<T> {
  const { method = "GET", body } = opciones;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-CSRFToken"] = csrfToken();
  }

  const res = await fetch(`/api${ruta}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    throw aError(res.status, datos);
  }
  return datos as T;
}

// Descarga un archivo de la API (Excel o PDF de una tabla): GET con la ruta o
// POST con el cuerpo. Lo guarda con el nombre que manda el servidor.
export async function descargar(ruta: string, body?: unknown): Promise<void> {
  const res = await fetch(`/api${ruta}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRFToken": csrfToken() },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw aError(res.status, await res.json().catch(() => null));
  }
  const nombre =
    /filename="([^"]+)"/.exec(
      res.headers.get("Content-Disposition") ?? "",
    )?.[1] ?? "descarga";
  const url = URL.createObjectURL(await res.blob());
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Una tabla armada en el navegador, para /api/exportar/. Los montos van como
// número con su moneda, así en Excel se pueden sumar.
export type CeldaDescarga =
  string | number | null | { monto: number; moneda: string };
export type TablaDescarga = {
  titulo: string;
  subtitulo?: string;
  columnas: string[];
  filas: CeldaDescarga[][];
};

export type Sesion =
  | { autenticado: false }
  | {
      autenticado: true;
      username: string;
      nombre: string;
      email: string;
      es_staff: boolean;
      es_superusuario: boolean;
      moneda: string; // ISO 4217: la moneda base
      region: string; // p. ej. "es-CO"
      monedas: { valor: string; etiqueta: string }[];
      preferencias: Preferencias;
    };

// Lo que el usuario eligió en el encabezado (ver retiros/api/sesion.py).
export type Preferencias = {
  retiro: { id: string; etiqueta: string } | null; // la edición
  moneda: string; // la elegida
  // En la que se ven los montos (la base si no hay tasa del BCV) y por cuánto
  // multiplicar un monto en la moneda base para verlo en ella.
  moneda_vista: string;
  factor: number;
  aviso: string;
};

export type Pagina<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

// --- Esquema de módulos (/api/esquema/) ---

export type TipoCampo =
  | "texto"
  | "area"
  | "email"
  | "numero"
  | "decimal" // dinero
  | "cifra" // decimal que no es dinero (una tasa de cambio)
  | "fecha"
  | "fechahora"
  | "bool"
  | "opcion"
  | "fk"
  | "json"
  | "enlace";

export type Campo = {
  nombre: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  opciones?: { valor: string; etiqueta: string }[]; // tipo "opcion"
  recurso?: string; // tipo "fk": slug del módulo relacionado
  seccion?: string; // título bajo el que va en el formulario
  ayuda?: string; // texto bajo el control
  // tipo "json": datos que el formulario pide por separado y guarda en ese JSON
  subcampos?: Campo[];
  // Valor que fija el rol del usuario (p. ej. su parroquia): el filtro no se
  // puede cambiar y el formulario de alta lo trae puesto.
  fijo?: { valor: string; etiqueta: string };
  // Valor por defecto que sale de las preferencias (la edición elegida); a
  // diferencia de `fijo`, se puede cambiar.
  predeterminado?: { valor: string; etiqueta: string };
};

export type Modulo = {
  slug: string;
  titulo: string;
  singular: string;
  grupo: string;
  en_menu: boolean; // false: existe (API, formularios) pero no va en el menú
  campos: Campo[]; // formulario
  lista: Campo[]; // columnas de la tabla
  filtros: Campo[];
  buscable: boolean;
  puede_agregar: boolean;
  puede_cambiar: boolean;
  puede_eliminar: boolean;
};

// Un registro de cualquier módulo. Cada relación trae además `<campo>_etiqueta`.
export type Registro = { id: string; etiqueta: string } & Record<
  string,
  unknown
>;

type Opcion = { valor: string; etiqueta: string };

export type FichaCaminante = {
  edad: number | null;
  documento: string; // "V-12345678"
  procedencia: string; // "Los Teques, Miranda"
  direccion: string; // sector / urbanización / dirección
  telefono_casa: string;
  condicion_medica: string;
  tratamiento: string;
  alimentacion: string;
  requerimientos: string;
  talla_camiseta: string;
  contactos: { nombre: string; relacion: string; telefono: string }[];
  notas: string;
};

// Control de pagos (/api/control-pagos/?retiro=<id>, ver
// retiros/api/control_pagos.py). Montos en la moneda base salvo `monto` de
// un abono, que va en la moneda en que se pagó.
export type Abono = {
  id: string;
  fecha: string;
  monto: number;
  moneda: string;
  monto_base: number;
  metodo: string;
  referencia: string;
  concepto: string;
};
export type FilaControlPago = {
  id: string; // de la inscripción o de la participación
  persona_id: string;
  persona: string;
  telefono: string;
  equipo?: string; // servidores: sus áreas
  estado: string;
  estado_display: string;
  ficha?: FichaCaminante; // caminantes, para quien ve datos confidenciales
  cuota: number;
  cuota_propia: boolean; // no es la del retiro
  abonos: Abono[];
  pagado: number;
  saldo: number;
  estado_pago: string;
  cancelado: boolean;
};
export type GrupoControlPago = {
  cuota: number; // la del retiro
  filas: FilaControlPago[];
  totales: {
    personas: number;
    esperado: number;
    pagado: number;
    saldo: number;
    por_estado_pago: (Opcion & { total: number })[];
  };
};
export type ControlPagos = {
  retiros: { id: string; etiqueta: string; fecha_inicio: string }[];
  retiro: { id: string; etiqueta: string; fecha_inicio: string } | null;
  puede_registrar?: boolean;
  puede_cambiar_monto?: boolean;
  caminantes?: GrupoControlPago | null;
  servidores?: GrupoControlPago | null;
};

// Panel de un retiro (/api/retiros/<id>/panel/). Cada sección llega en null si
// el usuario no tiene permiso para verla.
export type PanelRetiro = {
  retiro: {
    id: string;
    etiqueta: string;
    parroquia: string;
    fecha_inicio: string;
    fecha_fin: string;
    sede: string;
    cupo: number;
    cuota: number;
    cuota_servidor: number;
    estado: string;
    estado_display: string;
  };
  caminantes: {
    filas: {
      id: string;
      persona_id: string;
      persona: string;
      telefono: string;
      padrino: string;
      estado: string;
      motivo_cancelacion: string;
      // Solo para roles con acceso a datos confidenciales:
      ficha?: FichaCaminante;
      // Solo con acceso a finanzas:
      pagado?: number;
      saldo?: number;
      estado_pago?: string;
    }[];
    inscritos: number;
    disponibles: number;
    por_estado: { estado: string; etiqueta: string; total: number }[];
  } | null;
  // Para organizar al equipo: quiénes duermen, cuántos por turno y camisas.
  logistica_equipo: {
    total: number;
    duermen: number;
    no_duermen: number;
    sin_responder: number;
    turnos: (Opcion & { total: number })[]; // valor: "viernes_manana"
    camisas: (Opcion & { total: number })[];
    tallas: (Opcion & { total: number })[];
  } | null;
  equipo: {
    total: number;
    coordinadores: string[];
    sin_area: string[];
    areas: {
      area: string;
      personas: { nombre: string; es_coordinador: boolean }[];
    }[];
  } | null;
  // Lo que lleva pagado cada servidor; solo con acceso a finanzas.
  servidores: {
    filas: {
      id: string;
      persona: string;
      persona_id: string;
      telefono: string;
      tipo: string;
      estado: string; // por_confirmar | confirmado | cancelado
      estado_display: string;
      motivo_cancelacion: string;
      areas: string;
      duerme_en_casa: boolean | null; // null: no lo indicó
      turnos: string; // "Vie: noche · Sáb: todo el día"
      camisa: string; // "Azul de servicio · talla M"
      // Solo con acceso a finanzas:
      pagado?: number;
      saldo?: number;
      estado_pago?: string;
    }[];
    por_estado: { estado: string; etiqueta: string; total: number }[];
    por_cobrar?: number;
  } | null;
  charlas:
    { id: string; orden: number; tema: string; expositor: string }[] | null;
  finanzas: {
    ingresos: number;
    egresos: number;
    balance: number;
    por_cobrar?: number;
    por_concepto: (Opcion & { total: number })[];
    por_categoria: (Opcion & { total: number })[];
  } | null;
  opciones_pago: Opcion[];
};

type Conteo = Opcion & { total: number };

// Tablero de un retiro en el inicio. Cada sección llega en null (o sin sus
// campos de pago) si el usuario no tiene permiso para verla.
export type Tablero = {
  retiro: {
    id: string;
    etiqueta: string;
    fecha_inicio: string;
    fecha_fin: string;
    sede: string;
    cupo: number;
    cuota: number;
    cuota_servidor: number;
    estado: string;
    estado_display: string;
  };
  dias_para_inicio: number;
  dias_para_fin: number;
  caminantes: {
    inscritos: number;
    disponibles: number;
    confirmados: number;
    por_confirmar: number;
    cancelados: number;
    por_estado: { estado: string; etiqueta: string; total: number }[];
    pagos?: Conteo[];
    por_cobrar?: number;
    recaudado?: number;
    // Con acceso a finanzas: de los confirmados, cuántos pagaron completo.
    confirmados_pagados?: number;
    // Con acceso confidencial: a cuántos inscritos atender de forma especial.
    atencion?: {
      activos: number;
      salud: number;
      comida: number;
      requerimientos: number;
    };
  } | null;
  servidores: {
    total: number;
    coordinadores: number;
    sin_area: number;
    por_area: { area: string; total: number }[];
    confirmados?: number;
    por_confirmar?: number;
    cancelados?: number;
    pagos?: Conteo[];
    por_cobrar?: number;
    recaudado?: number;
  } | null;
  finanzas: {
    ingresos: number;
    egresos: number;
    balance: number;
    por_concepto: Conteo[];
    por_categoria: Conteo[];
    // Ingresos acumulados a cada fecha con pagos.
    recaudacion: { fecha: string; total: number }[];
  } | null;
  tareas: {
    pendientes: number;
    vencidas: number;
    hechas: number;
    proximas: {
      id: string;
      titulo: string;
      fecha_limite: string | null;
      responsable: string;
      area: string;
      vencida: boolean;
    }[];
  } | null;
  cumpleanos: {
    nombre: string;
    rol: string;
    fecha: string;
    cumple: number;
    en_dias: number;
    durante_retiro: boolean;
  }[];
  // Pendientes que salen de los datos (por confirmar, deben, sin contacto...).
  alertas: { clave: string; total: number; texto: string; enlace: string }[];
};

export type Resumen = {
  personas: number;
  retiros: number;
  retiros_activos: number;
  inscripciones: number;
  inscripciones_por_estado: {
    estado: string;
    etiqueta: string;
    total: number;
  }[];
  ingresos: number;
  egresos: number;
  balance: number;
  // Tasa oficial del BCV, en bolívares; null si no se pudo consultar.
  tasas_bcv: { fecha: string; USD: number; EUR: number } | null;
  proximos_retiros: {
    id: string;
    etiqueta: string;
    fecha_inicio: string;
    fecha_fin: string;
    cupo: number;
    inscritos: number;
    estado: string;
    estado_display: string;
  }[];
  // Retiros que se pueden elegir en el tablero y el tablero del elegido.
  retiros_tablero: { id: string; etiqueta: string; fecha_inicio: string }[];
  tablero: Tablero | null;
};

// Ficha de una persona (/api/personas/<id>/ficha/). Cada sección llega en null
// si el usuario no tiene permiso para verla.
type RetiroCorto = {
  id: string;
  etiqueta: string;
  fecha_inicio: string;
  estado: string;
};
type PagoResumido = {
  pagado?: number;
  saldo?: number;
  estado_pago?: string;
};

export type FichaPersona = {
  persona: {
    id: string;
    nombre: string;
    documento: string; // "V-12345678"
    fecha_nacimiento: string | null;
    edad: number | null;
    telefono: string;
    email: string;
    procedencia: string;
    parroquia: string;
    creado: string;
    datos_sensibles?: Record<string, unknown>; // solo con acceso confidencial
  };
  caminante:
    | ({
        id: string;
        retiro: RetiroCorto;
        estado: string;
        estado_display: string;
        motivo_cancelacion: string;
        padrino: string;
        padrino_id: string | null;
        salud?: Record<string, unknown>;
        contacto?: Record<string, unknown>;
      } & PagoResumido)[]
    | null;
  servidor:
    | ({
        id: string;
        retiro: RetiroCorto;
        tipo: string;
        tipo_display: string;
        estado: string;
        estado_display: string;
        motivo_cancelacion: string;
        duerme_en_casa: boolean | null;
        turnos: string;
        camisa: string;
        // Una por área: id de la asignación, id del área y si la coordina.
        areas: {
          id: string;
          area: string;
          nombre: string;
          es_coordinador: boolean;
        }[];
      } & PagoResumido)[]
    | null;
  invito:
    | {
        persona_id: string;
        nombre: string;
        retiro: string;
        estado_display: string;
      }[]
    | null;
  tareas:
    | {
        id: string;
        titulo: string;
        retiro: string;
        fecha_limite: string | null;
        vencida: boolean;
      }[]
    | null;
  // null: no tiene usuario; sin la clave: no se puede ver.
  acceso?: {
    usuario: string;
    activo: boolean;
    roles: { rol: string; rol_display: string; ambito: string }[];
  } | null;
};
