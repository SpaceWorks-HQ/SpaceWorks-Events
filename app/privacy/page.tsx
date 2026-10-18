import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal information this Yuyu instance collects, why, who can see it, how long it is kept and the choices you have.",
};

const sections: LegalSection[] = [
  {
    id: "who-is-responsible",
    title: "Who is responsible",
    body: [
      "Yuyu is open-source event software that anyone can run on their own server. In this policy, the “operator” is the organisation that runs this Yuyu instance, and “organisers” are the clubs, groups and teams that create events on it.",
      "The operator is responsible for accounts, security and the running of this instance. Each organiser is responsible for the information it asks for and uses to run its own events, such as its registration questions, guest lists and event emails. Depending on where you live, the law may call the operator and the organiser a “controller” or a “data fiduciary” for that information.",
      "The people who build the Yuyu software do not receive the information stored on this instance.",
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
      "Uploads. Event covers, logos, speaker photos and profile pictures are checked, resized and re-encoded, and hidden metadata such as camera details and location is removed before they are stored.",
      "Technical and security information. Your IP address is used briefly to limit repeated requests and prevent abuse. It is not stored in our database. We keep an activity log of important actions, such as sign-ins, role changes, exports and check-ins, recording who did what and when.",
    ],
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: [
      "We use this information to run the service: to create and secure your account, publish events, take registrations, manage capacity and waitlists, issue tickets, check guests in, send event emails, collect feedback, issue certificates, and investigate security or technical problems.",
      "We process it because it is needed to provide the service you asked for, because we and the organiser have a legitimate interest in running safe and well-organised events, because you gave your consent (for example, to an optional registration question), or because the law requires it.",
      "Yuyu does not sell personal information, does not show ads, does not take payments and does not build advertising profiles. Waitlists are handled automatically in the order people registered, but no decision with legal or similarly significant effects is made about you by automated means.",
    ],
  },
  {
    id: "who-can-see-it",
    title: "Who can see your information",
    body: [
      "Organisers. People with the right role in the organisation hosting an event can see its guest list, registration answers, check-in records and feedback, and can download them as spreadsheets. Organisers decide who on their team has that access. Any member of an organisation may see the first names of recent guests on its dashboard.",
      "Door volunteers. Volunteers using a PIN-locked door station can look up and check in guests for that one event. They cannot download the guest list.",
      "Connected tools. An organisation can connect its own tools through the Yuyu API. These can read event details and, if allowed, the display names, registration times and check-in times of confirmed guests. They never receive email addresses or registration answers.",
      "The operator. The operator’s administrators can see account and organisation details to support and protect the instance. Registration answers, passwords and tickets are not shown in these tools.",
      "The public. Public event pages show only what the organiser publishes, such as event details, speakers and, if the organiser chooses, the number of people registered. Guest names are never shown publicly. Public organisation pages show a member count, not member names. Ticket, invitation and password-reset pages are not listed in search engines.",
    ],
  },
  {
    id: "service-providers",
    title: "Service providers and third parties",
    body: [
      "The operator uses providers to run this instance, such as a hosting provider, file storage, a database, a cache used for rate limiting, an email provider and backups. These providers handle information only to provide their service.",
      "Google. If you sign in with Google, Google shares your basic profile with us. Event pages with a venue show an embedded Google Map, and confirmation emails include an “Add to Google Calendar” link. When these load or are used, Google receives your IP address and the venue or event details under its own privacy policy.",
      "Gravatar. Your account page may show your Gravatar picture. To do this, your browser sends Gravatar a one-way hash of your email address.",
      "We may also share information where the law requires it, or to protect the safety and rights of people using the service.",
    ],
  },
  {
    id: "cookies-and-device-storage",
    title: "Cookies and storage on your device",
    body: [
      "We use only the cookies needed to run the service: a sign-in cookie, security cookies that protect forms, a short-lived cookie for administrator verification, and a cookie that keeps a door station unlocked until shortly after the event. We also remember your light or dark theme and sidebar preference for up to a year.",
      "After you register, your browser remembers your ticket for that event so the page can show it again. Cancelling removes it. If an organiser downloads a guest list for offline check-in, it is kept on their device for up to 24 hours and then deleted.",
      "We do not use advertising or cross-site tracking cookies.",
    ],
  },
  {
    id: "emails",
    title: "Emails we send",
    body: [
      "We send emails needed for the service: registration confirmations with your ticket and a calendar file, updates when your registration is approved, rejected or moved off the waitlist, event invitations, co-organiser invitations, password resets and email verification.",
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
      "Accounts, registrations, feedback and activity logs are kept until they are deleted by you, the organiser or the operator. If you cancel a registration before checking in, it is deleted. If an organisation is deleted, its events, guest lists and feedback are deleted with it.",
      "Backups may hold copies of deleted information for a limited time, as set by the operator. Ask the operator or organiser about their retention schedule.",
    ],
  },
  {
    id: "security",
    title: "Security",
    body: [
      "Yuyu keeps each organisation’s data separate, limits access by role, stores passwords as strong one-way hashes, supports authenticator-app multi-factor authentication, encrypts sensitive settings, keeps files in private storage, limits repeated requests and records important actions.",
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
    body: "Yuyu is not designed for children. If you are below the age at which you can consent to the use of your personal information where you live, a parent or guardian should register for you. Organisers running events for children are responsible for obtaining any parental consent the law requires.",
  },
  {
    id: "international-transfers",
    title: "Where your information is stored",
    body: "Your information is stored where the operator hosts this instance and its providers. If that is outside your country, the operator is responsible for protecting the transfer as the law requires.",
  },
  {
    id: "changes-to-this-policy",
    title: "Changes to this policy",
    body: "We may update this policy when the service or the way it handles information changes. The date at the top of this page shows when it last changed. If a change is significant, the operator will tell users where the law requires it.",
  },
  {
    id: "contact",
    title: "Contact",
    body: "For questions or requests about your information, contact the operator of this instance. For anything about a particular event, contact the organiser shown on the event page.",
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      current="privacy"
      title="Privacy"
      updated="15 October 2026"
      notice="This policy describes how Yuyu handles personal information. Each operator must add its own name, contact details, hosting providers, retention periods and the laws that apply to it, and should have it reviewed by a lawyer. It is not legal advice."
      sections={sections}
    />
  );
}
