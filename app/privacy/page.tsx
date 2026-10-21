import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal information this Space Works Events site collects, why, who can see it, how long it is kept and the choices you have.",
};

const sections: LegalSection[] = [
  {
    id: "who-is-responsible",
    title: "Who is responsible",
    body: [
      "Space Works Events is open-source event software from Space Works that anyone can run on their own server. In this policy, the “operator” is the organisation that runs this Space Works Events site, and “organisers” are the clubs, groups and teams that create events on it.",
      "The operator of this site is [Operator legal name — to be filled in by the operator], who can be contacted at [operator contact email — to be filled in by the operator].",
      "The operator is responsible for accounts, security and the running of this site. Each organiser is responsible for the information it asks for and uses to run its own events, such as its registration questions, guest lists and event emails. Depending on where you live, the law may call the operator and the organiser a “controller” or a “data fiduciary” for that information.",
      "The people who build the Space Works Events software do not receive the information stored on this site, unless they are also its operator.",
    ],
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    body: [
      "Account details. If you create an account, we store your name, email address and whether it has been verified, your password as a one-way hash, an optional profile picture, and your multi-factor authentication settings. If you sign in with Google, we receive your name, email address, profile picture and Google account identifier. We do not keep Google access tokens for new sign-ins.",
      "Registrations. When you register for an event, with or without an account, we store your name, email address, registration status (such as confirmed, waitlisted, pending approval or rejected), your answers to the organiser’s questions, your ticket and when you checked in. Organisers choose their own questions, which can include a phone number, dietary or accessibility needs, and similar details.",
      "Organisations and teams. We store who belongs to each organisation and their role, event co-organisers and their permissions, invitations including the invited email address, and who checked each guest in.",
      "Feedback and certificates. If you answer a feedback form, we store your answers. Organisers can make feedback anonymous. When a form also issues certificates, you give the email address you registered with so the certificate can show your name.",
      "Information about other people. Organisers can publish speaker profiles with a name, photo, headline, biography and links, and can add guests to a list by hand. Organisers must have permission to share that information.",
      "Orders and payments. If you buy a ticket, we store the order: your name and email address, the tickets and extras you chose, prices, any promo code, the amount paid and refunded, the payment provider's reference, and a short description of how you paid, such as the card brand and last four digits or UPI. We never see or store full card, UPI or bank details: you enter them on the organiser's Razorpay or Stripe page.",
      "Uploads. Event covers, logos, speaker photos and profile pictures are checked, resized and re-encoded, and hidden metadata such as camera details and location is removed before they are stored.",
      "Sign-in security. To recognise new devices, your browser keeps a random identifier, and we store a one-way hash of it with a short description of the browser and the network address it last signed in from. Repeated failed sign-ins are counted for a short time to block attacks. When you choose a new password, we check it against a breach database by sending only the first five characters of a one-way hash of it, never the password.",
      "Technical and security information. Your IP address is used briefly to limit repeated requests and prevent abuse. It is not stored in our database. We keep an activity log of important actions, such as sign-ins, role changes, exports and check-ins, recording who did what and when.",
    ],
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: [
      "We use this information to run the service: to create and secure your account, publish events, take registrations, manage capacity and waitlists, issue tickets, check guests in, send event emails, collect feedback, issue certificates, and investigate security or technical problems.",
      "We process it because it is needed to provide the service you asked for, because we and the organiser have a legitimate interest in running safe and well-organised events, because you gave your consent (for example, to an optional registration question), or because the law requires it.",
      "Space Works Events does not sell personal information, does not show ads, does not take a share of ticket payments and does not build advertising profiles. Waitlists are handled automatically in the order people registered, but no decision with legal or similarly significant effects is made about you by automated means.",
    ],
  },
  {
    id: "who-can-see-it",
    title: "Who can see your information",
    body: [
      "Organisers. People with the right role in the organisation hosting an event can see its guest list, registration answers, check-in records and feedback, and can download them as spreadsheets. Organisers decide who on their team has that access. Any member of an organisation may see the first names of recent guests on its dashboard.",
      "Door volunteers. Volunteers using a PIN-locked door station can look up and check in guests for that one event. They cannot download the guest list.",
      "Connected tools. An organisation can connect its own tools through the Space Works Events API. These can read event details and, if allowed, the display names, registration times and check-in times of confirmed guests. They never receive email addresses or registration answers.",
      "The operator. The operator’s administrators can see account and organisation details to support and protect the site. Registration answers, passwords and tickets are not shown in these tools.",
      "The public. Public event pages show only what the organiser publishes, such as event details, speakers and, if the organiser chooses, the number of people registered. Guest names are never shown publicly. Public organisation pages show a member count, not member names. Ticket, invitation and password-reset pages are not listed in search engines.",
    ],
  },
  {
    id: "service-providers",
    title: "Service providers and third parties",
    body: [
      "The operator uses providers to run this site, such as a hosting provider, file storage, a database, a cache used for rate limiting, an email provider and backups. These providers handle information only to provide their service.",
      "Google. If you sign in with Google, Google shares your basic profile with us. Event pages with a venue show an embedded Google Map, and confirmation emails include an “Add to Google Calendar” link. When these load or are used, Google receives your IP address and the venue or event details under its own privacy policy.",
      "Payment providers. When you buy a ticket, the organiser's own Razorpay or Stripe account processes the payment under that provider's privacy policy. We send the provider the order amount, a reference and your email address for the receipt, and receive back the payment's status and how it was paid.",
      "Organisers' own services. An organiser may send its event email through its own mail server, and may connect team chats (Slack, Discord, Mattermost, Telegram or WhatsApp) that receive short notices such as a new registration with the guest's name. Those services handle that information under the organiser's arrangements with them.",
      "Have I Been Pwned. New passwords are checked against its breach database using only the first five characters of a one-way hash, so the password itself never leaves this site.",
      "Gravatar. Your account page may show your Gravatar picture. To do this, your browser sends Gravatar a one-way hash of your email address.",
      "We may also share information where the law requires it, or to protect the safety and rights of people using the service.",
    ],
  },
  {
    id: "cookies-and-device-storage",
    title: "Cookies and storage on your device",
    body: [
      "We use only the cookies needed to run the service: a sign-in cookie, security cookies that protect forms, a cookie that remembers an organiser's authenticator check for up to 12 hours, and a cookie that keeps a door station unlocked until shortly after the event. We also remember your light or dark theme and sidebar preference for up to a year.",
      "Your browser keeps a random device identifier so we can recognise a sign-in from a new device. It isn't used for anything else.",
      "After you register, your browser remembers your ticket for that event so the page can show it again. Cancelling removes it. If an organiser downloads a guest list for offline check-in, it is kept on their device for up to 24 hours and then deleted.",
      "We do not use advertising or cross-site tracking cookies.",
      "When someone opens an event's short link, we add one to that event's count for the day. Only the number is kept: not your IP address, browser, the page you came from or who you are. Link previews in chat apps are not counted.",
    ],
  },
  {
    id: "emails",
    title: "Emails we send",
    body: [
      "We send emails needed for the service: registration confirmations with your ticket and a calendar file, updates when your registration is approved, rejected or moved off the waitlist, event invitations, co-organiser invitations, password resets and email verification, event reminders, payment links, receipts and refund notices, sign-in codes for unusual sign-ins, alerts when your account is signed in to from a new device, and notices when your password changes.",
      "Organisers can also email the people registered for their events, for example reminders, schedule changes, a thank-you note or a link to slides. These emails are about events you registered for. To stop receiving them, cancel your registration or contact the organiser.",
    ],
  },
  {
    id: "sensitive-information",
    title: "Sensitive information",
    body: [
      "Some registration questions, such as dietary or accessibility needs, can reveal information about your health or beliefs. Answer only what you are comfortable sharing. Optional questions can be left blank.",
      "Organisers should ask only for what they need to run the event, explain why they are asking, and limit who on their team can see the answers.",
    ],
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: [
      "Password-reset and email-verification links expire after one hour. Unused team invitations expire after seven days. Copies of sent emails are deleted after 30 days by default, and those containing ticket or sign-in links are deleted as soon as they are sent.",
      "Sign-in codes expire after 10 minutes and are used once. The devices your account signed in from are kept until the account is deleted. Orders, payments and refunds are kept as financial records after a registration is cancelled, so organisers can account for them.",
      "Accounts, registrations, feedback and activity logs are kept until they are deleted by you, the organiser or the operator. If you cancel a registration before checking in, it is deleted. If an organisation is deleted, its events, guest lists and feedback are deleted with it.",
      "Backups may hold copies of deleted information for a limited time, as set by the operator. Ask the operator or organiser about their retention schedule.",
    ],
  },
  {
    id: "security",
    title: "Security",
    body: [
      "Space Works Events keeps each organisation’s data separate, limits access by role, stores passwords as strong one-way hashes, supports authenticator-app multi-factor authentication, encrypts sensitive settings, keeps files in private storage, limits repeated requests and records important actions.",
      "Ticket, invitation and password-reset links work like keys. Do not share them. No system is perfectly secure. The operator is responsible for configuring its servers, backups and access securely, and for telling people about a data breach where the law requires it.",
    ],
  },
  {
    id: "your-rights-and-choices",
    title: "Your rights and choices",
    body: [
      "If you have an account, you can update your name and picture, change your password, turn on multi-factor authentication, sign out of all devices, leave an organisation, cancel a registration and download a copy of your account data from your account settings.",
      "Depending on where you live, you may also have the right to access, correct, delete or restrict the use of your information, to object to its use, to withdraw consent, to move it elsewhere, to nominate someone to act for you, and to complain to a data protection authority.",
      "To delete your account, or for anything about a specific event, contact the operator or the event’s organiser. They will respond as required by the laws that apply to them. We may need to confirm who you are first.",
    ],
  },
  {
    id: "children",
    title: "Children",
    body: "Space Works Events is not designed for children. If you are below the age at which you can consent to the use of your personal information where you live, a parent or guardian should register for you. Organisers running events for children are responsible for obtaining any parental consent the law requires.",
  },
  {
    id: "international-transfers",
    title: "Where your information is stored",
    body: "Your information is stored where the operator hosts this site and its providers. If that is outside your country, the operator is responsible for protecting the transfer as the law requires.",
  },
  {
    id: "changes-to-this-policy",
    title: "Changes to this policy",
    body: "We may update this policy when the service or the way it handles information changes. The date at the top of this page shows when it last changed. If a change is significant, the operator will tell users where the law requires it.",
  },
  {
    id: "contact",
    title: "Contact",
    body: "For questions or requests about your information, contact the operator at [operator contact email — to be filled in by the operator]. For anything about a particular event, contact the organiser shown on the event page.",
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      current="privacy"
      title="Privacy"
      updated="21 October 2026"
      notice="This policy describes how Space Works Events handles personal information. Each operator must replace the bracketed placeholders with its own name and contact details, add its hosting providers, retention periods and the laws that apply to it, and should have it reviewed by a lawyer. It is not legal advice."
      sections={sections}
    />
  );
}
