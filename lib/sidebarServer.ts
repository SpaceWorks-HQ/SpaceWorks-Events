import "server-only";

import { cookies } from "next/headers";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "@/lib/sidebar";

/** Whether the person collapsed the dashboard sidebar (read on the server so the first render matches). */
export async function isSidebarCollapsed() {
  return (await cookies()).get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED;
}
