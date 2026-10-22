import PantallaError from "@/components/estados/PantallaError";
import { EsqueletoPanel } from "@/components/estados/Esqueleto";
import {
  api,
  ApiError,
  type CeldaDescarga,
  type ControlPagos as Datos,
  type FilaControlPago,
  type GrupoControlPago,
} from "@/api/client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PageMeta from "@/components/common/PageMeta";
import Telefono from "@/components/common/Telefono";
import BotonesDescarga from "@/components/modulos/BotonesDescarga";
import Paginacion from "@/components/modulos/Paginacion";
import SelectorColumnas from "@/components/modulos/SelectorColumnas";
import { useColumnas, type DefColumna } from "@/components/modulos/useColumnas";
import { usePaginas } from "@/components/modulos/usePaginas";
import {
  claseBoton,
  claseControl,
  claseTarjeta,
} from "@/components/modulos/estilos";
import Actualizacion from "@/components/retiros/Actualizacion";
import Metrica from "@/components/retiros/Metrica";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { useDatosVivos } from "@/hooks/useDatosVivos";
import {
  CheckCircleIcon,
  DollarLineIcon,
  PencilIcon,
  PieChartIcon,
  PlusIcon,
} from "@/icons";
import CampoFecha from "@/components/form/CampoFecha";
import { colorEstado, dinero, fecha, montoVista } from "@/utils/formato";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

type Quien = "caminantes" | "servidores";

const claseVacio = "text-sm text-gray-500 dark:text-gray-400";
const claseEncabezado =
  "px-3 py-3 text-start text-theme-xs font-medium whitespace-nowrap text-gray-500 dark:text-gray-400";
const claseCelda =
  "px-3 py-3 text-start text-theme-sm whitespace-nowrap text-gray-600 dark:text-gray-400";
const claseCifra = `${claseCelda} text-end tabular-nums`;
const claseEtiqueta =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

const ESTADOS_PAGO = [
  { valor: "", etiqueta: "Todos" },
  { valor: "debe", etiqueta: "Deben algo" },
  { valor: "pendiente", etiqueta: "Sin pago" },
  { valor: "parcial", etiqueta: "Parcial" },
  { valor: "pagado", etiqueta: "Pagado" },
];

