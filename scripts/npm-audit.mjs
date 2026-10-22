// `npm audit` for CI. A real finding fails at once; when npm's audit service
// is down (503, or a 400 from its retired fallback endpoint) there is no
// report, so it waits and asks again rather than failing the build.
// Usage: node scripts/npm-audit.mjs --omit=dev [--audit-level=high]
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
const attempts = 5;
const npm = (extra) => spawnSync("npm", ["audit", ...args, ...extra], { encoding: "utf8", shell: process.platform === "win32" });

for (let attempt = 1; attempt <= attempts; attempt++) {
  const run = npm(["--json"]);
  let report = null;
  try { report = JSON.parse(run.stdout); } catch { /* no report */ }
  if (report?.metadata) {
    if (run.status === 0) {
      console.log("npm audit: no vulnerabilities at this level.");
      process.exit(0);
    }
    console.log(npm([]).stdout);
    process.exit(1);
  }
  const reason = report?.error?.summary || run.stderr.trim().split("\n").pop() || `exit ${run.status}`;
  console.log(`::warning::npm audit service unavailable (attempt ${attempt} of ${attempts}): ${reason}`);
  if (attempt < attempts) await sleep(attempt * 20_000);
}
console.log("::error::npm audit service stayed unavailable; re-run this job later.");
process.exit(1);
