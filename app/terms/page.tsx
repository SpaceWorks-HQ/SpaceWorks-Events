import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for organising, registering for and attending free events on this Yuyu instance.",
};

const sections: LegalSection[] = [
  {
    id: "about-these-terms",
    title: "About these terms",
    body: [
      "These terms apply when you use this Yuyu instance, whether you create an account, join an organisation, register for an event as a guest or simply browse. By using it, you agree to them.",
      "Yuyu is open-source software. This instance is run by an organisation called the “operator”. Events are created by clubs, groups and teams called “organisers”. The operator runs the service. Each organiser runs its own events.",
      "Organisers may add their own rules for their events, such as a code of conduct. Those rules apply to their events alongside these terms.",
    ],
  },
  {
    id: "free-events",
    title: "Free events only",
    body: "Yuyu is built for free events. It does not sell tickets, take payments or charge fees, and organisers must not use it to collect payment or to sell or resell tickets. Any arrangement made outside Yuyu, such as a donation or a membership fee, is between you and the organiser.",
  },
  {
    id: "who-can-use-it",
    title: "Who can use Yuyu",
    body: "You must be old enough to agree to these terms where you live, or have permission from a parent or guardian. You must give accurate information and must not pretend to be someone else. If you use Yuyu for a club or organisation, you confirm you are allowed to act for it.",
  },
  {
    id: "your-account",
    title: "Your account",
    body: [
      "Keep your password private and use a strong, unique one. We recommend turning on multi-factor authentication. You are responsible for what happens through your account. Tell the operator straight away if you think someone else has used it.",
      "You do not need an account to register for most events. Some invite-only events require you to sign in with the email address you were invited with.",
    ],
  },
  {
    id: "registering-and-attending",
    title: "Registering for and attending events",
    body: [
      "When you register, you are dealing with the organiser, not the operator. The organiser decides who can attend, how many places there are, whether registrations need approval, and what happens if an event changes or is cancelled. A waitlist place does not guarantee you a spot.",
      "Your ticket link and QR code are personal. Anyone who has them can show your ticket at the door, so do not share them. Cancel your registration if you can no longer attend so someone else can take your place.",
      "When you attend, follow the organiser’s instructions, the venue’s rules and any code of conduct. The organiser may refuse entry or remove you under its own rules.",
    ],
  },
  {
    id: "organisers",
    title: "If you organise events",
    body: [
      "You are responsible for your events and everything you publish or send through Yuyu, including event details, registration questions, invitations, speaker profiles, emails, feedback forms, certificates and badges. Keep event information accurate and update guests promptly if plans change.",
      "Ask only for the information you need. Tell guests why you are asking, especially for sensitive details such as dietary or accessibility needs, and follow the privacy laws that apply to you. Get permission before publishing information or photos of speakers or other people.",
      "Use guest lists and exports only to run your events, keep them secure, and delete them when you no longer need them. Send emails only to people registered for your event, and only about that event.",
      "You are responsible for the safety and running of your event, including the venue, accessibility, any permits, and any separate code of conduct.",
    ],
  },
  {
    id: "teams-and-access",
    title: "Teams, door stations and API access",
    body: [
      "Organisation owners decide who joins their team and what each person can do, and are responsible for their actions. Remove access promptly when someone leaves. Deleting an organisation permanently deletes its events, guest lists and feedback.",
      "Share door station PINs only with volunteers working at the event. Keep API credentials secret, give them only the access they need, and revoke them if they may have been exposed.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: [
      "Do not use Yuyu to break the law, harass or harm others, publish hateful, misleading, sexually explicit or infringing content, or create events that are fake or put people at risk.",
      "Do not send spam or emails unrelated to an event, collect guests’ information for other purposes, try to access another organisation’s data, get around security or rate limits, upload malware, overload the service, or scrape it.",
    ],
  },
  {
    id: "your-content",
    title: "Your content",
    body: "You keep ownership of what you submit, such as event pages, images, registration answers and feedback. You give the operator permission to store, display, process and send that content only to run the service and the events you take part in. You confirm you have the right to share it. The operator may remove content that breaks these terms or the law.",
  },
  {
    id: "certificates",
    title: "Certificates",
    body: "Certificates are issued by organisers, based on their own registration and check-in records. They are not issued or verified by the operator or by Yuyu, and are not a formal qualification unless the organiser says otherwise.",
  },
  {
    id: "the-service",
    title: "The service",
    body: [
      "The operator works to keep Yuyu available and secure, but it is provided “as is” and “as available”. Features may change, and the service may sometimes be unavailable for maintenance or for reasons outside the operator’s control. Keep your own copy of anything important, such as your guest list.",
      "Yuyu’s source code is published under its open-source licence. That licence governs your use of the code. These terms govern your use of this instance.",
    ],
  },
  {
    id: "suspension-and-ending",
    title: "Suspension and ending",
    body: "You can stop using Yuyu at any time. To delete your account, contact the operator. The operator may suspend or remove an account, organisation or event that breaks these terms, puts people or the service at risk, or must be removed by law. Where it is reasonable, the operator will explain why.",
  },
  {
    id: "liability",
    title: "Disclaimers and liability",
    body: [
      "As far as the law allows, the operator gives no warranties about the service, and is not responsible for events, for what organisers or guests do, or for any indirect loss. The operator’s total liability is limited as far as the law allows.",
      "Nothing in these terms limits liability that the law does not allow to be limited, or removes rights you have as a consumer.",
    ],
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: "The operator may update these terms when the service or the law changes. The date at the top of this page shows when they last changed. Significant changes will be announced where reasonable. If you keep using Yuyu after a change takes effect, you accept the updated terms.",
  },
  {
    id: "law-and-contact",
    title: "Governing law and contact",
    body: "These terms are governed by the laws of the place where the operator is based, unless the law where you live gives you other rights. For questions about these terms, your account or the privacy policy, contact the operator. For questions about a particular event, contact its organiser.",
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      current="terms"
      title="Terms of use"
      updated="15 October 2026"
      notice="These terms are a starting point for any Yuyu instance. Each operator must add its legal name, contact details, governing law and how disputes are handled, and should have them reviewed by a lawyer. They are not legal advice."
      sections={sections}
    />
  );
}
