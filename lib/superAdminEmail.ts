/** No server dependencies: imported by actions that must not pull in the auth stack. */

/**
 * Whether this is the instance super admin's address. Its password is set
 * only from the server (scripts/vps-recover.sh, or recover-super-admin.mjs
 * with database access): never by sign-up, forgot password or the account page.
 */
export function isSuperAdminEmail(email: string | null | undefined) {
  const configured = process.env.SUPER_ADMIN_EMAIL;
  return Boolean(configured && email && email.trim().toLowerCase() === configured.trim().toLowerCase());
}

export const SUPER_ADMIN_PASSWORD_HINT = "The super admin's password is set on the server: run sudo bash scripts/vps-recover.sh on the VPS (or recover-super-admin.mjs with database access) and open the link it prints.";
