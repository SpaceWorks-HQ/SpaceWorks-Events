import type { ReactNode } from "react";

/** Shown instead of a panel's content when the person lacks the needed event permission. */
export function NoPermission({ children }: { children: ReactNode }) {
  return <p className="text-body-ui text-ink-muted">{children}</p>;
}
