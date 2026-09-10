import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

export default function ClinicNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">This enquiry link is not available</h1>
        <p className="mt-2 text-sm text-slate-600">
          The clinic link you followed does not exist or is no longer active. Please check the link
          provided by the clinic.
        </p>
        <Link href="/" className={buttonClasses("secondary", "sm", "mt-5")}>
          Go to homepage
        </Link>
      </div>
    </main>
  );
}
