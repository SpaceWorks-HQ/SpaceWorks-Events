import { auth } from "@/lib/auth";

export async function loadView() {
  const session = await auth();
  return { session };
}
