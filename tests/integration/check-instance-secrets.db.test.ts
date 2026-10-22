import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const KEY = vi.hoisted(() => {
  const key = Buffer.alloc(32, 9).toString("base64");
  process.env.MFA_ENCRYPTION_KEY = key;
  return key;
});

import { prisma } from "@/lib/db";
import { encryptOrgSecret } from "@/lib/orgSecrets";
import { encryptPaymentSecret } from "@/lib/payments/secrets";
import { encryptStationPin } from "@/lib/checkInStation";
import { ORG_SMTP_PASSWORD_SLOT } from "@/lib/email/transporter";
import { chatSecretSlot } from "@/lib/chat/notify";

const run = promisify(execFile);
const suffix = randomUUID().replace(/-/g, "");
const LABELS = ["organisation mail server password(s)", "chat channel credential(s)", "payment key(s)", "check-in station PIN(s)"] as const;
let orgId = "";
let otherOrgId = "";

/** Runs the script with the test database and KEY, and reads its counts per label. */
async function check() {
  const result = await run(process.execPath, ["scripts/check-instance-secrets.mjs"], { env: { ...process.env, MFA_ENCRYPTION_KEY: KEY } })
    .then(({ stdout }) => ({ code: 0, output: stdout }))
    .catch((error: { code: number; stdout: string; stderr: string }) => ({ code: error.code, output: `${error.stdout}${error.stderr}` }));
  const escape = (label: string) => label.replace(/[()]/g, "\\$&");
  const read = (label: string) => ({
    unreadable: Number(new RegExp(`(\\d+) of \\d+ ${escape(label)}`).exec(result.output)?.[1] ?? 0),
    total: Number(new RegExp(`(?:Checked: |\\(|, )(\\d+) ${escape(label)}`).exec(result.output)?.[1] ?? -1),
  });
  return { ...result, counts: Object.fromEntries(LABELS.map((label) => [label, read(label)])) as Record<(typeof LABELS)[number], { unreadable: number; total: number }> };
}

beforeAll(async () => {
  orgId = (await prisma.organisation.create({ data: { name: "Secrets org", slug: `secrets-${suffix}` } })).id;
  otherOrgId = (await prisma.organisation.create({ data: { name: "Other org", slug: `secrets-other-${suffix}` } })).id;
});

afterAll(async () => {
  await prisma.organisation.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
  await prisma.$disconnect();
});

describe("scripts/check-instance-secrets.mjs", () => {
  it("checks each organisation's secrets under their own keys, and reports a misplaced one by count only", async () => {
    const before = await check();

    await prisma.organisationEmailSettings.create({ data: { organisationId: orgId, smtpPasswordEncrypted: encryptOrgSecret(orgId, ORG_SMTP_PASSWORD_SLOT, "mail-password") } });
    const channel = await prisma.chatChannel.create({ data: { organisationId: orgId, kind: "SLACK", name: "Ops", events: [], secretEncrypted: "pending" } });
    await prisma.chatChannel.update({ where: { id: channel.id }, data: { secretEncrypted: encryptOrgSecret(orgId, chatSecretSlot(channel.id), "{\"url\":\"https://hooks.example.test/x\"}") } });
    await prisma.organisationPaymentSettings.create({ data: {
      organisationId: orgId, webhookPathId: `wh-${suffix}`,
      stripeSecretKeyEncrypted: encryptPaymentSecret(orgId, "stripeSecretKeyEncrypted", "sk_test_secret"),
      stripeWebhookSecretEncrypted: encryptPaymentSecret(orgId, "stripeWebhookSecretEncrypted", "whsec_secret"),
    } });
    await prisma.event.create({ data: {
      organisationId: orgId, title: "Secrets event", slug: `secrets-event-${suffix}`, timezone: "UTC",
      startDateTime: new Date("2030-01-01T10:00:00.000Z"), endDateTime: new Date("2030-01-01T11:00:00.000Z"),
      status: EventStatus.DRAFT, privacyType: EventPrivacyType.PUBLIC, checkInStationPinEncrypted: encryptStationPin("482913"),
    } });

    const after = await check();
    const added = { "organisation mail server password(s)": 1, "chat channel credential(s)": 1, "payment key(s)": 2, "check-in station PIN(s)": 1 };
    for (const label of LABELS) {
      expect(after.counts[label].total, label).toBe(before.counts[label].total + added[label]);
      expect(after.counts[label].unreadable, label).toBe(before.counts[label].unreadable);
    }

    // A credential copied from another organisation is bound to that one and must not read.
    const copied = await prisma.chatChannel.create({ data: { organisationId: otherOrgId, kind: "SLACK", name: "Copied", events: [], secretEncrypted: "pending" } });
    await prisma.chatChannel.update({ where: { id: copied.id }, data: { secretEncrypted: encryptOrgSecret(orgId, chatSecretSlot(channel.id), "{\"url\":\"https://hooks.example.test/x\"}") } });
    const misplaced = await check();
    expect(misplaced.code).not.toBe(0);
    expect(misplaced.counts["chat channel credential(s)"].unreadable).toBe(before.counts["chat channel credential(s)"].unreadable + 1);
    for (const secret of [orgId, otherOrgId, copied.id, "hooks.example.test", "sk_test_secret", "mail-password", "482913"]) expect(misplaced.output).not.toContain(secret);
  }, 60_000);
});
