import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ChromeSwitch } from "@/components/chrome/ChromeSwitch";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { COLOR_MODE_COOKIE, isColorMode } from "@/lib/colorMode";

export const metadata: Metadata = {
  title: {
    default: "Space Works Events",
    template: "%s · Space Works Events",
  },
  description: "Create organisations, publish events, and collect RSVPs.",
  // The installed app's name on every platform (Android reads the manifest; iOS reads these).
  applicationName: "Space Works Events",
  // iOS shows this under the home-screen icon, where long names are cut off.
  appleWebApp: { capable: true, title: "SW Events", statusBarStyle: "default" },
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  // Default social card for Space Works Events' own pages; event pages set their own image.
  openGraph: { siteName: "Space Works Events", images: [{ url: "/brand/og-default.png", width: 1200, height: 630, alt: "Space Works" }] },
  twitter: { card: "summary_large_image", images: ["/brand/og-default.png"] },
};

// Browser chrome matches the page canvas: Warm Cream in light mode, Deep Ink in dark.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF4E8" },
    { media: "(prefers-color-scheme: dark)", color: "#142C2A" },
  ],
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