// Los errores de estos campos salen junto a su control; los demás, abajo.
const CAMPOS_ABONO = ["monto", "moneda", "tasa", "fecha"];

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Registrar un abono: un pago de /api/pagos/ a nombre de la persona.
function DialogoAbono({
  fila,
  quien,
  retiro,
  onCerrar,
  onGuardado,
}: {
  fila: FilaControlPago | null;
  quien: Quien;
  retiro: string;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { sesion } = useAuth();
  const monedas = sesion?.autenticado ? sesion.monedas : [];
  const vista = sesion?.autenticado ? sesion.preferencias.moneda_vista : "";
  // Por omisión, lo que le resta, en la moneda en que el usuario ve los montos.
  const [valores, setValores] = useState(() => ({
    monto: fila ? String(Number(montoVista(fila.saldo).monto.toFixed(2))) : "",
    moneda: vista,
    fecha: hoyISO(),
    metodo: "efectivo",
    referencia: "",
  }));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  if (!fila) return null;
  const poner = (campo: keyof typeof valores, valor: string) =>
    setValores((v) => ({ ...v, [campo]: valor }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    try {
      await api("/pagos/", {
        method: "POST",
        body: {
          retiro,
          ...(quien === "caminantes"
            ? { inscripcion: fila.id, concepto: "cuota" }
            : { persona: fila.persona_id, concepto: "aportacion" }),
          monto: valores.monto,
          moneda: valores.moneda,
          fecha: valores.fecha,
          metodo: valores.metodo,
          referencia: valores.referencia,
        },
      });
      onGuardado();
    } catch (err) {
      const campos =
        err instanceof ApiError
          ? Object.fromEntries(
              Object.entries(err.campos).map(([c, m]) => [c, m.join(" ")]),
            )
          : {};
      setErrores({ ...campos, general: (err as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const error = (campo: string) =>
    errores[campo] && (
      <p className="mt-1 text-theme-xs text-error-500">{errores[campo]}</p>
    );

  return (
    <Modal isOpen onClose={onCerrar} className="m-4 max-w-md">
      <form className="p-6" onSubmit={guardar}>
        <h3 className="mb-1 pe-12 text-lg font-semibold text-gray-800 dark:text-white/90">
          Registrar abono
        </h3>
        <p className="mb-5 pe-12 text-theme-sm text-gray-500 dark:text-gray-400">
          {fila.persona} · resta {dinero(fila.saldo)} de {dinero(fila.cuota)}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="abono-monto" className={claseEtiqueta}>
              Monto
            </label>
            <input
              id="abono-monto"
              type="number"
              min="0.01"
              step="0.01"
              required
              autoFocus
              className={`${claseControl} w-full`}
              value={valores.monto}
              onChange={(e) => poner("monto", e.target.value)}
            />
            {error("monto")}
          </div>
          <div>
            <label htmlFor="abono-moneda" className={claseEtiqueta}>
              Moneda
            </label>
            <select
              id="abono-moneda"
              className={`${claseControl} w-full`}
              value={valores.moneda}
              onChange={(e) => poner("moneda", e.target.value)}
            >
              {monedas.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.valor} · {m.etiqueta}
                </option>
              ))}
            </select>
            {error("moneda")}
            {error("tasa")}
          </div>
          <div>
            <label htmlFor="abono-fecha" className={claseEtiqueta}>
              Fecha
            </label>
            <CampoFecha
              id="abono-fecha"
              required
              className={`${claseControl} w-full`}
              value={valores.fecha}
              onChange={(iso) => poner("fecha", iso)}
            />
            {error("fecha")}
          </div>
          <div>
            <label htmlFor="abono-metodo" className={claseEtiqueta}>
              Método
            </label>
            <select
              id="abono-metodo"
              className={`${claseControl} w-full`}
              value={valores.metodo}
              onChange={(e) => poner("metodo", e.target.value)}
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="abono-referencia" className={claseEtiqueta}>
              Referencia (opcional)
            </label>
            <input
              id="abono-referencia"
              className={`${claseControl} w-full`}
              placeholder="N.º de transferencia o recibo"
              maxLength={120}
              value={valores.referencia}
              onChange={(e) => poner("referencia", e.target.value)}
            />
          </div>
        </div>
        {errores.general && !CAMPOS_ABONO.some((c) => errores[c]) && (
          <p className="mt-4 text-sm text-error-500" role="alert">
            {errores.general}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={claseBoton} onClick={onCerrar}>
            Volver
          </button>
          <Button size="sm" disabled={guardando}>
            {guardando ? "Guardando…" : "Registrar abono"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Cambiar lo que paga una persona (beca, descuento, o servidores que no
// aportan todos lo mismo). Vacío: la cuota del retiro.
function DialogoMonto({
  fila,
  quien,
  cuotaRetiro,
  onCerrar,
  onGuardado,
}: {
  fila: FilaControlPago | null;
  quien: Quien;
  cuotaRetiro: number;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { sesion } = useAuth();
  // Las cuotas se guardan en la moneda base, aunque se vean en otra.
  const base = sesion?.autenticado ? sesion.moneda : "";
  const [monto, setMonto] = useState(() =>
    fila?.cuota_propia ? String(fila.cuota) : "",
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  if (!fila) return null;

  const guardar = async (cuota: string | null) => {
    setGuardando(true);
    setError("");
    try {
      await api("/control-pagos/monto/", {
        method: "POST",
        body: {
          tipo: quien === "caminantes" ? "caminante" : "servidor",
          id: fila.id,
          cuota: cuota === "" ? null : cuota,
        },
      });
      onGuardado();
    } catch (e) {
      const campos =
        e instanceof ApiError ? Object.values(e.campos).flat() : [];
      setError(campos.join(" ") || (e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal isOpen onClose={onCerrar} className="m-4 max-w-md">
      <form
        className="p-6"
        onSubmit={(e) => {
          e.preventDefault();
          guardar(monto);
        }}
      >
        <h3 className="mb-1 pe-12 text-lg font-semibold text-gray-800 dark:text-white/90">
          Monto a pagar
        </h3>
        <p className="mb-5 pe-12 text-theme-sm text-gray-500 dark:text-gray-400">
          {fila.persona}. La cuota del retiro es {dinero(cuotaRetiro, base)};
          escribe otro monto si esta persona paga distinto.
        </p>
        <label htmlFor="monto-propio" className={claseEtiqueta}>
          Monto en {base}
        </label>
        <input
          id="monto-propio"
          type="number"
          min="0"
          step="0.01"
          autoFocus
          className={`${claseControl} w-full`}
          placeholder={String(cuotaRetiro)}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        {error && (
          <p className="mt-2 text-sm text-error-500" role="alert">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {fila.cuota_propia && (
            <button
              type="button"
              className={`${claseBoton} me-auto`}
              disabled={guardando}
              onClick={() => guardar(null)}
            >
              Usar la cuota del retiro
            </button>
          )}
          <button type="button" className={claseBoton} onClick={onCerrar}>
            Volver
          </button>
          <Button size="sm" disabled={guardando || monto === ""}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Abonos({
  fila,
  columnas,
}: {
  fila: FilaControlPago;
  columnas: number;
}) {
  return (
    <>
      {Array.from({ length: columnas }, (_, i) => {
        const a = fila.abonos[i];
        return (
          <TableCell key={i} className={claseCifra}>
            {a ? (
              <span
                title={`${dinero(a.monto, a.moneda)} · ${a.metodo}${a.referencia ? ` · ref. ${a.referencia}` : ""}`}
              >
                {dinero(a.monto_base)}
                <span className="block text-theme-xs text-gray-400">
                  {fecha(a.fecha)}
                </span>
              </span>
            ) : (
              <span className="text-gray-300 dark:text-gray-600">—</span>
            )}
          </TableCell>
        );
      })}
    </>
  );
}

function Tabla({
  quien,
  grupo,
  retiro,
  puedeRegistrar,
  puedeCambiarMonto,
  onCambio,
}: {
  quien: Quien;
  grupo: GrupoControlPago;
  retiro: { id: string; etiqueta: string };
  puedeRegistrar: boolean;
  puedeCambiarMonto: boolean;
  onCambio: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState("");
  const [conCancelados, setConCancelados] = useState(false);
  const paginas = usePaginas();
  const [abonando, setAbonando] = useState<FilaControlPago | null>(null);
  const [cambiandoMonto, setCambiandoMonto] = useState<FilaControlPago | null>(
    null,
  );
  const esCaminante = quien === "caminantes";
  const buscado = texto.trim().toLowerCase();
  const visibles = grupo.filas.filter(
    (f) =>
      // Quien canceló solo aparece si se pide o si ya había pagado algo.
      (conCancelados || !f.cancelado || f.abonos.length > 0) &&
      (!buscado ||
        f.persona.toLowerCase().includes(buscado) ||
        (f.equipo ?? "").toLowerCase().includes(buscado)) &&
      (!estado || (estado === "debe" ? f.saldo > 0 : f.estado_pago === estado)),
  );
  const { pagina, desde, hayPaginas, paginacion } = paginas.de(
    visibles,
    `${buscado}|${estado}|${conCancelados}`,
  );
  // Tantas columnas de abono como el que más abonos tiene (al menos una).
  const columnasAbono = Math.max(1, ...visibles.map((f) => f.abonos.length));
  const conFicha = esCaminante && grupo.filas.some((f) => f.ficha);
  const segundo = esCaminante ? "Asistencia" : "Equipo";

  // Las columnas que se pueden elegir; cada una con lo que lleva la descarga
  // (los abonos son varias, una por abono). Las de la ficha se agregan.
  const contacto = (f: FilaControlPago) => f.ficha?.contactos[0];
  const estadoPago = (f: FilaControlPago) =>
    f.cancelado
      ? "Canceló"
      : (ESTADOS_PAGO.find((e) => e.valor === f.estado_pago)?.etiqueta ?? "");
  const definidas: (DefColumna & {
    titulos: string[];
    valores: (f: FilaControlPago, n: number) => CeldaDescarga[];
  })[] = [
    {
      clave: "numero",
      etiqueta: "N.º",
      titulos: ["N.º"],
      valores: (_, n) => [n + 1],
    },
    {
      clave: "persona",
      etiqueta: esCaminante ? "Caminante" : "Servidor",
      fija: true,
      titulos: [esCaminante ? "Nombre y apellido" : "Nombre del servidor"],
      valores: (f) => [f.persona],
    },
    {
      clave: "telefono",
      etiqueta: "Celular",
      titulos: ["Celular"],
      valores: (f) => [f.telefono],
    },
    ...(conFicha
      ? [
          {
            clave: "edad",
            etiqueta: "Edad",
            opcional: true,
            titulos: ["Edad"],
            valores: (f: FilaControlPago) => [f.ficha?.edad ?? null],
          },
          {
            clave: "direccion",
            etiqueta: "Dirección",
            opcional: true,
            titulos: ["Dirección"],
            valores: (f: FilaControlPago) => [
              [f.ficha?.direccion, f.ficha?.procedencia]
                .filter(Boolean)
                .join(", "),
            ],
          },
          {
            clave: "talla",
            etiqueta: "Talla",
            opcional: true,
            titulos: ["Talla"],
            valores: (f: FilaControlPago) => [f.ficha?.talla_camiseta ?? ""],
          },
          {
            clave: "dieta",
            etiqueta: "Dieta o tratamiento",
            opcional: true,
            titulos: ["Dieta o tratamiento"],
            valores: (f: FilaControlPago) => [
              [
                f.ficha?.alimentacion,
                f.ficha?.condicion_medica,
                f.ficha?.tratamiento,
              ]
                .filter(Boolean)
                .join(" · "),
            ],
          },
          {
            clave: "contacto",
            etiqueta: "Familiar de contacto",
            opcional: true,
            titulos: ["Contacto", "Celular del contacto"],
            valores: (f: FilaControlPago) => {
              const c = contacto(f);
              return [
                c ? `${c.nombre}${c.relacion ? ` (${c.relacion})` : ""}` : "",
                c?.telefono ?? "",
              ];
            },
          },
        ]
      : []),
    {
      clave: "segundo",
      etiqueta: segundo,
      titulos: [segundo],
      valores: (f) => [esCaminante ? f.estado_display : (f.equipo ?? "")],
    },
    {
      clave: "monto",
      etiqueta: "Monto",
      titulos: ["Monto"],
      valores: (f) => [montoVista(f.cuota)],
    },
    {
      clave: "abonos",
      etiqueta: "Abonos",
      titulos: Array.from(
        { length: columnasAbono },
        (_, i) => `Abono ${i + 1}`,
      ),
      valores: (f) =>
        Array.from({ length: columnasAbono }, (_, i) =>
          f.abonos[i] ? montoVista(f.abonos[i].monto_base) : null,
        ),
    },
    {
      clave: "pagado",
      etiqueta: "Pagado",
      titulos: ["Pagado"],
      valores: (f) => [montoVista(f.pagado)],
    },
    {
      clave: "resta",
      etiqueta: "Resta",
      titulos: ["Resta"],
      valores: (f) => [montoVista(f.saldo)],
    },
    {
      clave: "estado_pago",
      etiqueta: "Estado del pago",
      titulos: ["Estado del pago"],
      valores: (f) => [estadoPago(f)],
    },
  ];
  const { ve, selector } = useColumnas(`control_pagos_${quien}`, definidas);
  const elegidas = definidas.filter((c) => ve(c.clave));
  // Las de la ficha que agregó: en la tabla, como texto.
  const deFicha = elegidas.filter((c) => c.opcional);

  const tablaDescarga = () => ({
    titulo: `Control de pago ${esCaminante ? "de caminantes" : "de servidores"} · ${retiro.etiqueta}`,
    subtitulo: [
      `Esperado ${dinero(grupo.totales.esperado)}`,
      `pagado ${dinero(grupo.totales.pagado)}`,
      `por cobrar ${dinero(grupo.totales.saldo)}`,
      estado &&
        `Filtro: ${ESTADOS_PAGO.find((e) => e.valor === estado)?.etiqueta}`,
      buscado && `Búsqueda: «${texto.trim()}»`,
    ]
      .filter(Boolean)
      .join(" · "),
    columnas: elegidas.flatMap((c) => c.titulos),
    filas: visibles.map((f, n) => elegidas.flatMap((c) => c.valores(f, n))),
  });

  if (grupo.filas.length === 0) {
    return (
      <p className={claseVacio}>
        {esCaminante
          ? "Todavía no hay caminantes inscritos."
          : "Todavía no hay servidores registrados."}
      </p>
    );
  }

  const titulos = [
    ...(ve("numero") ? ["N.º"] : []),
    esCaminante ? "Caminante" : "Servidor",
    ...deFicha.map((c) => c.etiqueta),
    ...(ve("segundo") ? [segundo] : []),
    ...(ve("monto") ? ["Monto"] : []),
    ...(ve("abonos")
      ? Array.from({ length: columnasAbono }, (_, i) => `Abono ${i + 1}`)
      : []),
    ...(ve("pagado") ? ["Pagado"] : []),
    ...(ve("resta") || ve("estado_pago")
      ? [ve("resta") ? "Resta" : "Estado del pago"]
      : []),
    ...(puedeRegistrar ? [""] : []),
  ];
  const cifra = (t: string) =>
    ["Monto", "Pagado", "Resta", "Estado del pago"].includes(t) ||
    t.startsWith("Abono");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder={
            esCaminante ? "Buscar caminante…" : "Buscar servidor o equipo…"
          }
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className={`${claseControl} w-full sm:w-64`}
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className={claseControl}
          aria-label="Filtrar por pago"
        >
          {ESTADOS_PAGO.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.etiqueta}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <input
            type="checkbox"
            checked={conCancelados}
            onChange={(e) => setConCancelados(e.target.checked)}
          />
          Mostrar los que cancelaron
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:ms-auto">
          <SelectorColumnas {...selector} />
          {visibles.length > 0 && <BotonesDescarga tabla={tablaDescarga} />}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className={claseVacio}>Nadie coincide con el filtro.</p>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-y border-gray-100 bg-gray-50 dark:border-white/5 dark:bg-white/2">
              <TableRow>
                {titulos.map((t, i) => (
                  <TableCell
                    key={i}
                    isHeader
                    className={`${claseEncabezado} ${cifra(t) ? "text-end" : ""}`}
                  >
                    {t}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
              {pagina.map((f, n) => (
                <TableRow
                  key={f.id}
                  className={f.cancelado ? "opacity-60" : ""}
                >
                  {ve("numero") && (
                    <TableCell className={`${claseCelda} text-gray-400`}>
                      {desde + n + 1}
                    </TableCell>
                  )}
                  <TableCell
                    className={`${claseCelda} font-medium text-gray-800 dark:text-white/90`}
                  >
                    <Link
                      to={`/personas/${f.persona_id}`}
                      className="hover:text-brand-500"
                    >
                      {f.persona}
                    </Link>
                    {f.telefono && ve("telefono") && (
                      <Telefono
                        numero={f.telefono}
                        className="flex text-theme-xs font-normal text-gray-400"
                      />
                    )}
                  </TableCell>
                  {deFicha.map((c) => (
                    <TableCell key={c.clave} className={claseCelda}>
                      {c
                        .valores(f, n)
                        .filter((v) => v !== null && v !== "")
                        .join(" · ") || "—"}
                    </TableCell>
                  ))}
                  {ve("segundo") && (
                    <TableCell className={claseCelda}>
                      {esCaminante ? (
                        <Badge size="sm" color={colorEstado(f.estado)}>
                          {f.estado_display}
                        </Badge>
                      ) : (
                        <>
                          {f.equipo}
                          {f.cancelado && (
                            <span className="block text-theme-xs text-gray-400">
                              Canceló
                            </span>
                          )}
                        </>
                      )}
                    </TableCell>
                  )}
                  {ve("monto") && (
                    <TableCell className={claseCifra}>
                      <span className="inline-flex items-center gap-1">
                        {dinero(f.cuota)}
                        {puedeCambiarMonto && (
                          <button
                            type="button"
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
                            onClick={() => setCambiandoMonto(f)}
                            aria-label={`Cambiar el monto de ${f.persona}`}
                            title="Cambiar el monto de esta persona"
                          >
                            <PencilIcon className="size-3.5" />
                          </button>
                        )}
                      </span>
                      {f.cuota_propia && (
                        <span className="block text-theme-xs text-gray-400">
                          Monto propio
                        </span>
                      )}
                    </TableCell>
                  )}
                  {ve("abonos") && <Abonos fila={f} columnas={columnasAbono} />}
                  {ve("pagado") && (
                    <TableCell
                      className={`${claseCifra} font-medium text-gray-800 dark:text-white/90`}
                    >
                      {dinero(f.pagado)}
                    </TableCell>
                  )}
                  {(ve("resta") || ve("estado_pago")) && (
                    <TableCell
                      className={`${claseCifra} font-medium ${f.saldo > 0 ? "text-error-600 dark:text-error-500" : ""}`}
                    >
                      {ve("resta") && dinero(f.saldo)}
                      {/* El estado del pago, debajo: ahorra una columna. */}
                      {ve("estado_pago") && (
                        <span className="mt-1 block">
                          <Badge size="sm" color={colorEstado(f.estado_pago)}>
                            {ESTADOS_PAGO.find((e) => e.valor === f.estado_pago)
                              ?.etiqueta ?? f.estado_pago}
                          </Badge>
                        </span>
                      )}
                    </TableCell>
                  )}
                  {puedeRegistrar && (
                    <TableCell className={claseCelda}>
                      {!f.cancelado && f.saldo > 0 && (
                        <button
                          type="button"
                          className={`${claseBoton} inline-flex items-center gap-1 py-1.5`}
                          onClick={() => setAbonando(f)}
                        >
                          <PlusIcon className="size-4" aria-hidden="true" />
                          Abono
                        </button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {hayPaginas && (
        <div className="mt-5">
          <Paginacion {...paginacion} />
        </div>
      )}

      {abonando && (
        <DialogoAbono
          key={abonando.id}
          fila={abonando}
          quien={quien}
          retiro={retiro.id}
          onCerrar={() => setAbonando(null)}
          onGuardado={() => {
            setAbonando(null);
            onCambio();
          }}
        />
      )}
      {cambiandoMonto && (
        <DialogoMonto
          key={cambiandoMonto.id}
          fila={cambiandoMonto}
          quien={quien}
          cuotaRetiro={grupo.cuota}
          onCerrar={() => setCambiandoMonto(null)}
          onGuardado={() => {
            setCambiandoMonto(null);
            onCambio();
          }}
        />
      )}
    </>
  );
}

// Cifras del grupo elegido: lo esperado, lo cobrado, lo que falta y cuántos
// ya pagaron completo.
function Resumen({ grupo }: { grupo: GrupoControlPago }) {
  const { totales } = grupo;
  const conteo = (valor: string) =>
    totales.por_estado_pago.find((e) => e.valor === valor)?.total ?? 0;
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metrica
        icono={<PieChartIcon className="size-6" />}
        etiqueta="Esperado"
        valor={dinero(totales.esperado)}
        detalle={`${totales.personas} personas · cuota del retiro ${dinero(grupo.cuota)}`}
      />
      <Metrica
        icono={<DollarLineIcon className="size-6" />}
        etiqueta="Pagado"
        valor={dinero(totales.pagado)}
      />
      <Metrica
        icono={<DollarLineIcon className="size-6" />}
        etiqueta="Por cobrar"
        valor={dinero(totales.saldo)}
        detalle={`${conteo("pendiente")} sin pago · ${conteo("parcial")} con pago parcial`}
      />
      <Metrica
        icono={<CheckCircleIcon className="size-6" />}
        etiqueta="Pagaron completo"
        valor={`${conteo("pagado")} / ${totales.personas}`}
      />
    </div>
  );
}

// La hoja de "Control de pago" de caminantes y servidores, al día: cuánto
// debe aportar cada uno, sus abonos, lo pagado y lo que resta.
export default function ControlPagos() {
  const [busqueda, setBusqueda] = useSearchParams();
  const elegido = busqueda.get("retiro") ?? "";
  const { datos, alDia, error, hora, consultando, actualizar } =
    useDatosVivos<Datos>(
      `/control-pagos/${elegido ? `?retiro=${encodeURIComponent(elegido)}` : ""}`,
    );

  const disponibles = (
    [
      ["caminantes", "Caminantes"],
      ["servidores", "Servidores"],
    ] as const
  ).filter(([q]) => datos?.[q]);
  const pedido = busqueda.get("ver");
  const quien: Quien =
    disponibles.find(([q]) => q === pedido)?.[0] ??
    disponibles[0]?.[0] ??
    "caminantes";
  const grupo = datos?.[quien];
  const cambiar = (cambios: Record<string, string>) =>
    setBusqueda(
      (actual) => {
        const nueva = new URLSearchParams(actual);
        for (const [k, v] of Object.entries(cambios)) nueva.set(k, v);
        return nueva;
      },
      { replace: true },
    );

  return (
    <>
      <PageMeta
        title="Control de pagos | Betania"
        description="Lo que debe aportar cada caminante y servidor, sus abonos y lo que resta"
      />
      <PageBreadcrumb pageTitle="Control de pagos" />

      {!datos && error ? (
        <PantallaError error={error} onReintentar={actualizar} />
      ) : !alDia || !datos ? (
        <EsqueletoPanel />
      ) : !datos.retiro ? (
        <p className={claseVacio}>Todavía no hay retiros.</p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={datos.retiro.id}
                onChange={(e) => cambiar({ retiro: e.target.value })}
                className={`${claseControl} font-medium`}
                aria-label="Retiro"
              >
                {datos.retiros.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.etiqueta} · {fecha(r.fecha_inicio)}
                  </option>
                ))}
              </select>
              {disponibles.length > 1 && (
                <div
                  className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-900"
                  role="tablist"
                >
                  {disponibles.map(([q, etiqueta]) => (
                    <button
                      key={q}
                      type="button"
                      role="tab"
                      aria-selected={q === quien}
                      onClick={() => cambiar({ ver: q })}
                      className={`rounded-md px-4 py-2 text-sm font-medium ${
                        q === quien
                          ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white"
                          : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                      }`}
                    >
                      {etiqueta}
                      <span className="ms-1.5 text-gray-400">
                        {datos[q]?.totales.personas}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Actualizacion
              hora={hora}
              error={error}
              consultando={consultando}
              onActualizar={actualizar}
            />
          </div>

          {grupo ? (
            <>
              <Resumen grupo={grupo} />
              <section className={claseTarjeta}>
                <Tabla
                  key={`${datos.retiro.id}-${quien}`}
                  quien={quien}
                  grupo={grupo}
                  retiro={datos.retiro}
                  puedeRegistrar={!!datos.puede_registrar}
                  puedeCambiarMonto={!!datos.puede_cambiar_monto}
                  onCambio={actualizar}
                />
              </section>
            </>
          ) : (
            <p className={claseVacio}>No tienes acceso a estos datos.</p>
          )}
        </>
      )}
    </>
  );
}
