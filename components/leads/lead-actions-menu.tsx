"use client";

import { useActionState } from "react";

import {
  archiveLeadAction,
  deleteLeadAction,
  restoreLeadAction,
} from "@/app/(crm)/leads/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import type { ActionState } from "@/types";

const initialState: ActionState = { status: "idle" };

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      role="status"
      className={`text-xs font-medium ${
        state.status === "error" ? "text-red-600" : "text-emerald-700"
      }`}
    >
      {state.message}
    </p>
  );
}

/**
 * The lead detail page's "More actions" panel.
 *
 * Archive / restore are ordinary, reversible operations. Permanent deletion is
 * deliberately kept out of the primary workflow: it lives behind a collapsed
 * disclosure, states exactly what will be destroyed, and requires a typed
 * confirmation. Every action is authorized again on the server — this component
 * only decides what is worth showing.
 */
export function LeadActionsMenu({
  leadId,
  leadName,
  archived,
  canDelete,
}: {
  leadId: string;
  leadName: string;
  archived: boolean;
  canDelete: boolean;
}) {
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveLeadAction,
    initialState,
  );
  const [restoreState, restoreAction, restorePending] = useActionState(
    restoreLeadAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteLeadAction,
    initialState,
  );

  return (
    <div className="space-y-4">
      {archived ? (
        <form action={restoreAction} className="space-y-2">
          <input type="hidden" name="leadId" value={leadId} />
          <Button type="submit" size="sm" disabled={restorePending} className="w-full sm:w-auto">
            {restorePending ? "Restoring…" : "Restore lead"}
          </Button>
          <p className="text-xs text-slate-500">
            Restoring returns this lead to the lead list, the dashboard metrics and the open
            follow-up queue.
          </p>
          <ActionMessage state={restoreState} />
        </form>
      ) : (
        <form action={archiveAction} className="space-y-2">
          <input type="hidden" name="leadId" value={leadId} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={archivePending}
            className="w-full sm:w-auto"
          >
            {archivePending ? "Archiving…" : "Archive lead"}
          </Button>
          <p className="text-xs text-slate-500">
            Archiving hides the lead from the active list and dashboard. Nothing is deleted — the
            AI analysis, follow-up tasks, notes and activity history are all kept.
          </p>
          <ActionMessage state={archiveState} />
        </form>
      )}

      {canDelete ? (
        <details className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-3">
          <summary className="cursor-pointer text-sm font-medium text-red-700">
            Delete permanently…
          </summary>

          <form action={deleteAction} className="mt-3 space-y-3">
            <input type="hidden" name="leadId" value={leadId} />

            <p className="text-xs text-red-700">
              This cannot be undone. Permanently deleting this lead also deletes its AI analysis,
              its follow-up tasks, its internal notes and its full activity history.
            </p>

            <div>
              <Label htmlFor="lead-delete-confirmation" className="text-red-800">
                Type DELETE (or the lead&apos;s name) to confirm
              </Label>
              <Input
                id="lead-delete-confirmation"
                name="confirmation"
                autoComplete="off"
                spellCheck={false}
                placeholder="DELETE"
                className="mt-1.5 border-red-300"
                aria-describedby="lead-delete-confirmation-hint"
                required
              />
              <p id="lead-delete-confirmation-hint" className="mt-1 text-xs text-red-700">
                Lead name: {leadName}
              </p>
            </div>

            <Button type="submit" variant="danger" size="sm" disabled={deletePending}>
              {deletePending ? "Deleting…" : "Permanently delete this lead"}
            </Button>

            <ActionMessage state={deleteState} />
          </form>
        </details>
      ) : (
        <p className="text-xs text-slate-500">
          Permanent deletion is restricted to clinic owners. Archive the lead instead if it should
          no longer appear in the working list.
        </p>
      )}
    </div>
  );
}
