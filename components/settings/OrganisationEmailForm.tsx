"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { saveOrganisationEmail, sendOrganisationTestEmail, stopOwnEmailServer } from "@/app/actions/organisation-email";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { Callout, Card, Chip, SettingsRow } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/field";

export type OrganisationEmailStatus = {
  fromName: string;
  replyTo: string;
  useOwnServer: boolean;
  fromAddress: string;
  smtpHost: string;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string;
  hasPassword: boolean;
  verifiedAt: string | null;
};

type Notice = { tone: "success" | "danger"; text: string; } | null;

export function OrganisationEmailForm({ organisationSlug, organisationName, platformAddress, initial }: {
  organisationSlug: string;
  organisationName: string;
  /** Where the platform sends from, shown so owners know what guests see. */
  platformAddress: string | null;
  initial: OrganisationEmailStatus;
}) {
  const router = useRouter();
  const [fromName, setFromName] = useState(initial.fromName);
  const [replyTo, setReplyTo] = useState(initial.replyTo);
  const [useOwnServer, setUseOwnServer] = useState(initial.useOwnServer);
  const [fromAddress, setFromAddress] = useState(initial.fromAddress);
  const [smtpHost, setSmtpHost] = useState(initial.smtpHost);
  const [smtpPort, setSmtpPort] = useState(initial.smtpPort ? String(initial.smtpPort) : "587");
  const [smtpUser, setSmtpUser] = useState(initial.smtpUser);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      setNotice(null);
      const result = await saveOrganisationEmail({
        organisationSlug, fromName, replyTo, useOwnServer, fromAddress, smtpHost,
        smtpPort: smtpPort ? Number(smtpPort) : undefined, smtpSecure: smtpPort === "465", smtpUser, smtpPassword,
      });
      setSmtpPassword("");
      setNotice(result.ok
        ? { tone: "success", text: useOwnServer ? "Saved. Connected to your server: your event email now goes through it." : "Saved." }
        : { tone: "danger", text: result.error });
      router.refresh();
    });
  }

  function test() {
    startTransition(async () => {
      setNotice(null);
      const result = await sendOrganisationTestEmail({ organisationSlug });
      setNotice(result.ok ? { tone: "success", text: "Test email queued to your address. It arrives within a minute." } : { tone: "danger", text: result.error });
    });
  }

  function stop() {
    startTransition(async () => {
      setNotice(null);
      const result = await stopOwnEmailServer({ organisationSlug });
      if (result.ok) setUseOwnServer(false);
      setNotice(result.ok ? { tone: "success", text: "Back on the platform's email server. Your server details are kept." } : { tone: "danger", text: result.error });
      router.refresh();
    });
  }

  const sender = fromName.trim() || organisationName;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {notice ? <Callout tone={notice.tone} role={notice.tone === "success" ? "status" : "alert"}>{notice.text}</Callout> : null}
      <Card padding="none" className="rounded-xl px-5">
        <SettingsRow title="Sender" description="What guests see on tickets, reminders, updates and receipts. Sign-in and password emails always come from the platform.">
          <div className="flex flex-col gap-4">
            <Field label="Sender name" helperText={`Empty uses “${organisationName}”.`}>
              <Input value={fromName} maxLength={100} onChange={(event) => setFromName(event.target.value)} placeholder={organisationName} />
            </Field>
            <Field label="Reply-to address" helperText="Where guests' replies go. Empty sends replies to the sending address.">
              <Input type="email" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} placeholder="hello@your-organisation.org" autoComplete="off" />
            </Field>
            <p className="text-caption text-ink-muted">
              Guests see: <span className="font-semibold text-ink">{sender}</span> &lt;{useOwnServer && fromAddress ? fromAddress : platformAddress ?? "the platform's address"}&gt;
            </p>
          </div>
        </SettingsRow>

        <SettingsRow title="Your own mail server" description="Optional. Send from your own domain through your provider's SMTP server (Google Workspace, Microsoft 365, Brevo, SES, Mailgun…). It's tested before it's used.">
          <div className="flex flex-col gap-4">
            <SwitchRow label="Send through our own server" description="Off: the platform sends, under your sender name." checked={useOwnServer} onCheckedChange={setUseOwnServer} />
            {useOwnServer ? (
              <>
                <Field label="Sending address" helperText="Your provider must allow sending from it.">
                  <Input type="email" value={fromAddress} onChange={(event) => setFromAddress(event.target.value)} placeholder="events@your-organisation.org" autoComplete="off" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                  <Field label="Server host">
                    <Input value={smtpHost} onChange={(event) => setSmtpHost(event.target.value.trim())} placeholder="smtp.example.com" autoComplete="off" spellCheck={false} />
                  </Field>
                  <Field label="Port" helperText="587 or 2525: STARTTLS. 465: TLS.">
                    <Input inputMode="numeric" value={smtpPort} onChange={(event) => setSmtpPort(event.target.value.replace(/\D/g, "").slice(0, 4))} />
                  </Field>
                </div>
                <Field label="Username">
                  <Input value={smtpUser} onChange={(event) => setSmtpUser(event.target.value)} autoComplete="off" spellCheck={false} />
                </Field>
                <Field label={`Password${initial.hasPassword ? " (saved; leave blank to keep)" : ""}`} helperText="Stored encrypted and never shown again. Use an app password where your provider offers one.">
                  <PasswordInput value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} autoComplete="new-password" />
                </Field>
              </>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={initial.useOwnServer ? "success" : "neutral"}>{initial.useOwnServer ? "Sending through your server" : "Sending through the platform"}</Chip>
              {initial.verifiedAt ? <Chip tone="outline">Tested {new Date(initial.verifiedAt).toLocaleDateString()}</Chip> : null}
              {initial.useOwnServer ? <Button type="button" variant="dangerQuiet" size="sm" disabled={pending} onClick={stop}>Stop using it</Button> : null}
            </div>
          </div>
        </SettingsRow>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save email settings"}</Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={test}>
          <Send aria-hidden className="size-4" />
          Send me a test
        </Button>
      </div>
    </form>
  );
}
