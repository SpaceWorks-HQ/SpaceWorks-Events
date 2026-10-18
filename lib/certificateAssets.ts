import "server-only";
import { prisma } from "./db";
import { certificateTemplateKeys, type CertificateTemplate } from "./certificateTemplate";
import { certificateKeysBelongTo } from "./renderCertificate";

/** Every image a template uses must be a WebP derivative uploaded by this organisation. */
export async function certificateImagesAreOwned(template: CertificateTemplate, organisationId: string) {
  if (!certificateKeysBelongTo(template, organisationId)) return false;
  const { background, assets } = certificateTemplateKeys(template);
  const keys = [...new Set([background, ...assets])];
  const found = await prisma.asset.count({ where: { key: { in: keys }, organisationId, contentType: "image/webp" } });
  return found === keys.length;
}
