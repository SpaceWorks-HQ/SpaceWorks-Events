import Link from "next/link";
import { Bug, GitPullRequest, Lightbulb, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/ui/github-mark";
import { ThemedImage } from "@/components/ui/themed-image";
import { DotFace } from "@/components/brand/DotFace";
import type { DotFaceMood } from "@/components/brand/patterns";
import { DotMark } from "@/components/brand/DotMark";
import { CONTRIBUTING_URL, DISCUSSIONS_URL, GITHUB_REPO, GITHUB_URL, NEW_ISSUE_URL, SETUP_GUIDE_URL } from "@/lib/openSource";
import { accentStyle } from "@/lib/theme/accent";
import { ColourPreview } from "./ColourPreview";
import { Container, DotIcon, SectionHeading } from "./primitives";

/* eslint-disable @next/next/no-img-element -- static SVG design assets from /public */

const steps = [
  { title: "Create the event", body: "Pick a date, a place and your colours. Add a programme, speakers and an FAQ if you need them.", icon: "step-create" },
  { title: "Share one link", body: "People register in seconds, as guests or with an account. Set a capacity and Yuyu runs the waitlist.", icon: "step-share" },
  { title: "Welcome them in", body: "Scan tickets on any phone or tablet at the door, even when the venue Wi-Fi drops.", icon: "step-welcome" },
  { title: "Say thank you", body: "Send a feedback form, hand out certificates and download a simple report when it is over.", icon: "step-thanks" },
];

const features = [
  { title: "Event pages in your colours", body: "A page for every event, with your cover, logo, schedule, speakers, venue and FAQ.", icon: "icon-page" },
  { title: "Registration and waitlists", body: "Custom questions, capacity limits, approvals and automatic waitlist promotion.", icon: "icon-done" },
  { title: "Tickets and offline check-in", body: "QR tickets that tear away live at check-in, a desk on any phone, a PIN-locked door station and badge printing.", icon: "icon-check-in" },
  { title: "Programme and live schedule", body: "Parallel tracks, sessions and live delays that update for everyone in the room.", icon: "icon-time" },
  { title: "Speakers and sessions", body: "Speaker pages, session pages and resources people can open after the talk.", icon: "icon-speaker" },
  { title: "Feedback and certificates", body: "Quick feedback forms and certificates you design once and send to everyone who came.", icon: "icon-certificate" },
  { title: "Recurring series", body: "Weekly meetups and monthly clubs, each date with its own guest list.", icon: "icon-date" },
  { title: "Teams and co-organisers", body: "Invite your crew with the right access, from full admin to door volunteer.", icon: "icon-guests" },
];

const moments: Array<{ title: string; body: string; face: DotFaceMood }> = [
  { title: "You’re in!", body: "The moment someone registers.", face: "cheering" },
  { title: "Checked in", body: "A friendly hello at the door.", face: "wink" },
  { title: "On the waitlist", body: "Honest, and we tell them when a spot opens.", face: "waiting" },
  { title: "Loved it", body: "Feedback that takes ten seconds to give.", face: "love" },
];

const doorPoints = [
  "Scan QR tickets with the camera on any phone or tablet",
  "Download the guest list before doors open, then check people in offline",
  "Open a PIN-locked door station so volunteers can help without an account",
  "Every check-in syncs as soon as you are back online",
];

const promises = [
  { title: "Charge your guests", body: "There are no tickets for sale, no payments and no fees. Every event on Yuyu is free to attend." },
  { title: "Show ads or track people", body: "No ad trackers. Private ticket and invite links are stripped before any analytics." },
  { title: "Keep your data hostage", body: "Your organisation’s data lives on your server. Export your guest list whenever you like." },
  { title: "Make your guests sign up", body: "People can register as guests with just a name and email. Accounts are optional." },
];

const requirements = [
  ["App", "Docker image · Helm chart"],
  ["Database", "PostgreSQL"],
  ["Rate limiting", "Redis"],
  ["Files", "S3-compatible storage"],
  ["Email", "Any SMTP provider"],
  ["Sign-in", "Email + optional Google"],
];

const openLinks = [
  { title: "Star the project", body: "Follow along and help other communities find Yuyu.", href: GITHUB_URL, Icon: Star },
  { title: "Report a bug", body: "Something not working? Open an issue with the steps to repeat it.", href: NEW_ISSUE_URL, Icon: Bug },
  { title: "Suggest an idea", body: "Tell us what your community needs in GitHub Discussions.", href: DISCUSSIONS_URL, Icon: Lightbulb },
  { title: "Contribute", body: "Read the contributing guide, then send a fix or a feature.", href: CONTRIBUTING_URL, Icon: GitPullRequest },
];

const faqs = [
  { q: "Is Yuyu really free?", a: "Yes. Yuyu is built only for free events: there is nothing to buy and nothing to sell. If you host it yourself, you only pay for your own server." },
  { q: "Who is Yuyu for?", a: "Clubs, meetups, NGOs, campus groups and any community that runs free events, usually with a small team of volunteers." },
  { q: "Do my guests need an account?", a: "No. Guests can register with a name and email and get their ticket by email. They can create an account later if they want one." },
  { q: "Can I run it on my own server?", a: "Yes. Yuyu ships as a Docker image with a Helm chart. You will need PostgreSQL, Redis, S3-compatible storage and an SMTP provider." },
  { q: "Is Yuyu open source?", a: "Yes. All of the code is public on GitHub, where anyone can read it, report bugs, suggest ideas and send improvements." },
  { q: "What happens if the internet drops at the venue?", a: "Download the guest list before doors open and keep checking people in. Everything syncs when the connection comes back." },
];

/** Yuyu's homepage (Figma "Landing page — desktop", 117:289). */
export function HomePage({ getStartedHref }: { getStartedHref: string }) {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section aria-labelledby="hero-title">
        <Container className="grid items-center gap-14 pb-20 pt-12 lg:grid-cols-2 lg:pt-[72px]">
          <div className="flex flex-col items-start gap-7">
            <h1 id="hero-title" className="max-w-[552px] text-display-xl text-ink">Your whole event, in one place.</h1>
            <p className="max-w-[552px] text-body-l text-ink-secondary">
              From the invite to the thank-you, Yuyu gives clubs, meetups and volunteer teams one free tool for sign-ups, check-in and feedback.
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
              <p className="text-caption text-ink-muted">Free to organise and free to attend, for every event.</p>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 self-start text-label text-ink-secondary underline-offset-4 transition-colors hover:text-ink hover:underline">
                <GitHubMark />
                Open source on GitHub · {GITHUB_REPO}
              </a>
            </div>
          </div>

          {/* Hero visual: an example event card and ticket (illustrative, not live data) */}
          <div aria-hidden style={accentStyle(null)} className="yy-accent-scope relative mx-auto w-full max-w-[552px] pb-[176px] sm:h-[673px] sm:pb-0">
            <div className="relative overflow-hidden rounded-[20px] border border-line bg-canvas shadow-float sm:absolute sm:left-[30px] sm:top-0 sm:w-[460px]">
              <div className="relative h-[150px] overflow-hidden bg-accent">
                <img src="/landing/hero-cover-dots.svg" alt="" width={445} height={137} className="absolute left-[9px] top-[9px] h-[137px] w-[445px] max-w-none" />
              </div>
              <div className="flex flex-col gap-4 p-6">
                <div className="flex gap-2">
                  <span className="rounded-full bg-accent-soft px-[11px] py-1 text-[13px] font-bold leading-[1.4] text-accent-text">Free</span>
                  <span className="rounded-full bg-muted px-[11px] py-1 text-[13px] font-bold leading-[1.4] text-ink-secondary">In person</span>
                </div>
                <p className="font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-accent-text sm:text-[32px]">Maker Conference 2026</p>
                <div className="flex items-center gap-3.5">
                  <span className="flex h-[60px] w-14 shrink-0 flex-col items-center overflow-hidden rounded-md border border-line bg-canvas">
                    <span className="w-full bg-accent py-[3px] text-center text-[11px] font-bold uppercase leading-[1.3] tracking-[0.08em] text-on-accent">Jun</span>
                    <span className="font-display text-[22px] font-extrabold leading-[1.35] text-ink">6</span>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-label text-ink">Sunday, 6 June · 9:30 AM</span>
                    <span className="text-body-ui text-ink-muted">Trivandrum, Kerala</span>
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between">
                    <span className="text-label text-ink">60 going</span>
                    <span className="text-caption text-ink-muted">40 spots left</span>
                  </div>
                  <ThemedImage src="/landing/hero-dot-progress.svg" darkSrc="/landing/hero-dot-progress-dark.svg" width={404} height={16} className="h-auto w-full max-w-[404px]" />
                </div>
                <span className="inline-flex h-11 w-full items-center justify-center rounded-full bg-accent text-[15px] font-bold text-on-accent">Register — it’s free</span>
              </div>
            </div>

            <div className="group absolute bottom-0 right-0 flex w-[290px] max-w-[88%] flex-col gap-3.5 rounded-[24px] border border-line bg-canvas p-5 shadow-ticket sm:bottom-auto sm:left-[262px] sm:right-auto sm:top-[452px]">
              <div className="flex items-center gap-3">
                <DotFace mood="cheering" size={54.4} />
                <p className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-ink">You’re in, Adithya!</p>
              </div>
              <ThemedImage src="/landing/ticket-perforation.svg" darkSrc="/landing/ticket-perforation-dark.svg" width={248} height={3} className="h-[3px] w-full" />
              <div className="flex items-center gap-3.5">
                <span className="shrink-0 rounded-[10px] border border-line bg-white p-2">
                  <img src="/landing/ticket-qr.svg" alt="" width={70} height={70} className="size-[70px]" />
                </span>
                <p className="text-caption text-ink-muted">Show this at the door. It only holds a private ticket link.</p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-title" className="border-y border-line bg-subtle">
        <Container className="flex flex-col gap-10 py-16 lg:py-[72px]">
          <div className="flex max-w-[640px] flex-col gap-2">
            <p className="text-overline text-ink-muted">How it works</p>
            <h2 id="how-title" className="text-display-m text-ink">From first idea to thank-you note</h2>
          </div>
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-3 rounded-[20px] border border-line bg-canvas p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-full bg-highlight-peach font-display text-[17px] font-extrabold text-ink">{index + 1}</span>
                  <ThemedImage src={`/landing/${step.icon}.svg`} darkSrc={`/landing/${step.icon}-dark.svg`} width={45} height={45} className="size-[45px]" />
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
          <SectionHeading overline="Features" title="Everything a volunteer team needs" lead="One place for the whole event, so nobody has to juggle five tools on the morning of." />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <li key={feature.title} className="flex flex-col gap-3 rounded-[20px] border border-line bg-canvas p-6">
                <DotIcon name={feature.icon} />
                <h3 className="text-h4 text-ink">{feature.title}</h3>
                <p className="text-body-ui text-ink-secondary">{feature.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Your event, your colours */}
      <section aria-label="Your event, your colours" className="border-y border-line bg-subtle">
        <Container className="py-16 lg:py-[88px]">
          <ColourPreview />
        </Container>
      </section>

      {/* The little moments */}
      <section aria-labelledby="moments-title">
        <Container className="flex flex-col gap-10 py-16 lg:py-[88px]">
          <div className="flex max-w-[640px] flex-col gap-2">
            <p className="text-overline text-ink-muted">The little moments</p>
            <h2 id="moments-title" className="text-display-m text-ink">A warm welcome at every step</h2>
            <p className="text-body-l text-ink-secondary">Registering, arriving and saying thanks should feel good. Yuyu’s dot faces show up when it matters, never in the way.</p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {moments.map((moment) => (
              <li key={moment.title} className="group flex flex-col items-center gap-[18px] rounded-[24px] bg-tint-peach px-6 py-7 text-center">
                <DotFace mood={moment.face} size={108.8} />
                <h3 className="font-display text-[22px] font-extrabold text-ink">{moment.title}</h3>
                <p className="text-body-ui text-ink-secondary">{moment.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* At the door (always dark) */}
      <section aria-labelledby="door-title" className="yy-dark-band bg-canvas text-ink">
        <Container className="grid items-center gap-12 pb-12 pt-16 lg:grid-cols-2 lg:gap-14 lg:pb-14 lg:pt-[88px]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-overline text-ink-muted">At the door</p>
              <h2 id="door-title" className="text-display-m text-ink">Check-in that keeps working when the Wi-Fi doesn’t</h2>
            </div>
            <ul className="flex flex-col gap-3.5">
              {doorPoints.map((point) => (
                <li key={point} className="flex items-center gap-3.5 text-body-l text-ink">
                  <img src="/landing/point-dot.svg" alt="" width={12} height={12} className="size-3 shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden className="mx-auto flex w-full max-w-[552px] flex-col gap-3.5 rounded-[28px] bg-muted p-5 lg:mx-0 lg:justify-self-end">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="min-w-0 flex-1 text-label text-ink">Demo Summit · Station 1</span>
              <span className="text-body-ui text-ink-secondary">58 / 60 checked in</span>
              <span className="rounded-full bg-warning-bg px-[11px] py-1 text-[13px] font-bold leading-[1.4] text-warning-fg">Offline · syncs later</span>
            </div>
            <div className="group flex flex-col items-start gap-7 rounded-[24px] bg-success-solid p-7 sm:flex-row sm:items-center">
              <span className="shrink-0 rounded-[20px] bg-white p-4">
                <DotFace mood="wink" size={95.2} colors={{ X: "#FFB547", O: "#18181B" }} />
              </span>
              <div className="flex flex-col gap-2">
                <p className="text-[17px] font-bold text-white">Checked in</p>
                <p className="font-display text-[40px] font-extrabold leading-tight tracking-[-0.03em] text-white">Adithya Rao</p>
                <div className="flex gap-2.5">
                  <span className="inline-flex h-11 items-center rounded-full bg-[#18181b] px-[18px] text-[15px] font-bold text-[#f4f4f5]">Next guest</span>
                  <span className="inline-flex h-11 items-center rounded-full border-[1.5px] border-white px-5 text-[15px] font-bold text-white">Undo</span>
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
            <h2 id="promise-title" className="text-display-m text-ink">What Yuyu will never do</h2>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {promises.map((promise) => (
              <li key={promise.title} className="flex flex-col gap-2.5 rounded-[20px] bg-muted p-6">
                <p className="text-overline text-ink-muted">Never</p>
                <h3 className="text-h3 text-ink">{promise.title}</h3>
                <p className="text-body-ui text-ink-secondary">{promise.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Self-host */}
      <section id="self-host" aria-labelledby="self-host-title" className="scroll-mt-20 border-y border-line bg-subtle">
        <Container className="grid items-center gap-12 pb-12 pt-16 lg:grid-cols-2 lg:gap-14 lg:pb-14 lg:pt-[88px]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-overline text-ink-muted">Self-host</p>
              <h2 id="self-host-title" className="text-display-m text-ink">Run it on your own server</h2>
              <p className="text-body-l text-ink-secondary">Your guest lists stay with you. Yuyu ships as a Docker image with a Helm chart, and every organisation on your install is kept separate from the others.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="primary">
                <a href={SETUP_GUIDE_URL} target="_blank" rel="noopener noreferrer">Read the setup guide</a>
              </Button>
              <Button asChild variant="secondary">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"><GitHubMark />View on GitHub</a>
              </Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[552px] overflow-hidden rounded-[20px] border border-line bg-canvas lg:mx-0 lg:justify-self-end">
            <p className="border-b border-line px-5 py-3.5 text-label text-ink">What you need</p>
            <dl className="py-2">
              {requirements.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt className="text-label text-ink">{label}</dt>
                  <dd className="text-right font-mono text-[13px] text-ink-muted">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
        {/* Built in the open */}
        <Container className="flex flex-col gap-8 pb-16 lg:pb-[88px]">
          <div className="flex flex-col gap-2 border-t border-line pt-12 lg:pt-14">
            <p className="text-overline text-ink-muted">Open source</p>
            <h3 className="text-h2 text-ink">Built in the open</h3>
            <p className="max-w-[680px] text-body-l text-ink-secondary">Every line of Yuyu is public on GitHub. Read how it works, tell us what is missing, or help build it.</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {openLinks.map(({ title, body, href, Icon }) => (
              <li key={title}>
                <a href={href} target="_blank" rel="noopener noreferrer" className="group flex h-full flex-col gap-3 rounded-[20px] border border-line bg-canvas p-6 transition-colors hover:border-line-strong">
                  <span className="flex size-10 items-center justify-center rounded-full bg-tint-peach text-ink">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="text-h4 text-ink underline-offset-4 group-hover:underline">{title}</span>
                  <span className="text-body-ui text-ink-secondary">{body}</span>
                </a>
              </li>
            ))}
          </ul>
        </Container>
      </section>

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
                  <summary className="flex cursor-pointer list-none items-center gap-4 py-5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1 text-[18px] font-bold text-ink">{faq.q}</span>
                    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-ink transition-transform duration-200 group-open:rotate-45">
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

      {/* Closing CTA (always dark) */}
      <section aria-labelledby="cta-title">
        <Container className="pb-16 lg:pb-[88px]">
          <div className="yy-dark-band flex flex-col items-start gap-10 overflow-hidden rounded-[28px] bg-[var(--yy-inverse-surface)] p-8 sm:p-12 md:flex-row md:items-center lg:p-20">
            <DotMark size={150} label={null} className="hidden md:inline-flex" />
            <DotMark size={96} label={null} className="md:hidden" />
            <div className="flex flex-col gap-5">
              <h2 id="cta-title" className="max-w-[760px] text-display-l text-ink">Your next event starts here.</h2>
              <p className="max-w-[760px] text-body-l text-ink-secondary">Set up your organisation in a few minutes. Free for you and for everyone who comes.</p>
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
