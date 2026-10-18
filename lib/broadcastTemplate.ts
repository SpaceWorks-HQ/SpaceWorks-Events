import type { BroadcastAttendanceFilter, RsvpStatus } from "@prisma/client";
import { safeTimeZone } from "@/lib/timeZone";

/**
 * Shared (server and browser) helpers for organiser email broadcasts.
 *
 * Subjects are plain text. Bodies are a restricted HTML subset produced by the
 * dashboard editor and sanitised on the server before storage. Both may contain
 * `{{placeholder}}` tokens that are resolved per recipient at delivery time.
 */

export const BROADCAST_SUBJECT_MAX = 150;
export const BROADCAST_BODY_MAX = 20000;

export const BROADCAST_PLACEHOLDERS = [
  { token: "{{name}}", label: "Attendee name", description: "The attendee's name, or “there” when none was given" },
  { token: "{{event}}", label: "Event title", description: "Event title" },
  { token: "{{eventDate}}", label: "Date & time", description: "Start date and time in the event's timezone" },
  { token: "{{location}}", label: "Location", description: "Venue, or “Online” for online events" },
  { token: "{{eventUrl}}", label: "Event page link", description: "Public event page link" },
  { token: "{{ticketLink}}", label: "Ticket link", description: "The recipient's private ticket link (confirmed registrations); otherwise the event page" },
  { token: "{{feedbackUrl}}", label: "Feedback form link", description: "The event's feedback form link (share it after opening the form)" },
  { token: "{{scheduleUrl}}", label: "Programme link", description: "The public programme and live schedule page" },
  { token: "{{organisation}}", label: "Organisation", description: "Organisation name" },
] as const;

export type BroadcastPlaceholder = (typeof BROADCAST_PLACEHOLDERS)[number]["token"];

/** Placeholders that may be used as a link or button destination. */
export const BROADCAST_URL_PLACEHOLDERS = ["ticketLink", "eventUrl", "feedbackUrl", "scheduleUrl"] as const;

export type BroadcastVariables = {
  name?: string | null;
  event: string;
  eventDate: string;
  location: string;
  eventUrl: string;
  ticketLink?: string | null;
  feedbackUrl: string;
  scheduleUrl: string;
  organisation: string;
};

export const BROADCAST_STATUS_OPTIONS: ReadonlyArray<{ value: RsvpStatus; label: string; hint: string }> = [
  { value: "CONFIRMED", label: "Confirmed", hint: "Registered with a place and a ticket" },
  { value: "WAITLISTED", label: "Waitlisted", hint: "Registered after capacity was reached" },
  { value: "PENDING_APPROVAL", label: "Pending approval", hint: "Awaiting an organiser decision" },
  { value: "REJECTED", label: "Rejected", hint: "Declined by an organiser" },
];

export const BROADCAST_ATTENDANCE_OPTIONS: ReadonlyArray<{ value: BroadcastAttendanceFilter; label: string }> = [
  { value: "ANY", label: "Everyone in the selected statuses" },
  { value: "CHECKED_IN", label: "Only people who checked in" },
  { value: "NOT_CHECKED_IN", label: "Only people who did not check in" },
];

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

function cleanName(value?: string | null) {
  const trimmed = value?.replace(CONTROL_CHARACTERS, "").trim().slice(0, 200);
  return trimmed || "there";
}

function resolveValues(variables: BroadcastVariables): Record<string, string> {
  return {
    name: cleanName(variables.name),
    event: variables.event,
    eventDate: variables.eventDate,
    location: variables.location,
    eventUrl: variables.eventUrl,
    ticketLink: variables.ticketLink || variables.eventUrl,
    feedbackUrl: variables.feedbackUrl,
    scheduleUrl: variables.scheduleUrl,
    organisation: variables.organisation,
  };
}

export function escapeBroadcastHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

/** Replace `{{token}}` placeholders in plain text (subjects). Unknown tokens stay visible so typos are caught in the preview. */
export function renderBroadcastTemplate(template: string, variables: BroadcastVariables): string {
  const values = resolveValues(variables);
  return template
    .replace(CONTROL_CHARACTERS, "")
    .replace(PLACEHOLDER_PATTERN, (match, key: string) => (key in values ? values[key]! : match));
}

