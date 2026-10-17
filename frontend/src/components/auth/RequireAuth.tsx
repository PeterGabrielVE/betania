import { CargaInicial } from "@/components/estados/Esqueleto";
import PantallaError from "@/components/estados/PantallaError";
import { useAuth } from "@/context/AuthContext";
import { Navigate, Outlet, useLocation } from "react-router";

// Protege las rutas del panel: sin sesión de Django, manda a /signin.
export default function RequireAuth() {
  const { sesion, errorInicial, reintentar } = useAuth();
  const location = useLocation();

  if (errorInicial) {
    return (
      <PantallaError error={errorInicial} onReintentar={reintentar} completa />
    );
  }
  if (sesion === null) return <CargaInicial />;
  if (!sesion.autenticado) {
    return (
      <Navigate
        to="/signin"
        replace
        state={{ desde: location.pathname + location.search }}
      />
    );
  }
  return <Outlet />;
}
