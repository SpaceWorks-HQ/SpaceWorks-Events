import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  instances: [] as Array<{
    handlers: Record<string, (...args: unknown[]) => void>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    handlers: Record<string, (...args: unknown[]) => void> = {};
    subscribe = vi.fn().mockResolvedValue(1);
    unsubscribe = vi.fn().mockResolvedValue(0);
    publish = vi.fn().mockResolvedValue(1);
    constructor() {
      redis.instances.push(this);
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers[event] = handler;
      return this;
    }
  },
}));

type Events = typeof import("@/lib/ticketCheckInEvents");

async function load(redisUrl: string | undefined): Promise<Events> {
  vi.resetModules();
  if (redisUrl === undefined) vi.stubEnv("REDIS_URL", "");
  else vi.stubEnv("REDIS_URL", redisUrl);
  return import("@/lib/ticketCheckInEvents");
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  redis.instances.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ticket check-in events (in-process fallback)", () => {
  it("delivers a publish to subscribers of that RSVP only", async () => {
    const events = await load(undefined);
    const mine = vi.fn();
    const other = vi.fn();
    const off1 = events.subscribeTicketCheckedIn("rsvp_1", mine);
    const off2 = events.subscribeTicketCheckedIn("rsvp_2", other);
    await off1.ready;

    events.publishTicketCheckedIn({ rsvpId: "rsvp_1", checkedInAt: new Date("2035-01-01T10:00:00.000Z") });
    expect(mine).not.toHaveBeenCalled(); // dispatch is deferred off the check-in path
    await flush();

    expect(mine).toHaveBeenCalledWith({ checkedInAt: "2035-01-01T10:00:00.000Z" });
    expect(other).not.toHaveBeenCalled();
    expect(redis.instances).toHaveLength(0);
    off1();
    off2();
  });

  it("stops delivering after unsubscribe and tolerates repeated unsubscribe", async () => {
    const events = await load(undefined);
    const first = vi.fn();
    const second = vi.fn();
    const off1 = events.subscribeTicketCheckedIn("rsvp_1", first);
    const off2 = events.subscribeTicketCheckedIn("rsvp_1", second);
    off1();
    off1();

    events.publishTicketCheckedIn({ rsvpId: "rsvp_1", checkedInAt: "2035-01-01T10:00:00.000Z" });
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    off2();
  });

  it("swallows listener failures and invalid publishes", async () => {
    const events = await load(undefined);
    const healthy = vi.fn();
    const offBad = events.subscribeTicketCheckedIn("rsvp_1", () => {
      throw new Error("boom");
    });
    const offGood = events.subscribeTicketCheckedIn("rsvp_1", healthy);

    expect(() => events.publishTicketCheckedIn({ rsvpId: "rsvp_1", checkedInAt: new Date() })).not.toThrow();
    expect(() => events.publishTicketCheckedIn({ rsvpId: "bad id with spaces", checkedInAt: new Date() })).not.toThrow();
    expect(() => events.publishTicketCheckedIn({ rsvpId: "rsvp_1", checkedInAt: "not-a-date" })).not.toThrow();
    await flush();
    expect(healthy).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
  });
});

describe("ticket check-in events (Redis)", () => {
  it("shares one subscriber connection with per-channel reference counting", async () => {
    const events = await load("redis://redis.example.test:6379");
    const offA = events.subscribeTicketCheckedIn("rsvp_1", vi.fn());
    const offB = events.subscribeTicketCheckedIn("rsvp_1", vi.fn());
    const offC = events.subscribeTicketCheckedIn("rsvp_2", vi.fn());
    await offA.ready;

    expect(redis.instances).toHaveLength(1);
    const subscriber = redis.instances[0];
    expect(subscriber.subscribe).toHaveBeenCalledTimes(2);
    expect(subscriber.subscribe).toHaveBeenCalledWith("yuyu:ticket-checkin:rsvp_1");
    expect(subscriber.subscribe).toHaveBeenCalledWith("yuyu:ticket-checkin:rsvp_2");

    offA();
    expect(subscriber.unsubscribe).not.toHaveBeenCalled();
    offB();
    expect(subscriber.unsubscribe).toHaveBeenCalledWith("yuyu:ticket-checkin:rsvp_1");
    offC();
    expect(subscriber.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it("publishes by RSVP id over Redis and dispatches received messages", async () => {
    const events = await load("rediss://redis.example.test:6380");
    const listener = vi.fn();
    const off = events.subscribeTicketCheckedIn("rsvp_1", listener);
    const subscriber = redis.instances[0];

    events.publishTicketCheckedIn({ rsvpId: "rsvp_1", checkedInAt: new Date("2035-01-01T10:00:00.000Z") });
    const publisher = redis.instances[1];
    expect(publisher.publish).toHaveBeenCalledWith(
      "yuyu:ticket-checkin:rsvp_1",
      JSON.stringify({ checkedInAt: "2035-01-01T10:00:00.000Z" }),
    );
    // Redis mode does not also dispatch locally on success.
    await flush();
    expect(listener).not.toHaveBeenCalled();

    subscriber.handlers.message("yuyu:ticket-checkin:rsvp_1", "{not json");
    subscriber.handlers.message("yuyu:ticket-checkin:rsvp_1", JSON.stringify({ checkedInAt: "2035-01-01T10:00:00.000Z" }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ checkedInAt: "2035-01-01T10:00:00.000Z" });
    off();
  });

  it("never throws when Redis publish or subscribe fails", async () => {
    const events = await load("redis://redis.example.test:6379");
    const listener = vi.fn();
    const off = events.subscribeTicketCheckedIn("rsvp_1", listener);
    redis.instances[0].subscribe.mockRejectedValueOnce(new Error("down"));
    const off2 = events.subscribeTicketCheckedIn("rsvp_9", vi.fn());
    await expect(off2.ready).resolves.toBeUndefined();

    events.publishTicketCheckedIn({ rsvpId: "rsvp_1", checkedInAt: new Date("2035-01-01T10:00:00.000Z") });
    const publisher = redis.instances[1];
    publisher.publish.mockRejectedValueOnce(new Error("redis://user:secret@host down"));
    expect(() => events.publishTicketCheckedIn({ rsvpId: "rsvp_1", checkedInAt: new Date("2035-01-01T10:00:00.000Z") })).not.toThrow();
    await flush();
    await flush();
    // Local best-effort delivery after a failed publish.
    expect(listener).toHaveBeenCalledTimes(1);
    for (const call of vi.mocked(console.warn).mock.calls) expect(String(call[0])).not.toContain("secret");
    off();
    off2();
  });
});
