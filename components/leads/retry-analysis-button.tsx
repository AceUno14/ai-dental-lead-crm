"use client";

import { useActionState } from "react";

import { retryLeadAnalysisAction } from "@/app/(crm)/leads/actions";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/types";

const initialState: ActionState = { status: "idle" };

export function RetryAnalysisButton({
  leadId,
  label = "Retry AI analysis",
}: {
  leadId: string;
  label?: string;
}) {
  const [state, formAction, isPending] = useActionState(retryLeadAnalysisAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
        {isPending ? "Analysing…" : label}
      </Button>

      {state.message ? (
        <p
          role="status"
          className={`text-xs font-medium ${
            state.status === "error" ? "text-red-600" : "text-emerald-700"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
