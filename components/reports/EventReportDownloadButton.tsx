import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EventReportDownloadButton({ href, label = "Download PDF report" }: { href: string; label?: string }) {
  return (
    <Button asChild variant="secondary" size="sm">
      <a href={href}>
        <Download aria-hidden className="size-4" />
        {label}
      </a>
    </Button>
  );
}