/**
 * Replace placeholders inside already-sanitised HTML. Every value is
 * HTML-escaped, which is correct both for text nodes and for `href` attribute
 * values, so one pass covers `<a href="{{ticketLink}}">` and `Hello {{name}}`.
 */
export function renderBroadcastHtml(html: string, variables: BroadcastVariables): string {
  const values = resolveValues(variables);
  return html
    .replace(CONTROL_CHARACTERS, "")
    .replace(PLACEHOLDER_PATTERN, (match, key: string) => (key in values ? escapeBroadcastHtml(values[key]!) : match));
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      // fromCodePoint throws past U+10FFFF; text can come from attendee names.
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Plain-text alternative for mail clients that do not render HTML. */
export function broadcastHtmlToText(html: string): string {
  const text = html
    .replace(/\r\n?/g, "\n")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, "").trim();
      // Label and URL stay encoded here: the whole text is decoded once below,
      // and decoding twice would turn an escaped "&amp;lt;" into "<".
      return label && decodeEntities(label) !== decodeEntities(href) ? `${label} (${href})` : href;
    })
    // The editor wraps list item text in a paragraph; keep one line per bullet.
    .replace(/<\/p>\s*(?=<\/li>)/gi, "")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h2|h3|ul|ol|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatBroadcastEventDate(start: Date, timezone: string): string {
  return start.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: safeTimeZone(timezone),
    timeZoneName: "short",
  });
}

export type BroadcastStarterTemplate = {
  id: string;
  name: string;
  group: "Before the event" | "During the event" | "After the event" | "Registration";
  description: string;
  subject: string;
  bodyHtml: string;
  audience: { statuses: RsvpStatus[]; attendance: BroadcastAttendanceFilter };
};

const signature = "<p>See you there,<br>{{organisation}}</p>";

