"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, PlugZap } from "lucide-react";
import { disconnectPaymentProvider, savePaymentSettings, testPaymentConnection } from "@/app/actions/payment-settings";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup } from "@/components/ui/choice";
import { Callout, Card, Chip, SettingsRow } from "@/components/ui/display";
import { Field, Input, PasswordInput, ReadOnlyValue } from "@/components/ui/field";
import type { PaymentSettingsStatus } from "@/lib/payments/settings";

type Provider = "RAZORPAY" | "STRIPE";
type Notice = { tone: "success" | "danger"; text: string; } | null;

const RAZORPAY_EVENTS = "payment_link.paid, payment.captured, refund.processed, refund.failed";
const STRIPE_EVENTS = "checkout.session.completed, checkout.session.async_payment_succeeded, refund.created, refund.updated, charge.refunded";

function CopyValue({ value, label }: { value: string; label: string; }) {
  const [copied, setCopied] = useState(false);
  return (
    <ReadOnlyValue
      value={<span className="break-all">{value}</span>}
      action={(
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }).catch(() => undefined);
          }}
        >
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      )}
    />
  );
}

export function PaymentSettingsForm({ organisationSlug, initial, webhookUrls }: {
  organisationSlug: string;
  initial: PaymentSettingsStatus;
  webhookUrls: { razorpay: string; stripe: string; } | null;
}) {
  const router = useRouter();
  const status = initial;
  const [provider, setProvider] = useState<Provider | "NONE">(initial.provider ?? "NONE");
  const [currency, setCurrency] = useState(initial.currency);
  const [razorpayKeyId, setRazorpayKeyId] = useState(initial.razorpayKeyId);
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
  const [razorpayWebhookSecret, setRazorpayWebhookSecret] = useState("");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      setNotice(null);
      const result = await savePaymentSettings({
        organisationSlug,
        provider: provider === "NONE" ? null : provider,
        currency,
        razorpayKeyId: razorpayKeyId || undefined,
        razorpayKeySecret: razorpayKeySecret || undefined,
        razorpayWebhookSecret: razorpayWebhookSecret || undefined,
        stripeSecretKey: stripeSecretKey || undefined,
        stripeWebhookSecret: stripeWebhookSecret || undefined,
      });
      if (!result.ok) {
        setNotice({ tone: "danger", text: result.error });
        return;
      }
      // Secrets are write-only: clear the inputs; the refreshed page shows what is saved.
      setRazorpayKeySecret("");
      setRazorpayWebhookSecret("");
      setStripeSecretKey("");
      setStripeWebhookSecret("");
      setNotice({ tone: "success", text: "Payment settings saved." });
      router.refresh();
    });
  }

  function test(target: Provider) {
    startTransition(async () => {
      setNotice(null);
      const result = await testPaymentConnection({ organisationSlug, provider: target });
      setNotice(result.ok
        ? { tone: "success", text: result.data?.testMode ? "Connected. These are test keys, so payments are not real." : "Connected. These are live keys." }
        : { tone: "danger", text: result.error });
      if (result.ok) router.refresh();
    });
  }

  function disconnect(target: Provider) {
    if (!window.confirm(`Remove the saved ${target === "RAZORPAY" ? "Razorpay" : "Stripe"} keys? Existing payments keep their records.`)) return;
    startTransition(async () => {
      setNotice(null);
      const result = await disconnectPaymentProvider({ organisationSlug, provider: target });
      if (!result.ok) {
        setNotice({ tone: "danger", text: result.error });
        return;
      }
      if (provider === target) setProvider("NONE");
      if (target === "RAZORPAY") setRazorpayKeyId("");
      setNotice({ tone: "success", text: "Keys removed." });
      router.refresh();
    });
  }

  const saved = (isSet: boolean) => (isSet ? " (saved; leave blank to keep)" : "");

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
        <SettingsRow title="Provider" description="New paid tickets use this account. Payments already taken keep their own provider for refunds.">
          <div className="flex flex-col gap-4">
            <RadioGroup value={provider} onValueChange={(value) => setProvider(value as Provider | "NONE")} aria-label="Payment provider">
              <Radio value="RAZORPAY" label="Razorpay" description="Cards, UPI, netbanking and wallets in India." />
              <Radio value="STRIPE" label="Stripe" description="Cards worldwide. Stripe accepts new Indian businesses by invitation only." />
              <Radio value="NONE" label="Not connected" description="Only free tickets can be issued." />
            </RadioGroup>
            <Field label="Currency for new ticket types" helperText="Three-letter code, for example INR or USD. Prices include any tax.">
              <Input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="max-w-32 uppercase" />
            </Field>
            {status.configuredProvider ? (
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="success">Ready: {status.configuredProvider === "RAZORPAY" ? "Razorpay" : "Stripe"}</Chip>
                {(status.configuredProvider === "RAZORPAY" ? status.razorpayTestMode : status.stripeTestMode) ? <Chip tone="warning">Test mode</Chip> : null}
                <Chip tone={status.verifiedAt ? "success" : "neutral"}>{status.verifiedAt ? "Connection tested" : "Not tested yet"}</Chip>
              </div>
            ) : null}
          </div>
        </SettingsRow>

        <SettingsRow title="Razorpay" description="Dashboard → Account & Settings → API keys. Then add a webhook with the address below, a secret you choose, and the listed events.">
          <div className="flex flex-col gap-4">
            <Field label="Key id" helperText="Starts with rzp_test_ or rzp_live_.">
              <Input value={razorpayKeyId} onChange={(event) => setRazorpayKeyId(event.target.value.trim())} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label={`Key secret${saved(status.hasRazorpayKeySecret)}`}>
              <PasswordInput value={razorpayKeySecret} onChange={(event) => setRazorpayKeySecret(event.target.value)} autoComplete="new-password" />
            </Field>
            <Field label={`Webhook secret${saved(status.hasRazorpayWebhookSecret)}`}>
              <PasswordInput value={razorpayWebhookSecret} onChange={(event) => setRazorpayWebhookSecret(event.target.value)} autoComplete="new-password" />
            </Field>
            {webhookUrls ? (
              <Field label="Webhook address" helperText={`Events: ${RAZORPAY_EVENTS}.`}>
                <CopyValue value={webhookUrls.razorpay} label="Razorpay webhook address" />
              </Field>
            ) : <p className="text-body-ui text-ink-muted">Save once to get your webhook address.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={pending || !status.hasRazorpayKeySecret} onClick={() => test("RAZORPAY")}>
                <PlugZap aria-hidden className="size-4" />
                Test connection
              </Button>
              {status.hasRazorpayKeySecret || status.razorpayKeyId ? (
                <Button type="button" variant="dangerQuiet" disabled={pending} onClick={() => disconnect("RAZORPAY")}>Remove keys</Button>
              ) : null}
            </div>
          </div>
        </SettingsRow>

        <SettingsRow title="Stripe" description="Developers → API keys for the secret key. Then add an endpoint with the address below and the listed events, and copy its signing secret.">
          <div className="flex flex-col gap-4">
            <Field label={`Secret key${saved(status.hasStripeSecretKey)}`} helperText="Starts with sk_ or rk_ (restricted key).">
              <PasswordInput value={stripeSecretKey} onChange={(event) => setStripeSecretKey(event.target.value)} autoComplete="new-password" />
            </Field>
            <Field label={`Signing secret${saved(status.hasStripeWebhookSecret)}`} helperText="Starts with whsec_.">
              <PasswordInput value={stripeWebhookSecret} onChange={(event) => setStripeWebhookSecret(event.target.value)} autoComplete="new-password" />
            </Field>
            {webhookUrls ? (
              <Field label="Webhook address" helperText={`Events: ${STRIPE_EVENTS}.`}>
                <CopyValue value={webhookUrls.stripe} label="Stripe webhook address" />
              </Field>
            ) : <p className="text-body-ui text-ink-muted">Save once to get your webhook address.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={pending || !status.hasStripeSecretKey} onClick={() => test("STRIPE")}>
                <PlugZap aria-hidden className="size-4" />
                Test connection
              </Button>
              {status.hasStripeSecretKey || status.hasStripeWebhookSecret ? (
                <Button type="button" variant="dangerQuiet" disabled={pending} onClick={() => disconnect("STRIPE")}>Remove keys</Button>
              ) : null}
            </div>
          </div>
        </SettingsRow>
      </Card>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save payment settings"}</Button>
      </div>
    </form>
  );
}
