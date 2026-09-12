"use client";

import { useActionState } from "react";

import { updateFollowUpTaskAction } from "@/app/(crm)/leads/actions";
import { Button } from "@/components/ui/button";
import type { FollowUpTask } from "@/lib/generated/prisma/client";
import type { ActionState } from "@/types";

const initialState: ActionState = { status: "idle" };

const PRIORITY_TONE: Record<string, string> = {
  IMMEDIATE: "bg-red-50 text-red-700 ring-red-200",
  HIGH: "bg-amber-50 text-amber-700 ring-amber-200",
  NORMAL: "bg-sky-50 text-sky-700 ring-sky-200",
  LOW: "bg-slate-100 text-slate-600 ring-slate-200",
};

/**
 * Best-effort overdue hint available on both server and client render:
 * an open task whose due date has already passed relative to the freshest
 * timestamp the server rendered with.
 */
function isTaskOverdue(dueAt: Date, reference: Date): boolean {
  return dueAt.getTime() <= reference.getTime();
}

function formatDue(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

/**
 * One follow-up task row with the staff-controlled status actions. AI-sourced
 * tasks are always labelled as recommendations; nothing is auto-completed.
 */
export function FollowUpTaskRow({ task }: { task: FollowUpTask }) {
  const [state, formAction, isPending] = useActionState(
    updateFollowUpTaskAction,
    initialState,
  );

  const isOpen = task.status === "OPEN";
  // Render-time due-state, computed from the server-provided task so no
  // impure Date.now() call happens during render.
  const isDue = isOpen && isTaskOverdue(task.dueAt, task.updatedAt);
  const isAi = task.source === "AI";

  return (
    <li
      className={`rounded-lg border px-4 py-3 ${
        isDue ? "border-red-300 bg-red-50/50" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">
          {task.title}
          {isAi ? (
            <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
              AI-generated · review
            </span>
          ) : null}
        </p>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
            PRIORITY_TONE[task.priority] ?? PRIORITY_TONE.NORMAL
          }`}
        >
          {task.priority}
        </span>
      </div>

      {task.description ? (
        <p className="mt-1 text-sm text-slate-600">{task.description}</p>
      ) : null}

      <p className="mt-2 text-xs text-slate-500">
        {task.status === "COMPLETED"
          ? `Completed ${formatDue(task.completedAt ?? task.dueAt)}`
          : task.status === "CANCELLED"
            ? "Cancelled"
            : isDue
              ? `Overdue — was due ${formatDue(task.dueAt)}`
              : `Due ${formatDue(task.dueAt)}`}
        {` · source: ${task.source.toLowerCase()}`}
      </p>

      {isOpen ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={formAction} className="inline">
            <input type="hidden" name="leadId" value={task.leadId} />
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="status" value="COMPLETED" />
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving…" : "Mark completed"}
            </Button>
          </form>
          <form action={formAction} className="inline">
            <input type="hidden" name="leadId" value={task.leadId} />
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="status" value="CANCELLED" />
            <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
              Cancel
            </Button>
          </form>
        </div>
      ) : task.status === "CANCELLED" ? (
        <div className="mt-3">
          <form action={formAction} className="inline">
            <input type="hidden" name="leadId" value={task.leadId} />
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="status" value="OPEN" />
            <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
              Re-open
            </Button>
          </form>
        </div>
      ) : null}

      {state.message ? (
        <p
          role="status"
          className={`mt-2 text-xs font-medium ${
            state.status === "error" ? "text-red-600" : "text-emerald-700"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </li>
  );
}

export function FollowUpTaskCard({ tasks }: { tasks: FollowUpTask[] }) {
  const open = tasks.filter((task) => task.status === "OPEN");
  const settled = tasks.filter((task) => task.status !== "OPEN");

  return (
    <ul className="space-y-3">
      {tasks.length === 0 ? (
        <li className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          No follow-up tasks yet. They are created automatically after AI qualification, or you can
          add one manually later.
        </li>
      ) : (
        <>
          {[...open, ...settled].map((task) => (
            <FollowUpTaskRow key={task.id} task={task} />
          ))}
        </>
      )}
    </ul>
  );
}
