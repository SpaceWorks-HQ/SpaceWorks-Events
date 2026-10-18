#!/usr/bin/env node
// Seeds a local demo organiser, organisation, event and guests for development
// and visual review. Refuses to run with NODE_ENV=production.
//
//   DEMO_PASSWORD=... node --env-file-if-exists=.env scripts/seed-demo.mjs
//
// Idempotent: re-running replaces the demo organisation and users.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production") throw new Error("seed-demo is for local development only.");
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 12) throw new Error("Set DEMO_PASSWORD (12+ characters) to seed the demo organiser.");

const prisma = new PrismaClient();
const ORG_SLUG = "space-works-kochi";
const ORGANISER_EMAIL = "organiser@spaceworks.test";
const GUESTS = ["Adithya Menon", "Fathima Rahman", "Joel Thomas", "Meera Nair", "Rahul Varghese", "Sana Ali", "Vivek Pillai", "Ann Mary George"];

function daysFromNow(days, hour) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

async function main() {
  await prisma.organisation.deleteMany({ where: { slug: ORG_SLUG } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@spaceworks.test" } } });

  const passwordHash = await bcrypt.hash(password, 12);
  const organisation = await prisma.organisation.create({
    data: { name: "Space Works Kochi", slug: ORG_SLUG, description: "Maker meetups, workshops and build nights in Kochi." },
  });
  await prisma.user.create({
    data: {
      email: ORGANISER_EMAIL,
      name: "Demo Organiser",
      passwordHash,
      emailVerified: new Date(),
      memberships: { create: { organisationId: organisation.id, role: "OWNER" } },
    },
  });

  const event = await prisma.event.create({
    data: {
      organisationId: organisation.id,
      title: "Kochi Maker Night",
      slug: "kochi-maker-night",
      description: "An evening of show-and-tell, soldering and good company.",
      startDateTime: daysFromNow(10, 12),
      endDateTime: daysFromNow(10, 16),
      timezone: "Asia/Kolkata",
      location: "Space Works, Kakkanad, Kochi",
      isOnline: false,
      status: "PUBLISHED",
      privacyType: "PUBLIC",
      capacity: 60,
      page: { create: { isPublished: true } },
    },
  });

  for (const [index, name] of GUESTS.entries()) {
    const email = `${name.split(" ")[0].toLowerCase()}@spaceworks.test`;
    const guest = await prisma.user.create({ data: { email, name, passwordHash, emailVerified: new Date() } });
    await prisma.rSVP.create({
      data: {
        eventId: event.id,
        userId: guest.id,
        attendeeKey: `user:${guest.id}`,
        status: index === GUESTS.length - 1 ? "WAITLISTED" : "CONFIRMED",
        checkedInAt: index < 3 ? new Date() : null,
      },
    });
  }

  console.log(`Seeded ${ORG_SLUG}: organiser ${ORGANISER_EMAIL}, event /${ORG_SLUG}/kochi-maker-night, ${GUESTS.length} guests.`);
}

main().finally(() => prisma.$disconnect());
