import Link from "next/link";
import { Fragment } from "react";

/** "Event / Programme" breadcrumb (docs/DESIGN.md §4.4). The last item is the current page. */
export function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-[15px] text-ink-muted">
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 ? <li aria-hidden>/</li> : null}
            <li>
              {item.href ? (
                <Link href={item.href} className="font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink">{item.label}</Link>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
