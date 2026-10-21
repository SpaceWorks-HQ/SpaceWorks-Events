import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { getEmailSettings, type ConfigSource } from "@/lib/instanceSettings";
import { resolvePublicAddress } from "@/lib/net/publicAddress";
import { decryptOrgSecret } from "@/lib/orgSecrets";

const SMTP_CONNECTION_TIMEOUT_MS = 30_000;
const SMTP_GREETING_TIMEOUT_MS = 30_000;
const SMTP_SOCKET_TIMEOUT_MS = 60_000;

export class EmailTransportUnavailableError extends Error {
  override name = "EmailTransportUnavailableError";

  constructor() {
    super("Transactional email transport is not configured.");
  }
}

export class EmailRecipientRejectedError extends Error {
  override name = "EmailRecipientRejectedError";

  constructor() {
    super("SMTP rejected the recipient.");
  }
}

export function assertEmailAccepted(result: { accepted?: unknown; rejected?: unknown }) {
  if (
    (Array.isArray(result.rejected) && result.rejected.length > 0) ||
    (Array.isArray(result.accepted) && result.accepted.length === 0)
  ) {
    throw new EmailRecipientRejectedError();
  }
}

/** The column the organisation's SMTP password is encrypted under. */
export const ORG_SMTP_PASSWORD_SLOT = "OrganisationEmailSettings.smtpPasswordEncrypted";

/** Whose email is being sent: an organisation's, or the platform's own (null). */
const sendingScope = new AsyncLocalStorage<{ organisationId: string | null; }>();

/** Send the rest of this async flow as `organisationId` (null: the platform). */
export function sendAs(organisationId: string | null) {
  sendingScope.enterWith({ organisationId });
}

/** Run `fn` sending as `organisationId` (null: the platform). */
export function sendingAs<T>(organisationId: string | null, fn: () => Promise<T>) {
  return sendingScope.run({ organisationId }, fn);
}

type Sender = { from: string | { name: string; address: string; }; transporter: ReturnType<typeof nodemailer.createTransport> | null; };

/** The address part of a configured sender ("Name <a@b>" or "a@b"). */
export function senderAddress(from: string) {
  return (/<([^<>\s]+@[^<>\s]+)>/.exec(from)?.[1] ?? from).trim();
}

/** A display name for a header: no line breaks or control characters. */
function displayName(value: string) {
  return value.replace(/[\u0000-\u001F\u007F"<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

function withReplyTo(transporter: NonNullable<Sender["transporter"]>, replyTo: string | null) {
  if (!replyTo) return transporter;
  const sendMail = transporter.sendMail.bind(transporter);
  return Object.assign(Object.create(transporter) as typeof transporter, {
    sendMail: (options: Parameters<typeof sendMail>[0]) => sendMail({ replyTo, ...options }),
  });
}

/**
 * The organisation's own server, connected by the public address its host
 * resolves to (never a private one), with TLS checked against the host name.
 */
export async function organisationTransport(server: { organisationId: string; host: string; port: number; secure: boolean; user: string | null; passwordEncrypted: string | null; }) {
  const address = await resolvePublicAddress(server.host);
  const production = process.env.NODE_ENV === "production";
  const password = server.passwordEncrypted ? decryptOrgSecret(server.organisationId, ORG_SMTP_PASSWORD_SLOT, server.passwordEncrypted) : null;
  return nodemailer.createTransport({
    host: address, port: server.port, secure: server.secure,
    auth: server.user && password ? { user: server.user, pass: password } : undefined,
    requireTLS: !server.secure && production,
    tls: { servername: server.host, minVersion: "TLSv1.2", rejectUnauthorized: production },
    disableFileAccess: true, disableUrlAccess: true,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  });
}

/**
 * The transport for the email being sent. Platform email (sign-up, forgot
 * password, super-admin notices) always uses the platform server. An
 * organisation's email uses its own server when it has one switched on;
 * otherwise the platform server, under the organisation's name and reply-to.
 */
export async function getEmailTransport(): Promise<Sender> {
  const organisationId = sendingScope.getStore()?.organisationId ?? null;
  if (!organisationId) return getPlatformTransport();
  const organisation = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { name: true, emailSettings: { select: { fromName: true, replyTo: true, useOwnServer: true, fromAddress: true, smtpHost: true, smtpPort: true, smtpSecure: true, smtpUser: true, smtpPasswordEncrypted: true } } },
  });
  if (!organisation) return getPlatformTransport();
  const settings = organisation.emailSettings;
  const name = displayName(settings?.fromName || organisation.name) || "Space Works Events";
  const replyTo = settings?.replyTo ?? null;
  // An organisation's own server doesn't depend on the platform server being usable.
  if (settings?.useOwnServer && settings.smtpHost && settings.smtpPort && settings.fromAddress) {
    const transporter = await organisationTransport({ organisationId, host: settings.smtpHost, port: settings.smtpPort, secure: settings.smtpSecure, user: settings.smtpUser, passwordEncrypted: settings.smtpPasswordEncrypted });
    return { from: { name, address: settings.fromAddress }, transporter: withReplyTo(transporter, replyTo) };
  }
  const platform = await getPlatformTransport();
  return {
    from: { name, address: senderAddress(typeof platform.from === "string" ? platform.from : platform.from.address) },
    transporter: platform.transporter ? withReplyTo(platform.transporter, replyTo) : null,
  };
}

/**
 * The platform's own server, built fresh for each send from settings read at
 * send time. There is deliberately no module-level cache: a super-admin change
 * applies on the next send on every replica and worker without a restart.
 */
export async function getPlatformTransport(options: { timeoutMs?: number; } = {}): Promise<Sender & { source: ConfigSource; }> {
  const settings = await getEmailSettings();
  const production = process.env.NODE_ENV === "production";
  // Same explicit CI/staging bypass as lib/env.ts (e.g. Mailpit on plain port
  // 1025). Real production always requires verified TLS 1.2+.
  const insecureCiTest = process.env.CI === "true" && process.env.ALLOW_INSECURE_PRODUCTION_TESTS === "1";
  const enforceTls = production && !insecureCiTest;
  const tls = enforceTls ? { minVersion: "TLSv1.2" as const, rejectUnauthorized: true } : undefined;
  const requireTLS = enforceTls && !settings.secure;
  if (!settings.service && !settings.host) {
    if (production) throw new EmailTransportUnavailableError();
    return { from: settings.from, transporter: null, source: settings.source };
  }
  const auth = settings.user && settings.password ? { user: settings.user, pass: settings.password } : undefined;
  // Production SMTP is authenticated unless a private relay was explicitly allowed.
  if (production && !auth && !settings.allowUnauthenticated) throw new EmailTransportUnavailableError();
  const timeouts = {
    connectionTimeout: Math.min(options.timeoutMs ?? SMTP_CONNECTION_TIMEOUT_MS, SMTP_CONNECTION_TIMEOUT_MS),
    greetingTimeout: Math.min(options.timeoutMs ?? SMTP_GREETING_TIMEOUT_MS, SMTP_GREETING_TIMEOUT_MS),
    socketTimeout: Math.min(options.timeoutMs ?? SMTP_SOCKET_TIMEOUT_MS, SMTP_SOCKET_TIMEOUT_MS),
  };
  const common = { auth, disableFileAccess: true, disableUrlAccess: true, requireTLS, tls, ...timeouts };
  return {
    from: settings.from,
    source: settings.source,
    transporter: settings.service
      ? nodemailer.createTransport({ service: settings.service, ...common })
      : nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.secure, ...common }),
  };
}
