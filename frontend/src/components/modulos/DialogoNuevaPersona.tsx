import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext";
import { ChevronLeftIcon, GroupIcon, UserCircleIcon, UserIcon } from "@/icons";
import { useNavigate } from "react-router";
import { opcionesNuevaPersona } from "./nuevaPersona";

const claseOpcion =
  "group flex w-full items-center gap-4 rounded-xl border border-gray-200 p-4 text-start transition hover:border-brand-300 hover:bg-brand-25 focus:outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/20 dark:border-gray-800 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10";

function Opcion({
  icono,
  titulo,
  nota,
  onClick,
  autoFocus,
}: {
  icono: React.ReactNode;
  titulo: string;
  nota: string;
  onClick: () => void;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className={claseOpcion}
      onClick={onClick}
      autoFocus={autoFocus}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-gray-800 dark:text-white/90">
          {titulo}
        </span>
        <span className="block text-theme-sm text-gray-500 dark:text-gray-400">
          {nota}
        </span>
      </span>
      <ChevronLeftIcon
        className="size-5 shrink-0 rotate-180 text-gray-400 group-hover:text-brand-500"
        aria-hidden="true"
      />
    </button>
  );
}

// Al agregar una persona: ¿caminante, servidor o solo la persona? Los dos
// primeros llevan a su formulario por pasos (que también registra a la persona).
export default function DialogoNuevaPersona({
  onCerrar,
  onSoloPersona,
}: {
  onCerrar: () => void;
  onSoloPersona: () => void;
}) {
  const { modulos } = useAuth();
  const navigate = useNavigate();
  const puede = opcionesNuevaPersona(modulos);

  return (
    <Modal isOpen onClose={onCerrar} className="m-4 max-w-lg">
      <div className="p-6">
        <h3 className="mb-1 pe-12 text-lg font-semibold text-gray-800 dark:text-white/90">
          ¿A quién vas a registrar?
        </h3>
        <p className="mb-5 pe-12 text-theme-sm text-gray-500 dark:text-gray-400">
          Caminantes y servidores tienen su formulario por pasos, que registra
          también a la persona.
        </p>
        <div className="space-y-3">
          {puede.caminante && (
            <Opcion
              icono={<UserIcon className="size-6" />}
              titulo="Caminante"
              nota="Lo inscribe en un retiro: datos, familia, salud y contactos."
              onClick={() => navigate("/inscribir")}
              autoFocus
            />
          )}
          {puede.servidor && (
            <Opcion
              icono={<GroupIcon className="size-6" />}
              titulo="Servidor"
              nota="Lo suma al equipo de un retiro: áreas, turnos y camisa."
              onClick={() => navigate("/registrar-servidor")}
              autoFocus={!puede.caminante}
            />
          )}
          <Opcion
            icono={<UserCircleIcon className="size-6" />}
            titulo="Solo la persona"
            nota="Sin retiro: por ejemplo, alguien que tendrá usuario del sistema."
            onClick={onSoloPersona}
          />
        </div>
      </div>
    </Modal>
  );
}
