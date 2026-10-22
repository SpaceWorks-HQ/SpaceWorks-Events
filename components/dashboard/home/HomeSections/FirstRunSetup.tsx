import Link from "next/link";
import { Check } from "lucide-react";
import { MoodTile } from "@/components/brand/MoodTile";
import { CreateEventDialog } from "@/components/event/CreateEventDialog";
import { Button } from "@/components/ui/button";
import type { DashboardHome } from "@/lib/dashboardHome";
import { cn } from "@/lib/cn";

/* ---------- First run ---------- */

/** Setup checklist. `compact` drops the welcome banner when the page already greets the person. */
export function FirstRunSetup({ setup, name, compact = false }: { setup: NonNullable<DashboardHome["setup"]>; name: string; compact?: boolean }) {
  const slug = setup.firstAdminSlug;
  const steps = [
    { title: "Create your organisation", body: "Your community’s home on Space Works Events. Events, members and settings live here.", done: setup.hasOrganisation, action: <Button asChild variant="primary"><Link href="/dashboard/org/new">Create organisation</Link></Button> },
    { title: "Add your logo", body: "It appears on your organisation page and at the top of every event page.", done: setup.hasLogo, action: slug ? <Button asChild variant="secondary"><Link href={`/dashboard/${slug}/settings`}>Add logo</Link></Button> : null },
    { title: "Create your first event", body: "A date, a place and a capacity. You can add a programme and speakers later.", done: setup.hasEvent, action: slug ? <CreateEventDialog organisationSlug={slug} /> : null },
    { title: "Publish and share the link", body: "People register in seconds, as guests or with an account.", done: setup.hasPublished, action: slug ? <Button asChild variant="secondary"><Link href={`/dashboard/${slug}`}>Go to events</Link></Button> : null },
  ];
  const nextIndex = steps.findIndex((step) => !step.done);
  const doneCount = steps.filter((step) => step.done).length;
  return (
    <section aria-labelledby={compact ? "home-setup-steps" : "home-setup-title"} className="flex flex-col gap-6">
      {compact ? null : (
      <div className="flex flex-col items-start gap-6 rounded-xl bg-tint-peach p-6 sm:flex-row sm:items-center sm:p-8">
        <MoodTile mood="happy" size={104} className="yy-face" />
        <div className="flex flex-col gap-2">
          <h2 id="home-setup-title" className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[40px]">Welcome to Space Works Events, {name}</h2>
          <p className="max-w-[640px] text-body-l text-ink-secondary">Four small steps and your first event is ready to share.</p>
        </div>
      </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 id="home-setup-steps" className="text-h4 text-ink">Get set up</h3>
          <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <span aria-hidden className="flex gap-1">
              {steps.map((step, index) => (
                <span key={index} className={cn("size-2.5 rounded-full", step.done ? "bg-brand-marigold" : "bg-brand-dot-off")} />
              ))}
            </span>
            {doneCount} of {steps.length} done
          </span>
        </div>
        <ol className="flex flex-col gap-2.5">
          {steps.map((step, index) => {
            const isNext = index === nextIndex;
            return (
              <li
                key={step.title}
                className={cn(
                  "flex flex-col gap-3 rounded-lg px-5 py-4 sm:flex-row sm:items-center sm:gap-4",
                  step.done ? "border border-line bg-subtle" : isNext ? "border-2 border-primary bg-panel" : "border border-line bg-panel",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    step.done ? "bg-success-bg text-success-fg" : isNext ? "bg-primary text-on-primary" : "bg-muted text-ink-secondary",
                  )}
                >
                  {step.done ? <Check aria-label="Done" className="size-4" /> : index + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("text-base font-bold", step.done ? "text-ink-muted line-through" : "text-ink")}>{step.title}</span>
                  <span className="text-sm text-ink-muted">{step.body}</span>
                </span>
                {!step.done && isNext && step.action ? <span className="shrink-0">{step.action}</span> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
