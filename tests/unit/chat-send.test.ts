import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/net/publicAddress", () => ({
  resolvePublicAddress: async () => { throw new (class PrivateAddressError extends Error {})("private"); },
}));

import { describeChatTarget, parseChatConfig } from "@/lib/chat/config";
import { ChatDeliveryError, sendChatMessage } from "@/lib/chat/send";

afterEach(() => vi.unstubAllGlobals());

const ok = () => new Response(null, { status: 200 });

describe("chat connection details", () => {
  it("accepts only each service's own webhook hosts", () => {
    expect(parseChatConfig("SLACK", { url: "https://hooks.slack.com/services/T000/B000/abc" }).ok).toBe(true);
    expect(parseChatConfig("SLACK", { url: "https://evil.example/services/T000/B000/abc" }).ok).toBe(false);
    expect(parseChatConfig("DISCORD", { url: "https://discord.com/api/webhooks/123/abc-DEF_9" }).ok).toBe(true);
    expect(parseChatConfig("DISCORD", { url: "http://discord.com/api/webhooks/123/abc" }).ok).toBe(false);
    expect(parseChatConfig("MATTERMOST", { url: "https://chat.example.org/hooks/abc123" }).ok).toBe(true);
    expect(parseChatConfig("TELEGRAM", { token: "123456:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789", chatId: "-1001234567" }).ok).toBe(true);
    expect(parseChatConfig("WHATSAPP", { phoneNumberId: "1234567890", token: "x".repeat(40), to: ["+919876543210"] }).ok).toBe(true);
    expect(parseChatConfig("WHATSAPP", { phoneNumberId: "1234567890", token: "x".repeat(40), to: [] }).ok).toBe(false);
  });

  it("describes where a chat posts without its secret path or token", () => {
    expect(describeChatTarget("SLACK", { url: "https://hooks.slack.com/services/T000/B000/secret" })).toBe("hooks.slack.com");
    expect(describeChatTarget("WHATSAPP", { phoneNumberId: "1", token: "t", to: ["+919876543210"] })).toBe("…3210");
  });
});

describe("sending", () => {
  it("posts plain text to Slack, and to Discord with mentions switched off", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    await sendChatMessage("SLACK", { url: "https://hooks.slack.com/services/T/B/x" }, "Hello");
    await sendChatMessage("DISCORD", { url: "https://discord.com/api/webhooks/1/x" }, "@everyone hi");
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(((call as unknown) as [string, RequestInit])[1].body as string));
    expect(bodies[0]).toEqual({ text: "Hello" });
    expect(bodies[1]).toEqual({ content: "@everyone hi", allowed_mentions: { parse: [] } });
    expect(((fetchMock.mock.calls[0] as unknown) as [string, RequestInit])[1].redirect).toBe("error");
  });

  it("uses a WhatsApp template when one is set, for each number", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    await sendChatMessage("WHATSAPP", { phoneNumberId: "555", token: "tok".repeat(10), to: ["+911111111111", "+922222222222"], template: "event_update", language: "en" }, "New booking");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = (fetchMock.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/555/messages");
    expect(JSON.parse(init.body as string)).toMatchObject({ to: "911111111111", type: "template", template: { name: "event_update", components: [{ parameters: [{ text: "New booking" }] }] } });
  });

  it("treats a rejected webhook as permanent and rate limits as temporary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(sendChatMessage("SLACK", { url: "https://hooks.slack.com/services/T/B/x" }, "x")).rejects.toMatchObject({ permanent: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));
    await expect(sendChatMessage("SLACK", { url: "https://hooks.slack.com/services/T/B/x" }, "x")).rejects.toBeInstanceOf(ChatDeliveryError);
    await expect(sendChatMessage("SLACK", { url: "https://hooks.slack.com/services/T/B/x" }, "x")).rejects.toMatchObject({ permanent: false });
  });

  it("never connects to a Mattermost server on a private address", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendChatMessage("MATTERMOST", { url: "https://chat.internal.example/hooks/abc" }, "x")).rejects.toThrow("private");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