export const BROADCAST_STARTER_TEMPLATES: ReadonlyArray<BroadcastStarterTemplate> = [
  {
    id: "update",
    group: "Before the event",
    name: "General update",
    description: "A short note to everyone with a confirmed place.",
    subject: "Update about {{event}}",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>Here is an update about <strong>{{event}}</strong> on {{eventDate}} at {{location}}.</p>",
      "<p>(Write your message here.)</p>",
      '<p><a class="cta" href="{{ticketLink}}">View your ticket</a></p>',
      signature,
    ].join(""),
    audience: { statuses: ["CONFIRMED"], attendance: "ANY" },
  },
  {
    id: "reminder",
    group: "Before the event",
    name: "Reminder before the event",
    description: "Send the day before with the key details and the ticket.",
    subject: "Reminder: {{event}} is coming up",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>A quick reminder that <strong>{{event}}</strong> is almost here. We are looking forward to seeing you.</p>",
      "<ul><li><strong>When:</strong> {{eventDate}}</li><li><strong>Where:</strong> {{location}}</li></ul>",
      "<p>Have your ticket ready on your phone for a fast check-in.</p>",
      '<p><a class="cta" href="{{ticketLink}}">View your ticket</a></p>',
      "<p>Can’t make it any more? Open your ticket and cancel so someone on the waitlist can take your place.</p>",
      signature,
    ].join(""),
    audience: { statuses: ["CONFIRMED"], attendance: "ANY" },
  },
  {
    id: "thank-you",
    group: "After the event",
    name: "Thank you and feedback",
    description: "After the event, thank the people who came and ask for feedback.",
    subject: "Thank you for joining {{event}}",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>Thank you for being part of <strong>{{event}}</strong>. We hope you enjoyed it as much as we did.</p>",
      "<p>We would love to hear what worked and what we should improve. It only takes a minute.</p>",
      '<p><a class="cta" href="{{feedbackUrl}}">Share your feedback</a></p>',
      "<p>With thanks,<br>{{organisation}}</p>",
    ].join(""),
    audience: { statuses: ["CONFIRMED"], attendance: "CHECKED_IN" },
  },
  {
    id: "change",
    group: "Before the event",
    name: "Schedule or venue change",
    description: "Tell everyone who registered about a change to time or place.",
    subject: "Important change to {{event}}",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>There is a change to <strong>{{event}}</strong> that you should know about:</p>",
      "<blockquote><p>(Describe what changed and why.)</p></blockquote>",
      "<p>The updated details are:</p>",
      "<ul><li><strong>When:</strong> {{eventDate}}</li><li><strong>Where:</strong> {{location}}</li></ul>",
      '<p><a class="cta" href="{{eventUrl}}">Open the event page</a></p>',
      "<p>Sorry for any inconvenience, and thank you for your understanding.</p>",
      signature,
    ].join(""),
    audience: { statuses: ["CONFIRMED", "WAITLISTED"], attendance: "ANY" },
  },
  {
    id: "waitlist",
    group: "Registration",
    name: "Waitlist update",
    description: "Keep people on the waitlist informed about their chances.",
    subject: "Your place on the {{event}} waitlist",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>You are on the waitlist for <strong>{{event}}</strong> on {{eventDate}}.</p>",
      "<p>(Explain how likely places are to open up and what happens next.)</p>",
      "<p>If a place becomes available we will email you a ticket automatically, so there is nothing you need to do.</p>",
      '<p><a class="cta" href="{{eventUrl}}">Open the event page</a></p>',
      signature,
    ].join(""),
    audience: { statuses: ["WAITLISTED"], attendance: "ANY" },
  },
  {
    id: "know-before-you-go",
    group: "Before the event",
    name: "Know before you go",
    description: "Practical logistics for confirmed attendees: arrival, check-in, what to bring.",
    subject: "Know before you go: {{event}}",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>Here is everything you need for <strong>{{event}}</strong>.</p>",
      "<h3>When and where</h3>",
      "<ul><li><strong>Starts:</strong> {{eventDate}}</li><li><strong>Location:</strong> {{location}}</li></ul>",
      "<h3>Getting in</h3>",
      "<p>Doors open 30 minutes before the start. Have your ticket QR code ready on your phone; we scan it at the entrance.</p>",
      "<h3>What to bring</h3>",
      "<ul><li>(Photo ID, a laptop, a water bottle…)</li></ul>",
      '<p><a class="cta" href="{{ticketLink}}">View your ticket</a></p>',
      signature,
    ].join(""),
    audience: { statuses: ["CONFIRMED"], attendance: "ANY" },
  },
  {
    id: "agenda",
    group: "Before the event",
    name: "Agenda update",
    description: "Share the programme, new sessions, or timing changes.",
    subject: "The agenda for {{event}} is ready",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>The programme for <strong>{{event}}</strong> on {{eventDate}} is ready. Here are the highlights:</p>",
      "<ul><li>(Session or speaker highlight)</li><li>(Session or speaker highlight)</li><li>(Session or speaker highlight)</li></ul>",
      "<p>The full programme, including any live timing changes on the day, is always up to date online.</p>",
      '<p><a class="cta" href="{{scheduleUrl}}">See the full programme</a></p>',
      signature,
    ].join(""),
    audience: { statuses: ["CONFIRMED", "WAITLISTED"], attendance: "ANY" },
  },
  {
    id: "speakers",
    group: "Before the event",
    name: "Speaker announcement",
    description: "Introduce a newly confirmed speaker or headline session.",
    subject: "New speaker announced for {{event}}",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>We are excited to share that <strong>(Speaker name)</strong> is joining <strong>{{event}}</strong>.</p>",
      "<blockquote><p>(One or two sentences about the speaker and their session.)</p></blockquote>",
      "<p>Catch the session on {{eventDate}} at {{location}}.</p>",
      '<p><a class="cta" href="{{scheduleUrl}}">See who else is speaking</a></p>',
      signature,
    ].join(""),
    audience: { statuses: ["CONFIRMED", "WAITLISTED"], attendance: "ANY" },
  },
  {
    id: "cancelled",
    group: "Before the event",
    name: "Event cancelled",
    description: "Tell everyone who registered that the event will not go ahead.",
    subject: "{{event}} has been cancelled",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>We are sorry to let you know that <strong>{{event}}</strong>, planned for {{eventDate}}, has been cancelled.</p>",
      "<blockquote><p>(Explain why, and whether it will be rescheduled.)</p></blockquote>",
      "<p>There is nothing you need to do. If we announce a new date, you will be the first to hear about it.</p>",
      "<p>Thank you for your understanding,<br>{{organisation}}</p>",
    ].join(""),
    audience: { statuses: ["CONFIRMED", "WAITLISTED", "PENDING_APPROVAL"], attendance: "ANY" },
  },
  {
    id: "approval-update",
    group: "Registration",
    name: "Pending approval update",
    description: "Reassure people who are waiting for a decision on their registration.",
    subject: "Your registration for {{event}} is being reviewed",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>Thanks for registering for <strong>{{event}}</strong> on {{eventDate}}. Your registration is currently being reviewed.</p>",
      "<p>(Explain the review timeline and what happens next.)</p>",
      "<p>You will receive another email as soon as a decision is made. No action is needed from you right now.</p>",
      '<p><a class="cta" href="{{eventUrl}}">Open the event page</a></p>',
      signature,
    ].join(""),
    audience: { statuses: ["PENDING_APPROVAL"], attendance: "ANY" },
  },
  {
    id: "live-update",
    group: "During the event",
    name: "Live update on the day",
    description: "A short on-the-day note: room changes, delays, or a last call.",
    subject: "{{event}}: quick update",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>A quick update while <strong>{{event}}</strong> is under way:</p>",
      "<p>(Room change, delay, lunch is served, next session starting…)</p>",
      '<p><a class="cta" href="{{scheduleUrl}}">Check the live schedule</a></p>',
      "<p>{{organisation}}</p>",
    ].join(""),
    audience: { statuses: ["CONFIRMED"], attendance: "CHECKED_IN" },
  },
  {
    id: "missed-you",
    group: "After the event",
    name: "Sorry we missed you",
    description: "For confirmed people who did not check in; share what they missed.",
    subject: "Sorry we missed you at {{event}}",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>We noticed you could not make it to <strong>{{event}}</strong>. We hope everything is okay.</p>",
      "<p>(Share a short recap, recordings, or the next date.)</p>",
      '<p><a class="cta" href="{{eventUrl}}">See the event page</a></p>',
      "<p>Hope to see you next time,<br>{{organisation}}</p>",
    ].join(""),
    audience: { statuses: ["CONFIRMED"], attendance: "NOT_CHECKED_IN" },
  },
  {
    id: "resources",
    group: "After the event",
    name: "Slides and resources",
    description: "Send recordings, slides, and links to the people who attended.",
    subject: "Slides and resources from {{event}}",
    bodyHtml: [
      "<p>Hello {{name}},</p>",
      "<p>Thank you again for attending <strong>{{event}}</strong>. As promised, here are the resources from the day:</p>",
      "<ul><li>(Session title: link to slides)</li><li>(Session title: link to recording)</li><li>(Photos or a community link)</li></ul>",
      "<p>If we missed anything you were hoping for, just reply to this email.</p>",
      '<p><a class="cta" href="{{feedbackUrl}}">Tell us what you thought</a></p>',
      "<p>With thanks,<br>{{organisation}}</p>",
    ].join(""),
    audience: { statuses: ["CONFIRMED"], attendance: "CHECKED_IN" },
  },
];

