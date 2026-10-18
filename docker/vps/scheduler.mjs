// Separate recovery scheduler; never log credentials, response bodies or URLs.
async function tick() {
  try {
    const response = await fetch("http://app:3000/api/internal/outbox", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(55_000),
    });
    await response.body?.cancel();
    if (!response.ok) console.error(`Outbox recovery returned HTTP ${response.status}.`);
  } catch {
    console.error("Outbox recovery request failed.");
  }
}
await tick();
setInterval(tick, 60_000);
