import { api, ApiError } from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import {
  claseBoton,
  claseEnlace,
  claseTarjeta,
} from "@/components/modulos/estilos";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import NotFound from "@/pages/OtherPage/NotFound";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

type Accion = "view" | "add" | "change" | "delete";
type Tabla = {
  rol: {
    id: string;
    nombre: string;
    descripcion: string;
    ambito: string;
    ambito_display: string;
    ve_datos_sensibles: boolean;
    sistema: boolean;
    asignaciones: number;
  };
  acciones: { valor: Accion; etiqueta: string }[];
  grupos: {
    grupo: string;
    modulos: {
      modelo: string;
      titulo: string;
      acciones: Record<Accion, boolean | null>; // null: no existe
    }[];
  }[];
  puede_cambiar: boolean;
};

const claseVacio = "text-sm text-gray-500 dark:text-gray-400";
const claseCasilla = "size-4 rounded border-gray-300 text-brand-500";

// Los permisos marcados de la tabla, como "view_pago", "add_persona"...
function marcados(t: Tabla): Set<string> {
  const s = new Set<string>();
  for (const g of t.grupos)
    for (const m of g.modulos)
      for (const [a, v] of Object.entries(m.acciones))
        if (v) s.add(`${a}_${m.modelo}`);
  return s;
}