export function defaultBroadcastTemplate(): { subject: string; body: string } {
  const template = BROADCAST_STARTER_TEMPLATES[0]!;
  return { subject: template.subject, body: template.bodyHtml };
}

export function describeBroadcastAudience(statuses: readonly RsvpStatus[], attendance: BroadcastAttendanceFilter): string {
  const labels = BROADCAST_STATUS_OPTIONS.filter((option) => statuses.includes(option.value)).map((option) => option.label.toLowerCase());
  const statusText = labels.length === BROADCAST_STATUS_OPTIONS.length
    ? "all registrations"
    : labels.length === 0
      ? "no registrations"
      : `${labels.join(", ")} registrations`;
  if (attendance === "CHECKED_IN") return `${statusText} who checked in`;
  if (attendance === "NOT_CHECKED_IN") return `${statusText} who did not check in`;
  return statusText;
}

/** Example values for the live preview and the organiser test email. */
export function sampleBroadcastVariables(event: {
  title: string;
  startDateTime: Date;
  timezone: string;
  location: string;
  isOnline: boolean;
  eventUrl: string;
  organisationName: string;
}, recipientName?: string | null): BroadcastVariables {
  return {
    name: recipientName ?? "Priya",
    event: event.title,
    eventDate: formatBroadcastEventDate(event.startDateTime, event.timezone),
    location: event.isOnline ? "Online" : (event.location.trim() || "the venue"),
    eventUrl: event.eventUrl,
    ticketLink: event.eventUrl,
    feedbackUrl: `${event.eventUrl}/feedback`,
    scheduleUrl: `${event.eventUrl}/schedule`,
    organisation: event.organisationName,
  };
}
