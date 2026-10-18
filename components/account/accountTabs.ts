/** Tabs under the Account header. Add an entry here to add a tab. */
export type AccountTab = { href: string; label: string };

export const ACCOUNT_ROOT_HREF = "/account";

export const ACCOUNT_TABS: ReadonlyArray<AccountTab> = [
  { href: ACCOUNT_ROOT_HREF, label: "Profile" },
  { href: "/account/registrations", label: "Registrations" },
  { href: "/account/organisations", label: "Organisations" },
  { href: "/account/security", label: "Security" },
];

/**
 * The root tab matches only /account itself; every other tab also matches
 * its nested paths (/account/security/anything).
 */
export function isAccountTabActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (href === ACCOUNT_ROOT_HREF) return path === ACCOUNT_ROOT_HREF;
  return path === href || path.startsWith(`${href}/`);
}
