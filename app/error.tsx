"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log a digest only — never lead content or credentials.
    console.error("[app] unhandled error", { digest: error.digest });
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page could not be loaded. Please try again — if the problem continues, contact your
          clinic administrator.
        </p>
        <Button className="mt-5" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
