import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/(crm)/actions";
import { CrmNav } from "@/components/dashboard/crm-nav";
import { buttonClasses } from "@/components/ui/button";
import { getClinicContext } from "@/lib/auth/clinic";
import { getServerSession } from "@/lib/auth/session";

export default async function CrmLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  const context = await getClinicContext();

  if (!context) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">No clinic access yet</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your account is not linked to a clinic workspace. Ask a clinic owner or administrator to
            invite you, then sign in again.
          </p>
          <form action={signOutAction} className="mt-5">
            <button type="submit" className={buttonClasses("secondary")}>
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CrmNav
        clinicName={context.clinic.name}
        userName={context.userName}
        role={context.role}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
