"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus } from "lucide-react";
import { joinIdProgramme } from "@/app/actions/member-id-join";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import type { FieldType } from "@/lib/memberIds/core";

type JoinField = { key: string; label: string; type: FieldType; required: boolean; options: string[] };

const INPUT_TYPES: Record<FieldType, string> = { TEXT: "text", SELECT: "text", DATE: "date", EMAIL: "email", PHONE: "tel" };
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The public request form: name, photo and the programme's own questions. */
export function JoinIdProgrammeForm({
  organisationSlug,
  programmeSlug,
  organisationName,
  requiresApproval,
  defaultName,
  email,
  fields,
}: {
  organisationSlug: string;
  programmeSlug: string;
  organisationName: string;
  requiresApproval: boolean;
  defaultName: string;
  email: string;
  fields: JoinField[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"PENDING" | "APPROVED" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const onPhoto = (file: File | undefined) => {
    setError(null);
    if (!file) return setPreview(null);
    if (file.size > MAX_PHOTO_BYTES) {
      if (fileInput.current) fileInput.current.value = "";
      setPreview(null);
      return setError("Photos must be 5 MB or smaller.");
    }
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    data.set("organisationSlug", organisationSlug);
    data.set("programmeSlug", programmeSlug);
    try {
      const result = await joinIdProgramme(data);
      if (result.ok) setDone(result.data?.status ?? "PENDING");
      else setError(result.error);
    } catch {
      setError("Your request didn't go through. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5" role="status" aria-live="polite">
        <h2 className="text-h3 text-ink">{done === "APPROVED" ? "Your card is ready" : "Request sent"}</h2>
        <p className="text-body-ui text-ink-secondary">
          {done === "APPROVED"
            ? "Open your ID wallet to see it, flip it over and download it."
            : `${organisationName} will look at your request. Your card appears in your ID wallet as soon as it's approved.`}
        </p>
        <Button asChild variant="primary" className="self-start"><Link href="/account/ids">Open your ID wallet</Link></Button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 sm:p-6" noValidate={false}>
      <Field label="Name on the card" required>
        <Input name="name" defaultValue={defaultName} maxLength={120} autoComplete="name" />
      </Field>
      <Field label="Email" helperText="From your account. Your card is linked to it.">
        <Input value={email} readOnly disabled />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-label text-ink">Photo <span className="ml-1.5 font-normal text-ink-muted">Optional</span></span>
        <div className="flex items-center gap-4">
          <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[16px] border border-dashed border-line-strong bg-surface text-ink-muted">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
              <img src={preview} alt="Your chosen photo" className="size-full object-cover" />
            ) : (
              <ImagePlus aria-hidden className="size-6" />
            )}
          </span>
          <div className="flex flex-col gap-1">
            <label className="inline-flex">
              <span className="sr-only">Choose a photo</span>
              <input
                ref={fileInput}
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => onPhoto(event.target.files?.[0])}
                className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-[10px] file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted"
              />
            </label>
            <span className="text-caption text-ink-muted">A clear, front-facing photo. JPEG, PNG or WebP, up to 5 MB.</span>
          </div>
        </div>
      </div>

      {fields.map((field) => (
        <Field key={field.key} label={field.label} optional={!field.required} required={field.required}>
          {field.type === "SELECT" ? (
            <Dropdown name={`field:${field.key}`} defaultValue="">
              <option value="" disabled>Choose one</option>
              {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </Dropdown>
          ) : (
            <Input name={`field:${field.key}`} type={INPUT_TYPES[field.type]} maxLength={200} />
          )}
        </Field>
      ))}

      <div aria-live="polite">{error ? <Callout tone="danger" role="alert">{error}</Callout> : null}</div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-caption text-ink-muted">
          {requiresApproval ? `${organisationName} approves each card before it's issued.` : "Your card is issued as soon as you send this."}
        </p>
        <Button type="submit" variant="primary" loading={pending} loadingLabel="Sending…">Request my card</Button>
      </div>
    </form>
  );
}
