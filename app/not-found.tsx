import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          The page you were looking for does not exist, or you do not have access to it.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/dashboard" className={buttonClasses("primary", "sm")}>
            Go to dashboard
          </Link>
          <Link href="/" className={buttonClasses("secondary", "sm")}>
            Homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
