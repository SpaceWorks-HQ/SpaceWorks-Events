"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { FileUp, Link2 } from "lucide-react";
import { commitIdImport, readIdImportSource, type ImportPreview, type ImportResult } from "@/app/actions/member-ids";
import { Button } from "@/components/ui/button";
import { CheckboxField, SegmentedControl } from "@/components/ui/choice";
import { Callout, Card } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ImportTarget } from "@/lib/memberIds/importRows";

type Step = "source" | "map" | "done";
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Two steps: choose a CSV file or a public Google Sheet, then match its
 * columns to the card's fields and check a preview before importing.
 */
export function IdImportWizard({ organisationSlug, programmeId, fields }: { organisationSlug: string; programmeId: string; fields: Array<{ key: string; label: string }> }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("source");
  const [kind, setKind] = useState<"csv" | "sheet">("csv");
  const [sheetUrl, setSheetUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ImportTarget[]>([]);
  const [approve, setApprove] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const targets: Array<{ value: ImportTarget; label: string }> = useMemo(() => [
    { value: "", label: "Don't import" },
    { value: "name", label: "Name" },
    { value: "email", label: "Email" },
    ...fields.map((field) => ({ value: `field:${field.key}` as ImportTarget, label: field.label })),
  ], [fields]);

  const read = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    let source: { kind: "csv"; text: string } | { kind: "sheet"; url: string };
    if (kind === "csv") {
      if (!file) return setError("Choose a CSV file first.");
      if (file.size > MAX_FILE_BYTES) return setError("That file is larger than 2 MB. Split it into smaller files.");
      source = { kind: "csv", text: await file.text() };
    } else {
      if (!sheetUrl.trim()) return setError("Paste the link to your Google Sheet.");
      source = { kind: "sheet", url: sheetUrl.trim() };
    }
    setPending(true);
    try {
      const response = await readIdImportSource({ organisationSlug, programmeId, source });
      if (!response.ok || !response.data) return setError(response.ok ? "That file couldn't be read." : response.error);
      setPreview(response.data);
      setMapping(response.data.mapping);
      setStep("map");
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  const setTarget = (column: number, target: ImportTarget) => setMapping((current) => current.map((value, index) => {
    if (index === column) return target;
    // Each field takes one column: choosing it here frees it elsewhere.
    return target && value === target ? "" : value;
  }));

  const commit = async () => {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      const response = await commitIdImport({ organisationSlug, programmeId, headers: preview.headers, rows: preview.rows, mapping, approve });
      if (!response.ok || !response.data) return setError(response.ok ? "The import didn't finish." : response.error);
      setResult(response.data);
      setStep("done");
      router.refresh();
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  const ready = mapping.includes("name") && mapping.includes("email");
  const errorView = <div aria-live="polite">{error ? <Callout tone="danger" role="alert">{error}</Callout> : null}</div>;

  if (step === "done" && result) {
    return (
      <Card as="section" aria-live="polite">
        <h2 className="text-h3 text-ink">Import finished</h2>
        <ul className="mt-3 flex flex-col gap-1 text-body-ui text-ink-secondary">
          <li><strong className="text-ink">{result.created}</strong> members added{result.approved ? `, ${result.approved} approved and issued` : ", waiting for approval"}.</li>
          <li><strong className="text-ink">{result.duplicates}</strong> skipped because their email is already in this programme or repeated in the file.</li>
          {result.skipped.length ? <li><strong className="text-ink">{result.skipped.length}</strong> rows skipped: {result.skipped.slice(0, 8).map((row) => `row ${row.row} (${row.reason})`).join(", ")}{result.skipped.length > 8 ? "…" : ""}</li> : null}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => router.push(`/dashboard/${organisationSlug}/ids/${programmeId}`)}>See members</Button>
          <Button variant="secondary" onClick={() => { setStep("source"); setPreview(null); setResult(null); setFile(null); }}>Import another file</Button>
        </div>
      </Card>
    );
  }

  if (step === "map" && preview) {
    const sample = preview.rows.slice(0, 5);
    return (
      <div className="flex flex-col gap-5">
        <Card as="section" aria-labelledby="map-heading">
          <h2 id="map-heading" className="text-h3 text-ink">Step 2 of 2: match the columns</h2>
          <p className="text-caption text-ink-muted">{preview.rows.length} rows found{preview.truncated ? " (only the first 2,000 are imported)" : ""}. Name and email are needed; people already in this programme are skipped by email.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {preview.headers.map((header, column) => (
              <li key={`${header}-${column}`}>
                <Field label={header} helperText={preview.rows[0]?.[column] ? `e.g. "${preview.rows[0][column]!.slice(0, 40)}"` : "Empty in the first row"}>
                  <Dropdown value={mapping[column] ?? ""} onChange={(event) => setTarget(column, event.target.value as ImportTarget)}>
                    {targets.map((target) => <option key={target.value || "skip"} value={target.value}>{target.label}</option>)}
                  </Dropdown>
                </Field>
              </li>
            ))}
          </ul>
        </Card>

        <section aria-labelledby="preview-heading" className="flex flex-col gap-2">
          <h3 id="preview-heading" className="text-h4 text-ink">Preview</h3>
          <Table label="Import preview">
            <THead>
              <tr>
                {targets.filter((target) => target.value && mapping.includes(target.value)).map((target) => <TH key={target.value}>{target.label}</TH>)}
              </tr>
            </THead>
            <TBody>
              {sample.map((row, index) => (
                <TR key={index}>
                  {targets.filter((target) => target.value && mapping.includes(target.value)).map((target) => (
                    <TD key={target.value} className="max-w-[240px] truncate">{row[mapping.indexOf(target.value)] || <span className="text-ink-muted">—</span>}</TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        </section>

        <CheckboxField label="Approve and issue cards for everyone imported" description="Leave this off to review each person first." checked={approve} onCheckedChange={(on) => setApprove(on === true)} />
        {!ready ? <Callout tone="warning">Match one column to Name and one to Email to continue.</Callout> : null}
        {errorView}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setStep("source")} disabled={pending}>Back</Button>
          <Button variant="primary" onClick={commit} disabled={!ready} loading={pending} loadingLabel="Importing…">Import {preview.rows.length} rows</Button>
        </div>
      </div>
    );
  }

  return (
    <Card as="section" aria-labelledby="source-heading">
      <form onSubmit={read} className="flex flex-col gap-5">
        <div>
          <h2 id="source-heading" className="text-h3 text-ink">Step 1 of 2: choose your list</h2>
          <p className="text-caption text-ink-muted">The first row should hold column names, like Name, Email and Role. Up to 2,000 rows.</p>
        </div>
        <SegmentedControl<"csv" | "sheet">
          ariaLabel="Import from"
          value={kind}
          onValueChange={(next) => { setKind(next); setError(null); }}
          options={[{ value: "csv", label: "CSV file", icon: <FileUp /> }, { value: "sheet", label: "Google Sheet", icon: <Link2 /> }]}
          className="self-start"
        />
        {kind === "csv" ? (
          <Field label="CSV file" helperText="Export from Excel, Numbers or Google Sheets as .csv. Up to 2 MB.">
            <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-[10px] file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
          </Field>
        ) : (
          <Field label="Google Sheets link" helperText="In Google Sheets choose Share, then Anyone with the link can view. We read the tab in the link.">
            <Input type="url" inputMode="url" placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} maxLength={500} />
          </Field>
        )}
        {errorView}
        <Button type="submit" variant="primary" loading={pending} loadingLabel="Reading…" className="self-start">Read the list</Button>
      </form>
    </Card>
  );
}
