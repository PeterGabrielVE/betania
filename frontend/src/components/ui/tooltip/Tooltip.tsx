import { useId } from "react";

// Texto corto que aparece sobre un control al pasar el mouse o al llegar con
// el teclado; los lectores de pantalla lo leen como su descripción.
export default function Tooltip({
  texto,
  children,
}: {
  texto: string;
  // Recibe el id para enlazarlo con aria-describedby.
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      {children(id)}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md bg-gray-900 px-2.5 py-1.5 text-theme-xs font-medium whitespace-nowrap text-white opacity-0 shadow-theme-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 dark:bg-gray-700"
      >
        {texto}
        <span
          aria-hidden="true"
          className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
        />
      </span>
    </span>
  );
}
