import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

const WORKFLOW_STEPS = [
  {
    title: "Capture",
    body: "A public clinic enquiry page collects only the details your team needs to follow up.",
  },
  {
    title: "Qualify",
    body: "Every new lead is scored 0–100, prioritised HOT/WARM/COLD, and categorised by service.",
  },
  {
    title: "Follow up",
    body: "Staff review a recommended action and a draft reply, then move the lead to won or lost.",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            AI Dental Lead CRM
          </span>
          <nav className="flex items-center gap-2">
            <Link href="/login" className={buttonClasses("ghost", "sm")}>
              Sign in
            </Link>
            <Link href="/signup" className={buttonClasses("primary", "sm")}>
              Create clinic account
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl px-4 py-14">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
          Lead qualification CRM for dental practices
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Turn dental enquiries into booked appointments
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-600">
          Capture prospective patient enquiries, let AI prioritise them for your front desk, and
          give your team a clear next action with a reviewable draft reply. This is a
          lead-management tool, not a diagnostic or clinical system.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className={buttonClasses("primary")}>
            Create your clinic workspace
          </Link>
          <Link href="/login" className={buttonClasses("secondary")}>
            Sign in to the CRM
          </Link>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-12 sm:grid-cols-3">
          {WORKFLOW_STEPS.map((step, index) => (
            <div key={step.title} className="rounded-xl border border-slate-200 p-5">
              <span className="text-xs font-semibold text-slate-400">Step {index + 1}</span>
              <h2 className="mt-2 text-base font-semibold text-slate-900">{step.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 text-xs text-slate-500">
          AI output is a suggestion for clinic staff. It is not medical advice and must be reviewed
          by a human before it is sent to anyone.
        </div>
      </footer>
    </main>
  );
}
