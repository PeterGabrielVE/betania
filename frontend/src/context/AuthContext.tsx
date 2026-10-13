import { api, type Modulo, type Sesion } from "@/api/client";
import { configurarFormato } from "@/utils/formato";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Estado = {
  // null mientras se consulta la sesión al cargar la app.
  sesion: Sesion | null;
  // Módulos que el usuario puede ver (menú, tablas y formularios).
  modulos: Modulo[];
};

type AuthContextType = Estado & {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function cargar(sesion: Sesion): Promise<Estado> {
  if (sesion.autenticado) configurarFormato(sesion.region, sesion.moneda);
  const modulos = sesion.autenticado ? await api<Modulo[]>("/esquema/") : [];
  return { sesion, modulos };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [estado, setEstado] = useState<Estado>({ sesion: null, modulos: [] });

  useEffect(() => {
    api<Sesion>("/auth/sesion/")
      .then(cargar)
      .then(setEstado)
      .catch(() => setEstado({ sesion: { autenticado: false }, modulos: [] }));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const sesion = await api<Sesion>("/auth/login/", {
      method: "POST",
      body: { username, password },
    });
    setEstado(await cargar(sesion));
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout/", { method: "POST" });
    // Django rota el token CSRF al cerrar sesión: se pide uno nuevo.
    setEstado(await cargar(await api<Sesion>("/auth/sesion/")));
  }, []);

  return (
    <AuthContext.Provider value={{ ...estado, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
