import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TicketDownloadButton(props: { downloadUrl: string }) {
  return (
    <Button asChild variant="secondary" size="lg" fullWidth>
      <a href={props.downloadUrl} download>
        <Download aria-hidden className="size-[18px]" />
        Save ticket
      </a>
    </Button>
  );
}
