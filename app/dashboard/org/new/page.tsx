import { CreateOrgForm } from "@/components/org/CreateOrgForm";
import { PageHeader } from "@/components/ui/display";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create organisation", robots: { index: false, follow: false } };

export default function NewOrganisationPage() {
  return (
    <div className="flex w-full max-w-[560px] flex-col gap-8">
      <PageHeader
        title="Create an organisation"
        description={<>Set up a workspace for your events and community. You&apos;ll be its owner. You can update these details whenever you need to.</>}
      />
      <CreateOrgForm />
    </div>
  );
}
