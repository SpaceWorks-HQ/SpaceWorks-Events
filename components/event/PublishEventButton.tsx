"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { publishEvent } from "@/app/actions/event";

export function PublishEventButton(props: {
  organisationSlug: string;
  eventSlug: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="primary"
      loading={pending}
      loadingLabel="Publishing…"
      onClick={() => {
        startTransition(() => {
          void publishEvent({
            organisationSlug: props.organisationSlug,
            eventSlug: props.eventSlug,
          });
        });
      }}
    >
      Publish event
    </Button>
  );
}
