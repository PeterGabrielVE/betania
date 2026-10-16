import PantallaError from "@/components/estados/PantallaError";

// 404. `completa`: fuera del menú (una ruta que no existe).
export default function NotFound({ completa = false }: { completa?: boolean }) {
  return <PantallaError tipo="no_encontrado" completa={completa} />;
}
