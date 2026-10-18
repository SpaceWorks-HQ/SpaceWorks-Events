"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createIdProgramme } from "@/app/actions/member-ids";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { MEMBER_ID_PRESET_INFO, type MemberIdPreset } from "@/lib/memberIds/design";
import { PresetPicker } from "./PresetPicker";

export function CreateIdProgrammeForm({ organisationSlug }: { organisationSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<MemberIdPreset>("community");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await createIdProgramme({ organisationSlug, name, preset }).catch(() => ({ ok: false as const, error: "That didn't save. Check your connection and try again." }));
    if (result.ok && result.data) router.push(`/dashboard/${organisationSlug}/ids/${result.data.id}?tab=design`);
    else {
      setError(result.ok ? "That didn't save." : result.error);
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Programme name" helperText="Shown on the join form and the card back.">
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Community members 2026" required minLength={2} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-label text-ink">Starting design</legend>
        <PresetPicker value={preset} onChange={setPreset} />
        <p className="text-caption text-ink-muted">{MEMBER_ID_PRESET_INFO[preset].hint}. You can change everything later.</p>
      </fieldset>
      <div aria-live="polite">{error ? <Callout tone="danger" role="alert">{error}</Callout> : null}</div>
      <Button type="submit" variant="primary" loading={pending} loadingLabel="Creating…" disabled={name.trim().length < 2}>Create programme</Button>
    </form>
  );
}
