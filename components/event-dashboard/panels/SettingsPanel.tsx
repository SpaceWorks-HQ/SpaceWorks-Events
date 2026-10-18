import { prisma } from "@/lib/db";
import { toEventClientDto } from "@/lib/eventDto";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { CollaboratorInvitePanel } from "@/components/event/CollaboratorInvitePanel";
import { EventManageMore } from "@/components/dashboard/EventManageMore";
import { NoPermission } from "./shared";

export async function SettingsPanel({ ctx }: { ctx: EventDashboardContext }) {
  const { event, permissions, organisation } = ctx;
  const [collaborators, pending] = permissions.canManageCollaborators
    ? await Promise.all([
        prisma.eventCollaborator.findMany({ where: { eventId: event.id }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
        prisma.eventCollaboratorInvite.findMany({ where: { eventId: event.id, usedAt: null, expiresAt: { gt: ctx.now } }, select: { id: true, email: true, expiresAt: true, permissions: true }, orderBy: { createdAt: "desc" } }),
      ])
    : [[], []];
  return (
    <div className="flex flex-col gap-5">
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
