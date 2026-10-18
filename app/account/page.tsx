import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { gravatarUrl } from "@/lib/gravatar";
import { AccountProfileForm } from "@/components/account/AccountProfileForm";
import { AccountEmailCard } from "@/components/account/AccountEmailCard";
import { AccountAppearanceCard } from "@/components/account/AccountAppearanceCard";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountPage() {
  const session = await requireAuth();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { name: true, email: true, image: true, profileImageUrl: true, emailVerified: true, passwordHash: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <AccountProfileForm
        initialName={user.name ?? ""}
        email={user.email}
        image={user.image}
        profileImageUrl={user.profileImageUrl}
        gravatarUrl={user.email ? gravatarUrl(user.email) : null}
      />
      <AccountEmailCard
        email={user.email}
        verified={Boolean(user.emailVerified)}
        // Resending only applies to password accounts (see resendEmailVerification); only a boolean leaves the server.
        canResend={Boolean(user.passwordHash)}
      />
      <AccountAppearanceCard />
    </div>
  );
}
