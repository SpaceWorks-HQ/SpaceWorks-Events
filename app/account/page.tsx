import { loadAccountView } from "@/lib/views/app__account__page";
import type { Metadata } from "next";
import { gravatarUrl } from "@/lib/gravatar";
import { AccountProfileForm } from "@/components/account/AccountProfileForm";
import { AccountEmailCard } from "@/components/account/AccountEmailCard";
import { AccountAppearanceCard } from "@/components/account/AccountAppearanceCard";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountPage() {
  const { user } = await loadAccountView();
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
        canResend={user.hasPassword}
      />
      <AccountAppearanceCard />
    </div>
  );
}
