import type { PanelRetiro } from "@/api/client";

type Logistica = NonNullable<PanelRetiro["logistica_equipo"]>;

// Los turnos del fin de semana, en filas por día (claves "viernes_manana").
const DIAS = [
  ["viernes", "Viernes"],
  ["sabado", "Sábado"],
  ["domingo", "Domingo"],
];
const TURNOS = [
  ["manana", "Mañana"],
  ["tarde", "Tarde"],
  ["noche", "Noche"],
];

const claseCifra =
  "text-title-sm font-bold text-gray-800 tabular-nums dark:text-white/90";
const claseNota = "text-theme-xs text-gray-500 dark:text-gray-400";

function Conteos({
  titulo,
  filas,
}: {
  titulo: string;
  filas: Logistica["camisas"];
}) {
  const conValor = filas.filter((f) => f.total);
  return (
    <div>
      <h4 className="mb-2 text-theme-sm font-medium text-gray-800 dark:text-white/90">
        {titulo}
      </h4>
      {conValor.length === 0 ? (
        <p className={claseNota}>Nadie la pidió todavía.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {conValor.map((f) => (
            <li
              key={f.valor}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-theme-sm text-gray-700 dark:border-gray-800 dark:text-gray-300"
            >
              {f.etiqueta}{" "}
              <strong className="text-gray-800 tabular-nums dark:text-white/90">
                {f.total}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Para organizar al equipo de servidores: quiénes duermen en la casa,
// cuántos hay en cada turno del fin de semana y cuántas camisas encargar.
export default function LogisticaEquipo({
  logistica,
}: {
  logistica: Logistica;
}) {
  if (logistica.total === 0) {
    return <p className={claseNota}>Todavía no hay servidores registrados.</p>;
  }
  const porTurno = new Map(logistica.turnos.map((t) => [t.valor, t.total]));
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-3 gap-4">
        <div>
          <dt className={claseNota}>Duermen en la casa</dt>
          <dd className={claseCifra}>{logistica.duermen}</dd>
        </div>
        <div>
          <dt className={claseNota}>No duermen</dt>
          <dd className={claseCifra}>{logistica.no_duermen}</dd>
        </div>
        <div>
          <dt className={claseNota}>Sin responder</dt>
          <dd className={claseCifra}>{logistica.sin_responder}</dd>
        </div>
      </dl>

      <div>
        <h4 className="mb-2 text-theme-sm font-medium text-gray-800 dark:text-white/90">
          Servidores por turno
        </h4>
        <table className="w-full text-theme-sm">
          <thead>
            <tr className="text-theme-xs text-gray-500 dark:text-gray-400">
              <th className="py-1 text-start font-medium" />
              {TURNOS.map(([, etiqueta]) => (
                <th key={etiqueta} className="py-1 text-end font-medium">
                  {etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {DIAS.map(([dia, etiqueta]) => (
              <tr key={dia}>
                <td className="py-1.5 text-gray-700 dark:text-gray-300">
                  {etiqueta}
                </td>
                {TURNOS.map(([turno]) => {
                  const total = porTurno.get(`${dia}_${turno}`);
                  return (
                    <td
                      key={turno}
                      className="py-1.5 text-end font-medium text-gray-800 tabular-nums dark:text-white/90"
                    >
                      {/* El domingo no tiene turno de noche. */}
                      {total === undefined ? "—" : total}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Conteos titulo="Camisas que piden" filas={logistica.camisas} />
        <Conteos titulo="Tallas" filas={logistica.tallas} />
      </div>
    </div>
  );
}
