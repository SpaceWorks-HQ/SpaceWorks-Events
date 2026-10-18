import { requireSuperAdminMfa } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { isNewUserRegistrationEnabled } from "@/lib/instanceSettings";
import { AccountCreationControl } from "@/components/super-admin/AccountCreationControl";
import { AdminPanel } from "@/components/super-admin/AdminPanel";
import { PageHeader, StatTile } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default async function SuperAdminAuthPage() {
  // Layout checks don't re-run on client navigation, so every page checks too.
  await requireSuperAdminMfa();
  const [accountsCount, sessionsCount, tokensCount, accountCreationEnabled] = await Promise.all([
    prisma.account.count(),
    prisma.session.count(),
    prisma.verificationToken.count(),
    isNewUserRegistrationEnabled(),
  ]);

  const [accounts, sessions, tokens] = await Promise.all([
    prisma.account.findMany({
      orderBy: { id: "desc" },
      take: 50,
      select: {
        id: true,
        provider: true,
        type: true,
        providerAccountId: true,
        user: { select: { id: true, email: true } },
      },
    }),
    prisma.session.findMany({
      orderBy: { expires: "desc" },
      take: 50,
      select: {
        id: true,
        expires: true,
        user: { select: { id: true, email: true } },
      },
    }),
    prisma.verificationToken.findMany({
      orderBy: { expires: "desc" },
      take: 50,
      select: { identifier: true, expires: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Auth" description="Account creation, sign-in accounts, sessions, and verification tokens." />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile className="rounded-2xl" label="Accounts" value={accountsCount.toLocaleString()} />
        <StatTile className="rounded-2xl" label="Sessions" value={sessionsCount.toLocaleString()} />
        <StatTile className="rounded-2xl" label="Verification tokens" value={tokensCount.toLocaleString()} />
      </div>

      <AccountCreationControl initialEnabled={accountCreationEnabled} />

      <AdminPanel title="Recent accounts">
        <Table label="Recent accounts">
          <THead>
            <tr>
              <TH>Provider</TH>
              <TH>Type</TH>
              <TH>Provider account</TH>
              <TH>User</TH>
            </tr>
          </THead>
          <TBody>
            {accounts.map((a) => (
              <TR key={a.id}>
                <TD>{a.provider}</TD>
                <TD>{a.type}</TD>
                <TD className="font-mono text-sm [overflow-wrap:anywhere]">{a.providerAccountId}</TD>
                <TD className="font-mono text-sm">{a.user.email ?? a.user.id}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Recent sessions">
        <Table label="Recent sessions">
          <THead>
            <tr>
              <TH>User</TH>
              <TH>Expires</TH>
              <TH>Session id</TH>
            </tr>
          </THead>
          <TBody>
            {sessions.map((s) => (
              <TR key={s.id}>
                <TD className="font-mono text-sm">{s.user.email ?? s.user.id}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{s.expires.toLocaleString()}</TD>
                <TD className="font-mono text-sm [overflow-wrap:anywhere]">{s.id}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>

      <AdminPanel title="Recent verification tokens" description="Only token type and expiry are shown. Identifiers and token values are never exposed.">
        <Table label="Recent verification tokens">
          <THead>
            <tr>
              <TH>Type</TH>
              <TH>Expires</TH>
            </tr>
          </THead>
          <TBody>
            {tokens.map((t) => (
              <TR key={`${t.identifier}:${t.expires.toISOString()}`}>
                <TD>{t.identifier.startsWith("mfa:") ? "MFA enrollment" : t.identifier.startsWith("reset:") ? "Password reset" : "Other verification"}</TD>
                <TD className="whitespace-nowrap text-ink-secondary">{t.expires.toLocaleString()}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </AdminPanel>
    </div>
  );
}
