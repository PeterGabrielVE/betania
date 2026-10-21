import Logo from "@/components/common/Logo";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  CalenderIcon,
  ChevronDownIcon,
  DollarLineIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  TimeIcon,
  UserCircleIcon,
} from "../icons";
import { cn } from "../utils";

type NavItem = {
  name: string;
  key?: string;
  icon: React.ReactNode;
  path?: string;
  new?: boolean;
  target?: string;
  subItems?: {
    name: string;
    key?: string;
    path: string;
    pro?: boolean;
    new?: boolean;
    target?: string;
  }[];
};

// Icono de cada sección del menú (Modulo.grupo en retiros/api.py).
const iconosGrupo: Record<string, React.ReactNode> = {
  Retiros: <CalenderIcon fontSize={24} />,
  Personas: <UserCircleIcon fontSize={24} />,
  Finanzas: <DollarLineIcon fontSize={24} />,
  Catálogos: <ListIcon fontSize={24} />,
  Sistema: <TimeIcon fontSize={24} />,
};

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, setIsMobileOpen } =
    useSidebar();
  const location = useLocation();
  const { modulos } = useAuth();

  // Inicio + una sección desplegable por grupo de módulos.
  const navItems = useMemo<NavItem[]>(() => {
    const grupos = [...new Set(modulos.map((m) => m.grupo))];
    const puedenTodos = (slugs: string[]) =>
      slugs.every((s) => modulos.find((m) => m.slug === s)?.puede_agregar);
    const puedeInscribir = puedenTodos(["personas", "inscripciones"]);
    const puedeRegistrarServidor = puedenTodos([
      "personas",
      "participaciones",
      "servicios",
    ]);
    // Los contactos familiares son confidenciales: van tras el primero de los
    // listados de caminantes o servidores que vea.
    const conContactos = !!modulos
      .find((m) => m.slug === "personas")
      ?.campos.some((c) => c.nombre === "datos_sensibles");
    const listadoContactos = conContactos
      ? modulos.find((m) =>
          ["inscripciones", "participaciones"].includes(m.slug),
        )?.slug
      : undefined;
    // Los reportes son de caminantes o de servidores (ver retiros/api/reportes.py).
    const conReportes = modulos.some((m) =>
      ["inscripciones", "participaciones"].includes(m.slug),
    );
    return [
      { icon: <GridIcon fontSize={24} />, name: "Inicio", path: "/" },
      ...grupos.map((grupo) => ({
        icon: iconosGrupo[grupo] ?? <ListIcon fontSize={24} />,
        name: grupo,
        subItems: modulos
          .filter((m) => m.grupo === grupo && m.en_menu)
          .flatMap((m) => [
            // La hoja de control de pagos va antes del listado de pagos.
            ...(m.slug === "pagos"
              ? [{ name: "Control de pagos", path: "/control-pagos" }]
              : []),
            { name: m.titulo, path: `/${m.slug}` },
            // Los reportes, junto al listado de retiros.
            ...(m.slug === "retiros" && conReportes
              ? [{ name: "Reportes", path: "/reportes" }]
              : []),
            // El formulario de caminantes (el de papel) va junto a su listado.
            ...(m.slug === "inscripciones" && puedeInscribir
              ? [{ name: "Inscribir caminante", path: "/inscribir" }]
              : []),
            // Y el de servidores, junto a su listado.
            ...(m.slug === "participaciones" && puedeRegistrarServidor
              ? [{ name: "Registrar servidor", path: "/registrar-servidor" }]
              : []),
            ...(m.slug === listadoContactos
              ? [{ name: "Contactos familiares", path: "/contactos-familiares" }]
              : []),
          ]),
      })),
    ];
  }, [modulos]);
  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {},
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-close sidebar on mobile after route change
  useEffect(() => {
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Una página de detalle (/retiros/<id>) marca también su listado (/retiros).
  const isActive = useCallback(
    (path: string) =>
      location.pathname === path ||
      (path !== "/" && location.pathname.startsWith(`${path}/`)),
    [location.pathname],
  );

  useEffect(() => {
    let submenuMatched = false;

    navItems.forEach((nav, index) => {
      if (nav.subItems?.some((subItem) => isActive(subItem.path))) {
        setOpenSubmenu({ type: "main", index });
        submenuMatched = true;
      }
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [location, isActive, navItems]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number, menuType: "main") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  const renderMenuItems = (items: NavItem[], menuType: "main") => (
    <ul className="flex flex-col gap-1">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`group menu-item ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "xl:justify-center"
                  : "xl:justify-start"
              }`}
            >
              <span
                className={`menu-item-icon-size ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>

              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {nav.new && (isExpanded || isHovered || isMobileOpen) && (
                <span
                  className={`absolute inset-e-10 ms-auto ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "menu-dropdown-badge-active"
                      : "menu-dropdown-badge-inactive"
                  } menu-dropdown-badge`}
                >
                  nuevo
                </span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ms-auto h-5 w-5 transition-transform duration-200 ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                to={nav.path}
                target={nav.target}
                className={`group menu-item ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`menu-item-icon-size ${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="ms-9 mt-2 space-y-1">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      to={subItem.path}
                      target={subItem.target}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                      <span className="ms-auto flex items-center gap-1">
                        {subItem.new && (
                          <span
                            className={`ms-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            nuevo
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ms-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-pro-active"
                                : "menu-dropdown-badge-pro-inactive"
                            } menu-dropdown-badge-pro`}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      className={cn(
        "fixed inset-s-0 top-0 z-50 flex h-screen flex-col border-e border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out xl:translate-x-0 xl:rtl:translate-x-0 dark:border-gray-800 dark:bg-gray-900",
        isExpanded || isMobileOpen ? "w-72.5" : isHovered ? "w-72.5" : "w-22.5",
        isMobileOpen
          ? "translate-x-0"
          : "-translate-x-full rtl:translate-x-full",
      )}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "flex py-8",
          !isExpanded && !isHovered ? "xl:justify-center" : "justify-start",
        )}
      >
        <Link to="/">
          <Logo soloIcono={!(isExpanded || isHovered || isMobileOpen)} />
        </Link>
      </div>

      <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 flex text-xs leading-5 text-gray-400 uppercase ${
                  !isExpanded && !isHovered
                    ? "xl:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menú"
                ) : (
                  <HorizontaLDots className="size-6" />
                )}
              </h2>
              {renderMenuItems(navItems, "main")}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
