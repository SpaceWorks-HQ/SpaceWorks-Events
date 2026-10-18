import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DotMark } from "@/components/brand/DotMark";
import { cn } from "@/lib/cn";
import { Container, DotIcon } from "../primitives";
import { SETUP_GUIDE_URL } from "@/lib/openSource";


/* eslint-disable @next/next/no-img-element -- static SVG design assets from /public */

const sections = [
  {
    id: "event-pages",
    label: "Event pages",
    icon: "features-event-pages",
    lead: "A page for every event that looks like your community, not like us.",
    items: [
      "Your colour, logo and cover image",
      "Any accent colour you like, with a live preview",
      "Crop and adjust your cover photo before it goes live",
      "About, highlights, schedule, speakers, partners, venue, FAQ and resources",
      "Public, hidden-link, approval-only or invite-only",
      "Speaker and session pages",
      "An embeddable event card for your own website",
      "Listed on Discover when it is public, or when you approve each sign-up",
      "A short link that is easy to share and say out loud",
    ],
  },
  {
    id: "registration",
    label: "Registration",
    icon: "features-registration",
    lead: "Simple for guests, flexible for you.",
    items: [
      "Register as a guest or with an account",
      "Ten types of custom questions",
      "Capacity limits with an automatic waitlist",
      "Approve requests one by one",
      "A closing time for registrations",
      "Confirmation emails with a calendar invite",
      "Email your guests in five designs",
      "Check the email before it goes, with five seconds to undo",
      "Edit, cancel or undo registrations",
      "Export the guest list as CSV",
    ],
  },
  {
    id: "check-in",
    label: "Check-in",
    icon: "features-check-in",
    lead: "Fast at the door, even when the Wi-Fi isn’t.",
    items: [
      "A private QR ticket for every guest",
      "The ticket tears away on the guest’s phone the moment they are checked in",
      "A check-in desk on any phone or tablet",
      "Scan, type a code or search by name",
      "Works offline and syncs later",
      "A PIN-locked door station for volunteers",
      "Print a name badge with a QR code right after each check-in",
      "Badge designs for common card and label sizes",
    ],
  },
  {
    id: "programme",
    label: "Programme",
    icon: "features-programme",
    lead: "A schedule that keeps up with the day.",
    items: [
      "Parallel tracks and rooms",
      "Sessions with one or many speakers",
      "Running late? Later sessions in the same track move with it",
      "A live schedule page for guests",
      "Overlap warnings while you plan",
    ],
  },
  {
    id: "series",
    label: "Series",
    icon: "features-series",
    lead: "For the meetup that happens every week.",
    items: ["Weekly, monthly or custom repeats", "Each date has its own guest list", "Series-wide colours, capacity and privacy", "A schedule for every date"],
  },
  {
    id: "feedback-and-certificates",
    label: "Feedback and certificates",
    icon: "features-feedback",
    lead: "Say thank you, and learn what to do better.",
    items: [
      "Ready-made forms: quick pulse, event review, session and speaker review",
      "Anonymous when certificates are switched off",
      "Design certificates on your own artwork with text, logos and signatures",
      "Certificates for confirmed guests who give feedback",
      "Feedback export and an event report PDF",
    ],
  },
  {
    id: "teams",
    label: "Teams",
    icon: "features-teams",
    lead: "Bring your whole crew, with the right access.",
    items: [
      "Owner, admin and member roles",
      "Invite links that expire",
      "Co-organisers for a single event or series",
      "Exactly the access they need: editing, registrations, invites, check-in or publishing",
    ],
  },
  {
    id: "privacy-and-security",
    label: "Privacy and security",
    icon: "features-privacy",
    lead: "Built so organisers and guests can trust it.",
    items: [
      "Verified email before anyone creates events",
      "Two-step sign-in with recovery codes",
      "Sign out of every device in one click",
      "With an account, guests see their tickets and certificates in one place",
      "Download your own data, or leave an organisation, any time",
      "Private file storage",
      "No ad trackers; private links never reach analytics",
      "Important changes are recorded in an audit log",
    ],
  },
  {
    id: "for-developers",
    label: "For developers",
    icon: "features-developers",
    lead: "Open, self-hosted and easy to plug in.",
    items: ["A read-only API with scoped keys", "Keys you can rotate, expire and revoke", "Docker image and Helm chart", "PostgreSQL, Redis, S3 storage and SMTP", "Health checks for your monitoring"],
  },
];

/** Yuyu's features page (Figma "Features page — desktop", 123:1547). */
export function FeaturesPage({ getStartedHref }: { getStartedHref: string }) {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section aria-labelledby="features-title">
        <Container className="flex flex-col items-start gap-6 pb-14 pt-12 lg:pt-[88px]">
          <p className="text-overline text-ink-muted">Features</p>
          <h1 id="features-title" className="max-w-[900px] text-display-l text-ink">Everything you need to run a free event</h1>
          <p className="max-w-[720px] text-body-l text-ink-secondary">
            From the first announcement to the last certificate, Yuyu covers the whole event so your volunteers can focus on the people in the room.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href={getStartedHref}>Start organising — it’s free</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/discover">Discover events</Link>
            </Button>
          </div>
          <nav aria-label="Jump to a feature">
            <ul className="flex flex-wrap gap-2">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="inline-flex items-center rounded-full border border-line-strong bg-canvas px-3.5 py-1.5 text-[13px] font-bold leading-[1.4] text-ink transition-colors hover:bg-subtle"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </section>

      {/* Feature sections, alternating subtle / canvas */}
      {sections.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-title`}
          className={cn("scroll-mt-20 border-t border-line", index % 2 === 0 && "bg-subtle")}
        >
          <Container className="flex flex-col gap-8 py-14 lg:flex-row lg:items-start lg:gap-16 lg:py-[72px]">
            <div className="flex w-full flex-col items-start gap-3.5 lg:w-[420px] lg:shrink-0">
              <DotIcon name={section.icon} size={70} className="size-[70.2px]" />
              <p className="text-overline text-ink-muted">
                {String(index + 1).padStart(2, "0")} · {section.label}
              </p>
              <h2 id={`${section.id}-title`} className="text-h1 text-ink">{section.label}</h2>
              <p className="text-body-l text-ink-secondary">{section.lead}</p>
            </div>
            <ul className="grid min-w-0 flex-1 gap-4 rounded-[20px] border border-line bg-canvas p-7 sm:grid-cols-2">
              {section.items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-body text-ink">
                  <img src="/landing/features-bullet.svg" alt="" width={10} height={10} className="mt-[7px] size-2.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ))}

      {/* Closing CTA (always dark) */}
      <section aria-labelledby="features-cta-title" className="border-t border-line">
        <Container className="py-16 lg:py-[88px]">
          <div className="yy-dark-band flex flex-col items-start gap-10 overflow-hidden rounded-[28px] bg-[var(--yy-inverse-surface)] p-8 sm:p-12 md:flex-row md:items-center lg:p-[72px]">
            <DotMark size={132} label={null} className="hidden md:inline-flex" />
            <DotMark size={96} label={null} className="md:hidden" />
            <div className="flex flex-col gap-[18px]">
              <h2 id="features-cta-title" className="max-w-[760px] text-display-l text-ink">Ready for your next event?</h2>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="primary" size="lg">
                  <Link href={getStartedHref}>Start organising</Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <a href={SETUP_GUIDE_URL} target="_blank" rel="noopener noreferrer">Read the setup guide</a>
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
