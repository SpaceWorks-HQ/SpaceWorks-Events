import { loadIdProgrammeView } from "@/lib/views/app__dashboard__orgSlug__ids__programmeId__page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { IdImportWizard } from "@/components/member-ids/IdImportWizard";
import { MemberIdDesigner } from "@/components/member-ids/MemberIdDesigner";
import { MembersTable } from "@/components/member-ids/MembersTable";
import { ProgrammeActions } from "@/components/member-ids/ProgrammeActions";
import { ProgrammeSettings } from "@/components/member-ids/ProgrammeSettings";
import { ProgrammeStatusPill } from "@/components/member-ids/ProgrammeStatusPill";
import { Button } from "@/components/ui/button";
import { NavTabs } from "@/components/ui/tabs";
import { toDateInput } from "@/lib/memberIds/core";
import { programmeBranding, programmeDesign } from "@/lib/memberIds/presentation";

export const metadata: Metadata = { title: "Member IDs" };

type Props = {
  params: Promise<{ orgSlug: string; programmeId: string; }>;
  searchParams: Promise<{ tab?: string; q?: string; status?: string; page?: string; }>;
};

const TABS = [
  { id: "members", label: "Members" },
  { id: "import", label: "Import" },
  { id: "design", label: "Card design" },
  { id: "settings", label: "Settings" },
] as const;






export default async function IdProgrammePage({ params, searchParams }: Props) {
  const { organisation, canManage, programme, profile, tab, base, status, search, counts, total, joinPath, origin, memberList } = await loadIdProgrammeView({ params, searchParams });
  const countOf = (value: string) => counts.find((row) => row.status === value)?._count._all ?? 0;
  let content: React.ReactNode = null;
  if (tab === "members") {
    if (!memberList) notFound();
    const { filtered, pages, page, rows } = memberList;
    content = (
      <MembersTable
        organisationSlug={organisation.slug}
        programmeId={programme.id}
        canManage={canManage}
        rows={rows}
        fields={programme.fields.map((field) => ({ key: field.key, label: field.label, type: field.type, required: field.required, options: field.options }))}
        filter={{ status, search, page, pages, filtered, base }}
        counts={{ all: total, PENDING: countOf("PENDING"), APPROVED: countOf("APPROVED"), REJECTED: countOf("REJECTED"), REVOKED: countOf("REVOKED") }}
        joinUrl={`${origin}${joinPath}`}
        joinOpen={programme.status === "ACTIVE" && programme.registrationOpen}
      />
    );
  } else if (tab === "import") {
    content = <IdImportWizard organisationSlug={organisation.slug} programmeId={programme.id} fields={programme.fields.map((field) => ({ key: field.key, label: field.label }))} />;
  } else if (tab === "design") {
    content = (
      <MemberIdDesigner
        key={programme.id}
        organisationSlug={organisation.slug}
        programmeId={programme.id}
        context={{ programmeName: programme.name, organisationName: organisation.name }}
        initialDesign={programmeDesign(programme, organisation.name)}
        branding={programmeBranding(programme, profile.logoUrl)}
        fields={programme.fields.map((field) => ({ key: field.key, label: field.label, placement: field.placement, type: field.type }))}
        idPrefix={programme.idPrefix}
        updatedAt={programme.updatedAt.toISOString()}
      />
    );
  } else {
    content = (
      <ProgrammeSettings
        organisationSlug={organisation.slug}
        programme={{
          id: programme.id,
          name: programme.name,
          description: programme.description,
          status: programme.status,
          registrationOpen: programme.registrationOpen,
          requiresApproval: programme.requiresApproval,
          idPrefix: programme.idPrefix,
          validity: programme.validUntil ? "date" : programme.validityDays ? "days" : "none",
          validUntil: toDateInput(programme.validUntil),
          validityDays: programme.validityDays ?? 365,
        }}
        fields={programme.fields.map((field) => ({ key: field.key, label: field.label, type: field.type, required: field.required, options: field.options, placement: field.placement }))}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <OrgPageHeader
        organisation={{ name: organisation.name, slug: organisation.slug, logoUrl: profile.logoUrl }}
        title={programme.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ProgrammeStatusPill status={programme.status} />
            <span>{total} {total === 1 ? "member" : "members"} · {countOf("PENDING")} waiting · {countOf("APPROVED")} approved</span>
          </span>
        }
        actions={
          <>
            <Button asChild size="sm" variant="quiet"><Link href={`/dashboard/${organisation.slug}/ids`}>All programmes</Link></Button>
            {programme.status !== "DRAFT" ? <Button asChild size="sm" variant="secondary"><Link href={joinPath} target="_blank">Open join form</Link></Button> : null}
          </>
        }
      />
      {canManage ? <ProgrammeActions organisationSlug={organisation.slug} programmeId={programme.id} approved={countOf("APPROVED")} /> : null}
      {canManage ? (
        <NavTabs label="Programme sections" items={TABS.map((item) => ({ href: item.id === "members" ? base : `${base}?tab=${item.id}`, label: item.label, active: item.id === tab }))} />
      ) : null}
      {content}
    </div>
  );
}
