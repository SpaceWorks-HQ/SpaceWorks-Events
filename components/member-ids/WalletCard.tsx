"use client";

import { Download, ExternalLink } from "lucide-react";
import { BadgeFontFaces } from "@/components/checkin/id-card/BadgeCanvas";
import { Button } from "@/components/ui/button";
import type { IdCardPrintSettings } from "@/lib/idCardPrint";
import type { BadgeBranding, IdCardAttendee } from "@/lib/badge/types";
import { HolographicCard } from "./HolographicCard";
import { ScaledBadge } from "./ScaledBadge";

/** One card in the wallet: the holographic viewer plus downloads and the public check link. */
export function WalletCard({
  memberId,
  front,
  back,
  person,
  branding,
  label,
  verifyPath,
}: {
  memberId: string;
  front: IdCardPrintSettings;
  back: IdCardPrintSettings | null;
  person: IdCardAttendee;
  branding: BadgeBranding;
  label: string;
  verifyPath: string;
}) {
  const base = `/api/exports/account/ids/${memberId}`;
  return (
    <div className="flex flex-col gap-4">
      <BadgeFontFaces />
      <HolographicCard
        label={label}
        widthMm={front.widthMm}
        heightMm={front.heightMm}
        front={<ScaledBadge settings={front} person={person} branding={branding} />}
        back={back ? <ScaledBadge settings={back} person={person} branding={branding} /> : null}
      />
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild size="sm" variant="primary">
          <a href={`${base}?format=pdf`} download><Download aria-hidden className="size-4" />PDF{back ? " (front and back)" : ""}</a>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <a href={`${base}?format=png`} download><Download aria-hidden className="size-4" />PNG</a>
        </Button>
        <Button asChild size="sm" variant="quiet">
          <a href={verifyPath} target="_blank" rel="noreferrer"><ExternalLink aria-hidden className="size-4" />Check page<span className="sr-only"> (opens in a new tab)</span></a>
        </Button>
      </div>
    </div>
  );
}
