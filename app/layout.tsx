import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/figtree/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ChromeSwitch } from "@/components/chrome/ChromeSwitch";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { COLOR_MODE_COOKIE, isColorMode } from "@/lib/colorMode";

export const metadata: Metadata = {
  title: {
    default: "Yuyu — Events",
    template: "%s · Yuyu",
  },
  description: "Create organisations, publish events, and collect RSVPs.",
  // The installed app's name on every platform (Android reads the manifest; iOS reads these).
  applicationName: "Yuyu",
  appleWebApp: { capable: true, title: "Yuyu", statusBarStyle: "default" },
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  // Default social card for Yuyu's own pages; event pages set their own image.
  openGraph: { siteName: "Yuyu", images: [{ url: "/brand/og-default.png", width: 1200, height: 630, alt: "Yuyu" }] },
  twitter: { card: "summary_large_image", images: ["/brand/og-default.png"] },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // A per-request CSP nonce is injected by proxy.ts. Waiting for the incoming
  // request lets Next.js attach that nonce to every framework script.
  await connection();
  const savedColorMode = (await cookies()).get(COLOR_MODE_COOKIE)?.value;
  // No saved choice: omit the attribute so the tokens follow the operating system.
  const initialColorMode = isColorMode(savedColorMode) ? savedColorMode : null;

  return (
    <html lang="en" data-color-mode={initialColorMode ?? undefined} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
          <Providers initialColorMode={initialColorMode}>
            <ChromeSwitch>{children}</ChromeSwitch>
          </Providers>
      </body>
    </html>
  );
}
