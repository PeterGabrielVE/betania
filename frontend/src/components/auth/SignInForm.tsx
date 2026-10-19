import Logo from "@/components/common/Logo";
import PiePagina from "@/components/common/PiePagina";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useState } from "react";
import { Navigate, useLocation } from "react-router";

// En el celular (menos de sm) la pantalla cambia: cabecera azul arriba, arcos
// grises en medio y el formulario sobre fondo oscuro con borde de cúpula. Los
// estilos de esa versión van con max-sm:, así la de escritorio queda igual.
const etiquetaMovil = "max-sm:text-white/90";
const campoMovil =
  "max-sm:border-transparent max-sm:bg-white/8 max-sm:text-white max-sm:placeholder:text-white/40 max-sm:focus:border-brand-400";

export default function SignInForm() {
  const { sesion, vencida, login } = useAuth();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (sesion?.autenticado) {
    return <Navigate to={location.state?.desde ?? "/"} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await login(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col max-sm:overflow-hidden max-sm:bg-gray-50 max-sm:dark:bg-gray-900">
      {/* Celular: cabecera azul en la esquina */}
      <div className="relative z-10 w-4/5 rounded-ee-[6rem] bg-brand-500 px-6 pt-8 pb-12 sm:hidden">
        <Logo claro className="mb-8" />
        <h1 className="text-title-sm font-semibold text-white">
          Iniciar sesión
        </h1>
        <p className="mt-1 text-sm text-white/80">
          Entra con tu usuario y contraseña.
        </p>
      </div>

      {/* Celular: arcos grises de adorno */}
      {/* Los arcos se recortan a su espacio y crecen con él: en una pantalla
          baja no tapan la cabecera. */}
      <div
        aria-hidden
        className="relative min-h-28 flex-1 overflow-hidden sm:hidden"
      >
        <div className="absolute -bottom-4 left-1/2 h-[110%] w-[150%] -translate-x-1/2 rounded-[50%] bg-gray-100 dark:bg-white/3" />
        <div className="absolute -bottom-10 left-1/2 h-[95%] w-[130%] -translate-x-1/2 rounded-[50%] bg-gray-200/70 dark:bg-white/5" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center max-sm:relative max-sm:max-w-none max-sm:flex-none max-sm:bg-brand-950 max-sm:px-6 max-sm:pt-4 max-sm:pb-10">
        {/* Celular: el borde de cúpula del fondo oscuro */}
        <div
          aria-hidden
          className="absolute -top-20 left-1/2 h-40 w-[130%] -translate-x-1/2 rounded-[50%] bg-brand-950 sm:hidden"
        />
        <div className="relative">
          <div className="mb-5 max-sm:hidden sm:mb-8">
            <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">
              Iniciar sesión
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Entra con tu usuario y contraseña del sistema de retiros.
            </p>
          </div>
          {vencida && (
            <p
              role="status"
              className="mb-5 rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
            >
              {vencida === "inactividad"
                ? "Se cerró tu sesión por inactividad."
                : "Tu sesión terminó (venció o se cambió la contraseña)."}{" "}
              Vuelve a iniciar sesión para seguir donde estabas.
            </p>
          )}
          <form onSubmit={handleSubmit}>
            <div className="space-y-6 max-sm:space-y-5">
              <div>
                <Label htmlFor="usuario" className={etiquetaMovil}>
                  Usuario <span className="text-error-500">*</span>{" "}
                </Label>
                <Input
                  id="usuario"
                  name="username"
                  autoComplete="username"
                  required
                  className={campoMovil}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="clave" className={etiquetaMovil}>
                  Contraseña <span className="text-error-500">*</span>{" "}
                </Label>
                <div className="relative">
                  <Input
                    id="clave"
                    name="password"
                    autoComplete="current-password"
                    required
                    type={showPassword ? "text" : "password"}
                    className={campoMovil}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <span
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-e-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeIcon className="size-5 fill-gray-500 max-sm:fill-white/60 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="size-5 fill-gray-500 max-sm:fill-white/60 dark:fill-gray-400" />
                    )}
                  </span>
                </div>
              </div>
              {error && (
                <p
                  className="text-sm text-error-500 max-sm:text-error-400"
                  role="alert"
                >
                  {error}
                </p>
              )}
              <div className="max-sm:flex max-sm:justify-center max-sm:pt-2">
                <Button
                  className="w-full max-sm:w-auto max-sm:rounded-full max-sm:px-12"
                  size="sm"
                  disabled={enviando}
                >
                  {enviando ? "Entrando…" : "Entrar"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
      <PiePagina className="max-sm:bg-brand-950 max-sm:pt-0 max-sm:pb-4 max-sm:text-white/50" />
    </div>
  );
}
