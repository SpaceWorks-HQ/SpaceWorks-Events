"use client";

/** Fetch a file and save it, turning the server's JSON error into words for the page. */
export async function fetchDownload(url: string): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin" });
  } catch {
    return "The download didn't start. Check your connection and try again.";
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? (response.status === 404 ? "That card wasn't found." : "The download couldn't be prepared. Try again.");
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "download";
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return null;
}
