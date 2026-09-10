import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { SignUpForm } from "@/components/auth/signup-form";
import { getServerSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create clinic account",
};

export default async function SignUpPage() {
  const session = await getServerSession();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <AuthFormShell
      title="Create your clinic workspace"
      subtitle="You will be the owner of a private, clinic-scoped lead CRM."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-sky-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthFormShell>
  );
}
