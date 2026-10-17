// Las secciones del tablero de inicio que cada usuario puede mostrar u
// ocultar (se guardan en Preferencias.tablero_ocultos). Las claves no deben
// cambiar: son las que quedan guardadas.
import type { Resumen } from "@/api/client";

export type Seccion = {
  clave: string;
  titulo: string;
  grupo: "Del retiro" | "En general";
  // Si este usuario la tiene (según su rol y lo que trae el retiro).
  hay: (r: Resumen) => boolean;
};

const conTablero = (r: Resumen) => !!r.tablero;

export const SECCIONES: Seccion[] = [
  {
    clave: "cifras",
    titulo: "Cifras principales",
    grupo: "Del retiro",
    hay: conTablero,
  },
  {
    clave: "confirmados",
    titulo: "Asistencia confirmada",
    grupo: "Del retiro",
    hay: (r) => !!r.tablero?.caminantes,
  },
  {
    clave: "tesoreria",
    titulo: "Tesorería (pagos)",
    grupo: "Del retiro",
    hay: (r) => !!r.tablero?.caminantes?.pagos,
  },
  {
    clave: "estados",
    titulo: "Caminantes por estado",
    grupo: "Del retiro",
    hay: (r) => !!r.tablero?.caminantes,
  },
  {
    clave: "indicadores",
    titulo: "Pagos completos y atención especial",
    grupo: "Del retiro",
    hay: (r) => {
      const c = r.tablero?.caminantes;
      return !!c && (!!c.atencion || c.confirmados_pagados !== undefined);
    },
  },
  {
    clave: "recaudacion",
    titulo: "Recaudación acumulada",
    grupo: "Del retiro",
    hay: (r) => !!r.tablero?.finanzas,
  },
  {
    clave: "balance",
    titulo: "Balance y gastos",
    grupo: "Del retiro",
    hay: (r) => !!r.tablero?.finanzas,
  },
  {
    clave: "servidores_area",
    titulo: "Servidores por área",
    grupo: "Del retiro",
    hay: (r) => !!r.tablero?.servidores,
  },
  {
    clave: "pendientes",
    titulo: "Pendientes",
    grupo: "Del retiro",
    hay: conTablero,
  },
  {
    clave: "cumpleanos",
    titulo: "Cumpleaños",
    grupo: "Del retiro",
    hay: conTablero,
  },
  {
    clave: "accesos",
    titulo: "Accesos rápidos",
    grupo: "Del retiro",
    hay: conTablero,
  },
  {
    clave: "proximos",
    titulo: "Próximos retiros",
    grupo: "En general",
    hay: () => true,
  },
  {
    clave: "totales",
    titulo: "En todos los retiros",
    grupo: "En general",
    hay: () => true,
  },
];
