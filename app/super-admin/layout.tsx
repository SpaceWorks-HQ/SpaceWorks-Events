import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { SuperAdminTopBar } from "@/components/super-admin/SuperAdminTopBar";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Super admin", robots: { index: false, follow: false } };

// These pages require an authenticated database-backed session and must never
// be rendered during the build with placeholder database credentials.
export const dynamic = "force-dynamic";

export default async function SuperAdminLayout(props: {
  children: React.ReactNode;
}) {
  const session = await requireSuperAdminMfa();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, image: true, profileImageUrl: true },
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <SuperAdminTopBar user={{ name: user?.name ?? null, email: user?.email ?? null, image: user?.profileImageUrl ?? user?.image ?? null }} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1200px] flex-1 px-4 py-6 focus:outline-none sm:px-6 md:py-9">
        {props.children}
      </main>
    </div>
  );
}
