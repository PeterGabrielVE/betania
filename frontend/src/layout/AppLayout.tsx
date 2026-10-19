import { useAuth } from "@/context/AuthContext";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { cn } from "@/utils";
import AvisoInactividad from "@/components/auth/AvisoInactividad";
import PiePagina from "@/components/common/PiePagina";
import ErrorBoundary from "@/components/estados/ErrorBoundary";
import { Outlet, useLocation } from "react-router";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import Backdrop from "./Backdrop";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { sesion } = useAuth();
  const { pathname } = useLocation();
  // Al cambiar la edición o la moneda preferidas, la página se vuelve a
  // abrir con ellas (datos, filtros y formularios por defecto).
  const preferencias = sesion?.autenticado
    ? `${sesion.preferencias.retiro?.id ?? ""}-${sesion.preferencias.moneda_vista}`
    : "";

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <Backdrop />
      {/* Pregunta si seguir conectado antes de cerrar por inactividad. */}
      <AvisoInactividad />

      <div
        className={cn(
          // min-w-0: una tabla ancha se desplaza dentro de su caja en vez de
          // ensanchar toda la página.
          // flex-col: el pie queda abajo aunque la página sea corta.
          "flex min-h-screen min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-in-out",
          isExpanded || isHovered ? "xl:ms-72.5" : "xl:ms-22.5",
          isMobileOpen ? "ms-0" : "",
        )}
      >
        <AppHeader />
        <main className="mx-auto w-full max-w-(--breakpoint-2xl) flex-1 p-4 md:p-6">
          {/* Si la pantalla falla al dibujarse: "Algo salió mal" (se reintenta
              al ir a otra página). */}
          <ErrorBoundary clave={pathname}>
            <Outlet key={preferencias} />
          </ErrorBoundary>
        </main>
        <PiePagina />
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
