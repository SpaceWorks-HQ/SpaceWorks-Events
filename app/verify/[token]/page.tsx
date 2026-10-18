import type { Metadata } from "next";
import { BadgeCheck, CircleSlash, Clock, SearchX } from "lucide-react";
import { BrandHomeLink } from "@/components/chrome/SiteHeader";
import { Avatar } from "@/components/ui/display";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { cn } from "@/lib/cn";
import { prisma } from "@/lib/db";
import { memberPhotoUrl, VERIFY_TOKEN_PATTERN } from "@/lib/memberIds/data";
import { verificationView, type VerifyState, type VerifyView } from "@/lib/memberIds/verify";

export const dynamic = "force-dynamic";

/* The verify link is a bearer value: never indexed, never sent on as a referrer. */
export const metadata: Metadata = {
  title: "Check an ID card",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }> };

async function lookup(token: string): Promise<VerifyView | "limited"> {
  // Tight per-IP limit so the token space cannot be scanned.
  if (await isActionRateLimited("shortLink")) return "limited";
  if (!VERIFY_TOKEN_PATTERN.test(token)) return { state: "not-found" };
  const member = await prisma.idMember.findUnique({
    where: { verifyToken: token },
    select: {
      status: true,
      name: true,
      idNumber: true,
      expiresAt: true,
      photoUrl: true,
      organisationId: true,
      programme: { select: { name: true, organisation: { select: { name: true } } } },
    },
  });
  if (!member) return { state: "not-found" };
  return verificationView({
    status: member.status,
    name: member.name,
    idNumber: member.idNumber,
    expiresAt: member.expiresAt,
    photoUrl: memberPhotoUrl(member),
    programmeName: member.programme.name,
    organisationName: member.programme.organisation.name,
  });
}

const STATES: Record<VerifyState, { title: string; body: string; panel: string; icon: typeof BadgeCheck }> = {
  valid: { title: "Valid card", body: "This card is genuine and in date.", panel: "bg-success-bg text-success-fg", icon: BadgeCheck },
  expired: { title: "Expired card", body: "This card is genuine, but it is past its valid-until date.", panel: "bg-warning-bg text-warning-fg", icon: Clock },
  revoked: { title: "Revoked card", body: "The organisation that issued this card has withdrawn it. Don't accept it as proof of membership.", panel: "border border-danger-border bg-panel text-danger-fg", icon: CircleSlash },
  "not-found": { title: "Card not found", body: "We couldn't match this code to a card. Check the whole code was scanned, or ask to see the card again.", panel: "border border-line bg-surface text-ink", icon: SearchX },
};

const STAMP_CSS = `
@keyframes swe-verify-stamp { 0% { transform: scale(1.6) rotate(-14deg); opacity: 0; } 60% { transform: scale(0.94) rotate(-8deg); opacity: 1; } 100% { transform: scale(1) rotate(-8deg); opacity: 1; } }
@keyframes swe-verify-rise { from { transform: translateY(6px); opacity: 0; } to { transform: none; opacity: 1; } }
.swe-verify-stamp { transform: rotate(-8deg); }
@media (prefers-reduced-motion: no-preference) {
  .swe-verify-stamp { animation: swe-verify-stamp 520ms cubic-bezier(.2,.9,.3,1.2) 120ms both; }
  .swe-verify-rise { animation: swe-verify-rise 360ms ease-out both; }
}`;

export default async function VerifyPage({ params }: Props) {
  const { token } = await params;
  const result = await lookup(token.trim());

  return (
    <main id="main-content" className="flex min-h-dvh flex-col items-center bg-canvas px-4 py-8 sm:py-12">
      <style>{STAMP_CSS}</style>
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <BrandHomeLink />
        {result === "limited" ? (
          <section className="rounded-2xl border border-line bg-panel p-6" aria-live="polite">
            <h1 className="text-h2 text-ink">Too many checks</h1>
            <p className="mt-2 text-body-ui text-ink-secondary">This device has checked a lot of cards in a short time. Wait a minute, then scan the card again.</p>
          </section>
        ) : (
          <VerifyResult view={result} />
        )}
        <p className="text-caption text-ink-muted">
          Space Works Events checks cards against the issuing organisation&apos;s records. It shows only what&apos;s needed to confirm the card.
        </p>
      </div>
    </main>
  );
}

function VerifyResult({ view }: { view: VerifyView }) {
  const state = STATES[view.state];
  const Icon = state.icon;
  return (
    <article className="swe-verify-rise overflow-hidden rounded-2xl border border-line bg-panel" aria-labelledby="verify-title">
      <div className={cn("flex items-center gap-4 p-5", state.panel)} role="status">
        <span aria-hidden className={cn("grid size-14 shrink-0 place-items-center rounded-full border-2 border-current", view.state === "valid" && "swe-verify-stamp")}>
          <Icon className="size-7" />
        </span>
        <div className="min-w-0">
          <h1 id="verify-title" className="text-h2">{state.title}</h1>
          <p className="mt-1 text-body-ui">{state.body}</p>
        </div>
      </div>
      {view.state === "valid" || view.state === "expired" ? (
        <div className="flex flex-col gap-5 p-5">
          <div className="flex items-center gap-4">
            <Avatar name={view.name} src={view.photoUrl} size="lg" />
            <div className="min-w-0">
              <p className="break-words text-h3 text-ink">{view.name}</p>
              <p className="break-words text-body-ui text-ink-secondary">{view.organisationName}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="col-span-2">
              <dt className="text-overline text-ink-muted">Programme</dt>
              <dd className="break-words text-body-ui font-semibold text-ink">{view.programmeName}</dd>
            </div>
            <div>
              <dt className="text-overline text-ink-muted">ID number</dt>
              <dd className="font-medium tabular-nums text-ink">{view.idNumber ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-overline text-ink-muted">Valid until</dt>
              <dd className="font-medium tabular-nums text-ink">{view.validUntil ?? "No expiry"}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </article>
  );
}
