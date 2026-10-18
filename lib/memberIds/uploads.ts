import "server-only";

import { managedImageKey } from "@/lib/badge/imageUrl";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { deleteFiles, getPublicUrl, uploadFile } from "@/lib/storage";

/*
 * Member photos and watermark images go through the same pipeline as every
 * other upload: size check, validation, decode/resize, metadata stripping,
 * WebP re-encoding, private storage under the organisation's key, delivery by
 * the application's upload route.
 */

export const MEMBER_ID_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function storeMemberIdImage(file: unknown, organisationId: string, category: "member-id-photos" | "member-id-watermarks") {
  if (!(file instanceof File)) return { error: "Choose an image to upload." } as const;
  if (file.size === 0 || file.size > MEMBER_ID_IMAGE_MAX_BYTES) return { error: "Images must be 5 MB or smaller." } as const;
  const derivative = await createSafeWebpDerivative(
    file,
    category === "member-id-photos" ? { width: 600, height: 600, fit: "cover", position: "attention" } : { width: 1200, height: 1200, fit: "inside" },
  );
  if ("error" in derivative) return { error: derivative.error } as const;
  const key = `organisations/${organisationId}/${category}/${crypto.randomUUID()}.webp`;
  await uploadFile({ key, body: derivative.body, contentType: "image/webp", organisationId });
  return { url: getPublicUrl(key) } as const;
}

/**
 * Best-effort removal of member photos and watermarks after their rows are
 * deleted. Only this organisation's member-ID uploads are touched; a storage
 * failure is logged, never surfaced, because the delete already happened.
 */
export async function removeMemberIdImages(organisationId: string, urls: Array<string | null | undefined>) {
  const keys = urls.flatMap((url) => {
    const key = managedImageKey(url, { kind: "organisation", organisationId, category: "member-id-photos" })
      ?? managedImageKey(url, { kind: "organisation", organisationId, category: "member-id-watermarks" });
    return key ? [key] : [];
  });
  try {
    await deleteFiles(keys);
  } catch {
    console.error("[member-ids] stored image cleanup failed");
  }
}
