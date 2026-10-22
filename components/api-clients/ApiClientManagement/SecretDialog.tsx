"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { useToast } from "@/components/feedback/ToastProvider";

export function SecretDialog(props: { token: string | null; onClose: () => void }) {
  const { showToast } = useToast();
  return (
    <Dialog open={Boolean(props.token)} onOpenChange={(next) => { if (!next) props.onClose(); }}>
      <DialogContent size="md">
        <DialogHeader title="Copy this credential now" />
        <DialogBody className="flex flex-col gap-4">
          <Callout tone="warning">
            Space Works Events cannot show this value again. Store it in the consuming
            application&apos;s secret manager.
          </Callout>
          <code className="block select-all break-all rounded-md bg-inverse px-4 py-3 font-mono text-sm text-on-inverse">
            {props.token}
          </code>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            startIcon={<Copy />}
            onClick={async () => {
              if (!props.token) return;
              await navigator.clipboard.writeText(props.token);
              showToast("Credential copied", "success");
            }}
          >
            Copy
          </Button>
          <Button variant="primary" onClick={props.onClose}>
            I have stored it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
