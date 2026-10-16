import { api, ApiError } from "@/api/client";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { fecha } from "@/utils/formato";
import { useEffect, useState } from "react";
import { claseBoton, claseControl } from "./estilos";

type Cuenta = {
  persona: string;
  tiene_cuenta: boolean;
  username: string;
  email: string;
  activo: boolean;
  ultimo_acceso: string | null;
  es_superusuario: boolean;
};

const claseEtiqueta =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

// Una contraseña de 14 caracteres fácil de dictar (sin 0/O ni 1/l).
function generarClave() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const azar = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(azar, (n) => letras[n % letras.length]).join("");
}

// La cuenta con que entra un usuario: nombre de usuario, correo y contraseña.
// Lo que puede hacer lo dicen sus roles (módulo Roles), no esto.
export default function DialogoCuenta({
  usuarioId,
  onCerrar,
  onGuardado,
}: {
  usuarioId: string;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [valores, setValores] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [verClave, setVerClave] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vigente = true;
    api<Cuenta>(`/usuarios/${usuarioId}/cuenta/`)
      .then((c) => {
        if (!vigente) return;
        setCuenta(c);
        setValores({ username: c.username, email: c.email, password: "" });
      })
      .catch((e: Error) => vigente && setErrores({ general: e.message }));
    return () => {
      vigente = false;
    };
  }, [usuarioId]);

  const poner = (campo: keyof typeof valores, valor: string) =>
    setValores((v) => ({ ...v, [campo]: valor }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    try {
      const c = await api<Cuenta>(`/usuarios/${usuarioId}/cuenta/`, {
        method: "POST",
        body: valores,
      });
      setCuenta(c);
      setListo(true);
      onGuardado();
    } catch (err) {
      setErrores(
        err instanceof ApiError && Object.keys(err.campos).length
          ? Object.fromEntries(
              Object.entries(err.campos).map(([c, m]) => [c, m.join(" ")]),
            )
          : { general: (err as Error).message },
      );
    } finally {
      setGuardando(false);
    }
  };

  const error = (campo: string) =>
    errores[campo] && (
      <p className="mt-1 text-theme-xs text-error-500" role="alert">
        {errores[campo]}
      </p>
    );

  return (
    <Modal isOpen onClose={onCerrar} className="m-4 max-w-md">
      <div className="p-6">
        <h3 className="mb-1 pe-12 text-lg font-semibold text-gray-800 dark:text-white/90">
          {cuenta?.tiene_cuenta ? "Cuenta de acceso" : "Crear cuenta de acceso"}
        </h3>
        <p className="mb-5 pe-12 text-theme-sm text-gray-500 dark:text-gray-400">
          {cuenta ? (
            <>
              {cuenta.persona}
              {cuenta.tiene_cuenta &&
                ` · último acceso: ${cuenta.ultimo_acceso ? fecha(cuenta.ultimo_acceso) : "nunca"}`}
              {!cuenta.activo && " · usuario desactivado: no puede entrar"}
            </>
          ) : (
            "Cargando…"
          )}
        </p>

        {listo ? (
          <>
            <p className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/15 dark:text-success-400">
              Cuenta guardada. Entra con el usuario{" "}
              <strong>{cuenta?.username}</strong>
              {valores.password && (
                <>
                  {" "}
                  y la contraseña <strong>{valores.password}</strong> (anótala:
                  no se vuelve a mostrar)
                </>
              )}
              . Lo que puede hacer depende de sus roles.
            </p>
            <div className="mt-6 flex justify-end">
              <Button size="sm" onClick={onCerrar}>
                Listo
              </Button>
            </div>
          </>
        ) : (
          cuenta && (
            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label htmlFor="cuenta-usuario" className={claseEtiqueta}>
                  Nombre de usuario <span className="text-error-500">*</span>
                </label>
                <input
                  id="cuenta-usuario"
                  className={`${claseControl} w-full`}
                  autoComplete="off"
                  autoFocus
                  placeholder="Ej.: ana.perez"
                  value={valores.username}
                  onChange={(e) => poner("username", e.target.value)}
                />
                {error("username")}
              </div>
              <div>
                <label htmlFor="cuenta-correo" className={claseEtiqueta}>
                  Correo
                </label>
                <input
                  id="cuenta-correo"
                  type="email"
                  className={`${claseControl} w-full`}
                  value={valores.email}
                  onChange={(e) => poner("email", e.target.value)}
                />
                {error("email")}
              </div>
              <div>
                <label htmlFor="cuenta-clave" className={claseEtiqueta}>
                  {cuenta.tiene_cuenta ? "Nueva contraseña" : "Contraseña"}
                  {!cuenta.tiene_cuenta && (
                    <span className="text-error-500"> *</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    id="cuenta-clave"
                    type={verClave ? "text" : "password"}
                    autoComplete="new-password"
                    className={`${claseControl} w-full`}
                    placeholder={
                      cuenta.tiene_cuenta ? "Vacía: no se cambia" : undefined
                    }
                    value={valores.password}
                    onChange={(e) => poner("password", e.target.value)}
                  />
                  <button
                    type="button"
                    className={`${claseBoton} whitespace-nowrap`}
                    onClick={() => {
                      poner("password", generarClave());
                      setVerClave(true);
                    }}
                  >
                    Generar
                  </button>
                </div>
                {errores.password ? (
                  error("password")
                ) : (
                  <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
                    Al menos 8 caracteres, que no sea solo números ni parecida
                    al nombre.
                  </p>
                )}
              </div>
              {errores.general && (
                <p className="text-sm text-error-500" role="alert">
                  {errores.general}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className={claseBoton} onClick={onCerrar}>
                  Volver
                </button>
                <Button size="sm" disabled={guardando}>
                  {guardando
                    ? "Guardando…"
                    : cuenta.tiene_cuenta
                      ? "Guardar"
                      : "Crear cuenta"}
                </Button>
              </div>
            </form>
          )
        )}
      </div>
    </Modal>
  );
}
