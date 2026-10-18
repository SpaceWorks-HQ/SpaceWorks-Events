import "server-only";

import sanitizeHtml from "sanitize-html";

/** The event website deliberately supports text formatting, not arbitrary embeds or markup. */
export function sanitizeRichText(value: string) {
  return sanitizeHtml(value, {
    allowedTags: ["p", "br", "strong", "em", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "a"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  }).trim();
}

/** Render a plain-text field in a rich-text slot without treating it as HTML. */
export function plainTextToSafeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br>");
}

/** Build a compact plain-text summary from already-sanitized rich text. */
export function richTextToPlainText(value: string) {
  const withBlockSeparators = value.replace(
    /<\/?(?:p|br|h2|h3|li|blockquote)\b[^>]*>/gi,
    " ",
  );
  // sanitize-html re-escapes text for HTML output; the summary is plain text, so undo that.
  return sanitizeHtml(withBlockSeparators, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(lt|gt|quot|#39|amp);/g, (_, entity: string) => ({ lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" })[entity] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
