import SignInForm from "@/components/auth/SignInForm";
import PageMeta from "@/components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Iniciar sesión | Gestión de retiros"
        description="Acceso al sistema de gestión de retiros"
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
