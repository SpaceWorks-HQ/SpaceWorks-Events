"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import {
  createOrganisation,
  checkSlugAvailability,
  updateOrganisation,
} from "@/app/actions/org";
import { uploadOrganisationLogo } from "@/app/actions/media";
import { ImageUploadPicker } from "@/components/forms/ImageUploadPicker";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, PrefixInput, Textarea } from "@/components/ui/field";

/** Host shown before the slug, e.g. `yuyu.example.org/`. Inlined at build time, so server and client agree. */
const SITE_PREFIX = `${(process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "")}/`;

export function CreateOrgForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [slug, setSlug] = useState("");
  const [slugState, setSlugState] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    const trimmed = slug.trim();
    if (!trimmed) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const available = await checkSlugAvailability(trimmed);
        setSlugState(available ? "available" : "taken");
      } catch (err) {
        if (process.env.NODE_ENV === "development")
          console.error("Failed to check slug availability", err);
        setSlugState("idle");
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug]);

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    setSlug(val);
    setSlugState(val.trim() ? "checking" : "idle");
  };

  let helperText: React.ReactNode = "Lowercase, alphanumeric and dashes, e.g. my-community";
  let isError = false;

  if (slugState === "checking") {
    helperText = "Checking availability...";
  } else if (slugState === "available") {
    helperText = (
      <span className="inline-flex items-center gap-1 font-semibold text-success-fg">
        <Check aria-hidden className="size-3.5" />
        URL slug is available!
      </span>
    );
  } else if (slugState === "taken") {
    helperText = (
      <span className="inline-flex items-center gap-1">
        <X aria-hidden className="size-3.5" />
        This URL slug is already taken or reserved.
      </span>
    );
    isError = true;
  }

  const isSubmitDisabled =
    pending || slugState === "checking" || slugState === "taken" || !slug;

  return (
    <form
      className="flex w-full flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await createOrganisation({
            name: String(fd.get("name") ?? ""),
            slug: slug,
            description: String(fd.get("description") ?? ""),
            logoUrl: "",
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          if (res.data?.slug) {
            if (logoFile) {
              const upload = new FormData();
              upload.set("organisationSlug", res.data.slug);
              upload.set("file", logoFile);
              const uploaded = await uploadOrganisationLogo(upload);
              if (!uploaded.ok) {
                setError(uploaded.error);
                return;
              }
              if (!uploaded.data) {
                setError(
                  "Organisation created, but the logo could not be uploaded.",
                );
                return;
              }
              const saved = await updateOrganisation({
                organisationSlug: res.data.slug,
                name: String(fd.get("name") ?? ""),
                description: String(fd.get("description") ?? ""),
                logoUrl: uploaded.data.url,
              });
              if (!saved.ok) {
                setError(
                  "Organisation created, but the logo could not be saved.",
                );
                return;
              }
            }
            router.push(`/${res.data.slug}`);
          }
        });
      }}
    >
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <Field label="Name" required>
        <Input name="name" autoFocus />
      </Field>
      <Field label="Web address" required helperText={isError ? undefined : helperText} error={isError ? helperText : undefined}>
        <PrefixInput
          prefix={SITE_PREFIX}
          name="slug"
          value={slug}
          onChange={handleSlugChange}
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field label="Description" optional>
        <Textarea name="description" rows={3} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <p className="text-label text-ink">
          Logo<span className="ml-1.5 font-normal text-ink-muted">Optional</span>
        </p>
        <ImageUploadPicker
          label="Logo"
          placeholder="Your logo will appear here."
          onChange={(file) => setLogoFile(file)}
        />
      </div>
      <div>
        <Button type="submit" variant="primary" size="lg" disabled={isSubmitDisabled} loading={pending}>
          Create organisation
        </Button>
      </div>
    </form>
  );
}
