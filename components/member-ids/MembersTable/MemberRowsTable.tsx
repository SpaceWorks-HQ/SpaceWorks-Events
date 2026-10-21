"use client";

import type { Dispatch, SetStateAction } from "react";
import { Check, Download, Mail, MoreHorizontal, Pencil, RefreshCw, RotateCcw, Slash, Trash2, X } from "lucide-react";
import { emailIdCard, renewIdMembers } from "@/app/actions/member-ids";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Avatar } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { MemberStatusPill } from "../StatusPill";
import type { MemberIds, MemberRow, RunSimple, StatusAction } from "./shared";

/** The members table: one row per member, with selection and per-row actions for managers. */
export function MemberRowsTable({
  rows,
  canManage,
  selected,
  setSelected,
  allOnPage,
  toggle,
  busy,
  ids,
  changeStatus,
  simple,
  downloadCard,
  setReasonFor,
  setEditing,
  setDeleting,
}: {
  rows: MemberRow[];
  canManage: boolean;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  allOnPage: boolean;
  toggle: (id: string, on: boolean) => void;
  busy: boolean;
  ids: MemberIds;
  changeStatus: (action: StatusAction, memberIds: string[], why?: string) => Promise<void>;
  simple: RunSimple;
  downloadCard: (row: MemberRow, format: "pdf" | "png") => Promise<void>;
  setReasonFor: (value: { action: "reject" | "revoke"; ids: string[] }) => void;
  setEditing: (row: MemberRow) => void;
  setDeleting: (row: MemberRow) => void;
}) {
  return (
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
                          <MenuItem icon={<Mail />} onSelect={() => simple(() => emailIdCard({ ...ids, memberId: row.id }), () => `Card emailed to ${row.email ?? row.name}.`)}>Email card</MenuItem>
                          <MenuItem icon={<RefreshCw />} onSelect={() => simple(() => renewIdMembers({ ...ids, memberIds: [row.id] }), () => `${row.name}'s card renewed from today.`)}>Renew</MenuItem>
                        </>
                      ) : null}
                      <MenuItem icon={<Pencil />} onSelect={() => setEditing(row)}>Edit details and photo</MenuItem>
                      <MenuSeparator />
                      {row.status === "APPROVED" ? <MenuItem danger icon={<Slash />} onSelect={() => setReasonFor({ action: "revoke", ids: [row.id] })}>Revoke card</MenuItem> : null}
                      <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleting(row)}>Delete member</MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              </TD>
            ) : null}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
