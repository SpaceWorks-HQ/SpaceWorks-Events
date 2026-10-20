import { loadSettingsPanel } from "@/lib/views/components__event-dashboard__panels__SettingsPanel";
import { toEventClientDto } from "@/lib/eventDto";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { CollaboratorInvitePanel } from "@/components/event/CollaboratorInvitePanel";
import { EventManageMore } from "@/components/dashboard/EventManageMore";
import { TicketTypesManager } from "@/components/event-dashboard/settings/TicketTypesManager";
import { PromoCodesManager, RefundPolicyControl } from "@/components/event-dashboard/settings/PromoCodesManager";
import { NoPermission } from "./shared";

export async function SettingsPanel({ ctx }: { ctx: EventDashboardContext; }) {
  const { permissions, organisation, event, collaborators, pending, tickets } = await loadSettingsPanel({ ctx });
  return (
    <div className="flex flex-col gap-5">
      {tickets ? (
        <TicketTypesManager
          organisationSlug={organisation.slug}
          target={{ eventId: event.id }}
          tickets={tickets.tickets}
          currency={tickets.currency}
          paidAllowed={tickets.paidAllowed}
          paidBlockedReason={tickets.paidBlockedReason}
          payee={tickets.payee}
        />
      ) : null}
      {tickets ? (
        <PromoCodesManager organisationSlug={organisation.slug} target={{ eventId: event.id }} currency={tickets.currency} promoCodes={tickets.promoCodes} tickets={tickets.tickets} />
      ) : null}
      {tickets && tickets.tickets.some((ticket) => ticket.priceMinor > 0) ? (
        <RefundPolicyControl organisationSlug={organisation.slug} target={{ eventId: event.id }} policy={tickets.refundPolicy} sold={tickets.sold} />
      ) : null}
      {permissions.canManageCollaborators ? (
        <CollaboratorInvitePanel
          organisationSlug={organisation.slug}
          organisationName={organisation.name}
          eventId={event.id}
          now={ctx.now.toISOString()}
          collaborators={collaborators.map((c) => ({ id: c.id, name: c.user.name, email: c.user.email, permissions: c.permissions }))}
          pendingInvites={pending.map((invite) => ({ id: invite.id, email: invite.email, expiresAt: invite.expiresAt.toISOString(), permissions: invite.permissions }))}
        />
      ) : null}
      {/* Address, clone, embed and delete are organisation-admin actions on the server. */}
      {permissions.isAdmin ? (
        <EventManageMore organisationSlug={organisation.slug} event={toEventClientDto(event)} />
      ) : (
        <NoPermission>Only organisation owners and admins can change this event&apos;s address, clone it or delete it.</NoPermission>
      )}
    </div>
  );
}
