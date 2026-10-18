import { loadOpenGraphImage } from "@/lib/views/app__orgSlug__eventSlug__opengraph-image";
import { shareCardResponse } from "@/lib/og/shareCard";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Space Works Events event preview";

export default async function OpenGraphImage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string; }>; }) {
  const { card } = await loadOpenGraphImage({ params });
  return shareCardResponse(card);
}
