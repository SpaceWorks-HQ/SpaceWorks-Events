import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TICKET_MAX_STREAM_FAILURES,
  TICKET_POLL_INTERVAL_MS,
  TICKET_SAFETY_CHECK_MS,
  ticketReconnectDelay,
  watchTicketCheckIn,
  type TicketCheckInWatcherEnv,
} from "@/components/ticket/ticketCheckInWatcher";

const TOKEN = "test-ticket-token-0001";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.(new Event("open"));
  }

  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) } as MessageEvent);
  }

  emitRaw(type: string, data: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data } as MessageEvent);
  }

  fail() {
    this.onerror?.(new Event("error"));
  }

  static latest() {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1]!;
  }
}

class FakeDocument {
  visibilityState: DocumentVisibilityState = "visible";
  private listeners = new Set<() => void>();
  addEventListener(_type: "visibilitychange", listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: "visibilitychange", listener: () => void) {
    this.listeners.delete(listener);
  }
  setVisibility(state: DocumentVisibilityState) {
    this.visibilityState = state;
    for (const listener of [...this.listeners]) listener();
  }
  get listenerCount() {
    return this.listeners.size;
  }
}

function statusResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function makeEnv(options: { eventSource?: boolean } = {}) {
  const doc = new FakeDocument();
  const fetchMock = vi.fn(async (...args: [url: string, init?: RequestInit]) => {
    void args;
    return statusResponse({ checkedIn: false, checkedInAt: null });
  });
  const env: TicketCheckInWatcherEnv = {
    EventSource: options.eventSource === false ? undefined : FakeEventSource,
    fetch: fetchMock,
    document: doc,
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  return { env, doc, fetchMock };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("watchTicketCheckIn", () => {
  it("connects to the ticket's event stream and reports a live check-in once", async () => {
    const { env, doc } = makeEnv();
    const onCheckedIn = vi.fn();
    watchTicketCheckIn(TOKEN, onCheckedIn, env);

    const source = FakeEventSource.latest();
    expect(source.url).toBe(`/api/ticket/${TOKEN}/events`);
    source.open();
    source.emit("state", { checkedIn: false, checkedInAt: null });
    expect(onCheckedIn).not.toHaveBeenCalled();

    source.emit("checked-in", { checkedInAt: "2026-10-15T09:30:00.000Z" });
    expect(onCheckedIn).toHaveBeenCalledTimes(1);
    expect(onCheckedIn).toHaveBeenCalledWith("2026-10-15T09:30:00.000Z");
    expect(source.closed).toBe(true);
    expect(doc.listenerCount).toBe(0);

    // Nothing else runs after the check-in.
    source.emit("checked-in", { checkedInAt: "2026-10-15T09:31:00.000Z" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onCheckedIn).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("catches a check-in the stream missed with the periodic safety check", async () => {
    const { env, fetchMock } = makeEnv();
    const onCheckedIn = vi.fn();
    watchTicketCheckIn(TOKEN, onCheckedIn, env);
    const source = FakeEventSource.latest();
    source.open();
    source.emit("state", { checkedIn: false, checkedInAt: null });

    // The stream stays open but its checked-in message never arrives.
    await vi.advanceTimersByTimeAsync(TICKET_SAFETY_CHECK_MS);
    expect(fetchMock).toHaveBeenCalledWith(`/api/ticket/${TOKEN}/status`, expect.anything());
    expect(onCheckedIn).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(statusResponse({ checkedIn: true, checkedInAt: "2026-10-15T09:30:00.000Z" }));
    await vi.advanceTimersByTimeAsync(TICKET_SAFETY_CHECK_MS);
    expect(onCheckedIn).toHaveBeenCalledWith("2026-10-15T09:30:00.000Z");
    expect(source.closed).toBe(true);

    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(TICKET_SAFETY_CHECK_MS * 4);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("treats a checked-in state on connect as the check-in", () => {
    const { env } = makeEnv();
    const onCheckedIn = vi.fn();
    watchTicketCheckIn(TOKEN, onCheckedIn, env);
    FakeEventSource.latest().emit("state", { checkedIn: true, checkedInAt: "2026-10-15T09:30:00.000Z" });
    expect(onCheckedIn).toHaveBeenCalledWith("2026-10-15T09:30:00.000Z");
  });

  it("reconnects with exponential backoff and resets after a successful open", async () => {
    const { env, fetchMock } = makeEnv();
    watchTicketCheckIn(TOKEN, vi.fn(), env);

    FakeEventSource.latest().fail();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(ticketReconnectDelay(1) - 1);
    expect(FakeEventSource.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeEventSource.instances).toHaveLength(2);

    FakeEventSource.latest().fail();
    await vi.advanceTimersByTimeAsync(ticketReconnectDelay(2) - 1);
    expect(FakeEventSource.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeEventSource.instances).toHaveLength(3);

    // A server-side close after a healthy connection starts the backoff again.
    FakeEventSource.latest().open();
    FakeEventSource.latest().fail();
    await vi.advanceTimersByTimeAsync(ticketReconnectDelay(1));
    expect(FakeEventSource.instances).toHaveLength(4);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ticketReconnectDelay(1)).toBeLessThan(ticketReconnectDelay(2));
    expect(ticketReconnectDelay(50)).toBe(30_000);
  });

  it("falls back to polling when the stream keeps failing", async () => {
    const { env, fetchMock } = makeEnv();
    const onCheckedIn = vi.fn();
    watchTicketCheckIn(TOKEN, onCheckedIn, env);

    for (let attempt = 1; attempt < TICKET_MAX_STREAM_FAILURES; attempt++) {
      FakeEventSource.latest().fail();
      await vi.advanceTimersByTimeAsync(ticketReconnectDelay(attempt));
    }
    FakeEventSource.latest().fail();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeEventSource.instances).toHaveLength(TICKET_MAX_STREAM_FAILURES);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/ticket/${TOKEN}/status`);

    await vi.advanceTimersByTimeAsync(TICKET_POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances).toHaveLength(TICKET_MAX_STREAM_FAILURES);

    fetchMock.mockResolvedValueOnce(statusResponse({ checkedIn: true, checkedInAt: "2026-10-15T09:30:00.000Z" }));
    await vi.advanceTimersByTimeAsync(TICKET_POLL_INTERVAL_MS);
    expect(onCheckedIn).toHaveBeenCalledWith("2026-10-15T09:30:00.000Z");
  });

  it("polls the status endpoint every 4 seconds when EventSource is unavailable, then stops", async () => {
    const { env, fetchMock } = makeEnv({ eventSource: false });
    const onCheckedIn = vi.fn();
    watchTicketCheckIn(TOKEN, onCheckedIn, env);

    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(TICKET_POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/ticket/${TOKEN}/status`);
    expect(init?.cache).toBe("no-store");

    await vi.advanceTimersByTimeAsync(TICKET_POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValueOnce(statusResponse({ checkedIn: true, checkedInAt: null }));
    await vi.advanceTimersByTimeAsync(TICKET_POLL_INTERVAL_MS);
    expect(onCheckedIn).toHaveBeenCalledWith(null);

    await vi.advanceTimersByTimeAsync(TICKET_POLL_INTERVAL_MS * 5);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops watching when the ticket no longer exists", async () => {
    const { env, fetchMock } = makeEnv({ eventSource: false });
    const onCheckedIn = vi.fn();
    fetchMock.mockResolvedValueOnce(statusResponse({ error: "Not found" }, 404));
    watchTicketCheckIn(TOKEN, onCheckedIn, env);
    await vi.advanceTimersByTimeAsync(TICKET_POLL_INTERVAL_MS * 4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onCheckedIn).not.toHaveBeenCalled();
  });

  it("pauses while hidden and refreshes immediately when visible again", async () => {
    const { env, doc, fetchMock } = makeEnv();
    const onCheckedIn = vi.fn();
    watchTicketCheckIn(TOKEN, onCheckedIn, env);
    const first = FakeEventSource.latest();

    doc.setVisibility("hidden");
    expect(first.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();

    doc.setVisibility("visible");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeEventSource.instances).toHaveLength(2);

    // A check-in that happened while hidden is picked up by the refresh.
    doc.setVisibility("hidden");
    fetchMock.mockResolvedValueOnce(statusResponse({ checkedIn: true, checkedInAt: "2026-10-15T09:30:00.000Z" }));
    doc.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(onCheckedIn).toHaveBeenCalledWith("2026-10-15T09:30:00.000Z");
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it("does not poll in a hidden tab", async () => {
    const { env, doc, fetchMock } = makeEnv({ eventSource: false });
    watchTicketCheckIn(TOKEN, vi.fn(), env);
    doc.setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(TICKET_POLL_INTERVAL_MS * 5);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cleans up every connection, timer and listener", async () => {
    const { env, doc, fetchMock } = makeEnv();
    const stop = watchTicketCheckIn(TOKEN, vi.fn(), env);
    FakeEventSource.latest().fail();
    stop();
    expect(doc.listenerCount).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores malformed stream data", () => {
    const { env } = makeEnv();
    const onCheckedIn = vi.fn();
    watchTicketCheckIn(TOKEN, onCheckedIn, env);
    const source = FakeEventSource.latest();
    source.emitRaw("state", "not json");
    source.emit("state", { checkedIn: "yes" });
    expect(onCheckedIn).not.toHaveBeenCalled();
  });
});
