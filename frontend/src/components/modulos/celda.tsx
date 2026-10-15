import type { Campo, Registro } from "@/api/client";
import Badge from "@/components/ui/badge/Badge";
import { colorEstado, dinero, fecha } from "@/utils/formato";
import { claseEnlace } from "./estilos";

// Lo que se muestra de un campo en un listado (tabla o tarjeta).
export function celda(campo: Campo, fila: Registro): React.ReactNode {
  const valor = fila[campo.nombre];
  switch (campo.tipo) {
    case "fk":
      return (fila[`${campo.nombre}_etiqueta`] as string) || "—";
    case "opcion": {
      if (valor === null || valor === "") return "—";
      return (
        <Badge size="sm" color={colorEstado(valor as string)}>
          {campo.opciones?.find((o) => o.valor === valor)?.etiqueta ??
            (valor as string)}
        </Badge>
      );
    }
    case "bool":
      return valor ? (
        <span className="text-gray-800 dark:text-white/90">Sí</span>
      ) : (
        <span className="text-gray-400 dark:text-gray-500">No</span>
      );
    case "fecha":
    case "fechahora":
      return fecha(valor as string | null);
    case "decimal":
      // El monto de un pago o gasto va en la moneda en que se hizo.
      return dinero(
        valor as number | null,
        campo.nombre === "monto"
          ? (fila.moneda as string | undefined)
          : undefined,
      );
    case "enlace":
      // Lo sirve Django (p. ej. el PDF de un retiro), no React Router.
      return (
        <a href={valor as string} className={claseEnlace}>
          PDF
        </a>
      );
    default:
      return valor === null || valor === "" ? "—" : String(valor);
  }
}
