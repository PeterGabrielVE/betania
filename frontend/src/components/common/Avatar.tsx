import { cn } from "@/utils";
import { useState } from "react";

const TAMANOS = {
  xs: "size-7",
  sm: "size-9",
  md: "size-11",
  lg: "size-20",
  xl: "size-28",
} as const;

// Colores de la silueta por defecto (fondo y figura).
const COLORES = {
  M: "bg-blue-light-50 text-blue-light-400 dark:bg-blue-light-500/15 dark:text-blue-light-400",
  F: "bg-theme-pink-500/10 text-theme-pink-500/70 dark:bg-theme-pink-500/15 dark:text-theme-pink-500/80",
  "": "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500",
};

// Siluetas por defecto: hombre (cabello corto), mujer (cabello largo) o
// neutra, cuando no se sabe el sexo.
function Silueta({ sexo }: { sexo: "M" | "F" | "" }) {
  return (
    <svg viewBox="0 0 40 40" className="size-full" aria-hidden="true">
      {sexo === "F" && (
        <path
          d="M10.5 18.5c0-7 4.2-11.5 9.5-11.5s9.5 4.5 9.5 11.5v9.5c-2.3 1.2-5.2 1.8-9.5 1.8s-7.2-.6-9.5-1.8z"
          fill="currentColor"
          opacity=".55"
        />
      )}
      <path
        d="M4.5 41c0-8.6 6.9-14 15.5-14s15.5 5.4 15.5 14z"
        fill="currentColor"
      />
      <circle cx="20" cy="17" r="7.3" fill="currentColor" />
      {sexo === "M" && (
        <path
          d="M12.6 16.3c-.2-5.4 3.1-8.8 7.4-8.8s7.6 3.4 7.4 8.8c-1.2-2.4-3.7-3.8-7.4-3.8s-6.2 1.4-7.4 3.8z"
          fill="currentColor"
          opacity=".55"
        />
      )}
      {sexo === "F" && (
        <path
          d="M12.4 17.6c-.3-5.9 3-9.6 7.6-9.6s7.9 3.7 7.6 9.6c-1.9-3.2-4.5-4.9-7.6-4.9s-5.7 1.7-7.6 4.9z"
          fill="currentColor"
          opacity=".55"
        />
      )}
    </svg>
  );
}

// Avatar de una persona: su foto de perfil o, si no tiene (o no carga), la
// silueta por defecto según el sexo.
export default function Avatar({
  foto,
  sexo,
  nombre = "",
  tamano = "sm",
  className,
}: {
  foto?: string | null;
  sexo?: string | null;
  nombre?: string;
  tamano?: keyof typeof TAMANOS;
  className?: string;
}) {
  // La foto que no cargó (borrada, sin acceso): se muestra la silueta.
  const [fallida, setFallida] = useState("");
  const clave = sexo === "M" || sexo === "F" ? sexo : "";
  const conFoto = !!foto && foto !== fallida;
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full",
        TAMANOS[tamano],
        !conFoto && COLORES[clave],
        className,
      )}
      role="img"
      aria-label={nombre ? `Foto de ${nombre}` : "Foto de perfil"}
    >
      {conFoto ? (
        <img
          src={foto}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFallida(foto)}
        />
      ) : (
        <Silueta sexo={clave} />
      )}
    </span>
  );
}
