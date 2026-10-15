import SignInForm from "@/components/auth/SignInForm";
import PageMeta from "@/components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Iniciar sesión | Betania"
        description="Acceso a Betania, el sistema de gestión de retiros"
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
