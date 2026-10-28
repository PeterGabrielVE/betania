import Badge from "@/components/ui/badge/Badge";

// Los líderes ocultos (servidores que van entre los caminantes) salen en las
// tablas de caminantes con su fila de un color suave, una etiqueta y esta
// explicación al pasar el cursor.
export const textoLiderOculto =
  "Líder oculto: servidor que va entre los caminantes. No cuenta en el cupo y paga la cuota de servidor.";
export const claseFilaLider =
  "bg-brand-25 hover:bg-brand-50 dark:bg-brand-500/10 dark:hover:bg-brand-500/15";

export function EtiquetaLider() {
  return (
    <span className="ms-2 inline-block align-middle" title={textoLiderOculto}>
      <Badge size="sm" color="primary">
        Líder oculto
      </Badge>
    </span>
  );
}

// Bajo la tabla: qué significa la fila resaltada (solo si hay alguna).
export function LeyendaLiderOculto({ total }: { total: number }) {
  if (total === 0) return null;
  return (
    <p className="flex items-center gap-2 text-theme-xs text-gray-500 dark:text-gray-400">
      <span
        className="size-3 shrink-0 rounded-sm border border-brand-200 bg-brand-25 dark:border-brand-500/30 dark:bg-brand-500/10"
        aria-hidden="true"
      />
      {textoLiderOculto}
      {total > 1 && ` (${total})`}
    </p>
  );
}
