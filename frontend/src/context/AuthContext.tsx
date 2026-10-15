import { api, type Modulo, type Preferencias, type Sesion } from "@/api/client";
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
  // Cambia la edición y/o la moneda preferidas (se guardan en el servidor).
  cambiarPreferencias: (datos: {
    retiro?: string | null;
    moneda?: string;
  }) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// La edición preferida va por defecto en los campos y filtros "retiro".
function conEdicion(modulos: Modulo[], pref: Preferencias): Modulo[] {
  const retiro = pref.retiro;
  if (!retiro) return modulos;
  const predeterminado = { valor: retiro.id, etiqueta: retiro.etiqueta };
  const marcar = (campos: Modulo["campos"]) =>
    campos.map((c) =>
      c.nombre === "retiro" && !c.fijo ? { ...c, predeterminado } : c,
    );
  return modulos.map((m) => ({
    ...m,
    campos: marcar(m.campos),
    filtros: marcar(m.filtros),
  }));
}

async function cargar(sesion: Sesion): Promise<Estado> {
  if (!sesion.autenticado) return { sesion, modulos: [] };
  const { preferencias: pref } = sesion;
  configurarFormato(
    sesion.region,
    sesion.moneda,
    pref.moneda_vista,
    pref.factor,
  );
  const modulos = await api<Modulo[]>("/esquema/");
  return { sesion, modulos: conEdicion(modulos, pref) };
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

  const cambiarPreferencias = useCallback(
    async (datos: { retiro?: string | null; moneda?: string }) => {
      const sesion = await api<Sesion>("/auth/preferencias/", {
        method: "PATCH",
        body: datos,
      });
      setEstado(await cargar(sesion));
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{ ...estado, login, logout, cambiarPreferencias }}
    >
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
