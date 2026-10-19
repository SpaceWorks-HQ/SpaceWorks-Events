// Safe operator output: no connection URLs, credentials or response bodies.
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) {
  if (!process.env[key] || process.env[key] === "CHANGE_ME") {
    console.error(`Configure ${key} in the external app.env first.`);
    process.exit(1);
  }
}
await import("../../scripts/check-production-env.mjs");
if (process.argv[2] === "preflight") process.exit(0);

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 5000, maxRetriesPerRequest: 1 });
redis.on("error", () => {});
const s3 = new S3Client({
  region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});
try {
  const [{ ssl }] = await prisma.$queryRaw`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
  const [role] = await prisma.$queryRaw`SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
  if (!ssl || role.rolsuper || role.rolcreatedb || role.rolcreaterole) throw new Error();
  await import("../../scripts/verify-production-schema.mjs");
  await redis.connect();
  if (await redis.ping() !== "PONG") throw new Error();
  await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
  const response = await fetch("http://app:3000/api/health/db", {
    headers: { Authorization: `Bearer ${process.env.HEALTHCHECK_SECRET}` },
    signal: AbortSignal.timeout(10_000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error();
  if (process.env.SWE_LAYOUT === "split") {
    // The website container reaches the API over its HTTPS name and the gateway.
    const viaFrontend = await fetch("http://frontend:3000/api/health", { signal: AbortSignal.timeout(15_000) });
    await viaFrontend.body?.cancel();
    if (!viaFrontend.ok) throw new Error();
  }
  console.log(`VPS checks passed: database TLS, runtime role, schema, Redis TLS/auth, private bucket access and authenticated readiness${process.env.SWE_LAYOUT === "split" ? ", website-to-API gateway" : ""}.`);
} catch {
  console.error("VPS checks failed. Check service health and configuration in a trusted operator session; no connection details were logged.");
  process.exitCode = 1;
} finally {
  redis.disconnect();
  s3.destroy();
  await prisma.$disconnect();
}
