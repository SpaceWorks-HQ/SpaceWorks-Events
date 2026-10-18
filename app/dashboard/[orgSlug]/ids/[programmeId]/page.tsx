import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { IdImportWizard } from "@/components/member-ids/IdImportWizard";
import { MemberIdDesigner } from "@/components/member-ids/MemberIdDesigner";
import { MembersTable, type MemberRow } from "@/components/member-ids/MembersTable";
import { ProgrammeActions } from "@/components/member-ids/ProgrammeActions";
import { ProgrammeSettings } from "@/components/member-ids/ProgrammeSettings";
import { ProgrammeStatusPill } from "@/components/member-ids/ProgrammeStatusPill";
import { Button } from "@/components/ui/button";
import { NavTabs } from "@/components/ui/tabs";
import { prisma } from "@/lib/db";
import { cardState, formatCardDate, toDateInput } from "@/lib/memberIds/core";
import { loadProgramme, memberPhotoUrl, programmeBranding, programmeDesign, publicOrigin } from "@/lib/memberIds/data";
import { isOrgAdmin, requireOrgMembership } from "@/lib/permissions";

export const metadata: Metadata = { title: "Member IDs" };

type Props = {
  params: Promise<{ orgSlug: string; programmeId: string }>;
  searchParams: Promise<{ tab?: string; q?: string; status?: string; page?: string }>;
};

const TABS = [
  { id: "members", label: "Members" },
  { id: "import", label: "Import" },
  { id: "design", label: "Card design" },
  { id: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const STATUS_FILTERS = ["all", "PENDING", "APPROVED", "REJECTED", "REVOKED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const PAGE_SIZE = 100;

export default async function IdProgrammePage({ params, searchParams }: Props) {
  const { orgSlug, programmeId } = await params;
  const query = await searchParams;
  const { organisation, membership } = await requireOrgMembership(orgSlug);
  const canManage = isOrgAdmin(membership.role);
  const programme = await loadProgramme(organisation.id, programmeId);
  if (!programme) notFound();
  const profile = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { logoUrl: true } });

  const requested = (TABS.find((tab) => tab.id === query.tab)?.id ?? "members") as Tab;
  const tab: Tab = canManage ? requested : "members";
  const base = `/dashboard/${organisation.slug}/ids/${programme.id}`;
  const status: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(query.status ?? "") ? (query.status as StatusFilter) : "all";
  const search = (query.q ?? "").trim().slice(0, 100);

  const counts = await prisma.idMember.groupBy({ by: ["status"], where: { programmeId: programme.id }, _count: { _all: true } });
  const countOf = (value: string) => counts.find((row) => row.status === value)?._count._all ?? 0;
  const total = counts.reduce((sum, row) => sum + row._count._all, 0);
  const joinPath = `/${organisation.slug}/ids/${programme.slug}`;
  const origin = publicOrigin();

  let content: React.ReactNode = null;
  if (tab === "members") {
    const where: Prisma.IdMemberWhereInput = {
      programmeId: programme.id,
      ...(status !== "all" ? { status } : {}),
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { idNumber: { contains: search, mode: "insensitive" } }, ...(canManage ? [{ email: { contains: search.toLowerCase() } }] : [])] }
        : {}),
    };
    const filtered = await prisma.idMember.count({ where });
    const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
    const members = await prisma.idMember.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, organisationId: true, name: true, email: true, photoUrl: true, status: true, idNumber: true, expiresAt: true, fieldValues: true, statusReason: true, source: true },
    });
    // Emails and answers reach the browser only for owners and admins.
    const rows: MemberRow[] = members.map((member) => ({
      id: member.id,
      name: member.name,
      email: canManage ? member.email : null,
      photoUrl: memberPhotoUrl(member),
      status: member.status,
      state: cardState(member),
      idNumber: member.idNumber,
      validUntil: member.status === "APPROVED" || member.status === "REVOKED" ? formatCardDate(member.expiresAt) ?? "No expiry" : null,
      values: canManage && member.fieldValues && typeof member.fieldValues === "object" && !Array.isArray(member.fieldValues) ? (member.fieldValues as Record<string, string>) : {},
      reason: canManage ? member.statusReason : null,
      source: member.source,
    }));
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
