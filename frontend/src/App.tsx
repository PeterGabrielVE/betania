import { Route, BrowserRouter as Router, Routes } from "react-router";
import RequireAuth from "./components/auth/RequireAuth";
import { ScrollToTop } from "./components/common/ScrollToTop";
import AppLayout from "./layout/AppLayout";
import SignIn from "./pages/AuthPages/SignIn";
import NotFound from "./pages/OtherPage/NotFound";
import Inicio from "./pages/Retiros/Inicio";
import InscribirCaminante from "./pages/Retiros/InscribirCaminante";
import ModuloPagina from "./pages/Retiros/ModuloPagina";
import EditarPersona from "./pages/Retiros/EditarPersona";
import PersonaFicha from "./pages/Retiros/PersonaFicha";
import RegistrarServidor from "./pages/Retiros/RegistrarServidor";
import Auditoria from "./pages/Retiros/Auditoria";
import ControlPagos from "./pages/Retiros/ControlPagos";
import MiCuenta from "./pages/Retiros/MiCuenta";
import RetiroPanel from "./pages/Retiros/RetiroPanel";
import RolPermisos from "./pages/Retiros/RolPermisos";

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        {/* Panel: requiere sesión de Django */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index path="/" element={<Inicio />} />
            <Route path="/inscribir" element={<InscribirCaminante />} />
            <Route path="/registrar-servidor" element={<RegistrarServidor />} />
            <Route path="/retiros/:id" element={<RetiroPanel />} />
            <Route path="/control-pagos" element={<ControlPagos />} />
            <Route path="/roles/:id/permisos" element={<RolPermisos />} />
            <Route path="/auditoria" element={<Auditoria />} />
            <Route path="/mi-cuenta" element={<MiCuenta />} />
            <Route path="/personas/:id" element={<PersonaFicha />} />
            <Route path="/personas/:id/editar" element={<EditarPersona />} />
            {/* Cualquier módulo de /api/esquema/ (retiros, personas, pagos...) */}
            <Route path="/:slug" element={<ModuloPagina />} />
          </Route>
        </Route>

        <Route path="/signin" element={<SignIn />} />
        <Route path="*" element={<NotFound completa />} />
      </Routes>
    </Router>
  );
}
