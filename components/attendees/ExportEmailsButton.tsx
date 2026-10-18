"use client";

import { AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  attendeeEmailExportFilename,
  buildAttendeeEmailCsv,
  type AttendeeEmailExportRow,
} from "@/lib/attendeeEmailExport";

export function ExportEmailsButton(props: {
  eventTitle: string;
  attendees: AttendeeEmailExportRow[];
  size?: "sm" | "md";
  title?: string;
}) {
  const { eventTitle, attendees, size = "sm", title } = props;

  function handleExport() {
    const csv = buildAttendeeEmailCsv(attendees);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = attendeeEmailExportFilename(eventTitle);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const hasEmail = attendees.some((attendee) => Boolean(attendee.user?.email ?? attendee.guestEmail));

  return (
    <Button variant="secondary" size={size} title={title} startIcon={<AtSign />} onClick={handleExport} disabled={!hasEmail}>
      Export emails
    </Button>
  );
}
