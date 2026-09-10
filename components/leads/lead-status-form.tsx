"use client";

import { useActionState } from "react";

import { updateLeadStatusAction } from "@/app/(crm)/leads/actions";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/form";
import { LEAD_STATUS_LABELS } from "@/lib/lead-labels";
import type { LeadStatus } from "@/lib/generated/prisma/enums";
import type { ActionState } from "@/types";

const initialState: ActionState = { status: "idle" };

export function LeadStatusForm({
  leadId,
  status,
}: {
  leadId: string;
  status: LeadStatus;
}) {
  const [state, formAction, isPending] = useActionState(updateLeadStatusAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />

      <div>
        <Label htmlFor="lead-status">Lead status</Label>
        <Select id="lead-status" name="status" defaultValue={status} className="mt-1.5">
          {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" disabled={isPending} size="sm" className="w-full sm:w-auto">
        {isPending ? "Saving…" : "Update status"}
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
