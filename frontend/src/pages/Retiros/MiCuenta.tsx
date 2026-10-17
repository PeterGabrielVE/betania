import { api, ApiError } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import { EsqueletoFicha } from "@/components/estados/Esqueleto";
import PantallaError from "@/components/estados/PantallaError";
import PreferenciasUsuario from "@/components/header/PreferenciasUsuario";
import {
  claseBoton,
  claseBotonPrincipal,
  claseControl,
  claseEnlace,
  claseTarjeta,
} from "@/components/modulos/estilos";
import { useAuth } from "@/context/AuthContext";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { fecha } from "@/utils/formato";
import { useEffect, useState } from "react";
import { Link } from "react-router";

type Cuenta = {
  username: string;
  nombre: string;
  email: string;
  persona: { id: string; nombre: string } | null;
  roles: string[];
  ultimo_acceso: string | null;
  creada: string;
};

const claseTitulo = "text-lg font-semibold text-gray-800 dark:text-white/90";
const claseNota = "mt-1 text-theme-sm text-gray-500 dark:text-gray-400";
const claseEtiqueta =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

function Mensaje({ ok, texto }: { ok: boolean; texto: string }) {
  if (!texto) return null;
  return (
    <p
      role={ok ? "status" : "alert"}
      className={`text-sm ${ok ? "text-success-600 dark:text-success-500" : "text-error-500"}`}
    >
      {texto}
    </p>
  );
}

function errorDe(e: unknown, campo: string) {
  if (e instanceof ApiError && e.campos[campo])
    return e.campos[campo].join(" ");
  return (e as Error).message;
}

function Correo({
  actual,
  onGuardado,
}: {
  actual: string;
  onGuardado: () => void;
}) {
  const [email, setEmail] = useState(actual);
  const [estado, setEstado] = useState({ ok: true, texto: "" });
  const [guardando, setGuardando] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setGuardando(true);
        try {
          await api("/auth/cuenta/", { method: "PATCH", body: { email } });
          setEstado({ ok: true, texto: "Correo guardado." });
          onGuardado();
        } catch (err) {
          setEstado({ ok: false, texto: errorDe(err, "email") });
        } finally {
          setGuardando(false);
        }
      }}
    >
      <label htmlFor="cuenta-email" className={claseEtiqueta}>
        Correo
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="cuenta-email"
          type="email"
          className={`${claseControl} min-w-0 flex-1`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <button
          className={claseBotonPrincipal}
          disabled={guardando || email === actual}
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
      <Mensaje {...estado} />
    </form>
  );
}

function Contrasena() {
  const [valores, setValores] = useState({
    actual: "",
    nueva: "",
    repetir: "",
  });
  const [ver, setVer] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const poner = (c: keyof typeof valores, v: string) => {
    setValores((x) => ({ ...x, [c]: v }));
    setHecho(false);
  };
  const campo = (c: keyof typeof valores, etiqueta: string, auto: string) => (
    <div>
      <label htmlFor={`clave-${c}`} className={claseEtiqueta}>
        {etiqueta}
      </label>
      <input
        id={`clave-${c}`}
        type={ver ? "text" : "password"}
        className={`${claseControl} w-full`}
        value={valores[c]}
        onChange={(e) => poner(c, e.target.value)}
        autoComplete={auto}
        required
      />
      {errores[c] && (
        <p className="mt-1 text-theme-xs text-error-500" role="alert">
          {errores[c]}
        </p>
      )}
    </div>
  );
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setErrores({});
        if (valores.nueva !== valores.repetir) {
          setErrores({ repetir: "No coincide con la nueva contraseña." });
          return;
        }
        setGuardando(true);
        try {
          await api("/auth/cuenta/clave/", {
            method: "POST",
            body: { actual: valores.actual, nueva: valores.nueva },
          });
          setValores({ actual: "", nueva: "", repetir: "" });
          setHecho(true);
        } catch (err) {
          setErrores(
            err instanceof ApiError && Object.keys(err.campos).length
              ? Object.fromEntries(
                  Object.entries(err.campos).map(([k, m]) => [k, m.join(" ")]),
                )
              : { actual: (err as Error).message },
          );
        } finally {
          setGuardando(false);
        }
      }}
    >
      {campo("actual", "Contraseña actual", "current-password")}
      <div className="grid gap-4 sm:grid-cols-2">
        {campo("nueva", "Nueva contraseña", "new-password")}
        {campo("repetir", "Repite la nueva", "new-password")}
      </div>
      <p className="text-theme-xs text-gray-500 dark:text-gray-400">
        Al menos 8 caracteres, que no sea solo números ni parecida a tu nombre o
        usuario.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={claseBotonPrincipal}
          disabled={guardando || !valores.actual || !valores.nueva}
        >
          {guardando ? "Guardando…" : "Cambiar contraseña"}
        </button>
        <button
          type="button"
          className={`${claseBoton} inline-flex items-center gap-2`}
          onClick={() => setVer((v) => !v)}
          aria-pressed={ver}
        >
          {ver ? (
            <EyeCloseIcon className="size-5 fill-current" aria-hidden="true" />
          ) : (
            <EyeIcon className="size-5 fill-current" aria-hidden="true" />
          )}
          {ver ? "Ocultar" : "Mostrar"}
        </button>
        <Mensaje
          ok
          texto={hecho ? "Contraseña cambiada. Tu sesión sigue abierta." : ""}
        />
      </div>
    </form>
  );
}