// Qué puede hacer un rol, módulo por módulo: ver, agregar, cambiar, eliminar.
export default function RolPermisos() {
  const { id } = useParams();
  const { modulos } = useAuth();
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string }>();

  useEffect(() => {
    let vigente = true;
    api<Tabla>(`/roles/${id}/permisos/`)
      .then((t) => {
        if (!vigente) return;
        setTabla(t);
        setElegidos(marcados(t));
      })
      .catch((e: ApiError) => vigente && setError(e));
    return () => {
      vigente = false;
    };
  }, [id]);

  const guardados = useMemo(
    () => (tabla ? marcados(tabla) : new Set<string>()),
    [tabla],
  );
  const cambios =
    elegidos.size !== guardados.size ||
    [...elegidos].some((p) => !guardados.has(p));

  if (error) {
    if ([403, 404].includes(error.status)) return <NotFound />;
    return <p className={claseVacio}>{error.message}</p>;
  }
  if (!tabla) return <p className={claseVacio}>Cargando…</p>;
  const { rol } = tabla;
  const editable = tabla.puede_cambiar;
  const existe = (modelo: string, a: Accion) =>
    tabla.grupos.some((g) =>
      g.modulos.some((m) => m.modelo === modelo && m.acciones[a] !== null),
    );

  // Agregar, cambiar o eliminar sin poder ver no sirve: marcan también "ver";
  // quitar "ver" quita lo demás.
  const poner = (cambios: [string, Accion, boolean][]) =>
    setElegidos((actual) => {
      const nuevo = new Set(actual);
      for (const [modelo, a, marcar] of cambios) {
        if (!existe(modelo, a)) continue;
        if (marcar) {
          nuevo.add(`${a}_${modelo}`);
          if (a !== "view" && existe(modelo, "view"))
            nuevo.add(`view_${modelo}`);
        } else {
          nuevo.delete(`${a}_${modelo}`);
          if (a === "view")
            for (const otra of ["add", "change", "delete"])
              nuevo.delete(`${otra}_${modelo}`);
        }
      }
      return nuevo;
    });

  const guardar = async () => {
    setGuardando(true);
    setAviso(undefined);
    try {
      const t = await api<Tabla>(`/roles/${id}/permisos/`, {
        method: "PUT",
        body: { permisos: [...elegidos] },
      });
      setTabla(t);
      setElegidos(marcados(t));
      setAviso({
        tipo: "ok",
        texto:
          "Permisos guardados. Se aplican en la próxima acción de cada usuario.",
      });
    } catch (e) {
      setAviso({ tipo: "error", texto: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const total = elegidos.size;
  const puedeAsignar = modulos.some((m) => m.slug === "asignaciones");

  return (
    <>
      <PageMeta
        title={`Permisos de ${rol.nombre} | Betania`}
        description={`Qué puede ver, agregar, cambiar y eliminar el rol ${rol.nombre}`}
      />
      <PageBreadcrumb pageTitle={`Permisos · ${rol.nombre}`} />

      <section className={`${claseTarjeta} mb-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              {rol.nombre}
            </h2>
            {rol.descripcion && (
              <p className="mt-1 max-w-2xl text-theme-sm text-gray-500 dark:text-gray-400">
                {rol.descripcion}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge size="sm" color="info">
                Se asigna en: {rol.ambito_display.toLowerCase()}
              </Badge>
              <Badge
                size="sm"
                color={rol.ve_datos_sensibles ? "warning" : "light"}
              >
                {rol.ve_datos_sensibles
                  ? "Ve datos confidenciales"
                  : "No ve datos confidenciales"}
              </Badge>
              {rol.sistema && (
                <Badge size="sm" color="light">
                  Rol del sistema
                </Badge>
              )}
              <Badge size="sm" color="light">
                Asignado a {rol.asignaciones}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link to="/roles" className={claseBoton}>
              Volver a roles
            </Link>
            {puedeAsignar && (
              <Link to="/asignaciones" className={claseBoton}>
                Asignar a usuarios
              </Link>
            )}
          </div>
        </div>
        <p className="mt-4 text-theme-xs text-gray-500 dark:text-gray-400">
          El nombre, la descripción, dónde se asigna y si ve datos
          confidenciales se cambian en{" "}
          <Link to={`/roles?editar=${rol.id}`} className={claseEnlace}>
            editar el rol
          </Link>
          .
        </p>
      </section>

      <div className="space-y-6 pb-24">
        {tabla.grupos.map((g) => {
          const filas = g.modulos;
          const todos = (a: Accion) =>
            filas.every(
              (m) => m.acciones[a] === null || elegidos.has(`${a}_${m.modelo}`),
            );
          return (
            <section key={g.grupo} className={claseTarjeta}>
              <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
                {g.grupo}
              </h3>
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[560px] table-fixed text-theme-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-theme-xs text-gray-500 dark:border-white/5 dark:text-gray-400">
                      <th className="w-2/5 py-2 pe-4 text-start font-medium">
                        Módulo
                      </th>
                      {tabla.acciones.map((a) => (
                        <th
                          key={a.valor}
                          className="px-3 py-2 text-center font-medium"
                        >
                          <label className="inline-flex flex-col items-center gap-1">
                            {a.etiqueta}
                            {editable && (
                              <input
                                type="checkbox"
                                className={claseCasilla}
                                checked={todos(a.valor)}
                                onChange={(e) =>
                                  poner(
                                    filas.map((m) => [
                                      m.modelo,
                                      a.valor,
                                      e.target.checked,
                                    ]),
                                  )
                                }
                                aria-label={`${a.etiqueta}: todos los de ${g.grupo}`}
                              />
                            )}
                          </label>
                        </th>
                      ))}
                      {editable && (
                        <th className="px-3 py-2 text-center font-medium">
                          Todo
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {filas.map((m) => {
                      const acciones = tabla.acciones.filter(
                        (a) => m.acciones[a.valor] !== null,
                      );
                      const completo = acciones.every((a) =>
                        elegidos.has(`${a.valor}_${m.modelo}`),
                      );
                      return (
                        <tr key={m.modelo}>
                          <td className="py-2.5 pe-4 text-gray-800 dark:text-white/90">
                            {m.titulo}
                          </td>
                          {tabla.acciones.map((a) => (
                            <td
                              key={a.valor}
                              className="px-3 py-2.5 text-center"
                            >
                              {m.acciones[a.valor] === null ? (
                                <span className="text-gray-300 dark:text-gray-600">
                                  —
                                </span>
                              ) : (
                                <input
                                  type="checkbox"
                                  className={claseCasilla}
                                  disabled={!editable}
                                  checked={elegidos.has(
                                    `${a.valor}_${m.modelo}`,
                                  )}
                                  onChange={(e) =>
                                    poner([
                                      [m.modelo, a.valor, e.target.checked],
                                    ])
                                  }
                                  aria-label={`${a.etiqueta} ${m.titulo}`}
                                />
                              )}
                            </td>
                          ))}
                          {editable && (
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                className={claseCasilla}
                                checked={completo}
                                onChange={(e) =>
                                  poner(
                                    acciones.map((a) => [
                                      m.modelo,
                                      a.valor,
                                      e.target.checked,
                                    ]),
                                  )
                                }
                                aria-label={`Todo ${m.titulo}`}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      {editable && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 dark:border-gray-800 dark:bg-gray-900/95">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {total} {total === 1 ? "permiso marcado" : "permisos marcados"}
            {cambios && " · hay cambios sin guardar"}
          </span>
          {aviso && (
            <span
              role="alert"
              className={`text-sm ${aviso.tipo === "ok" ? "text-success-600 dark:text-success-500" : "text-error-500"}`}
            >
              {aviso.texto}
            </span>
          )}
          <div className="ms-auto flex gap-2">
            <button
              type="button"
              className={claseBoton}
              disabled={!cambios || guardando}
              onClick={() => setElegidos(new Set(guardados))}
            >
              Descartar
            </button>
            <Button
              size="sm"
              disabled={!cambios || guardando}
              onClick={guardar}
            >
              {guardando ? "Guardando…" : "Guardar permisos"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
