import { Component } from "react";
import PantallaError from "./PantallaError";

// Si una pantalla falla al dibujarse (un error de programación), muestra
// "Algo salió mal" en vez de dejar la página en blanco. `clave`: al cambiar
// (otra ruta), vuelve a intentar.
export default class ErrorBoundary extends Component<
  { children: React.ReactNode; clave?: string; completa?: boolean },
  { error: unknown; clave?: string }
> {
  state = { error: null as unknown, clave: this.props.clave };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { clave?: string },
    state: { error: unknown; clave?: string },
  ) {
    return props.clave !== state.clave
      ? { error: null, clave: props.clave }
      : null;
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("Error en la pantalla:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <PantallaError tipo="fallo" completa={this.props.completa} />;
    }
    return this.props.children;
  }
}
