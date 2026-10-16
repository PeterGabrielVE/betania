import type { Campo, Registro } from "@/api/client";
import Badge from "@/components/ui/badge/Badge";
import { FilePdfIcon } from "@/icons";
import { colorEstado, dinero, fecha } from "@/utils/formato";

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
      // Lo sirve Django (p. ej. la lista en PDF de un retiro), no React Router.
      return (
        <a
          href={valor as string}
          className="inline-flex size-8 items-center justify-center rounded-lg text-error-600 hover:bg-error-50 dark:text-error-500 dark:hover:bg-error-500/10"
          title={`Descargar ${campo.etiqueta.toLowerCase()} en PDF`}
          aria-label={`Descargar ${campo.etiqueta.toLowerCase()} de ${fila.etiqueta} en PDF`}
        >
          <FilePdfIcon className="size-5" aria-hidden="true" />
        </a>
      );
    default:
      return valor === null || valor === "" ? "—" : String(valor);
  }
}
