import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The unit suite runs in Node without a DOM renderer, so this drives the hook
 * through a minimal useState/useEffect harness and a mocked watcher. The
 * watcher's network behaviour is covered in ticket-check-in-watcher.test.ts.
 */
const harness = vi.hoisted(() => {
  type Effect = { deps?: unknown[]; cleanup?: void | (() => void) };
  const state = { slots: [] as unknown[], effects: [] as Effect[], slot: 0, effect: 0, queue: [] as Array<() => void>, rerender: () => {} };
  return state;
});

vi.mock("react", () => ({
  useState<T>(initial: T | (() => T)) {
    const index = harness.slot++;
    if (!(index in harness.slots)) harness.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    const set = (value: T) => {
      harness.slots[index] = value;
      harness.rerender();
    };
    return [harness.slots[index] as T, set];
  },
  useEffect(run: () => void | (() => void), deps?: unknown[]) {
    const index = harness.effect++;
    const previous = harness.effects[index];
    const changed = !previous || !deps || !previous.deps || deps.some((dep, i) => !Object.is(dep, previous.deps![i]));
    if (!changed) return;
    harness.queue.push(() => {
      if (typeof previous?.cleanup === "function") previous.cleanup();
      harness.effects[index] = { deps, cleanup: run() };
    });
  },
}));

const watcher = vi.hoisted(() => ({ calls: [] as Array<{ token: string; onCheckedIn: (at: string | null) => void; stop: () => void }> }));

vi.mock("@/components/ticket/ticketCheckInWatcher", () => ({
  watchTicketCheckIn: (token: string, onCheckedIn: (at: string | null) => void) => {
    const stop = vi.fn();
    watcher.calls.push({ token, onCheckedIn, stop });
    return stop;
  },
}));

const { useTicketCheckIn } = await import("@/components/ticket/useTicketCheckIn");

function renderHook<T>(hook: () => T) {
  const view = { current: undefined as T };
  const render = () => {
    harness.slot = 0;
    harness.effect = 0;
    view.current = hook();
    const queued = harness.queue.splice(0);
    for (const run of queued) run();
  };
  harness.rerender = render;
  render();
  return view;
}

beforeEach(() => {
  harness.slots = [];
  harness.effects = [];
  harness.queue = [];
  watcher.calls = [];
});

describe("useTicketCheckIn", () => {
  it("flips justCheckedIn when the check-in arrives live, then stops watching", () => {
    const view = renderHook(() => useTicketCheckIn("tok-live-0001", { checkedIn: false, checkedInAt: null }));
    expect(view.current).toEqual({ checkedIn: false, checkedInAt: null, justCheckedIn: false });
    expect(watcher.calls).toHaveLength(1);
    expect(watcher.calls[0]!.token).toBe("tok-live-0001");

    watcher.calls[0]!.onCheckedIn("2026-10-15T09:30:00.000Z");
    expect(view.current).toEqual({ checkedIn: true, checkedInAt: "2026-10-15T09:30:00.000Z", justCheckedIn: true });
    expect(watcher.calls[0]!.stop).toHaveBeenCalled();
    expect(watcher.calls).toHaveLength(1);
  });

  it("does not watch or animate a ticket that loaded already checked in", () => {
    const view = renderHook(() => useTicketCheckIn("tok-done-0001", { checkedIn: true, checkedInAt: "2026-10-15T08:00:00.000Z" }));
    expect(view.current).toEqual({ checkedIn: true, checkedInAt: "2026-10-15T08:00:00.000Z", justCheckedIn: false });
    expect(watcher.calls).toHaveLength(0);
  });

  it("does not watch when disabled", () => {
    renderHook(() => useTicketCheckIn("tok-off-00001", { checkedIn: false, checkedInAt: null }, { enabled: false }));
    expect(watcher.calls).toHaveLength(0);
  });
});
