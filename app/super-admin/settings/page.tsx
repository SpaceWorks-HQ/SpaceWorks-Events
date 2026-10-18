import { requireSuperAdminMfa } from "@/lib/permissions";
import { loadSuperAdminSettingsView } from "@/lib/views/app__super-admin__settings__page";
import { InstanceServiceSettingsForm } from "@/components/super-admin/InstanceServiceSettingsForm";
import { PageHeader } from "@/components/ui/display";

export default async function SuperAdminSettingsPage() {
  await requireSuperAdminMfa();
  const { initial } = await loadSuperAdminSettingsView();
  return <div className="flex flex-col gap-6"><PageHeader title="Instance settings" description="Configure email delivery, Google sign-in, and backup status for this instance. Secrets are encrypted and never displayed." /><InstanceServiceSettingsForm initial={initial} /></div>;
}
