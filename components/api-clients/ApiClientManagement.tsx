"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckboxCard } from "@/components/ui/choice";
import { Card, EmptyState } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { createApiClient } from "@/app/actions/api-clients";
import { API_SCOPES, type ApiScope } from "@/lib/api/v1/scopes";
import { useToast } from "@/components/feedback/ToastProvider";
import { ClientPanel } from "./ApiClientManagement/ClientPanel";
import { SecretDialog } from "./ApiClientManagement/SecretDialog";
import { expiryIso, type Client } from "./ApiClientManagement/shared";

export function ApiClientManagement(props: {
  organisationSlug: string;
  clients: Client[];
  referenceTime: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [scopes, setScopes] = useState<ApiScope[]>(["events:read"]);
  const [token, setToken] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <SecretDialog token={token} onClose={() => setToken(null)} />
      <Card
        as="section"
        className="flex flex-col gap-5"
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await createApiClient({
                organisationSlug: props.organisationSlug,
                name: String(form.get("name") ?? ""),
                credentialName: String(form.get("credentialName") ?? ""),
                expiresAt: expiryIso(form.get("expiresAt")),
                scopes,
              });
              if (!result.ok) return showToast(result.error, "error");
              setToken(result.data?.token ?? null);
              showToast("API client created", "success");
              router.refresh();
            });
          }}
        >
          <div>
            <h2 className="text-title text-ink">Create API client</h2>
            <p className="mt-1 text-body-ui text-ink-muted">The first credential is shown once after creation.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Application name" required>
              <Input name="name" maxLength={100} />
            </Field>
            <Field label="Credential label" required>
              <Input name="credentialName" maxLength={80} />
            </Field>
            <Field label="Optional expiry">
              <Input name="expiresAt" type="datetime-local" />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-label text-ink">Scopes</legend>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {API_SCOPES.map((scope) => (
                <CheckboxCard
                  key={scope}
                  label={<span className="tabular-nums text-sm">{scope}</span>}
                  checked={scopes.includes(scope)}
                  onCheckedChange={(checked) =>
                    setScopes((current) =>
                      checked === true
                        ? [...current, scope]
                        : current.filter((item) => item !== scope),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
          <div>
            <Button type="submit" variant="primary" disabled={pending || scopes.length === 0} loading={pending}>
              Create client
            </Button>
          </div>
        </form>
      </Card>
      <section aria-labelledby="api-clients-title" className="flex flex-col gap-3">
        <h2 id="api-clients-title" className="text-title text-ink">Clients</h2>
        {props.clients.length === 0 ? (
          <EmptyState mood="sleepy">No machine clients have been created.</EmptyState>
        ) : (
          props.clients.map((client) => (
            <ClientPanel
              key={client.id}
              organisationSlug={props.organisationSlug}
              client={client}
              referenceTime={props.referenceTime}
              reveal={setToken}
            />
          ))
        )}
      </section>
    </div>
  );
}
