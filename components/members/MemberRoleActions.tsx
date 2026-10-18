"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MembershipRole } from "@prisma/client";
import { updateMemberRole, removeMember } from "@/app/actions/membership";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { Dropdown } from "@/components/ui/field";
import { ROLE_LABELS } from "@/components/members/memberSummary";

const ROLE_TONES = { OWNER: "ink", ADMIN: "warning", MEMBER: "neutral" } as const satisfies Record<MembershipRole, string>;

export function MemberRoleActions(props: {
  organisationSlug: string;
  targetUserId: string;
  role: MembershipRole;
  actorRole: MembershipRole;
  /** Used to label the role select and removal dialog for this row. */
  memberName?: string;
}) {
  const { organisationSlug, targetUserId, role, actorRole, memberName } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const canEditRoles = actorRole === "OWNER" && role !== "OWNER";
  const canRemove =
    (actorRole === "OWNER" && role !== "OWNER") ||
    (actorRole === "ADMIN" && role === "MEMBER");

  if (!canEditRoles && !canRemove) {
    return <Chip size="sm" tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Chip>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEditRoles ? (
        <Dropdown
          aria-label={memberName ? `Role for ${memberName}` : "Role"}
          value={role}
          disabled={pending}
          className="w-auto min-w-[120px] py-2 text-sm"
          onChange={(e) => {
            const next = e.target.value as "ADMIN" | "MEMBER";
            startTransition(async () => {
              const res = await updateMemberRole({
                organisationSlug,
                targetUserId,
                role: next,
              });
              if (!res.ok) {
                showToast(res.error, "error");
                return;
              }
              showToast("Role updated", "success");
              router.refresh();
            });
          }}
        >
          <option value="ADMIN">Admin</option>
          <option value="MEMBER">Member</option>
        </Dropdown>
      ) : (
        <Chip size="sm" tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</Chip>
      )}
      {canRemove ? (
        <Button size="sm" variant="dangerQuiet" disabled={pending} onClick={() => setConfirmRemove(true)}>
          Remove
          {memberName ? <span className="sr-only"> {memberName}</span> : null}
        </Button>
      ) : null}
      <ConfirmationDialog
        open={confirmRemove}
        title={memberName ? `Remove ${memberName}?` : "Remove organisation member?"}
        message="This person will immediately lose access to the organisation and its events."
        confirmLabel="Remove member"
        loading={pending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          startTransition(async () => {
            const res = await removeMember({
              organisationSlug,
              targetUserId,
            });
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            setConfirmRemove(false);
            showToast("Member removed", "success");
            router.refresh();
          });
        }}
      />
    </div>
  );
}
