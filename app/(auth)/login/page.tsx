import { Suspense } from "react";
import { connection } from "next/server";
import { LoginForm } from "./ui";
import { YuyuWordmark } from "@/components/chrome/SiteHeader";
import { DotMark } from "@/components/brand/DotMark";
import { getGoogleSsoSettings, isNewUserRegistrationEnabled } from "@/lib/instanceSettings";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage() {
  // The public registration policy is an instance setting and must be read
  // only for a real request, never from a build-time database.
  await connection();
  const [accountCreationEnabled, googleSsoConfigured] = await Promise.all([
    isNewUserRegistrationEnabled(),
    getGoogleSsoSettings().then(Boolean),
  ]);
  return (
    <div className="grid min-h-dvh bg-canvas md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-4 py-5 sm:px-8 sm:py-6">
        <header>
          <YuyuWordmark />
        </header>
        <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center py-10 focus:outline-none">
          <div className="flex w-full max-w-[400px] flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-display-l text-ink">Welcome back.</h1>
              <p className="text-body-ui text-ink-secondary">
                Sign in with Google or your email and password. New here? Create an account in seconds.
              </p>
            </div>
            <Suspense fallback={<p className="text-body-ui text-ink-muted">Loading sign in…</p>}>
              <LoginForm accountCreationEnabled={accountCreationEnabled} googleSsoConfigured={googleSsoConfigured} />
            </Suspense>
          </div>
        </main>
      </div>

      <aside aria-hidden className="relative hidden overflow-hidden p-4 md:block">
        <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[28px] bg-tint-peach p-12">
          <p className="max-w-[440px] font-display text-[40px] font-extrabold leading-[1.02] tracking-[-0.03em] text-ink">
            Free events.
            <br />
            Your community’s data stays yours.
          </p>
          <DotMark size={192} label={null} className="self-end" />
        </div>
      </aside>
    </div>
  );
}
