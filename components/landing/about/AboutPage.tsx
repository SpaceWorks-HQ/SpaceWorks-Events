import Link from "next/link";
import { Accessibility, Code, HandHeart, LockKeyhole, MessageSquareText, Server, ShieldCheck, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/ui/github-mark";
import { CONTRIBUTING_URL, DISCUSSIONS_URL, GITHUB_REPO, GITHUB_URL, NEW_ISSUE_URL, SETUP_GUIDE_URL } from "@/lib/openSource";
import { Container, IconTile, SectionHeading, type IconTileTone } from "../primitives";
import { BuildingNote } from "./BuildingNote";
import { SpaceWorksSection } from "./SpaceWorksSection";

const story = [
  "Maker events run on goodwill. The person at the door is usually a volunteer, the budget is usually zero, and the guest list often lives in a spreadsheet next to the soldering irons.",
  "Space Works Events brings the whole event into one place, from the event page and registrations to the door and the certificates, and keeps it free for everyone involved. No tickets to sell, no fees to take, nothing to upsell.",
  "It can run on your own server, so your community keeps its own data.",
];

const principles: Array<{ title: string; body: string; icon: LucideIcon; tone: IconTileTone }> = [
  { title: "Clear, warm and specific", body: "Plain words and one obvious next step on every screen. Never an admin console.", icon: Sparkles, tone: "citron" },
  { title: "The event leads", body: "Space Works Events stays quiet so your colours, cover and logo carry the page.", icon: Wrench, tone: "teal" },
  { title: "Simple for volunteers", body: "Nothing destructive happens without asking first, and the door works on any phone.", icon: HandHeart, tone: "sky" },
  { title: "Free, and staying free", body: "Built only for free events. No payments, no fees, no ads.", icon: ShieldCheck, tone: "yellow" },
  { title: "Your data stays yours", body: "Run it on your own server. Organisations are kept apart, and private links stay private.", icon: LockKeyhole, tone: "citron" },
  { title: "Accessible by default", body: "Readable contrast and real controls that work with a keyboard, a screen reader and a small phone.", icon: Accessibility, tone: "teal" },
];

const openCards = [
  { title: "Read the code", body: "The whole app is on GitHub, from the event page to the check-in station.", icon: Code },
  { title: "Run your own", body: "A Docker image and Helm chart get your community its own Space Works Events.", icon: Server },
  { title: "Help shape it", body: "Report a bug or suggest an idea on GitHub. Organisers’ feedback decides what comes next.", icon: MessageSquareText },
];

/** The Space Works Events About page. */
export function AboutPage({ getStartedHref }: { getStartedHref: string }) {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section aria-labelledby="about-title">
        <Container className="flex flex-col items-start gap-12 py-16 lg:flex-row lg:items-center lg:gap-16 lg:py-[88px]">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <p className="text-overline text-ink-muted">About</p>
            <h1 id="about-title" className="max-w-[640px] text-display-l text-ink">Events for the people who build things.</h1>
            <p className="max-w-[600px] text-body-l text-ink-secondary">
              Most event tools are built to sell tickets. Space Works Events is built for the other kind of event: the free build night, the soldering workshop, the campus hack club, organised by volunteers in their spare time.
            </p>
          </div>
          {/* The team's note: the page's accent phrase on the envelope, and its one orange moment on the seal. */}
          <BuildingNote className="lg:w-[420px] lg:shrink-0" />
        </Container>
      </section>

      {/* Why */}
      <section aria-labelledby="why-title" className="border-y border-line bg-surface">
        <Container className="flex flex-col gap-8 py-16 lg:flex-row lg:items-start lg:gap-16 lg:py-[88px]">
          <SectionHeading id="why-title" overline="Why Space Works Events" title="Built for the people who run the room" className="lg:w-[480px] lg:shrink-0" />
          <div className="flex min-w-0 max-w-[616px] flex-1 flex-col gap-5 text-body-l text-ink-secondary">
            {story.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </Container>
      </section>

      {/* Principles */}
      <section aria-labelledby="principles-title">
        <Container className="flex flex-col gap-10 py-16 lg:py-[88px]">
          <SectionHeading id="principles-title" overline="What we believe" title="Six promises we design by" />
          <ul className="grid auto-rows-fr gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {principles.map((principle) => (
              <li key={principle.title} className="group flex flex-col gap-3 rounded-[16px] border border-line bg-panel p-6">
                <IconTile icon={principle.icon} tone={principle.tone} />
                <h3 className="text-h4 text-ink">{principle.title}</h3>
                <p className="text-body-ui text-ink-secondary">{principle.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Open and yours */}
      <section aria-labelledby="open-title" className="border-y border-line bg-surface">
        <Container className="flex flex-col gap-10 py-16 lg:py-[88px]">
          <SectionHeading id="open-title" overline="Open and yours" title="Read it, run it, help shape it" />
          <ul className="grid gap-5 md:grid-cols-3">
            {openCards.map((card) => (
              <li key={card.title} className="group flex flex-col gap-3 rounded-[16px] border border-line bg-panel p-6">
                <IconTile icon={card.icon} />
                <h3 className="text-h4 text-ink">{card.title}</h3>
                <p className="text-body-ui text-ink-secondary">{card.body}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="primary">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"><GitHubMark />View on GitHub</a>
              </Button>
              <Button asChild variant="secondary">
                <a href={SETUP_GUIDE_URL} target="_blank" rel="noopener noreferrer">Read the setup guide</a>
              </Button>
            </div>
            <p className="text-body-ui text-ink-secondary">
              The code lives at{" "}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-4">{GITHUB_REPO}</a>
              . You can{" "}
              <a href={NEW_ISSUE_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">report a bug</a>
              ,{" "}
              <a href={DISCUSSIONS_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">start a discussion</a>
              {" "}or read{" "}
              <a href={CONTRIBUTING_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">how to contribute</a>
              .
            </p>
          </div>
        </Container>
      </section>

      {/* Who makes it */}
      <SpaceWorksSection />

      {/* Closing CTA */}
      <section aria-labelledby="about-cta-title">
        <Container className="pb-16 lg:pb-[88px]">
          <div className="flex flex-col items-start gap-6 overflow-hidden rounded-[16px] bg-sw-sky p-8 sm:p-12 lg:p-[72px]">
            <h2 id="about-cta-title" className="max-w-[760px] text-display-l text-sw-ink">Bring your community together.</h2>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="primary" size="lg">
                <Link href={getStartedHref}>Start organising</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/discover">Discover events</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
