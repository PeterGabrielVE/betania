import GridShape from "@/components/common/GridShape";
import Logo from "@/components/common/Logo";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import React from "react";
import { Link } from "react-router";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // En el celular el formulario ocupa toda la pantalla, de borde a borde
    // (ver SignInForm).
    <div className="relative z-1 bg-white dark:bg-gray-900">
      <div className="relative flex h-screen w-full flex-col justify-center max-sm:h-auto max-sm:min-h-dvh lg:flex-row dark:bg-gray-900">
        {children}
        <div className="hidden h-full w-full items-center bg-brand-950 lg:grid lg:w-1/2 dark:bg-white/5">
          <div className="relative z-1 flex items-center justify-center">
            <GridShape />

            <div className="flex max-w-xs flex-col items-center">
              <Link to="/" className="mb-4 block">
                <Logo claro className="scale-125" />
              </Link>

              <p className="text-center text-gray-400 dark:text-white/60">
                Gestión de retiros de Emaús y Samuel
              </p>
            </div>
          </div>
        </div>

        <div className="fixed inset-e-6 bottom-6 z-50 hidden sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}
