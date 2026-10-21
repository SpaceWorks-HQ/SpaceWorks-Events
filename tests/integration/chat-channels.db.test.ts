import { randomUUID } from "node:crypto";
import { MembershipRole } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { addChatChannel, testChatChannel, updateChatChannel } from "@/app/actions/chat-channels";
import { notifyChat } from "@/lib/chat/notify";
import { prisma } from "@/lib/db";
import { deliverOutboxBatch } from "@/lib/outbox";

const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
const organisationSlug = `chatters-${suffix}`;
const SLACK = `https://hooks.slack.com/services/T${suffix}/B000/secretpart`;
const users = { owner: "", member: "" };
let organisationId = "";
const posts: Array<{ url: string; body: Record<string, unknown>; }> = [];
let status = 200;

beforeAll(async () => {
  vi.stubEnv("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY || Buffer.alloc(32, 5).toString("base64"));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    posts.push({ url, body: JSON.parse(init.body as string) });
    return new Response(null, { status });
  }));
  for (const key of Object.keys(users) as Array<keyof typeof users>) {
    users[key] = (await prisma.user.create({ data: { name: key, email: `${key}-${suffix}@example.test`, emailVerified: new Date() } })).id;
  }
  organisationId = (await prisma.organisation.create({ data: { name: "Chat Makers", slug: organisationSlug } })).id;
  await prisma.membership.createMany({ data: [
    { userId: users.owner, organisationId, role: MembershipRole.OWNER },
    { userId: users.member, organisationId, role: MembershipRole.MEMBER },
  ] });
});

beforeEach(() => {
  posts.length = 0;
  status = 200;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  identity.id = "";
  await prisma.outboxMessage.deleteMany({ where: { payload: { path: ["organisationId"], equals: organisationId } } });
  await prisma.organisation.deleteMany({ where: { id: organisationId } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
});

async function deliverOurs() {
  await prisma.outboxMessage.updateMany({ where: { status: "PENDING", payload: { path: ["organisationId"], equals: organisationId } }, data: { createdAt: new Date(0) } });
  await deliverOutboxBatch(10);
}

describe("chat channels", () => {
  it("stores the webhook encrypted, and only for owners and admins", async () => {
    identity.id = users.member;
    expect(await addChatChannel({ organisationSlug, kind: "SLACK", name: "#events", config: { url: SLACK }, events: ["registration"] })).toMatchObject({ ok: false });
    identity.id = users.owner;
    const added = await addChatChannel({ organisationSlug, kind: "SLACK", name: "#events", config: { url: SLACK }, events: ["registration", "payment"] });
    expect(added.ok).toBe(true);
    const row = await prisma.chatChannel.findFirstOrThrow({ where: { organisationId } });
    expect(row.secretEncrypted).not.toContain("secretpart");
    expect(await addChatChannel({ organisationSlug, kind: "SLACK", name: "bad", config: { url: "https://evil.example/hook" }, events: [] })).toMatchObject({ ok: false });
  });

  it("queues a notification only to chats that listen for it, and posts it from the worker", async () => {
    expect(await notifyChat(prisma, organisationId, "registration", "Ada registered for Launch.")).toBe(1);
    expect(await notifyChat(prisma, organisationId, "dispute", "Chargeback opened.")).toBe(0);
    await deliverOurs();
    expect(posts).toEqual([{ url: SLACK, body: { text: "Ada registered for Launch." } }]);
    expect((await prisma.chatChannel.findFirstOrThrow({ where: { organisationId } })).lastDeliveredAt).not.toBeNull();
  });

  it("drops queued messages for a switched-off chat, and gives up when the webhook is gone", async () => {
    identity.id = users.owner;
    const channel = await prisma.chatChannel.findFirstOrThrow({ where: { organisationId } });
    await notifyChat(prisma, organisationId, "payment", "Paid.");
    expect(await updateChatChannel({ organisationSlug, channelId: channel.id, enabled: false })).toEqual({ ok: true });
    await deliverOurs();
    expect(posts).toHaveLength(0);

    await updateChatChannel({ organisationSlug, channelId: channel.id, enabled: true });
    status = 404;
    await notifyChat(prisma, organisationId, "payment", "Paid again.");
    await deliverOurs();
    const failed = await prisma.outboxMessage.findFirstOrThrow({ where: { kind: "chat-message", payload: { path: ["text"], equals: "Paid again." } } });
    expect(failed.status).toBe("FAILED");
    expect((await prisma.chatChannel.findUniqueOrThrow({ where: { id: channel.id } })).lastFailedAt).not.toBeNull();
  });

  it("sends a test at once and reports a refusal without echoing the service", async () => {
    identity.id = users.owner;
    const channel = await prisma.chatChannel.findFirstOrThrow({ where: { organisationId } });
    expect(await testChatChannel({ organisationSlug, channelId: channel.id })).toEqual({ ok: true });
    expect(posts[0]?.body.text).toContain("Chat Makers");
    status = 403;
    const refused = await testChatChannel({ organisationSlug, channelId: channel.id });
    expect(refused).toMatchObject({ ok: false });
    expect(JSON.stringify(refused)).not.toContain("secretpart");
  });
});
