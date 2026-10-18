"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, Card, SettingsRow } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { saveInstanceServiceSettings } from "@/app/actions/instance-settings";

type Values = { emailFrom: string; smtpService: string; smtpHost: string; smtpPort: string; smtpSecure: boolean; smtpUser: string; smtpAllowUnauthenticated: boolean; googleClientId: string; backupProvider: string; backupLastSuccessAt: string; backupRetentionDays: string; hasSmtpPassword: boolean; hasGoogleClientSecret: boolean };
type TextKey = { [K in keyof Values]: Values[K] extends string ? K : never }[keyof Values];

export function InstanceServiceSettingsForm({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Values, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));
  function submit() {
    startTransition(async () => {
      setStatus(null);
      const result = await saveInstanceServiceSettings({ ...values, smtpPort: values.smtpPort || undefined, backupRetentionDays: values.backupRetentionDays || undefined, backupLastSuccessAt: values.backupLastSuccessAt ? new Date(values.backupLastSuccessAt).toISOString() : undefined, smtpPassword: smtpPassword || undefined, googleClientSecret: googleClientSecret || undefined });
      setStatus(result.ok ? "Settings saved." : result.error ?? "Could not save settings.");
    });
  }
  const field = (key: TextKey, label: string, type = "text") => (
    <Field label={label}>
      <Input type={type} value={values[key]} onChange={(event) => set(key, event.target.value)} />
    </Field>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      {status ? <Callout tone={status === "Settings saved." ? "success" : "danger"} role={status === "Settings saved." ? "status" : "alert"}>{status}</Callout> : null}
      <Card padding="none" className="rounded-2xl px-5">
        <SettingsRow title="SMTP">
          <div className="flex flex-col gap-4">
            {field("emailFrom", "Sender address")}
            {field("smtpService", "Service (optional)")}
            {field("smtpHost", "Host (optional)")}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("smtpPort", "Port", "number")}
              {field("smtpUser", "Username")}
            </div>
            <Field label={values.hasSmtpPassword ? "Password (leave blank to keep current)" : "Password"}>
              <PasswordInput value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} autoComplete="new-password" />
            </Field>
            <CheckboxField label="Use implicit TLS" checked={values.smtpSecure} onCheckedChange={(checked) => set("smtpSecure", checked === true)} />
            <CheckboxField label="Private unauthenticated relay" checked={values.smtpAllowUnauthenticated} onCheckedChange={(checked) => set("smtpAllowUnauthenticated", checked === true)} />
          </div>
        </SettingsRow>
        <SettingsRow title="Google SSO" description="Register the callback URL shown in the deployment documentation with Google.">
          <div className="flex flex-col gap-4">
            {field("googleClientId", "OAuth client ID")}
            <Field label={values.hasGoogleClientSecret ? "OAuth client secret (leave blank to keep current)" : "OAuth client secret"}>
              <PasswordInput value={googleClientSecret} onChange={(event) => setGoogleClientSecret(event.target.value)} autoComplete="new-password" />
            </Field>
          </div>
        </SettingsRow>
        <SettingsRow title="Backup configuration" description="This records backup posture only; backup creation and restore access remain with the database provider.">
          <div className="flex flex-col gap-4">
            {field("backupProvider", "Provider")}
            {field("backupLastSuccessAt", "Last successful backup", "datetime-local")}
            {field("backupRetentionDays", "Retention days", "number")}
          </div>
        </SettingsRow>
      </Card>
      <div>
        <Button type="submit" variant="primary" loading={pending}>Save instance settings</Button>
      </div>
    </form>
  );
}
