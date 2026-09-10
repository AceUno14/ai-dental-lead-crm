"use client";

import { useActionState, useEffect, useRef } from "react";

import { addLeadNoteAction } from "@/app/(crm)/leads/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import type { ActionState } from "@/types";

const initialState: ActionState = { status: "idle" };

export function NoteForm({ leadId }: { leadId: string }) {
  const [state, formAction, isPending] = useActionState(addLeadNoteAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />

      <div>
        <label htmlFor="note-body" className="block text-sm font-medium text-slate-700">
          Add an internal note
        </label>
        <p className="mb-1.5 text-xs text-slate-500">
          Notes are visible to clinic staff only. Never store clinical records here.
        </p>
        <Textarea
          id="note-body"
          name="body"
          rows={3}
          maxLength={2000}
          placeholder="Called the lead, left a voicemail…"
          aria-invalid={Boolean(state.fieldErrors?.body)}
        />
      </div>

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving…" : "Save note"}
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
