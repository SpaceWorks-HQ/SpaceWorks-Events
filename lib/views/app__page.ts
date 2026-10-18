import { auth } from "@/lib/auth";

export async function loadView() {
  const session = await auth();
  const getStartedHref = session?.user ? "/dashboard" : "/login";
  return { getStartedHref };
}
