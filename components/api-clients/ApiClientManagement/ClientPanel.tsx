"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Card, Chip } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import {
  createApiCredential,
  revokeApiCredential,
  setApiClientStatus,
  updateApiClientScopes,
} from "@/app/actions/api-clients";
import { API_SCOPES, type ApiScope } from "@/lib/api/v1/scopes";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { expiryIso, formatTimestamp, type Client, type Credential } from "./shared";

export function ClientPanel(props: {
  organisationSlug: string;
  client: Client;
  referenceTime: string;
  reveal: (token: string) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [selectedScopes, setSelectedScopes] = useState<ApiScope[]>(
    props.client.scopes,
  );
  const [revokeTarget, setRevokeTarget] = useState<Credential | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  function run(
    operation: () => Promise<
      { ok: true; data?: unknown } | { ok: false; error: string }
    >,
  ) {
    startTransition(async () => {
      const result = await operation();
      if (!result.ok)
        return showToast(result.error ?? "The change failed.", "error");
      if (
        result.data &&
        typeof result.data === "object" &&
        "token" in result.data &&
        typeof result.data.token === "string"
      ) {
        props.reveal(result.data.token);
      }
      showToast("API access updated", "success");
      router.refresh();
    });
  }

  return (
    <Card as="section" padding="none" className="divide-y divide-line">
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-title text-ink">{props.client.name}</h3>
          <Chip size="sm" tone={props.client.status === "ACTIVE" ? "success" : "neutral"}>
            {props.client.status.toLowerCase()}
          </Chip>
        </div>
        <Button
          size="sm"
          variant={props.client.status === "ACTIVE" ? "danger" : "secondary"}
          disabled={pending}
          onClick={() =>
            props.client.status === "ACTIVE"
              ? setConfirmDisable(true)
              : run(() =>
                  setApiClientStatus({
                    organisationSlug: props.organisationSlug,
                    apiClientId: props.client.id,
                    status: "ACTIVE",
                  }),
                )
          }
        >
          {props.client.status === "ACTIVE" ? "Disable client" : "Enable client"}
        </Button>
      </div>
      <div className="flex flex-col gap-3 p-5">
        <p className="text-label text-ink">Scopes</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2.5">
          {API_SCOPES.map((scope) => (
            <CheckboxField
              key={scope}
              label={<span className="tabular-nums text-sm">{scope}</span>}
              checked={selectedScopes.includes(scope)}
              onCheckedChange={(checked) =>
                setSelectedScopes((current) =>
                  checked === true
                    ? [...current, scope]
                    : current.filter((item) => item !== scope),
                )
              }
            />
          ))}
        </div>
        <div>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || selectedScopes.length === 0}
            onClick={() =>
              run(() =>
                updateApiClientScopes({
                  organisationSlug: props.organisationSlug,
                  apiClientId: props.client.id,
                  scopes: selectedScopes,
                }),
              )
            }
          >
            Save scopes
          </Button>
        </div>
      </div>
      <form
        className="flex flex-col gap-3 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          run(() =>
            createApiCredential({
              organisationSlug: props.organisationSlug,
              apiClientId: props.client.id,
              name: String(form.get("name") ?? ""),
              expiresAt: expiryIso(form.get("expiresAt")),
            }),
          );
        }}
      >
        <p className="text-label text-ink">Create rotation credential</p>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <Field label="Credential label" required>
            <Input name="name" maxLength={80} />
          </Field>
          <Field label="Optional expiry">
            <Input name="expiresAt" type="datetime-local" />
          </Field>
          <Button type="submit" variant="secondary" disabled={pending}>
            Create credential
          </Button>
        </div>
      </form>
      <div className="p-5">
        {props.client.credentials.length === 0 ? (
          <p className="text-body-ui text-ink-muted">No credentials.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {props.client.credentials.map((credential) => {
              const inactive =
                Boolean(credential.revokedAt) ||
                Boolean(
                  credential.expiresAt &&
                  credential.expiresAt <= props.referenceTime,
                );
              return (
                <li key={credential.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink">{credential.name}</p>
                    <p className="text-caption text-ink-muted">
                      Created {formatTimestamp(credential.createdAt)} · Last
                      used{" "}
                      {credential.lastUsedAt
                        ? formatTimestamp(credential.lastUsedAt)
                        : "never"}
                      {credential.expiresAt
                        ? ` · Expires ${formatTimestamp(credential.expiresAt)}`
                        : ""}
                    </p>
                  </div>
                  {inactive ? (
                    <Chip size="sm">{credential.revokedAt ? "revoked" : "expired"}</Chip>
                  ) : (
                    <Button
                      variant="dangerQuiet"
                      size="sm"
                      disabled={pending}
                      onClick={() => setRevokeTarget(credential)}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
        <ConfirmationDialog
        open={confirmDisable}
        title="Disable API client?"
        message="All credentials for this client will stop working until it is enabled again."
        confirmLabel="Disable client"
        loading={pending}
        onCancel={() => setConfirmDisable(false)}
        onConfirm={() => {
          setConfirmDisable(false);
          run(() =>
            setApiClientStatus({
              organisationSlug: props.organisationSlug,
              apiClientId: props.client.id,
              status: "DISABLED",
            }),
          );
        }}
      />
      <ConfirmationDialog
        open={Boolean(revokeTarget)}
        title="Revoke API credential?"
        message={`“${revokeTarget?.name ?? "This credential"}” will stop working immediately. This cannot be undone.`}
        confirmLabel="Revoke credential"
        loading={pending}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (!revokeTarget) return;
          const id = revokeTarget.id;
          setRevokeTarget(null);
          run(() =>
            revokeApiCredential({
              organisationSlug: props.organisationSlug,
              apiClientId: props.client.id,
              credentialId: id,
            }),
          );
        }}
      />
    </Card>
  );
}
