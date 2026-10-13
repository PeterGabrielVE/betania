import { useAuth } from "@/context/AuthContext";
import { Navigate, Outlet, useLocation } from "react-router";

// Protege las rutas del panel: sin sesión de Django, manda a /signin.
export default function RequireAuth() {
  const { sesion } = useAuth();
  const location = useLocation();

  if (sesion === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        Cargando…
      </div>
    );
  }
  if (!sesion.autenticado) {
    return (
      <Navigate to="/signin" replace state={{ desde: location.pathname }} />
    );
  }
  return <Outlet />;
}
