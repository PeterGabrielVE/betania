import { api, type Resumen } from "@/api/client";
import PageMeta from "@/components/common/PageMeta";
import { claseEnlace, claseTarjeta } from "@/components/modulos/estilos";
import Metrica from "@/components/retiros/Metrica";
import Badge from "@/components/ui/badge/Badge";
import { BoxIconLine, CalenderIcon, DollarLineIcon, GroupIcon } from "@/icons";
import { colorEstado, dinero, fecha } from "@/utils/formato";
import { useEffect, useState } from "react";
import { Link } from "react-router";

export default function Inicio() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Resumen>("/resumen/")
      .then(setResumen)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!resumen) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {error || "Cargando…"}
      </p>
    );
  }

  const maximo = Math.max(
    1,
    ...resumen.inscripciones_por_estado.map((e) => e.total),
  );

  return (
    <>
      <PageMeta
        title="Inicio | Betania"
        description="Resumen de retiros, personas, inscripciones y finanzas"
      />
      {resumen.tasas_bcv && (
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Tasa BCV del {fecha(resumen.tasas_bcv.fecha)}:{" "}
          {dinero(resumen.tasas_bcv.USD, "VES")} por dólar ·{" "}
          {dinero(resumen.tasas_bcv.EUR, "VES")} por euro
        </p>
      )}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
          <Metrica
            icono={<GroupIcon className="size-6" />}
            etiqueta="Personas"
            valor={resumen.personas}
          />
          <Metrica
            icono={<CalenderIcon className="size-6" />}
            etiqueta="Retiros"
            valor={resumen.retiros}
            detalle={`${resumen.retiros_activos} sin finalizar`}
          />
          <Metrica
            icono={<BoxIconLine className="size-6" />}
            etiqueta="Inscripciones"
            valor={resumen.inscripciones}
          />
          <Metrica
            icono={<DollarLineIcon className="size-6" />}
            etiqueta="Balance"
            valor={dinero(resumen.balance)}
            detalle={`${dinero(resumen.ingresos)} ingresos · ${dinero(resumen.egresos)} gastos`}
          />
        </div>

        <div className={`col-span-12 xl:col-span-5 ${claseTarjeta}`}>
          <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">
            Inscripciones por estado
          </h3>
          <ul className="space-y-4">
            {resumen.inscripciones_por_estado.map((e) => (
              <li key={e.estado}>
                <div className="mb-1.5 flex justify-between text-theme-sm text-gray-700 dark:text-gray-400">
                  <span>{e.etiqueta}</span>
                  <span className="font-medium">{e.total}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-2 rounded-full bg-brand-500"
                    style={{ width: `${(e.total / maximo) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className={`col-span-12 xl:col-span-7 ${claseTarjeta}`}>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Próximos retiros
            </h3>
            <Link to="/retiros" className={`text-sm ${claseEnlace}`}>
              Ver todos
            </Link>
          </div>
          {resumen.proximos_retiros.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay retiros próximos.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {resumen.proximos_retiros.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <Link
                      to={`/retiros/${r.id}`}
                      className="block text-theme-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90"
                    >
                      {r.etiqueta}
                    </Link>
                    <span className="block text-theme-xs text-gray-500 dark:text-gray-400">
                      {fecha(r.fecha_inicio)} – {fecha(r.fecha_fin)} ·{" "}
                      {r.inscritos} / {r.cupo} inscritos
                    </span>
                  </div>
                  <Badge size="sm" color={colorEstado(r.estado)}>
                    {r.estado_display}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
