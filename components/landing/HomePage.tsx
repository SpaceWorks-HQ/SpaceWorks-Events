import Link from "next/link";
import { Plus } from "lucide-react";
import { MoodTile } from "@/components/brand/MoodTile";
import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/ui/github-mark";
import { GITHUB_REPO, GITHUB_URL } from "@/lib/openSource";
import { ColourPreview } from "./ColourPreview";
import { Container, IconTile, SectionHeading } from "./primitives";
import { doorPoints, faqs, features, promises, statuses, steps } from "./HomePage/content";
import { HeroVisual } from "./HomePage/HeroVisual";
import { SelfHostSection } from "./HomePage/SelfHostSection";

/** The Space Works Events homepage. */
export function HomePage({ getStartedHref }: { getStartedHref: string }) {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section aria-labelledby="hero-title">
        <Container className="grid items-center gap-14 pb-20 pt-12 lg:grid-cols-2 lg:pt-[72px]">
          <div className="flex flex-col items-start gap-7">
            <p className="text-overline text-ink-muted">Space Works Events</p>
            <h1 id="hero-title" className="max-w-[552px] font-accent text-[34px] font-medium leading-[1.08] text-ink sm:text-[52px]">
              Less admin. More making.
            </h1>
            <p className="max-w-[552px] text-body-l text-ink-secondary">
              The event platform from Space Works for maker meetups, workshops and build nights. Event pages, registrations, live tickets, check-in, ID cards and certificates, in one free, open-source tool.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="primary" size="lg">
                <Link href={getStartedHref}>Create your first event</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/discover">Browse events</Link>
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-caption text-ink-muted">Free to organise. Free events stay free; ticket money goes straight to you.</p>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 self-start text-label text-ink-secondary underline-offset-4 transition-colors hover:text-ink hover:underline">
                <GitHubMark />
                Open source on GitHub · {GITHUB_REPO}
              </a>
            </div>
          </div>

          {/* Hero visual: an example event card and ticket (illustrative, not live data) */}
          <HeroVisual />
        </Container>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-title" className="border-y border-line bg-surface">
        <Container className="flex flex-col gap-10 py-16 lg:py-[72px]">
          <div className="flex max-w-[640px] flex-col gap-2">
            <p className="text-overline text-ink-muted">How it works</p>
            <h2 id="how-title" className="text-display-m text-ink">From first idea to thank-you note</h2>
          </div>
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="group flex flex-col gap-3 rounded-[16px] border border-line bg-panel p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-full bg-sw-citron text-[17px] font-semibold tabular-nums text-sw-ink">{index + 1}</span>
                  <IconTile icon={step.icon} />
                </div>
                <h3 className="text-h4 text-ink">{step.title}</h3>
                <p className="text-body-ui text-ink-secondary">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Features */}
      <section id="features" aria-labelledby="features-title" className="scroll-mt-20">
        <Container className="flex flex-col gap-10 py-16 lg:py-[88px]">
          <SectionHeading id="features-title" overline="Features" title="Everything a volunteer crew needs" lead="One place for the whole event, so nobody has to juggle five tools on the morning of." />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <li key={feature.title} className="group flex flex-col gap-3 rounded-[16px] border border-line bg-panel p-6">
                <IconTile icon={feature.icon} />
                <h3 className="text-h4 text-ink">{feature.title}</h3>
                <p className="text-body-ui text-ink-secondary">{feature.body}</p>
              </li>
            ))}
          </ul>
          <Link href="/features" className="self-start text-label text-ink underline underline-offset-4 hover:decoration-2">See every feature →</Link>
        </Container>
      </section>

      {/* Your event, your colours */}
      <section aria-label="Your event, your colours" className="border-y border-line bg-surface">
        <Container className="py-16 lg:py-[88px]">
          <ColourPreview />
        </Container>
      </section>

      {/* Clear at every step */}
      <section aria-labelledby="moments-title">
        <Container className="flex flex-col gap-10 py-16 lg:py-[88px]">
          <SectionHeading
            id="moments-title"
            overline="Clear at every step"
            title="Everyone knows where they stand"
            lead="Registering, waiting, arriving and saying thanks each come with a plain word, so guests never have to guess."
          />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {statuses.map((status) => (
              <li key={status.title} className="group flex flex-col items-start gap-3 rounded-[16px] border border-line bg-panel p-6">
                <MoodTile mood={status.mood} size={56} />
                <span className={`inline-flex min-h-8 items-center rounded-full px-3.5 text-[14px] font-semibold ${status.tone}`}>{status.pill}</span>
                <h3 className="text-h4 text-ink">{status.title}</h3>
                <p className="text-body-ui text-ink-secondary">{status.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* At the door (always Deep Ink, in both colour modes) */}
      <section aria-labelledby="door-title" className="border-y border-line bg-sw-ink text-sw-cream">
        <Container className="grid items-center gap-12 py-16 lg:grid-cols-2 lg:gap-14 lg:py-[88px]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-overline text-sw-cream">At the door</p>
              <h2 id="door-title" className="text-display-m text-sw-cream">Check-in that keeps working when the Wi-Fi doesn’t</h2>
            </div>
            <ul className="flex flex-col gap-3.5">
              {doorPoints.map((point) => (
                <li key={point} className="flex items-start gap-3.5 text-body-l text-sw-cream">
                  <span aria-hidden className="mt-2 size-3 shrink-0 rounded-[3px] bg-sw-citron" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden className="mx-auto flex w-full max-w-[552px] flex-col gap-3.5 rounded-[16px] bg-sw-teal p-5 lg:mx-0 lg:justify-self-end">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="min-w-0 flex-1 text-label text-sw-cream">Kochi Maker Night · Station 1</span>
              <span className="text-body-ui tabular-nums text-sw-cream">46 / 48 checked in</span>
              <span className="rounded-full bg-sw-yellow px-[11px] py-1 text-[13px] font-semibold leading-[1.4] text-sw-ink">Offline · syncs later</span>
            </div>
            <div className="flex flex-col items-start gap-6 rounded-[16px] bg-sw-citron p-7 sm:flex-row sm:items-center">
              <span className="flex size-[88px] shrink-0 items-center justify-center rounded-full bg-sw-cream text-[28px] font-semibold text-sw-ink">MN</span>
              <div className="flex flex-col gap-2 text-sw-ink">
                <p className="text-[17px] font-semibold">Checked in</p>
                <p className="text-[36px] font-semibold leading-tight">Meera Nair</p>
                <div className="flex flex-wrap gap-2.5">
                  <span className="inline-flex h-11 items-center rounded-full bg-sw-ink px-[18px] text-[15px] font-semibold text-sw-cream">Next guest</span>
                  <span className="inline-flex h-11 items-center rounded-full border-[1.5px] border-sw-ink px-5 text-[15px] font-semibold">Print ID card</span>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Our promise */}
      <section aria-labelledby="promise-title">
        <Container className="flex flex-col gap-10 py-16 lg:py-[88px]">
          <div className="flex max-w-[640px] flex-col gap-2">
            <p className="text-overline text-ink-muted">Our promise</p>
            <h2 id="promise-title" className="text-display-m text-ink">What Space Works Events will never do</h2>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {promises.map((promise) => (
              <li key={promise.title} className="flex flex-col gap-2.5 rounded-[16px] border border-line bg-surface p-6">
                <p className="text-overline text-ink-muted">Never</p>
                <h3 className="text-h3 text-ink">{promise.title}</h3>
                <p className="text-body-ui text-ink-secondary">{promise.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Self-host */}
      <SelfHostSection />

      {/* FAQ */}
      <section aria-labelledby="faq-title">
        <Container className="py-16 lg:py-[88px]">
          <div className="mx-auto flex max-w-[820px] flex-col gap-8">
            <div className="flex flex-col gap-2">
              <p className="text-overline text-ink-muted">Questions</p>
              <h2 id="faq-title" className="text-display-m text-ink">Good to know</h2>
            </div>
            <div className="border-t border-line">
              {faqs.map((faq, index) => (
                <details key={faq.q} open={index === 0} className="group border-b border-line">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-4 py-5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1 text-[18px] font-semibold text-ink">{faq.q}</span>
                    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink transition-transform duration-200 group-open:rotate-45">
                      <Plus className="size-4" />
                    </span>
                  </summary>
                  <p className="pb-[22px] pr-12 text-body text-ink-secondary">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Closing CTA */}
      <section aria-labelledby="cta-title">
        <Container className="pb-16 lg:pb-[88px]">
          <div className="relative flex flex-col items-start gap-10 overflow-hidden rounded-[16px] bg-sw-citron p-8 text-sw-ink sm:p-12 md:flex-row md:items-center lg:p-20">
            <span aria-hidden className="relative hidden size-[150px] shrink-0 md:block">
              <span className="absolute right-0 top-0 size-24 rounded-full bg-sw-teal" />
              <span className="absolute bottom-0 left-0 size-20 rounded-[16px] bg-sw-sky" />
              <span className="absolute bottom-0 right-2 size-12 rounded-tl-full bg-sw-ink" />
            </span>
            <div className="relative flex flex-col gap-5">
              <h2 id="cta-title" className="max-w-[760px] text-display-l text-sw-ink">Your next event starts here.</h2>
              <p className="max-w-[760px] text-body-l text-sw-ink">Set up your organisation in a few minutes. Free for you and for everyone who comes.</p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="primary" size="lg">
                  <Link href={getStartedHref}>Start organising</Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/discover">Discover events</Link>
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