// Lo que cada usuario configura de sí mismo.
export default function MiCuenta() {
  const { refrescar } = useAuth();
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    api<Cuenta>("/auth/cuenta/")
      .then((c) => vigente && setCuenta(c))
      .catch((e) => vigente && setError(e));
    return () => {
      vigente = false;
    };
  }, [version]);

  if (error) return <PantallaError error={error} />;
  if (!cuenta) return <EsqueletoFicha />;

  return (
    <>
      <PageMeta
        title="Mi cuenta | Betania"
        description="Tus datos, tu correo, tu contraseña y tus preferencias"
      />
      <PageBreadcrumb pageTitle="Mi cuenta" />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={claseTarjeta}>
          <div className="flex items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-2xl font-semibold text-brand-500 uppercase dark:bg-brand-500/15 dark:text-brand-400">
              {cuenta.nombre.charAt(0)}
            </span>
            <div className="min-w-0">
              <h2 className={claseTitulo}>{cuenta.nombre}</h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Usuario:{" "}
                <strong className="font-medium">{cuenta.username}</strong>
              </p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 text-theme-sm sm:grid-cols-2">
            <div>
              <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                Último acceso
              </dt>
              <dd className="mt-0.5 text-gray-800 dark:text-white/90">
                {cuenta.ultimo_acceso ? fecha(cuenta.ultimo_acceso) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                Cuenta creada
              </dt>
              <dd className="mt-0.5 text-gray-800 dark:text-white/90">
                {fecha(cuenta.creada)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                Mis roles
              </dt>
              <dd className="mt-1 flex flex-wrap gap-2">
                {cuenta.roles.length ? (
                  cuenta.roles.map((r) => (
                    <span
                      key={r}
                      className="rounded-md bg-brand-25 px-2 py-1 text-theme-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                    >
                      {r}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500">
                    Sin roles: pide acceso a la coordinación.
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-theme-xs text-gray-500 dark:text-gray-400">
            Los roles los asigna la coordinación. Tu nombre y tus datos
            personales están en{" "}
            {cuenta.persona ? (
              <Link
                to={`/personas/${cuenta.persona.id}`}
                className={claseEnlace}
              >
                tu ficha
              </Link>
            ) : (
              "tu ficha de persona"
            )}
            .
          </p>
        </section>

        <section className={`${claseTarjeta} space-y-6`}>
          <div>
            <h2 className={claseTitulo}>Correo</h2>
            <p className={claseNota}>Para avisos y para recuperar el acceso.</p>
            <div className="mt-4">
              <Correo
                actual={cuenta.email}
                onGuardado={() => {
                  setVersion((v) => v + 1);
                  void refrescar();
                }}
              />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-6 dark:border-white/5">
            <h2 className={claseTitulo}>Preferencias</h2>
            <p className={claseNota}>
              La edición con que trabajas va por defecto en el inicio, los
              formularios y los filtros; la moneda, en todos los montos.
            </p>
            <div className="mt-4">
              <PreferenciasUsuario />
            </div>
          </div>
        </section>

        <section className={`${claseTarjeta} xl:col-span-2`}>
          <h2 className={claseTitulo}>Contraseña</h2>
          <p className={claseNota}>
            Cámbiala si alguien más la conoce o si te la dieron al crear tu
            cuenta.
          </p>
          <div className="mt-5 max-w-2xl">
            <Contrasena />
          </div>
        </section>
      </div>
    </>
  );
}
