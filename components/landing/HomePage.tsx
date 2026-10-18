import Link from "next/link";
import {
  Award,
  Bug,
  CalendarClock,
  ClipboardList,
  GitPullRequest,
  IdCard,
  LayoutTemplate,
  Lightbulb,
  Link2,
  PenLine,
  Plus,
  ScanLine,
  Star,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/ui/github-mark";
import { CONTRIBUTING_URL, DISCUSSIONS_URL, GITHUB_REPO, GITHUB_URL, LICENSE_URL, NEW_ISSUE_URL, SETUP_GUIDE_URL } from "@/lib/openSource";
import { ColourPreview } from "./ColourPreview";
import { Container, IconTile, SectionHeading } from "./primitives";

const steps = [
  { title: "Create the event", body: "Pick a date, a place and your colours. Add a programme, speakers and an FAQ if you need them.", icon: PenLine },
  { title: "Share one link", body: "Every event gets a short link. People register in seconds, and Space Works Events runs the waitlist.", icon: Link2 },
  { title: "Welcome them in", body: "Scan live tickets on any phone or tablet at the door, even when the workshop Wi-Fi drops.", icon: ScanLine },
  { title: "Say thank you", body: "Send a feedback form, issue certificates and download a simple report when it is over.", icon: Award },
];

const features = [
  { title: "Event pages in your colours", body: "A page for every event, with your cover, logo, schedule, speakers, venue and FAQ.", icon: LayoutTemplate },
  { title: "Registration and waitlists", body: "Custom questions, capacity limits, approvals and automatic waitlist promotion.", icon: ClipboardList },
  { title: "Live tickets", body: "A private QR ticket that updates on the guest’s phone the moment they are checked in.", icon: Ticket },
  { title: "Check-in that works offline", body: "A desk on any phone, a PIN-locked door station for volunteers, and sync when you are back online.", icon: ScanLine },
  { title: "ID cards and badges", body: "Print a name badge or ID card with a QR code right after each check-in.", icon: IdCard },
  { title: "Short links", body: "A short link for every event that is easy to share, print on a poster and say out loud.", icon: Link2 },
  { title: "Programme and live schedule", body: "Parallel tracks, sessions and live delays that update for everyone in the room.", icon: CalendarClock },
  { title: "Feedback and certificates", body: "Quick feedback forms, and certificates you design once and issue to everyone who came.", icon: Award },
];

/** Status words people see along the way. Every status pairs a colour with a word. */
const statuses = [
  { pill: "Registered", tone: "bg-sw-citron text-sw-ink", title: "You’re in", body: "The moment someone registers, with the ticket in their inbox." },
  { pill: "Waitlisted", tone: "bg-sw-sky text-sw-ink", title: "On the waitlist", body: "Honest about the queue, and we tell them when a spot opens." },
  { pill: "Checked in", tone: "bg-accent-soft text-ink", title: "Through the door", body: "A quick scan, and their ticket updates on their phone." },
  { pill: "Feedback sent", tone: "bg-sw-yellow text-sw-ink", title: "Thanks for coming", body: "Feedback in ten seconds, and the certificate follows." },
];

const doorPoints = [
  "Scan QR tickets with the camera on any phone or tablet",
  "Download the guest list before doors open, then check people in offline",
  "Open a PIN-locked door station so volunteers can help without an account",
  "Print an ID card or badge for each guest as they arrive",
];

const promises = [
  { title: "Charge your guests", body: "There are no tickets for sale, no payments and no fees. Every event here is free to attend." },
  { title: "Show ads or track people", body: "No ad trackers. Private ticket and invite links are stripped before any analytics." },
  { title: "Keep your data hostage", body: "Your community’s data lives on your server. Export your guest list whenever you like." },
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
  { title: "Star the project", body: "Follow along and help other maker communities find it.", href: GITHUB_URL, Icon: Star },
  { title: "Report a bug", body: "Something not working? Open an issue with the steps to repeat it.", href: NEW_ISSUE_URL, Icon: Bug },
  { title: "Suggest an idea", body: "Tell us what your community needs in GitHub Discussions.", href: DISCUSSIONS_URL, Icon: Lightbulb },
  { title: "Contribute", body: "Read the contributing guide, then send a fix or a feature.", href: CONTRIBUTING_URL, Icon: GitPullRequest },
];

const faqs = [
  { q: "Is Space Works Events free?", a: "Yes. It is built only for free events: there is nothing to buy and nothing to sell. If you host it yourself, you only pay for your own server." },
  { q: "Who is it for?", a: "Makerspaces, hackerspaces, workshops, build nights, campus clubs and any community that runs free events, usually with a small team of volunteers." },
  { q: "Do my guests need an account?", a: "No. Guests can register with a name and email and get their ticket by email. They can create an account later if they want one." },
  { q: "Can I run it on my own server?", a: "Yes. It ships as a Docker image with a Helm chart. You will need PostgreSQL, Redis, S3-compatible storage and an SMTP provider." },
  { q: "Is it open source?", a: "Yes. The code is public on GitHub under the AGPL-3.0 licence. Anyone can read it, report bugs, suggest ideas and send improvements." },
  { q: "What happens if the internet drops at the venue?", a: "Download the guest list before doors open and keep checking people in. Everything syncs when the connection comes back." },
];

/** A fixed, decorative QR-like pattern for the sample ticket. It encodes nothing. */
const SAMPLE_QR = [
  "1111111010111",
  "1000001001001",
  "1011101011101",
  "1011101000101",
  "1011101011001",
  "1000001010111",
  "1111111010101",
  "0000000011000",
  "1101011100110",
  "0110100011011",
  "1011011101001",
  "0100110010110",
  "1110101101011",
];

function SampleQr() {
  return (
    <svg viewBox="0 0 13 13" className="block size-[70px] text-[#142C2A]" shapeRendering="crispEdges" aria-hidden>
      {SAMPLE_QR.flatMap((row, y) => [...row].map((bit, x) => (bit === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)))}
    </svg>
  );
}

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
              <p className="text-caption text-ink-muted">Free to organise and free to attend, for every event.</p>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 self-start text-label text-ink-secondary underline-offset-4 transition-colors hover:text-ink hover:underline">
                <GitHubMark />
                Open source on GitHub · {GITHUB_REPO}
              </a>
            </div>
          </div>

          {/* Hero visual: an example event card and ticket (illustrative, not live data) */}
          <div aria-hidden className="relative mx-auto w-full max-w-[552px] pb-[176px] sm:h-[680px] sm:pb-0">
            <div className="relative overflow-hidden rounded-[16px] border border-line bg-panel sm:absolute sm:left-[30px] sm:top-0 sm:w-[460px]">
              {/* Cover: simple shapes in brand colours. The orange quarter is this page's one bold moment. */}
              <div className="relative h-[150px] overflow-hidden bg-sw-teal">
                <span className="absolute -left-8 top-6 size-36 rounded-full bg-sw-citron" />
                <span className="absolute left-[150px] top-10 size-20 rounded-[16px] bg-sw-sky" />
                <span className="absolute -bottom-10 right-16 size-32 rounded-tl-full bg-sw-orange" />
                <span className="absolute right-4 top-4 size-10 rounded-full bg-sw-yellow" />
              </div>
              <div className="flex flex-col gap-4 p-6">
                <div className="flex gap-2">
                  <span className="rounded-full bg-sw-citron px-[11px] py-1 text-[13px] font-semibold leading-[1.4] text-sw-ink">Free</span>
                  <span className="rounded-full border border-line bg-surface px-[11px] py-1 text-[13px] font-semibold leading-[1.4] text-ink">In person</span>
                </div>
                <p className="text-[28px] font-semibold leading-tight text-ink sm:text-[32px]">Kochi Maker Night</p>
                <div className="flex items-center gap-3.5">
                  <span className="flex h-[60px] w-14 shrink-0 flex-col items-center overflow-hidden rounded-[10px] border border-line bg-panel">
                    <span className="w-full bg-primary py-[3px] text-center text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.08em] text-on-primary">Nov</span>
                    <span className="text-[22px] font-semibold leading-[1.35] tabular-nums text-ink">14</span>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-label text-ink">Saturday, 14 November · 6:00 PM</span>
                    <span className="text-body-ui text-ink-muted">Space Works, Kochi</span>
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between">
                    <span className="text-label tabular-nums text-ink">48 going</span>
                    <span className="text-caption tabular-nums text-ink-muted">12 spots left</span>
                  </div>
                  <span className="block h-2 overflow-hidden rounded-full bg-track">
                    <span className="block h-full w-4/5 rounded-full bg-primary" />
                  </span>
                </div>
                <span className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-on-primary">Register — it’s free</span>
              </div>
            </div>

            <div className="absolute bottom-0 right-0 flex w-[290px] max-w-[88%] flex-col gap-3.5 rounded-[16px] border border-line-strong bg-panel p-5 sm:bottom-auto sm:left-[262px] sm:right-auto sm:top-[476px]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[20px] font-semibold text-ink">You’re in, Meera!</p>
                <span className="rounded-full bg-sw-citron px-2.5 py-0.5 text-[12px] font-semibold text-sw-ink">Registered</span>
              </div>
              <span className="block border-t-2 border-dashed border-line-strong" />
              <div className="flex items-center gap-3.5">
                <span className="shrink-0 rounded-[10px] border border-line bg-white p-2">
                  <SampleQr />
                </span>
                <p className="text-caption text-ink-muted">Show this at the door. It updates the moment you are checked in.</p>
              </div>
            </div>
          </div>
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
              <li key={step.title} className="flex flex-col gap-3 rounded-[16px] border border-line bg-panel p-6">
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
              <li key={feature.title} className="flex flex-col gap-3 rounded-[16px] border border-line bg-panel p-6">
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
              <li key={status.title} className="flex flex-col items-start gap-3 rounded-[16px] border border-line bg-panel p-6">
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
      <section id="self-host" aria-labelledby="self-host-title" className="scroll-mt-20 border-y border-line bg-surface">
        <Container className="grid items-center gap-12 pb-12 pt-16 lg:grid-cols-2 lg:gap-14 lg:pb-14 lg:pt-[88px]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-overline text-ink-muted">Self-host</p>
              <h2 id="self-host-title" className="text-display-m text-ink">Run it on your own server</h2>
              <p className="text-body-l text-ink-secondary">Your guest lists stay with you. Space Works Events ships as a Docker image with a Helm chart, and every organisation on your install is kept separate from the others.</p>
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
          <div className="mx-auto w-full max-w-[552px] overflow-hidden rounded-[16px] border border-line bg-panel lg:mx-0 lg:justify-self-end">
            <p className="border-b border-line px-5 py-3.5 text-label text-ink">What you need</p>
            <dl className="py-2">
              {requirements.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt className="text-label text-ink">{label}</dt>
                  <dd className="text-right text-[14px] font-medium text-ink-muted">{value}</dd>
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
            <p className="max-w-[680px] text-body-l text-ink-secondary">
              Every line is public on GitHub under the{" "}
              <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">AGPL-3.0 licence</a>
              . Read how it works, tell us what is missing, or help build it.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {openLinks.map(({ title, body, href, Icon }) => (
              <li key={title}>
                <a href={href} target="_blank" rel="noopener noreferrer" className="group flex h-full flex-col gap-3 rounded-[16px] border border-line bg-panel p-6 transition-colors hover:border-line-strong">
                  <IconTile icon={Icon} tone="citron" />
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
