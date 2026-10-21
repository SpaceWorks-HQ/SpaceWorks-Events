export type ContentKind = "highlight" | "speaker" | "sponsor" | "resource" | "faq";
export type ContentRow = {
  id: string;
  title: string;
  description: string;
  visibility: string;
  values: Record<string, string | number | null>;
};
export type SaveAction = (input: unknown) => Promise<{ ok: boolean; error?: string }>;

export const CONTENT_FOR_SECTION: Partial<Record<string, ContentKind>> = {
  HIGHLIGHTS: "highlight",
  SPEAKERS: "speaker",
  SPONSORS: "sponsor",
  FAQ: "faq",
  RESOURCES: "resource",
};
export const collectionId = (kind: ContentKind) => `event-page-${kind}s`;

export function contentInput(
  kind: ContentKind,
  target: { organisationSlug: string; eventId: string },
  values: Record<string, string | number | null>,
  id: string | undefined,
  form: FormData,
) {
  const title = String(form.get("title") ?? "");
  const description = String(form.get("description") ?? "");
  const visibility = String(form.get("visibility") ?? "PUBLISHED");
  const shared = { ...target, ...values, ...(id ? { id } : {}), visibility };
  if (kind === "faq")
    return { ...shared, question: title, answerHtml: description };
  if (kind === "speaker")
    return {
      ...shared,
      title,
      bioHtml: description,
      headline: String(form.get("headline") ?? ""),
      organisation: String(form.get("organisation") ?? ""),
      websiteUrl: String(form.get("websiteUrl") ?? ""),
      linkedinUrl: String(form.get("linkedinUrl") ?? ""),
      xUrl: String(form.get("xUrl") ?? ""),
    };
  if (kind === "sponsor")
    return {
      ...shared,
      title,
      description,
      websiteUrl: String(form.get("websiteUrl") ?? ""),
      tier: String(form.get("tier") ?? "PARTNER"),
    };
  if (kind === "resource")
    return {
      ...shared,
      title,
      description,
      externalUrl: String(form.get("externalUrl") ?? ""),
    };
  return {
    ...shared,
    title,
    description,
    ...(kind === "highlight" ? { icon: String(form.get("icon") ?? "") } : {}),
  };
}
