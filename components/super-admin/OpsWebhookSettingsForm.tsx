"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, Card, SettingsRow } from "@/components/ui/display";
import { Field, PasswordInput } from "@/components/ui/field";
import { saveOpsWebhookSettings, sendOpsWebhookTest } from "@/app/actions/instance-settings";

type Initial = { enabled: boolean; includeWarnings: boolean; configuredHost: string | null };
type Status = { tone: "success" | "danger"; text: string } | null;

export function OpsWebhookSettingsForm({ initial }: { initial: Initial }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [includeWarnings, setIncludeWarnings] = useState(initial.includeWarnings);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const [testing, startTest] = useTransition();
  const configured = Boolean(initial.configuredHost);

  function save(removeUrl = false) {
    startTransition(async () => {
      setStatus(null);
      const result = await saveOpsWebhookSettings({ enabled: removeUrl ? false : enabled, includeWarnings, url: url || undefined, removeUrl });
      if (result.ok) {
        setUrl("");
        if (removeUrl) setEnabled(false);
      }
      setStatus(result.ok ? { tone: "success", text: removeUrl ? "Webhook removed." : "Alert settings saved." } : { tone: "danger", text: result.error ?? "Could not save alert settings." });
    });
  }

  function test() {
    startTest(async () => {
      setStatus(null);
      const result = await sendOpsWebhookTest({ url: url || undefined });
      setStatus(result.ok ? { tone: "success", text: "Test message sent. Check the channel." } : { tone: "danger", text: result.error ?? "The test message could not be sent." });
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="flex flex-col gap-5"
    >
      {status ? <Callout tone={status.tone} role={status.tone === "success" ? "status" : "alert"}>{status.text}</Callout> : null}
      <Card padding="none" className="rounded-2xl px-5">
        <SettingsRow
          title="Alerts webhook"
          description="Posts server errors, crashes, sign-in failures, and email delivery problems to a Mattermost (or Slack-compatible) incoming webhook. Details are redacted and repeats are grouped."
        >
          <div className="flex flex-col gap-4">
            {configured ? <p className="text-body-ui text-ink-secondary">Currently sending to <span className="font-medium text-ink">{initial.configuredHost}</span>.</p> : null}
            <Field label={configured ? "Webhook URL (leave blank to keep current)" : "Webhook URL"}>
              <PasswordInput value={url} onChange={(event) => setUrl(event.target.value)} autoComplete="off" placeholder="https://chat.example.com/hooks/…" />
            </Field>
            <CheckboxField label="Send alerts" checked={enabled} onCheckedChange={(checked) => setEnabled(checked === true)} />
            <CheckboxField label="Include warnings" description="Retried email failures and degraded dependencies, as well as errors." checked={includeWarnings} onCheckedChange={(checked) => setIncludeWarnings(checked === true)} />
          </div>
        </SettingsRow>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" loading={pending}>Save alert settings</Button>
        <Button type="button" onClick={test} loading={testing} disabled={!url && !configured}>Send test message</Button>
        {configured ? <Button type="button" variant="dangerQuiet" onClick={() => save(true)} disabled={pending}>Remove webhook</Button> : null}
      </div>
    </form>
  );
}
