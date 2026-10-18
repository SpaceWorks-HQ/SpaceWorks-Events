import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Programme summary at the top of "Page & programme". The schedule link appears only with schedule permission. */
export function ProgrammeCard({ summary, scheduleHref }: { summary: string; scheduleHref: string | null }) {
  return (
    <section aria-labelledby="programme-card-title" className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-subtle p-5">
      <div className="min-w-0 flex-[1_1_240px]">
        <h2 id="programme-card-title" className="text-h4 text-ink">Programme</h2>
        <p className="mt-0.5 text-body-ui text-ink-secondary">
          {summary}.{scheduleHref ? " Shift times live on the day." : null}
        </p>
        {scheduleHref ? null : <p className="mt-1 text-caption text-ink-muted">You do not have permission to manage the programme.</p>}
      </div>
      {scheduleHref ? (
        <Button asChild variant="primary" className="shrink-0">
          <Link href={scheduleHref}>
            Open schedule
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
