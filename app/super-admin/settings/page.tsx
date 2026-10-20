import { requireSuperAdminMfa } from "@/lib/permissions";
import { loadSuperAdminSettingsView } from "@/lib/views/app__super-admin__settings__page";
import { InstanceServiceSettingsForm } from "@/components/super-admin/InstanceServiceSettingsForm";
import { PaidEventsControl } from "@/components/super-admin/PaidEventsControl";
import { PageHeader } from "@/components/ui/display";

export default async function SuperAdminSettingsPage() {
  await requireSuperAdminMfa();
  const { initial, paidEventsEnabled } = await loadSuperAdminSettingsView();
  return <div className="flex flex-col gap-6"><PageHeader title="Instance settings" description="Configure email delivery, Google sign-in, paid events, and backup status for this instance. Secrets are encrypted and never displayed." /><InstanceServiceSettingsForm initial={initial} /><PaidEventsControl initialEnabled={paidEventsEnabled} /></div>;
}
