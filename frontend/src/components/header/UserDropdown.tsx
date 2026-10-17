import Avatar from "@/components/common/Avatar";
import { useAuth } from "@/context/AuthContext";
import { TaskIcon, UserCircleIcon, UserIcon } from "@/icons";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Dropdown } from "../ui/dropdown/Dropdown";

const claseItem =
  "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200";
const claseIconoItem =
  "size-5 shrink-0 text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300";

// Menú del usuario: quién es (nombre, cuenta y roles), su cuenta, su ficha,
// sus tareas y cerrar sesión.
export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { sesion, modulos, logout } = useAuth();
  const datos = sesion?.autenticado ? sesion : null;
  const nombre = datos?.nombre ?? "";
  const persona = datos?.persona ?? null;
  const ve = (slug: string) => modulos.some((m) => m.slug === slug);

  const toggleDropdown = () => setIsOpen((prev) => !prev);
  const closeDropdown = () => setIsOpen(false);

  // RequireAuth redirige a /signin en cuanto la sesión queda cerrada.
  const handleLogout = () => {
    closeDropdown();
    void logout();
  };

  useEffect(() => {
    return () => {
      setIsOpen(false);
    };
  }, []);

  const enlaces = [
    {
      a: "/mi-cuenta",
      texto: "Mi cuenta",
      nota: "Correo, contraseña y preferencias",
      icono: <UserCircleIcon className={claseIconoItem} />,
    },
    persona &&
      ve("personas") && {
        a: `/personas/${persona.id}`,
        texto: "Mi ficha",
        nota: "Mis datos y mis retiros",
        icono: <UserIcon className={claseIconoItem} />,
      },
    persona &&
      ve("tareas") && {
        a: `/tareas?${new URLSearchParams({
          responsable: persona.id,
          responsable__etiqueta: persona.nombre,
          hecha: "false",
        })}`,
        texto: "Mis tareas",
        nota: "Las pendientes a mi cargo",
        icono: <TaskIcon className={claseIconoItem} />,
      },
  ].filter((e) => !!e);

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="dropdown-toggle flex items-center text-gray-700 dark:text-gray-400"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {persona ? (
          <Avatar
            foto={persona.foto}
            sexo={persona.sexo}
            nombre={persona.nombre}
            tamano="md"
            className="me-3"
          />
        ) : (
          <span className="me-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-500 uppercase dark:bg-brand-500/15 dark:text-brand-400">
            {nombre.charAt(0)}
          </span>
        )}

        <span className="me-1 hidden max-w-40 truncate text-theme-sm font-medium sm:block">
          {nombre}
        </span>
        <svg
          className={`stroke-gray-500 transition-transform duration-200 dark:stroke-gray-400 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute inset-e-0 mt-4.25 flex w-72 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <div className="px-1">
          <span className="block text-theme-sm font-semibold text-gray-800 dark:text-white/90">
            {nombre}
          </span>
          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            {datos?.username}
            {datos?.email && ` · ${datos.email}`}
          </span>
          {datos && datos.roles.length > 0 && (
            <ul className="mt-2 space-y-1">
              {datos.roles.map((r) => (
                <li
                  key={r}
                  className="rounded-md bg-brand-25 px-2 py-1 text-theme-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                >
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>

        <ul className="mt-3 flex flex-col gap-0.5 border-t border-gray-200 pt-3 dark:border-gray-800">
          {enlaces.map((e) => (
            <li key={e.a}>
              <Link to={e.a} onClick={closeDropdown} className={claseItem}>
                {e.icono}
                <span className="min-w-0">
                  <span className="block">{e.texto}</span>
                  <span className="block text-theme-xs font-normal text-gray-500 dark:text-gray-400">
                    {e.nota}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={handleLogout}
          className={`${claseItem} mt-2 border-t border-gray-200 pt-3 dark:border-gray-800`}
        >
          <svg
            className="fill-gray-500 group-hover:fill-gray-700 dark:group-hover:fill-gray-300"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M15.1007 19.247C14.6865 19.247 14.3507 18.9112 14.3507 18.497L14.3507 14.245H12.8507V18.497C12.8507 19.7396 13.8581 20.747 15.1007 20.747H18.5007C19.7434 20.747 20.7507 19.7396 20.7507 18.497L20.7507 5.49609C20.7507 4.25345 19.7433 3.24609 18.5007 3.24609H15.1007C13.8581 3.24609 12.8507 4.25345 12.8507 5.49609V9.74501L14.3507 9.74501V5.49609C14.3507 5.08188 14.6865 4.74609 15.1007 4.74609L18.5007 4.74609C18.9149 4.74609 19.2507 5.08188 19.2507 5.49609L19.2507 18.497C19.2507 18.9112 18.9149 19.247 18.5007 19.247H15.1007ZM3.25073 11.9984C3.25073 12.2144 3.34204 12.4091 3.48817 12.546L8.09483 17.1556C8.38763 17.4485 8.86251 17.4487 9.15549 17.1559C9.44848 16.8631 9.44863 16.3882 9.15583 16.0952L5.81116 12.7484L16.0007 12.7484C16.4149 12.7484 16.7507 12.4127 16.7507 11.9984C16.7507 11.5842 16.4149 11.2484 16.0007 11.2484L5.81528 11.2484L9.15585 7.90554C9.44864 7.61255 9.44847 7.13767 9.15547 6.84488C8.86248 6.55209 8.3876 6.55226 8.09481 6.84525L3.52309 11.4202C3.35673 11.5577 3.25073 11.7657 3.25073 11.9984Z"
              fill=""
            />
          </svg>
          Cerrar sesión
        </button>
      </Dropdown>
    </div>
  );
}
