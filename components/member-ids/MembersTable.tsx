"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, Copy, Download, Mail, MoreHorizontal, Pencil, RefreshCw, RotateCcw, Slash, UserPlus, X } from "lucide-react";
import { addIdMember, emailIdCards, renewIdMembers, setIdMemberStatus, updateIdMember, uploadIdMemberPhoto } from "@/app/actions/member-ids";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, CheckboxField } from "@/components/ui/choice";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Avatar, Callout, EmptyState } from "@/components/ui/display";
import { Dropdown, Field, Input, SearchInput, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import type { CardState, FieldType, MemberStatus } from "@/lib/memberIds/core";
import { fetchDownload } from "./download";
import { MemberStatusPill } from "./StatusPill";

export type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  status: MemberStatus;
  state: CardState;
  idNumber: string | null;
  validUntil: string | null;
  values: Record<string, string>;
  reason: string | null;
  source: "FORM" | "IMPORT" | "MANUAL";
};

type FormField = { key: string; label: string; type: FieldType; required: boolean; options: string[] };
type StatusAction = "approve" | "reject" | "revoke" | "reinstate";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "PENDING", label: "Waiting" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "REVOKED", label: "Revoked" },
] as const;

const ACTION_COPY: Record<StatusAction, { verb: string; done: (n: number) => string }> = {
  approve: { verb: "Approve", done: (n) => `${n} ${n === 1 ? "card" : "cards"} approved and issued.` },
  reject: { verb: "Reject", done: (n) => `${n} ${n === 1 ? "request" : "requests"} rejected.` },
  revoke: { verb: "Revoke", done: (n) => `${n} ${n === 1 ? "card" : "cards"} revoked. Their check page now says Revoked.` },
  reinstate: { verb: "Reinstate", done: (n) => `${n} ${n === 1 ? "card" : "cards"} reinstated.` },
};

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

  const simple = async (task: () => Promise<{ ok: true; data?: { count: number } } | { ok: false; error: string }>, done: (n: number) => string) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await task();
      if (result.ok) finish(true, done(result.data?.count ?? 0));
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
          <Button size="sm" variant="secondary" startIcon={<Mail />} disabled={busy} onClick={() => simple(() => emailIdCards({ ...ids, memberIds: selectedIds }), (n) => `${n} emails queued.`)}>Email cards</Button>
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
        <Table label="Members">
          <THead>
            <tr>
              {canManage ? (
                <TH className="w-10">
                  <Checkbox aria-label="Select every member on this page" checked={allOnPage} onCheckedChange={(on) => setSelected(on ? new Set(rows.map((row) => row.id)) : new Set())} />
                </TH>
              ) : null}
              <TH>Member</TH>
              <TH>ID number</TH>
              <TH>Status</TH>
              <TH>Valid until</TH>
              {canManage ? <TH className="text-right"><span className="sr-only">Actions</span></TH> : null}
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                {canManage ? (
                  <TD className="w-10">
                    <Checkbox aria-label={`Select ${row.name}`} checked={selected.has(row.id)} onCheckedChange={(on) => toggle(row.id, on === true)} />
                  </TD>
                ) : null}
                <TD>
                  <div className="flex min-w-[200px] items-center gap-3">
                    <Avatar name={row.name} src={row.photoUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{row.name}</p>
                      {row.email ? <p className="truncate text-caption text-ink-muted">{row.email}</p> : null}
                    </div>
                  </div>
                </TD>
                <TD className="whitespace-nowrap font-medium tabular-nums">{row.idNumber ?? <span className="text-ink-muted">Not issued</span>}</TD>
                <TD>
                  <div className="flex flex-col items-start gap-0.5">
                    <MemberStatusPill state={row.state} size="sm" />
                    {row.reason ? <span className="max-w-[220px] truncate text-caption text-ink-muted" title={row.reason}>{row.reason}</span> : null}
                  </div>
                </TD>
                <TD className="whitespace-nowrap tabular-nums">{row.validUntil ?? <span className="text-ink-muted">—</span>}</TD>
                {canManage ? (
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {row.status === "PENDING" ? (
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => changeStatus("approve", [row.id])}>Approve</Button>
                      ) : null}
                      <Menu>
                        <MenuTrigger asChild>
                          <IconButton label={`Actions for ${row.name}`} size="sm" variant="quiet"><MoreHorizontal /></IconButton>
                        </MenuTrigger>
                        <MenuContent>
                          {row.status === "PENDING" || row.status === "REJECTED" ? <MenuItem icon={<Check />} onSelect={() => changeStatus("approve", [row.id])}>Approve and issue</MenuItem> : null}
                          {row.status === "PENDING" ? <MenuItem icon={<X />} onSelect={() => setReasonFor({ action: "reject", ids: [row.id] })}>Reject</MenuItem> : null}
                          {row.status === "REVOKED" ? <MenuItem icon={<RotateCcw />} onSelect={() => changeStatus("reinstate", [row.id])}>Reinstate</MenuItem> : null}
                          {row.status === "APPROVED" ? (
                            <>
                              <MenuItem icon={<Download />} onSelect={() => void downloadCard(row, "pdf")}>Download PDF</MenuItem>
                              <MenuItem icon={<Download />} onSelect={() => void downloadCard(row, "png")}>Download PNG (front)</MenuItem>
                              <MenuItem icon={<Mail />} onSelect={() => simple(() => emailIdCards({ ...ids, memberIds: [row.id] }), () => `Card emailed to ${row.email ?? row.name}.`)}>Email card</MenuItem>
                              <MenuItem icon={<RefreshCw />} onSelect={() => simple(() => renewIdMembers({ ...ids, memberIds: [row.id] }), () => `${row.name}'s card renewed from today.`)}>Renew</MenuItem>
                            </>
                          ) : null}
                          <MenuItem icon={<Pencil />} onSelect={() => setEditing(row)}>Edit details and photo</MenuItem>
                          {row.status === "APPROVED" ? (
                            <>
                              <MenuSeparator />
                              <MenuItem danger icon={<Slash />} onSelect={() => setReasonFor({ action: "revoke", ids: [row.id] })}>Revoke card</MenuItem>
                            </>
                          ) : null}
                        </MenuContent>
                      </Menu>
                    </div>
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
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

function MemberDialog({
  organisationSlug,
  programmeId,
  member,
  fields,
  onClose,
  onSaved,
}: {
  organisationSlug: string;
  programmeId: string;
  member: MemberRow | null;
  fields: FormField[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [values, setValues] = useState<Record<string, string>>(member?.values ?? {});
  const [approve, setApprove] = useState(true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const base = { organisationSlug, programmeId, name, email, values };
      const result = member ? await updateIdMember({ ...base, memberId: member.id }) : await addIdMember({ ...base, approve });
      if (!result.ok) return setError(result.error);
      const memberId = member?.id ?? (result.ok && result.data && "id" in result.data ? result.data.id : null);
      if (photo && memberId) {
        const data = new FormData();
        data.set("organisationSlug", organisationSlug);
        data.set("programmeId", programmeId);
        data.set("memberId", memberId);
        data.set("file", photo);
        const uploaded = await uploadIdMemberPhoto(data);
        if (!uploaded.ok) return setError(`Details saved, but the photo didn't upload: ${uploaded.error}`);
      }
      onSaved(member ? `${name}'s details saved.` : approve ? `${name} added and their card issued.` : `${name} added, waiting for approval.`);
    } catch {
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="md">
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader title={member ? `Edit ${member.name}` : "Add a member"} description={member ? "Changes show on the card the next time it's downloaded." : "Add someone who didn't use the join form."} />
          <DialogBody className="flex flex-col gap-4">
            <Field label="Name on the card" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
            </Field>
            <Field label="Email" required helperText="Their card appears in the wallet of the account with this email.">
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} />
            </Field>
            {fields.map((field) => (
              <Field key={field.key} label={field.label} optional={!field.required}>
                {field.type === "SELECT" ? (
                  <Dropdown value={values[field.key] ?? ""} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}>
                    <option value="">Not set</option>
                    {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Dropdown>
                ) : (
                  <Input type={field.type === "DATE" ? "date" : field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : "text"} value={values[field.key] ?? ""} maxLength={200} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />
                )}
              </Field>
            ))}
            <Field label="Photo" optional helperText={member?.photoUrl ? "Choose a file to replace the current photo." : "JPEG, PNG or WebP, up to 5 MB."}>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-[10px] file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
            </Field>
            {!member ? <CheckboxField label="Approve and issue the card now" checked={approve} onCheckedChange={(on) => setApprove(on === true)} /> : null}
            <div aria-live="polite">{error ? <Callout tone="danger" role="alert">{error}</Callout> : null}</div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending} loadingLabel="Saving…">{member ? "Save" : "Add member"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
