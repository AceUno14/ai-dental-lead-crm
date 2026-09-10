import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getServerSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const session = await getServerSession();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <AuthFormShell
      title="Sign in to your clinic CRM"
      subtitle="Use the clinic staff account created by your workspace owner."
      footer={
        <>
          Need a workspace?{" "}
          <Link href="/signup" className="font-medium text-sky-700 hover:underline">
            Create a clinic account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthFormShell>
  );
}
