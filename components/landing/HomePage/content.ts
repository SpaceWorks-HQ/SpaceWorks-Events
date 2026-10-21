import {
  Award,
  Bug,
  CalendarClock,
  ClipboardList,
  GitPullRequest,
  IdCard,
  LayoutTemplate,
  Lightbulb,
  Link2,
  PenLine,
  ScanLine,
  Star,
  Ticket,
} from "lucide-react";
import type { Mood } from "@/components/brand/MoodTile";
import { CONTRIBUTING_URL, DISCUSSIONS_URL, GITHUB_URL, NEW_ISSUE_URL } from "@/lib/openSource";

export const steps = [
  { title: "Create the event", body: "Pick a date, a place and your colours. Add a programme, speakers and an FAQ if you need them.", icon: PenLine },
  { title: "Share one link", body: "Every event gets a short link. People register in seconds, and Space Works Events runs the waitlist.", icon: Link2 },
  { title: "Welcome them in", body: "Scan live tickets on any phone or tablet at the door, even when the workshop Wi-Fi drops.", icon: ScanLine },
  { title: "Say thank you", body: "Send a feedback form, issue certificates and download a simple report when it is over.", icon: Award },
];

export const features = [
  { title: "Event pages in your colours", body: "A page for every event, with your cover, logo, schedule, speakers, venue and FAQ.", icon: LayoutTemplate },
  { title: "Registration and waitlists", body: "Custom questions, capacity limits, approvals and automatic waitlist promotion.", icon: ClipboardList },
  { title: "Live tickets", body: "A private QR ticket that updates on the guest’s phone the moment they are checked in.", icon: Ticket },
  { title: "Check-in that works offline", body: "A desk on any phone, a PIN-locked door station for volunteers, and sync when you are back online.", icon: ScanLine },
  { title: "ID cards and badges", body: "Print a name badge or ID card with a QR code right after each check-in.", icon: IdCard },
  { title: "Short links", body: "A short link for every event that is easy to share, print on a poster and say out loud.", icon: Link2 },
  { title: "Programme and live schedule", body: "Parallel tracks, sessions and live delays that update for everyone in the room.", icon: CalendarClock },
  { title: "Feedback and certificates", body: "Quick feedback forms, and certificates you design once and issue to everyone who came.", icon: Award },
];

/** Status words people see along the way. Every status pairs a colour with a word. */
export const statuses: Array<{ pill: string; tone: string; mood: Mood; title: string; body: string }> = [
  { pill: "Registered", tone: "bg-sw-citron text-sw-ink", mood: "cheering", title: "You’re in", body: "The moment someone registers, with the ticket in their inbox." },
  { pill: "Waitlisted", tone: "bg-sw-sky text-sw-ink", mood: "waiting", title: "On the waitlist", body: "Honest about the queue, and we tell them when a spot opens." },
  { pill: "Checked in", tone: "bg-accent-soft text-ink", mood: "done", title: "Through the door", body: "A quick scan, and their ticket updates on their phone." },
  { pill: "Feedback sent", tone: "bg-sw-yellow text-sw-ink", mood: "love", title: "Thanks for coming", body: "Feedback in ten seconds, and the certificate follows." },
];

export const doorPoints = [
  "Scan QR tickets with the camera on any phone or tablet",
  "Download the guest list before doors open, then check people in offline",
  "Open a PIN-locked door station so volunteers can help without an account",
  "Print an ID card or badge for each guest as they arrive",
];

export const promises = [
  { title: "Charge your guests", body: "There are no tickets for sale, no payments and no fees. Every event here is free to attend." },
  { title: "Show ads or track people", body: "No ad trackers. Private ticket and invite links are stripped before any analytics." },
  { title: "Keep your data hostage", body: "Your community’s data lives on your server. Export your guest list whenever you like." },
  { title: "Make your guests sign up", body: "People can register as guests with just a name and email. Accounts are optional." },
];

/** What the one-line installer sets up on the server. */
export const installed = [
  ["Website and API", "Frontend and backend containers"],
  ["Database migrations", "Run by the backend on every update"],
  ["Database", "PostgreSQL 16"],
  ["Cache and rate limits", "Redis 7"],
  ["Images and files", "Silo storage, or your S3 bucket"],
  ["HTTPS", "Caddy, with automatic certificates"],
  ["Upkeep", "Backups, status, updates with rollback"],
];

export const openLinks = [
  { title: "Star the project", body: "Follow along and help other maker communities find it.", href: GITHUB_URL, Icon: Star },
  { title: "Report a bug", body: "Something not working? Open an issue with the steps to repeat it.", href: NEW_ISSUE_URL, Icon: Bug },
  { title: "Suggest an idea", body: "Tell us what your community needs in GitHub Discussions.", href: DISCUSSIONS_URL, Icon: Lightbulb },
  { title: "Contribute", body: "Read the contributing guide, then send a fix or a feature.", href: CONTRIBUTING_URL, Icon: GitPullRequest },
];

export const faqs = [
  { q: "Is Space Works Events free?", a: "Yes. It is built only for free events: there is nothing to buy and nothing to sell. If you host it yourself, you only pay for your own server." },
  { q: "Who is it for?", a: "Makerspaces, hackerspaces, workshops, build nights, campus clubs and any community that runs free events, usually with a small team of volunteers." },
  { q: "Do my guests need an account?", a: "No. Guests can register with a name and email and get their ticket by email. They can create an account later if they want one." },
  { q: "Can I run it on my own server?", a: "Yes. One command on a Linux server installs everything: the website and API, PostgreSQL, Redis, file storage and HTTPS. You only bring a domain and an SMTP provider for email. Docker images and a Helm chart are there if you prefer." },
  { q: "Is it open source?", a: "Yes. The code is public on GitHub under the AGPL-3.0 licence. Anyone can read it, report bugs, suggest ideas and send improvements." },
  { q: "What happens if the internet drops at the venue?", a: "Download the guest list before doors open and keep checking people in. Everything syncs when the connection comes back." },
];
