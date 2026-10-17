import {
  api,
  ApiError,
  SESION_VENCIDA,
  type Modulo,
  type Preferencias,
  type Sesion,
} from "@/api/client";
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
  // Si al abrir la app el sistema no respondió (sin conexión, error 500…).
  errorInicial?: ApiError;
  // La sesión se cerró sola (venció o cambió la contraseña en otro lado).
  vencida?: boolean;
};

type AuthContextType = Estado & {
  reintentar: () => void;
  // Vuelve a pedir la sesión sin pasar por la pantalla de carga (p. ej. al
  // cambiar el correo en Mi cuenta).
  refrescar: () => Promise<void>;
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

  const iniciar = useCallback(() => {
    api<Sesion>("/auth/sesion/")
      .then(cargar)
      .then(setEstado)
      .catch((e) => {
        // Sin conexión o el servidor caído: no es "sin sesión", es que el
        // sistema no está; se muestra eso con la opción de reintentar.
        if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
          setEstado({ sesion: null, modulos: [], errorInicial: e });
        } else {
          setEstado({ sesion: { autenticado: false }, modulos: [] });
        }
      });
  }, []);

  useEffect(() => {
    iniciar();
  }, [iniciar]);

  // Sesión vencida: se marca como cerrada y RequireAuth manda a iniciar
  // sesión (y después vuelve a la página donde estaba).
  useEffect(() => {
    const vencida = () =>
      setEstado((e) =>
        e.sesion?.autenticado
          ? { sesion: { autenticado: false }, modulos: [], vencida: true }
          : e,
      );
    window.addEventListener(SESION_VENCIDA, vencida);
    return () => window.removeEventListener(SESION_VENCIDA, vencida);
  }, []);

  const refrescar = useCallback(async () => {
    setEstado(await cargar(await api<Sesion>("/auth/sesion/")));
  }, []);

  const reintentar = useCallback(() => {
    setEstado({ sesion: null, modulos: [] });
    iniciar();
  }, [iniciar]);

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
      value={{
        ...estado,
        login,
        logout,
        cambiarPreferencias,
        reintentar,
        refrescar,
      }}
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
