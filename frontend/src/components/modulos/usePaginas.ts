// Paginación en el navegador para las tablas que llegan completas (panel del
// retiro, control de pagos, contactos, reportes), con el mismo tamaño de página
// que los listados de los módulos.
import { useState } from "react";
import { TAMANOS_PAGINA } from "./paginas";

const CLAVE_POR_PAGINA = "betania.porPagina";

export function porPaginaGuardado(): number {
  try {
    const n = Number(localStorage.getItem(CLAVE_POR_PAGINA));
    return TAMANOS_PAGINA.includes(n) ? n : 25;
  } catch {
    return 25;
  }
}

export function guardarPorPagina(n: number) {
  try {
    localStorage.setItem(CLAVE_POR_PAGINA, String(n));
  } catch {
    // Sin almacenamiento (ventana privada): solo dura esta visita.
  }
}

// Se llama antes de cualquier return (es un hook); `de(filas, filtros)` da la
// página a la vista y las props de <Paginacion>. Al cambiar `filtros` (la
// búsqueda, el filtro elegido...) se vuelve a la primera página.
export function usePaginas() {
  const [porPagina, setPorPagina] = useState(porPaginaGuardado);
  const [estado, setEstado] = useState({ pagina: 1, filtros: "" });

  function de<T>(filas: T[], filtros = "") {
    const paginas = Math.max(1, Math.ceil(filas.length / porPagina));
    const pagina = Math.min(
      estado.filtros === filtros ? estado.pagina : 1,
      paginas,
    );
    const desde = (pagina - 1) * porPagina;
    return {
      pagina: filas.slice(desde, desde + porPagina),
      desde, // para numerar las filas
      // Con pocas filas no hace falta paginar.
      hayPaginas: filas.length > TAMANOS_PAGINA[0],
      paginacion: {
        pagina,
        total: filas.length,
        porPagina,
        cargando: false,
        onPagina: (n: number) => setEstado({ pagina: n, filtros }),
        onPorPagina: (n: number) => {
          setPorPagina(n);
          guardarPorPagina(n);
          setEstado({ pagina: 1, filtros });
        },
      },
    };
  }
  return { de };
}
