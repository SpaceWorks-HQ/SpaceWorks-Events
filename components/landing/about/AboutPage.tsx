import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DotFace } from "@/components/brand/DotFace";
import { DotMark } from "@/components/brand/DotMark";
import type { DotFaceMood } from "@/components/brand/patterns";
import { GitHubMark } from "@/components/ui/github-mark";
import { CONTRIBUTING_URL, DISCUSSIONS_URL, GITHUB_REPO, GITHUB_URL, NEW_ISSUE_URL, SETUP_GUIDE_URL } from "@/lib/openSource";
import { Container, DotIcon, SectionHeading } from "../primitives";
import { BuildingNote } from "./BuildingNote";
import { MakerSection } from "./MakerSection";


const story = [
  "Community events run on goodwill. The person at the door is usually a volunteer, the budget is usually zero, and the guest list often lives in a spreadsheet.",
  "Yuyu brings the whole event into one place, from the event page and registrations to the door and the thank-you, and keeps it free for everyone involved. No tickets to sell, no fees to take, nothing to upsell.",
  "Yuyu can run on your own server, not anyone else's, so you protect your own data.",
];

const principles: Array<{ title: string; body: string; face: DotFaceMood }> = [
  { title: "Welcoming, like a neighbourhood", body: "Plain words, friendly shapes and room to breathe. Never an admin console.", face: "happy" },
  { title: "The event leads", body: "Yuyu stays quiet so your colours, cover and logo carry the page.", face: "cheering" },
  { title: "Simple for volunteers", body: "One obvious next step on every screen, and nothing destructive without asking first.", face: "done" },
  { title: "Free, and staying free", body: "Built only for free events. No payments, no fees, no ads.", face: "love" },
  { title: "Your data stays yours", body: "Run it on your own server. Organisations are kept apart, and private links stay private.", face: "wink" },
  { title: "Accessible by default", body: "Readable contrast and real controls that work with a keyboard, a screen reader and a small phone.", face: "thinking" },
];

const openCards = [
  { title: "Read the code", body: "The whole app is on GitHub, from the event page to the check-in station.", icon: "about-icon-code" },
  { title: "Run your own", body: "A Docker image and Helm chart get your community its own Yuyu.", icon: "about-icon-lock" },
  { title: "Help shape it", body: "Report a bug or suggest an idea on GitHub. Organisers’ feedback decides what comes next.", icon: "about-icon-feedback" },
];

/** Yuyu's About page (Figma "About page — desktop", 124:1826). */
export function AboutPage({ getStartedHref }: { getStartedHref: string }) {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section aria-labelledby="about-title">
        <Container className="flex flex-col items-start gap-12 py-16 lg:flex-row lg:items-center lg:gap-16 lg:py-[88px]">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <p className="text-overline text-ink-muted">About</p>
            <h1 id="about-title" className="max-w-[640px] text-display-l text-ink">Free events, run by communities.</h1>
            <p className="max-w-[600px] text-body-l text-ink-secondary">
              Most event tools are built to sell tickets. Yuyu is built for the other kind of event: the free meetup, the campus club, the NGO workshop, organised by volunteers in their spare time.
            </p>
          </div>
          {/* The builder's note: a sealed envelope that opens into a letter. */}
          <BuildingNote className="lg:w-[420px] lg:shrink-0" />
        </Container>
      </section>

      {/* Why Yuyu */}
      <section aria-labelledby="why-title" className="border-y border-line bg-subtle">
        <Container className="flex flex-col gap-8 py-16 lg:flex-row lg:items-start lg:gap-16 lg:py-[88px]">
          <SectionHeading id="why-title" overline="Why Yuyu" title="Built for the people who run the room" className="lg:w-[480px] lg:shrink-0" />
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
              <li key={principle.title} className="group flex flex-col items-center gap-[18px] rounded-[24px] bg-tint-peach px-6 py-7 text-center">
                <DotFace mood={principle.face} size={108.8} />
                <h3 className="font-display text-[22px] font-extrabold text-ink">{principle.title}</h3>
                <p className="text-body-ui text-ink-secondary">{principle.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Open and yours */}
      <section aria-labelledby="open-title" className="border-y border-line bg-subtle">
        <Container className="flex flex-col gap-10 py-16 lg:py-[88px]">
          <SectionHeading id="open-title" overline="Open and yours" title="Read it, run it, help shape it" />
          <ul className="grid gap-5 md:grid-cols-3">
            {openCards.map((card) => (
              <li key={card.title} className="flex flex-col gap-3 rounded-[20px] border border-line bg-canvas p-6">
                <DotIcon name={card.icon} />
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
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="font-mono text-[14px] text-ink underline underline-offset-4">{GITHUB_REPO}</a>
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

      {/* Who makes Yuyu */}
      <MakerSection />

      {/* Closing CTA (always dark) */}
      <section aria-labelledby="about-cta-title">
        <Container className="pb-16 lg:pb-[88px]">
          <div className="yy-dark-band flex flex-col items-start gap-10 overflow-hidden rounded-[28px] bg-[var(--yy-inverse-surface)] p-8 sm:p-12 md:flex-row md:items-center lg:p-[72px]">
            <DotMark size={132} label={null} className="hidden md:inline-flex" />
            <DotMark size={96} label={null} className="md:hidden" />
            <div className="flex flex-col gap-[18px]">
              <h2 id="about-cta-title" className="max-w-[760px] text-display-l text-ink">Bring your community together.</h2>
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
