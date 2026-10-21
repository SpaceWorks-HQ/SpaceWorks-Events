"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, Copy, Mail, RefreshCw, UserPlus } from "lucide-react";
import { deleteIdMember, emailIdCards, renewIdMembers, setIdMemberStatus } from "@/app/actions/member-ids";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout, EmptyState } from "@/components/ui/display";
import { Field, SearchInput, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { emailQueuedNotice } from "@/lib/memberIds/core";
import { fetchDownload } from "./download";
import { MemberDialog } from "./MembersTable/MemberDialog";
import { MemberRowsTable } from "./MembersTable/MemberRowsTable";
import { ACTION_COPY, FILTERS, type FormField, type MemberRow, type StatusAction } from "./MembersTable/shared";

export type { MemberRow } from "./MembersTable/shared";

export function MembersTable({
  organisationSlug,
  programmeId,
  canManage,
  rows,
  fields,
  filter,
  counts,
  joinUrl,
  joinOpen,
}: {
  organisationSlug: string;
  programmeId: string;
  canManage: boolean;
  rows: MemberRow[];
  fields: FormField[];
  filter: { status: string; search: string; page: number; pages: number; filtered: number; base: string };
  counts: Record<(typeof FILTERS)[number]["id"], number>;
  joinUrl: string;
  joinOpen: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [reasonFor, setReasonFor] = useState<{ action: "reject" | "revoke"; ids: string[] } | null>(null);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<MemberRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<MemberRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState(filter.search);

  const ids = { organisationSlug, programmeId };
  const href = (params: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    const merged = { status: filter.status, q: filter.search, ...params };
    for (const [key, value] of Object.entries(merged)) if (value && value !== "all" && !(key === "page" && Number(value) === 1)) query.set(key, String(value));
    const text = query.toString();
    return text ? `${filter.base}?${text}` : filter.base;
  };

  const finish = (ok: boolean, text: string) => {
    setNotice({ tone: ok ? "success" : "danger", text });
    if (ok) {
      setSelected(new Set());
      router.refresh();
    }
  };

  const changeStatus = async (action: StatusAction, memberIds: string[], why?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await setIdMemberStatus({ ...ids, memberIds, action, ...(why ? { reason: why } : {}) });
      if (!result.ok) return finish(false, result.error);
      const count = result.data?.count ?? 0;
      finish(true, count === 0 ? "Nothing changed: none of those members were in a state that allows that." : ACTION_COPY[action].done(count));
    } catch {
      finish(false, "That didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const simple = async <T extends { count: number }>(task: () => Promise<{ ok: true; data?: T } | { ok: false; error: string }>, done: (n: number, data?: T) => string) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await task();
      if (result.ok) finish(true, done(result.data?.count ?? 0, result.data));
      else finish(false, result.error);
    } catch {
      finish(false, "That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const downloadCard = async (row: MemberRow, format: "pdf" | "png") => {
    setNotice(null);
    const error = await fetchDownload(`/api/exports/member-ids/${programmeId}/cards/${row.id}?format=${format}`);
    if (error) setNotice({ tone: "danger", text: error });
  };

  const selectedIds = [...selected];
  const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggle = (id: string, on: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-label text-ink">Join link</p>
            <p className="truncate text-caption text-ink-muted">{joinOpen ? joinUrl : "The join form is closed. Open it in Settings to accept requests."}</p>
          </div>
          {joinOpen ? (
            <Button
              size="sm"
              variant="secondary"
              startIcon={copied ? <Check /> : <Copy />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(joinUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setNotice({ tone: "danger", text: "Couldn't copy. Select the link and copy it yourself." });
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          ) : null}
          <Button size="sm" variant="primary" startIcon={<UserPlus />} onClick={() => setEditing("new")}>Add member</Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <Link
              key={item.id}
              href={href({ status: item.id, page: 1 })}
              aria-current={filter.status === item.id ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                filter.status === item.id ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-panel text-ink-secondary hover:bg-subtle hover:text-ink",
              )}
            >
              {item.label}
              <span className="tabular-nums opacity-80">{counts[item.id]}</span>
            </Link>
          ))}
        </nav>
        <form
          role="search"
          className="w-full lg:w-[300px]"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            router.push(href({ q: search.trim() || undefined, page: 1 }));
          }}
        >
          <SearchInput
            aria-label={canManage ? "Search by name, email or ID number" : "Search by name or ID number"}
            placeholder={canManage ? "Name, email or ID number" : "Name or ID number"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => {
              setSearch("");
              router.push(href({ q: undefined, page: 1 }));
            }}
          />
        </form>
      </div>

      {canManage && selected.size > 0 ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel p-3" role="toolbar" aria-label="Selected members">
          <p className="mr-auto text-label text-ink">{selected.size} selected</p>
          <Button size="sm" variant="primary" startIcon={<Check />} disabled={busy} onClick={() => changeStatus("approve", selectedIds)}>Approve</Button>
          <Button size="sm" variant="secondary" startIcon={<Mail />} disabled={busy} onClick={() => simple(() => emailIdCards({ ...ids, memberIds: selectedIds }), (n, data) => emailQueuedNotice(data ?? { count: n, skippedRecent: 0, skippedLimit: 0 }))}>Email cards</Button>
          <Button size="sm" variant="secondary" startIcon={<RefreshCw />} disabled={busy} onClick={() => simple(() => renewIdMembers({ ...ids, memberIds: selectedIds }), (n) => `${n} cards renewed from today.`)}>Renew</Button>
          <Button size="sm" variant="quiet" disabled={busy} onClick={() => setReasonFor({ action: "reject", ids: selectedIds })}>Reject</Button>
          <Button size="sm" variant="dangerQuiet" disabled={busy} onClick={() => setReasonFor({ action: "revoke", ids: selectedIds })}>Revoke</Button>
          <Button size="sm" variant="quiet" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}

      <div aria-live="polite">
        {notice ? (
          <Callout tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"} action={<Button size="sm" variant="quiet" onClick={() => setNotice(null)}>Dismiss</Button>}>{notice.text}</Callout>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={filter.search || filter.status !== "all" ? "No members match" : "No members yet"} mood="sleepy">
          {filter.search || filter.status !== "all"
            ? "Try another filter or search."
            : canManage
              ? "Share the join link, add someone by hand, or import a list from the Import tab."
              : "Members appear here once people join or an admin imports them."}
        </EmptyState>
      ) : (
        <MemberRowsTable
          rows={rows}
          canManage={canManage}
          selected={selected}
          setSelected={setSelected}
          allOnPage={allOnPage}
          toggle={toggle}
          busy={busy}
          ids={ids}
          changeStatus={changeStatus}
          simple={simple}
          downloadCard={downloadCard}
          setReasonFor={setReasonFor}
          setEditing={setEditing}
          setDeleting={setDeleting}
        />
      )}

      {filter.pages > 1 ? (
        <nav aria-label="Member pages" className="flex flex-wrap items-center justify-end gap-2">
          <p className="text-sm text-ink-muted">Page {filter.page} of {filter.pages} · {filter.filtered} members</p>
          {filter.page <= 1 ? <Button size="sm" variant="secondary" disabled>Previous</Button> : <Button asChild size="sm" variant="secondary"><Link href={href({ page: filter.page - 1 })}>Previous</Link></Button>}
          {filter.page >= filter.pages ? <Button size="sm" variant="secondary" disabled>Next</Button> : <Button asChild size="sm" variant="secondary"><Link href={href({ page: filter.page + 1 })}>Next</Link></Button>}
        </nav>
      ) : null}

      <ConfirmDialog
        open={reasonFor !== null}
        destructive={reasonFor?.action === "revoke"}
        title={reasonFor?.action === "revoke" ? `Revoke ${reasonFor.ids.length === 1 ? "this card" : `${reasonFor.ids.length} cards`}?` : `Reject ${reasonFor?.ids.length === 1 ? "this request" : `${reasonFor?.ids.length ?? 0} requests`}?`}
        message={reasonFor?.action === "revoke" ? "The card's check page will say Revoked straight away. You can reinstate it later." : "They won't get a card. You can still approve them later."}
        confirmLabel={reasonFor?.action === "revoke" ? "Revoke" : "Reject"}
        loading={busy}
        onCancel={() => {
          setReasonFor(null);
          setReason("");
        }}
        onConfirm={async () => {
          if (!reasonFor) return;
          await changeStatus(reasonFor.action, reasonFor.ids, reason.trim() || undefined);
          setReasonFor(null);
          setReason("");
        }}
      >
        <Field label="Reason" optional helperText="For your team only. It is never shown on the check page.">
          <Textarea rows={2} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "this member"}?`}
        message="Their card, ID number and photo are removed for good, and the card's check page will say it can't be found. To stop a card but keep the record, revoke it instead."
        confirmLabel="Delete member"
        loading={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const row = deleting;
          setBusy(true);
          setNotice(null);
          try {
            const result = await deleteIdMember({ ...ids, memberId: row.id });
            finish(result.ok, result.ok ? `${row.name} was deleted.` : result.error);
          } catch {
            finish(false, "That didn't work. Check your connection and try again.");
          } finally {
            setBusy(false);
            setDeleting(null);
          }
        }}
      />

      {editing ? (
        <MemberDialog
          key={editing === "new" ? "new" : editing.id}
          organisationSlug={organisationSlug}
          programmeId={programmeId}
          member={editing === "new" ? null : editing}
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            finish(true, text);
          }}
        />
      ) : null}
    </div>
  );
}
