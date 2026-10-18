/**
 * Framework-free watcher behind `useTicketCheckIn`. It listens for the
 * ticket's live check-in over Server-Sent Events, reconnecting with backoff,
 * and falls back to polling the status endpoint while the page is visible.
 *
 * The ticket token is a bearer capability: it only ever appears in the
 * request URL, is never logged, and is never stored by this module.
 */

export type TicketCheckInStatus = { checkedIn: boolean; checkedInAt: string | null };

type EventSourceLike = {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

type VisibilityTarget = {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

export type TicketCheckInWatcherEnv = {
  EventSource?: new (url: string) => EventSourceLike;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  document?: VisibilityTarget;
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

/** Poll interval when EventSource is unavailable or keeps failing. */
export const TICKET_POLL_INTERVAL_MS = 4_000;
/**
 * While the live stream is open, also confirm the status this often. A safety
 * net for a missed message (proxy buffering, a replica without Redis, a stale
 * deployment): the ticket still tears within this window.
 */
export const TICKET_SAFETY_CHECK_MS = 15_000;
/** First reconnect delay; doubles per consecutive failure up to the cap. */
export const TICKET_RECONNECT_BASE_MS = 1_000;
export const TICKET_RECONNECT_MAX_MS = 30_000;
/** Consecutive stream failures (without a successful open) before polling instead. */
export const TICKET_MAX_STREAM_FAILURES = 4;

export function ticketReconnectDelay(failures: number) {
  return Math.min(TICKET_RECONNECT_BASE_MS * 2 ** Math.max(0, failures - 1), TICKET_RECONNECT_MAX_MS);
}

function defaultEnv(): TicketCheckInWatcherEnv | null {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return null;
  return {
    EventSource: typeof window.EventSource === "function" ? window.EventSource : undefined,
    fetch: window.fetch.bind(window),
    document: window.document,
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  };
}

function parseJson(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function checkedInAtOf(value: Record<string, unknown> | null) {
  return typeof value?.checkedInAt === "string" ? value.checkedInAt : null;
}

/**
 * Starts watching `token` and calls `onCheckedIn` at most once. Returns a
 * cleanup function that stops every connection, timer and listener.
 */
export function watchTicketCheckIn(
  token: string,
  onCheckedIn: (checkedInAt: string | null) => void,
  env: TicketCheckInWatcherEnv | null = defaultEnv(),
): () => void {
  if (!env || !token) return () => {};

  const base = `/api/ticket/${encodeURIComponent(token)}`;
  const doc = env.document;
  let stopped = false;
  let source: EventSourceLike | null = null;
  let timer: unknown = null;
  let failures = 0;
  let mode: "stream" | "poll" = env.EventSource ? "stream" : "poll";
  let fetching = false;
  let safetyTimer: unknown = null;

  const visible = () => !doc || doc.visibilityState !== "hidden";

  const clearTimer = () => {
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
  };

  const clearSafety = () => {
    if (safetyTimer !== null) env.clearTimeout(safetyTimer);
    safetyTimer = null;
  };

  // Periodic status check alongside the stream (polling mode already checks often).
  const armSafety = () => {
    clearSafety();
    if (stopped) return;
    safetyTimer = env.setTimeout(() => {
      safetyTimer = null;
      if (stopped) return;
      if (visible() && mode === "stream") void checkStatus();
      armSafety();
    }, TICKET_SAFETY_CHECK_MS);
  };

  const closeSource = () => {
    if (!source) return;
    source.onopen = null;
    source.onerror = null;
    source.close();
    source = null;
  };

  const stop = () => {
    stopped = true;
    clearTimer();
    clearSafety();
    closeSource();
    doc?.removeEventListener("visibilitychange", onVisibilityChange);
  };

  const finish = (checkedInAt: string | null) => {
    if (stopped) return;
    stop();
    onCheckedIn(checkedInAt);
  };

  const schedule = (ms: number, run: () => void) => {
    clearTimer();
    timer = env.setTimeout(() => {
      timer = null;
      if (!stopped && visible()) run();
    }, ms);
  };

  /** One status request; resolves to whether watching should continue. */
  const checkStatus = async () => {
    if (fetching) return;
    fetching = true;
    try {
      const response = await env.fetch(`${base}/status`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (stopped) return;
      if (response.status === 404) {
        // The ticket no longer exists (for example it was cancelled): nothing to watch.
        stop();
        return;
      }
      if (!response.ok) return;
      const body = (await response.json()) as unknown;
      if (stopped || !body || typeof body !== "object") return;
      const status = body as Partial<TicketCheckInStatus>;
      if (status.checkedIn === true) finish(typeof status.checkedInAt === "string" ? status.checkedInAt : null);
    } catch {
      // Offline or a transient failure; the next poll or reconnect retries.
    } finally {
      fetching = false;
    }
  };

  const poll = () => {
    void checkStatus().then(() => {
      if (!stopped && mode === "poll" && visible()) schedule(TICKET_POLL_INTERVAL_MS, poll);
    });
  };

  const connect = () => {
    if (stopped || !visible()) return;
    const EventSourceImpl = env.EventSource;
    if (mode === "poll" || !EventSourceImpl) {
      mode = "poll";
      schedule(TICKET_POLL_INTERVAL_MS, poll);
      return;
    }
    closeSource();
    let stream: EventSourceLike;
    try {
      stream = new EventSourceImpl(`${base}/events`);
    } catch {
      mode = "poll";
      schedule(TICKET_POLL_INTERVAL_MS, poll);
      return;
    }
    source = stream;
    stream.onopen = () => {
      failures = 0;
    };
    stream.addEventListener("state", (event) => {
      if (source !== stream) return;
      failures = 0;
      const data = parseJson(event.data);
      if (data?.checkedIn === true) finish(checkedInAtOf(data));
    });
    stream.addEventListener("checked-in", (event) => {
      if (source !== stream) return;
      finish(checkedInAtOf(parseJson(event.data)));
    });
    // An error covers both failures and the server closing the stream. Take
    // over from the browser's own retry so the backoff stays under our control.
    stream.onerror = () => {
      if (source !== stream) return;
      closeSource();
      failures += 1;
      if (failures >= TICKET_MAX_STREAM_FAILURES) {
        mode = "poll";
        // Confirm the state now, then keep polling while visible.
        poll();
        return;
      }
      schedule(ticketReconnectDelay(failures), connect);
    };
  };

  function onVisibilityChange() {
    if (stopped) return;
    if (!visible()) {
      // Pause while hidden; nothing runs in a background tab.
      clearTimer();
      clearSafety();
      closeSource();
      return;
    }
    // Back in view: refresh immediately, then resume the live connection.
    clearTimer();
    armSafety();
    void checkStatus().then(() => {
      if (stopped || !visible()) return;
      if (mode === "poll") schedule(TICKET_POLL_INTERVAL_MS, poll);
      else if (!source) connect();
    });
  }

  doc?.addEventListener("visibilitychange", onVisibilityChange);
  connect();
  armSafety();

  return stop;
}
